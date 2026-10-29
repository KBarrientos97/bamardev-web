import { useCallback, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import ComprobanteCredito, { type TipoComprobante } from "../components/ComprobanteCredito";
import InputMonto from "../components/InputMonto";
import { QrParaCobrar } from "../components/QrCobro";
import {
  aCentavos,
  esCero,
  esPositivo,
  excede,
  restoEnEfectivo,
} from "../lib/dinero";
import { leerMonto, montoParaEditar } from "../lib/montoTecleado";
import { tienePermiso } from "../lib/permisos";
import { useAuth } from "../store/AuthContext";
import { Icon } from "../components/Icon";
import { Buscador, Chips, EncabezadoPagina, FilaFiltros } from "../components/filtros";
import {
  AvisoOk,
  Badge,
  Boton,
  Campo,
  Cargando,
  ErrorMsg,
  Kpi,
  Modal,
  Select,
  useAviso,
  Vacio,
} from "../components/ui";
import { ApiError, api } from "../lib/api";
import { fmtFecha, fmtFechaHora, fmtMoney, fmtNum } from "../lib/format";
import { historialDePagos, reciboDelCobro, type PagoDelHistorial } from "../lib/historialPagos";
import { useApi } from "../lib/useApi";
import { useSucursales } from "../lib/useSucursales";
import { huellaDeCobro } from "./pos/useIntentoDeCobro";
import type {
  ClienteCredito,
  Credito,
  CreditoDetalle,
  EstadoCredito,
  FiltroCredito,
  FormaPago,
} from "../types";

const OPC_FILTRO = [
  ["por_cobrar", "Por cobrar"],
  ["vencidos", "Vencidos"],
  ["vencen_pronto", "Vencen pronto"],
  ["pagados", "Pagados"],
] as const satisfies readonly (readonly [FiltroCredito, string])[];

// En el color del negocio (abonado, pagado) o neutro (pendiente): el amarillo y
// el azul fijos se mezclaban con el color de cada negocio (12-oct).
const TONO_ESTADO: Record<EstadoCredito, "marca" | "verde" | "gris"> = {
  PENDIENTE: "gris",
  ABONADO: "marca",
  PAGADO: "verde",
  ANULADO: "gris",
};

const ETIQUETA_ESTADO: Record<EstadoCredito, string> = {
  PENDIENTE: "Pendiente",
  ABONADO: "Abonado",
  PAGADO: "Pagado",
  ANULADO: "Anulado",
};

/**
 * A partir de acá el vencimiento deja de ser un dato y pasa a ser un aviso.
 *
 * Es el mismo umbral del filtro "Vencen pronto" del backend
 * (`DIAS_VENCE_PRONTO` en credito.util.ts). BUG-finanzas-8: acá valía 3 y el
 * filtro trae hasta 7 días, así que una cuenta que vencía en 5 aparecía en
 * "Vencen pronto" sin ninguna marca.
 */
const DIAS_VENCE_PRONTO = 7;

/**
 * El listado y el detalle no nombran igual los días: el listado manda
 * `diasAtraso`/`diasParaVencer` y el tipo del dominio declara `diasVencido`.
 * Se leen los tres para que la tarjeta sirva con cualquiera de las dos formas.
 */
interface CreditoApi extends Credito {
  diasAtraso?: number;
  diasParaVencer?: number;
}

function diasDeAtraso(c: CreditoApi): number {
  return c.diasAtraso ?? c.diasVencido ?? 0;
}

/**
 * Cuántos días faltan para el compromiso, como los cuenta el backend.
 *
 * Si no los mandó se calculan igual que él (`calcularVencimiento`): truncando.
 * El compromiso es a las 23:59 del día pactado, así que con 14 horas por
 * delante "vence hoy"; redondeando para arriba decía "vence en 1 d" y la marca
 * no coincidía con la del filtro.
 */
function diasParaVencer(c: CreditoApi): number | null {
  if (typeof c.diasParaVencer === "number") return c.diasParaVencer;
  if (!c.fechaCompromiso) return null;
  const ms = new Date(c.fechaCompromiso).getTime() - Date.now();
  return Number.isNaN(ms) ? null : Math.floor(ms / 86_400_000);
}

/** Si lo que devolvió el backend es la cuenta (registrar un abono devuelve el detalle). */
function esCuenta(x: unknown): x is CreditoDetalle {
  if (typeof x !== "object" || x === null) return false;
  const c = x as Partial<Credito>;
  return typeof c.saldo === "number" && typeof c.montoTotal === "number";
}

/** El detalle no trae `progreso`: se deriva del pagado sobre el total. */
function progresoDe(c: CreditoApi): number {
  if (typeof c.progreso === "number") return c.progreso;
  if (!c.montoTotal) return 0;
  return Math.min(1, (c.pagado ?? c.montoTotal - c.saldo) / c.montoTotal);
}

/**
 * La identidad de cada abono en curso, que viaja como `clienteRequestId`
 * (BUG-cobro-4). Sin ella, si la respuesta se perdía (un 504 del proxy, un
 * corte con el POST ya grabado) y el cajero reintentaba, el abono se
 * registraba dos veces: el saldo del cliente bajaba de más y el arqueo
 * esperaba plata que nunca entró.
 *
 * Una por CUENTA, no una para toda la página como `useIntentoDeCobro`: con una
 * sola, si el abono de A daba un 504 con el POST ya grabado y en el medio se
 * cobraba B, la clave pendiente de A se perdía (B estrenaba una, y al salir
 * bien otra más). Al volver a A con el mismo monto salía una clave nueva y el
 * backend grababa el abono dos veces. Las reglas de cada cuenta son las de
 * `useIntentoDeCobro`: la misma clave mientras se reintente el mismo cobro,
 * una nueva si cambian las partes o si salió bien.
 */
function useIntentosDeAbono() {
  const pendientes = useRef(new Map<number, { huella: string; id: string }>());

  /** La clave para este cobro de la cuenta: la pendiente si es el mismo. */
  const actual = useCallback((creditoId: number, huella: string) => {
    const previo = pendientes.current.get(creditoId);
    if (previo?.huella === huella) return previo.id;
    const id = idDeCobro();
    pendientes.current.set(creditoId, { huella, id });
    return id;
  }, []);

  /** El abono de esa cuenta quedó registrado (o su clave ya no sirve): el próximo estrena otra. */
  const registrado = useCallback((creditoId: number) => {
    pendientes.current.delete(creditoId);
  }, []);

  return { actual, registrado };
}

/** `randomUUID` sólo existe en https o localhost (ver `useIntentoDeCobro`). */
function idDeCobro(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `web-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function Creditos() {
  const [filtro, setFiltro] = useState<FiltroCredito>("por_cobrar");
  const [q, setQ] = useState("");
  // El backend busca por nombre y por código (CR00007), así que la búsqueda va
  // como parámetro y no filtrando en el cliente: los créditos pagados de meses
  // viejos no están en la lista que ya se descargó.
  const [qBuscado, setQBuscado] = useState("");

  // Sin depósitos: se fía en el mostrador, no en un depósito.
  const suc = useSucursales();
  const creditos = useApi<CreditoApi[]>(
    () => api.getCreditos({ filtro, q: qBuscado || undefined, sucursalId: suc.sucursalId }),
    [filtro, qBuscado, suc.sucursalId],
  );
  const clientes = useApi(
    () => api.getClientesCredito(suc.sucursalId),
    [suc.sucursalId],
  );
  const formasPago = useApi(() => api.getFormasPago(), []);

  const [detalleId, setDetalleId] = useState<number | null>(null);
  const [abonando, setAbonando] = useState<CreditoApi | null>(null);
  const [editandoLimite, setEditandoLimite] = useState<ClienteCredito | null>(null);
  const [reciboDe, setReciboDe] = useState<{ credito: CreditoDetalle; pago: PagoDelHistorial } | null>(
    null,
  );
  const [aviso, setAviso] = useAviso();
  /**
   * Las claves de los abonos (ver `useIntentosDeAbono`). Viven acá y no en el
   * formulario porque cerrar el modal después del error y volver a abrirlo es
   * la forma natural de reintentar, y tiene que ser el mismo cobro.
   */
  const intentoAbono = useIntentosDeAbono();

  const navigate = useNavigate();
  const { usuario } = useAuth();
  /**
   * Al cajero se le avisa ANTES de que llene el formulario, no con el 400 del
   * backend después de teclear el monto. Es lo que hace la app
   * (`CuentasPorCobrarFragment`), y esta página la abre cualquiera desde el
   * menú, con o sin caja.
   *
   * La regla es la misma de `FormAbono` y del backend: quien tiene
   * `credito.cobrar_sin_caja` cobra sin caja, así que a él ni se le pregunta.
   */
  const cobraSinCaja = tienePermiso(usuario, "credito.cobrar_sin_caja");
  const caja = useApi(
    () => (cobraSinCaja ? Promise.resolve({ caja: null }) : api.cajaActual()),
    [cobraSinCaja],
  );
  // Si no se pudo preguntar (error) no se avisa nada: el cobro puede andar
  // igual. Misma decisión que la app, que trata ese caso como "no sé".
  const sinCaja =
    !cobraSinCaja && !caja.cargando && !caja.error && caja.datos?.caja == null;

  const lista = creditos.datos ?? [];
  const listaClientes = clientes.datos ?? [];

  const kpis = useMemo(() => {
    const porCobrar = lista.reduce((s, c) => s + c.saldo, 0);
    const abiertos = lista.filter((c) => c.saldo > 0 && c.estado !== "ANULADO").length;
    // El monto vencido sale de los clientes y no de la lista: la lista cambia
    // con el filtro elegido y el total de la deuda atrasada no debería.
    const vencido = listaClientes.reduce((s, c) => s + c.montoVencido, 0);
    return { porCobrar, abiertos, vencido };
  }, [lista, listaClientes]);

  const conDeuda = listaClientes.filter((c) => c.saldoTotal > 0);

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-5">
      <EncabezadoPagina
        titulo="Créditos"
        subtitulo="Ventas fiadas y cuentas por cobrar"
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          etiqueta="Total por cobrar"
          valor={fmtMoney(kpis.porCobrar)}
          icono="dollar"
          tono="verde"
          pie="Suma de los saldos listados"
        />
        <Kpi
          etiqueta="Créditos abiertos"
          valor={fmtNum(kpis.abiertos)}
          icono="fileText"
          tono="verde"
        />
        <Kpi
          etiqueta="Monto vencido"
          valor={fmtMoney(kpis.vencido)}
          icono="alert"
          tono={kpis.vencido > 0 ? "rojo" : "gris"}
          pie="Pasado el compromiso"
        />
        <Kpi
          etiqueta="Clientes con deuda"
          valor={fmtNum(conDeuda.length)}
          icono="users"
          tono="marca"
        />
      </div>

      {sinCaja && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-warning-bg px-3.5 py-2.5 text-[13px] text-warning-text">
          <span className="flex items-center gap-2">
            <Icon name="alert" size={17} />
            Para cobrar hace falta tu caja abierta: el abono entra a la caja de quien
            cobra.
          </span>
          {/* La caja se abre en el POS: es la misma pantalla de apertura de siempre. */}
          <Boton variante="ghost" icono="lock" onClick={() => navigate("/pos")}>
            Abrir caja
          </Boton>
        </div>
      )}

      <div className="space-y-3">
        <div
          className="flex gap-2"
          // BUG-finanzas-11: Enter no hacía nada y había que ir a tocar
          // "Buscar". Va acá y no con un <form>: la cruz de limpiar del
          // Buscador no declara `type` y dentro de un form también lo enviaría.
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.target instanceof HTMLInputElement) setQBuscado(q.trim());
          }}
        >
          <Buscador
            valor={q}
            onChange={(v) => {
              setQ(v);
              // Buscar en cada tecla dispararía una petición por letra; el
              // backend responde a nombre o código completo, así que alcanza
              // con confirmar. Vaciar el campo sí recarga al instante.
              if (v === "") setQBuscado("");
            }}
            placeholder="Buscar por cliente o código (CR00007)"
          />
          <Boton variante="ghost" icono="search" onClick={() => setQBuscado(q.trim())}>
            Buscar
          </Boton>
        </div>
        <FilaFiltros>
          {suc.elegir && (
            <Chips titulo="Sucursal" valor={suc.valorChip} opciones={suc.opciones} onChange={suc.alElegir} />
          )}
          <Chips titulo="Estado" valor={filtro} opciones={OPC_FILTRO} onChange={setFiltro} />
        </FilaFiltros>
      </div>

      <ErrorMsg>{creditos.error}</ErrorMsg>
      <AvisoOk>{aviso}</AvisoOk>

      {creditos.cargando ? (
        <Cargando />
      ) : lista.length === 0 ? (
        <div className="card">
          <Vacio
            icono="fileText"
            titulo={qBuscado ? "Sin resultados" : "No hay créditos acá"}
            texto={
              qBuscado
                ? "Probá con el nombre del cliente o el código completo."
                : "Los créditos se generan al cobrar una venta como fiado."
            }
          />
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {lista.map((c) => (
            <TarjetaCredito
              key={c.id}
              credito={c}
              onClick={() => setDetalleId(c.id)}
              onAbonar={() => setAbonando(c)}
            />
          ))}
        </ul>
      )}

      {conDeuda.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[15px] font-bold text-texto">
            Clientes con deuda
            <span className="ml-1.5 text-[13px] font-normal text-texto-3">
              — {conDeuda.length} en total
            </span>
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {conDeuda.map((c) => (
              <TarjetaCliente key={c.id} cliente={c} onLimite={setEditandoLimite} />
            ))}
          </ul>
        </section>
      )}

      {detalleId !== null && (
        <DetalleCredito
          id={detalleId}
          onClose={() => setDetalleId(null)}
          onAbonar={(c) => {
            setDetalleId(null);
            setAbonando(c);
          }}
        />
      )}

      {editandoLimite && (
        <FormLimiteCredito
          cliente={editandoLimite}
          onClose={() => setEditandoLimite(null)}
          onGuardado={() => {
            setEditandoLimite(null);
            clientes.recargar();
          }}
        />
      )}

      {abonando && (
        <FormAbono
          key={abonando.id}
          credito={abonando}
          formasPago={formasPago.datos ?? []}
          intento={intentoAbono}
          onClose={() => setAbonando(null)}
          onGuardado={(recibo) => {
            // El recibo se ofrece acá y no después: el cliente está enfrente
            // esperando su papel, y buscarlo más tarde en el detalle es un
            // paso que nadie da.
            setReciboDe(recibo);
            setAbonando(null);
            setAviso(`Abono de ${fmtMoney(recibo.pago.monto)} registrado.`);
            creditos.recargar();
            clientes.recargar();
          }}
        />
      )}
      {reciboDe && (
        <ComprobanteCredito
          credito={reciboDe.credito}
          tipo="RECIBO"
          pago={reciboDe.pago}
          onClose={() => setReciboDe(null)}
        />
      )}
    </div>
  );
}

function BarraProgreso({ valor }: { valor: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, valor)) * 100);
  return (
    <div className="mt-2">
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-[11px] text-texto-4">{pct}% pagado</p>
    </div>
  );
}

/** Badge de vencimiento: rojo si ya se pasó, amarillo si está por pasarse. */
function BadgeVencimiento({ credito: c }: { credito: CreditoApi }) {
  if (c.vencido) {
    const dias = diasDeAtraso(c);
    return <Badge tono="rojo">{dias > 0 ? `${dias} d de atraso` : "Vencido"}</Badge>;
  }
  const faltan = diasParaVencer(c);
  if (esPositivo(c.saldo) && faltan !== null && faltan <= DIAS_VENCE_PRONTO) {
    return (
      <Badge tono="amarillo">{faltan <= 0 ? "Vence hoy" : `Vence en ${faltan} d`}</Badge>
    );
  }
  return null;
}

function TarjetaCredito({
  credito: c,
  onClick,
  onAbonar,
}: {
  credito: CreditoApi;
  onClick: () => void;
  onAbonar: () => void;
}) {
  return (
    <li className="card flex flex-col p-4">
      <button onClick={onClick} className="flex-1 text-left">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-bold text-texto">{c.clienteNombre}</h3>
            <p className="mt-0.5 flex items-center gap-1 truncate text-[13px] text-texto-3">
              <Icon name="phone" size={13} />
              {c.clienteTelefono || "Sin teléfono"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <BadgeVencimiento credito={c} />
            <Icon name="chevronRight" size={17} color="#94A3B8" />
          </div>
        </div>

        <div className="mt-3 rounded-xl bg-muted p-3">
          <p className="text-[11px] font-semibold uppercase text-texto-4">Saldo</p>
          <p className="text-xl font-bold tracking-tight text-texto">{fmtMoney(c.saldo)}</p>
          <p className="mt-0.5 text-[12px] text-texto-3">
            {fmtMoney(c.pagado ?? c.montoTotal - c.saldo)} pagado de {fmtMoney(c.montoTotal)}
          </p>
          <BarraProgreso valor={progresoDe(c)} />
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <Badge tono={TONO_ESTADO[c.estado]}>{ETIQUETA_ESTADO[c.estado]}</Badge>
          <span className="flex items-center gap-1 text-xs text-texto-4">
            <Icon name="calendar" size={13} />
            {fmtFecha(c.fechaCompromiso)}
          </span>
        </div>

        <div className="mt-2 flex items-center gap-2 text-[11px] text-texto-4">
          <span className="font-semibold">{c.codigo ?? `#${c.id}`}</span>
          {c.comprobante && <span>· venta {c.comprobante}</span>}
        </div>
      </button>

      {c.saldo > 0 && c.estado !== "ANULADO" && (
        <Boton variante="soft" icono="dollar" className="mt-3 w-full" onClick={onAbonar}>
          Registrar abono
        </Boton>
      )}
    </li>
  );
}

function TarjetaCliente({
  cliente: c,
  onLimite,
}: {
  cliente: ClienteCredito;
  onLimite: (c: ClienteCredito) => void;
}) {
  const { usuario } = useAuth();
  // A quien no puede cambiar límites se le esconde el lápiz: un ícono de
  // editar que no responde se lee como app rota, no como falta de permiso.
  const puedeEditarLimite = tienePermiso(usuario, "credito.limite_editar");

  return (
    <li className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-bold text-texto">{c.nombre}</h3>
          <p className="mt-0.5 truncate text-[13px] text-texto-3">
            {c.telefono ? (
              // Tocable: desde el celular se llama al deudor sin re-teclear.
              <a href={`tel:${c.telefono}`} className="hover:underline">
                {c.telefono}
              </a>
            ) : (
              "Sin teléfono"
            )}
          </p>
        </div>
        {c.montoVencido > 0 && <Badge tono="rojo">Con atraso</Badge>}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-muted p-2.5">
        <div>
          <p className="text-[11px] font-semibold uppercase text-texto-4">Saldo</p>
          <p className="text-sm font-bold text-texto">{fmtMoney(c.saldoTotal)}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase text-texto-4">Vencido</p>
          <p
            className={`text-sm font-bold ${c.montoVencido > 0 ? "text-danger-text" : "text-texto"}`}
          >
            {fmtMoney(c.montoVencido)}
          </p>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-xs text-texto-3">
          {c.limiteCredito === null ? (
            "Sin límite de crédito"
          ) : (
            <>
              Límite {fmtMoney(c.limiteCredito)} · le quedan{" "}
              <span className="font-bold text-texto-2">{fmtMoney(c.disponible ?? 0)}</span>
            </>
          )}
        </p>
        {puedeEditarLimite && (
          <button
            onClick={() => onLimite(c)}
            aria-label={`Cambiar el límite de ${c.nombre}`}
            className="rounded-lg p-1.5 text-texto-3 hover:bg-muted hover:text-texto"
          >
            <Icon name="edit" size={15} />
          </button>
        )}
      </div>

      <p className="mt-2 text-xs text-texto-4">
        {fmtNum(c.creditosAbiertos)} {c.creditosAbiertos === 1 ? "abierto" : "abiertos"} ·{" "}
        {fmtNum(c.vecesFiado)} {c.vecesFiado === 1 ? "vez fiado" : "veces fiado"}
      </p>
    </li>
  );
}

/** Detalle del crédito con lo que el listado no trae: lo que se llevó y los pagos. */
function DetalleCredito({
  id,
  onClose,
  onAbonar,
}: {
  id: number;
  onClose: () => void;
  onAbonar: (c: CreditoApi) => void;
}) {
  const credito = useApi<CreditoDetalle>(() => api.getCredito(id) as Promise<CreditoDetalle>, [id]);
  const c = credito.datos;
  const [imprimiendo, setImprimiendo] = useState<TipoComprobante | null>(null);
  /**
   * C-01 / CRE-6: el recibo de cualquier pago, cuando sea. Antes el único
   * recibo era el que se ofrecía justo después de abonar: si el cliente lo
   * perdía o volvía a pedirlo, no había cómo dárselo.
   */
  const [reciboDe, setReciboDe] = useState<PagoDelHistorial | null>(null);
  // El mismo cálculo que el recibo impreso: lo que el cajero ve en la lista y
  // lo que el cliente se lleva en el papel no pueden separarse.
  const historial = c ? historialDePagos(c) : [];

  return (
    <Modal
      abierto
      titulo="Detalle del crédito"
      subtitulo={c ? `${c.codigo ?? `#${c.id}`} · ${c.clienteNombre}` : "Cargando…"}
      onClose={onClose}
      acciones={
        c && c.estado !== "ANULADO" ? (
          <>
            {/* El papel que se lleva el cliente: el compromiso mientras debe,
                la constancia cuando la cuenta queda en cero. Con la tolerancia
                de medio centavo: un saldo de 0,004 es una cuenta saldada, y
                su compromiso diría "Saldo a pagar Bs 0,00". */}
            <Boton
              variante="ghost"
              icono="printer"
              onClick={() => setImprimiendo(esPositivo(c.saldo) ? "COMPROMISO" : "CONSTANCIA")}
            >
              {esPositivo(c.saldo) ? "Comprobante" : "Constancia"}
            </Boton>
            {esPositivo(c.saldo) && (
              <Boton icono="dollar" onClick={() => onAbonar(c)}>
                Registrar abono
              </Boton>
            )}
          </>
        ) : undefined
      }
    >
      {imprimiendo && c && (
        <ComprobanteCredito
          credito={c}
          tipo={imprimiendo}
          onClose={() => setImprimiendo(null)}
        />
      )}
      {reciboDe && c && (
        <ComprobanteCredito
          credito={c}
          tipo="RECIBO"
          pago={reciboDe}
          onClose={() => setReciboDe(null)}
        />
      )}

      {credito.cargando ? (
        <Cargando />
      ) : !c ? (
        <ErrorMsg>{credito.error || "No se pudo cargar el crédito"}</ErrorMsg>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl bg-primary-50 p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="truncate text-base font-bold text-texto">{c.clienteNombre}</h3>
                <p className="text-[13px] text-texto-3">{c.clienteTelefono || "Sin teléfono"}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <Badge tono={TONO_ESTADO[c.estado]}>{ETIQUETA_ESTADO[c.estado]}</Badge>
                <BadgeVencimiento credito={c} />
              </div>
            </div>
            <p className="mt-3 text-[11px] font-semibold uppercase text-texto-4">Saldo</p>
            <p className="text-2xl font-bold tracking-tight text-texto">{fmtMoney(c.saldo)}</p>
            <BarraProgreso valor={progresoDe(c)} />
          </div>

          <dl className="grid grid-cols-2 gap-3">
            <Dato label="Monto total" valor={fmtMoney(c.montoTotal)} />
            <Dato label="Pagado" valor={fmtMoney(c.pagado ?? c.montoTotal - c.saldo)} />
            <Dato label="Adelanto" valor={fmtMoney(c.adelanto)} />
            <Dato label="Compromiso" valor={fmtFecha(c.fechaCompromiso)} />
            <Dato label="Venta" valor={c.comprobante || `#${c.ventaId}`} />
            <Dato label="Fecha de venta" valor={fmtFecha(c.fechaVenta)} />
            {c.registradoPor && <Dato label="Registró" valor={c.registradoPor} />}
            <Dato label="Código" valor={c.codigo ?? `#${c.id}`} />
          </dl>

          {/* BUG-finanzas-9: las dos por separado. Se mostraba `nota ||
              clienteNota`, y con las dos cargadas la del cliente ("paga los
              viernes", que vale para todas sus cuentas) no se veía. */}
          {c.nota && <Nota titulo="Nota de la cuenta" texto={c.nota} />}
          {c.clienteNota && <Nota titulo="Nota del cliente" texto={c.clienteNota} />}

          {!!c.detalles?.length && (
            <div>
              <h4 className="mb-2 text-[13px] font-bold text-texto">Lo que se llevó</h4>
              <ul className="divide-y divide-borde-soft rounded-xl border border-borde">
                {c.detalles.map((d, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 px-3.5 py-2.5">
                    <span className="min-w-0 truncate text-[13px] text-texto">
                      {fmtNum(d.cantidad)} × {d.producto}
                    </span>
                    <span className="shrink-0 text-[13px] font-bold text-texto">
                      {fmtMoney(d.subtotal)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* El adelanto va primero: para quien cobra es un pago más, y también
              tiene su recibo. */}
          <div>
            <h4 className="mb-2 text-[13px] font-bold text-texto">
              Pagos{historial.length > 0 && ` (${historial.length})`}
            </h4>
            {historial.length === 0 ? (
              <p className="text-[13px] text-texto-3">Todavía no pagó nada.</p>
            ) : (
              <ul className="divide-y divide-borde-soft rounded-xl border border-borde">
                {historial.map((p, i) => (
                  <li key={p.id ?? `adelanto-${i}`} className="flex items-center gap-2 px-3.5 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] text-texto">
                        {p.esAdelanto ? "Adelanto al llevarse el pedido" : `Abono · ${p.formaPago}`}
                        {p.usuario && <span className="text-texto-4"> · {p.usuario}</span>}
                      </p>
                      <p className="text-[11px] text-texto-4">{fmtFechaHora(p.fecha)}</p>
                    </div>
                    <span className="shrink-0 text-[13px] font-bold text-texto">
                      {fmtMoney(p.monto)}
                    </span>
                    {/* Una cuenta anulada no da recibos: dirían un saldo
                        pendiente que ya no existe. */}
                    {c.estado !== "ANULADO" && (
                      <button
                        onClick={() => setReciboDe(p)}
                        aria-label={`Recibo ${p.esAdelanto ? "del adelanto" : "del abono"} de ${fmtMoney(p.monto)} del ${fmtFecha(p.fecha)}`}
                        className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-texto-3 hover:bg-muted hover:text-texto"
                      >
                        <Icon name="printer" size={15} />
                        Recibo
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

function Nota({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="rounded-xl bg-muted p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-texto-4">{titulo}</p>
      <p className="mt-0.5 whitespace-pre-wrap text-sm text-texto-2">{texto}</p>
    </div>
  );
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="rounded-xl bg-muted p-3">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-texto-4">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-bold text-texto">{valor}</dd>
    </div>
  );
}

/** Valor del desplegable para el cobro repartido entre efectivo y QR. */
const MIXTO = "__mixto__";

function FormAbono({
  credito: c,
  formasPago,
  intento,
  onClose,
  onGuardado,
}: {
  credito: CreditoApi;
  formasPago: FormaPago[];
  /** La identidad del cobro, que sobrevive a cerrar y reabrir el modal (BUG-cobro-4). */
  intento: ReturnType<typeof useIntentosDeAbono>;
  onClose: () => void;
  /** La cuenta como quedó y el recibo de este cobro, para dárselo al cliente. */
  onGuardado: (recibo: { credito: CreditoDetalle; pago: PagoDelHistorial }) => void;
}) {
  const { usuario } = useAuth();
  /**
   * Donde termina la plata, que no es lo mismo para todos.
   *
   * Quien tiene `credito.cobrar_sin_caja` (el dueño, en la plantilla) puede
   * cobrar un fiado sin caja abierta: ahi el cobro queda registrado a su
   * nombre y no entra a ningun arqueo. Al resto se le sigue exigiendo su
   * caja, asi que para ellos la frase de siempre es la correcta.
   */
  const cobraSinCaja = tienePermiso(usuario, "credito.cobrar_sin_caja");
  const { incluye } = useAuth();

  const [monto, setMonto] = useState("");
  // Las formas de pago se resuelven por NOMBRE porque los ids son por negocio:
  // el "1" de un negocio no es el efectivo de otro.
  const [formaNombre, setFormaNombre] = useState(
    () => formasPago.find((f) => f.nombre === "Efectivo")?.nombre ?? formasPago[0]?.nombre ?? "",
  );

  /**
   * QR y mixto, como en la app (`RegistrarAbonoDialog`).
   *
   * Antes elegir "QR" en el desplegable registraba el abono al instante: no se
   * mostraba el QR ni se pedía confirmar que la plata llegó, y al cliente se
   * le borraba una deuda que todavía podía deber. Ahora con QR de por medio el
   * botón no se habilita hasta dar el pago por recibido, igual que en el POS.
   */
  const formaEfectivo = formasPago.find((f) => f.nombre.toLowerCase() === "efectivo");
  const formaQr = formasPago.find((f) => f.nombre.toLowerCase() === "qr");
  const permiteMixto = incluye("pago_qr_mixto") && !!formaEfectivo && !!formaQr;
  const esMixto = formaNombre === MIXTO;
  const [montoQr, setMontoQr] = useState("");
  /** El monto por QR que se dio por recibido. Si el monto cambia, deja de valer. */
  const [qrConfirmadoPor, setQrConfirmadoPor] = useState<number | null>(null);

  const montoNum = leerMonto(monto) ?? 0;
  const qrMixtoNum = leerMonto(montoQr) ?? 0;
  const esQr = !esMixto && formaNombre.toLowerCase() === "qr";
  /** Cuánto de este cobro entra por QR: todo, la parte del mixto, o nada. */
  const qrDelCobro = esQr ? montoNum : esMixto ? qrMixtoNum : 0;
  const efectivoDelMixto = restoEnEfectivo(montoNum, qrMixtoNum);
  const qrConfirmado =
    qrConfirmadoPor != null && esPositivo(qrDelCobro) && esCero(qrConfirmadoPor - qrDelCobro);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  /**
   * El candado del doble clic, y acá es plata que entra a la caja.
   *
   * `setGuardando(true)` no frena un segundo clic en el MISMO tick: React
   * batchea el estado y las dos llamadas salen antes del re-render, así que el
   * `disabled` del botón llega tarde. Un doble clic nervioso en el mostrador
   * registraba DOS abonos: el cliente quedaba con un saldo menor al que pagó y
   * el arqueo del turno cerraba con plata que nunca entró. El reintento
   * después de un error lo cubre el `clienteRequestId` (ver `intento`).
   */
  const enVuelo = useRef(false);

  async function guardar() {
    if (enVuelo.current) return;
    setError("");
    // leerMonto y no Number(): "1.500,50" es como se teclea en Bolivia.
    if (!esPositivo(montoNum)) return setError("Poné un monto mayor a cero.");
    if (excede(montoNum, c.saldo))
      return setError(`El abono no puede pasar el saldo (${fmtMoney(c.saldo)}).`);

    let pagos: { monto: number; formaPagoId: number }[];
    if (esMixto) {
      if (!formaEfectivo || !formaQr) return setError("Faltan las formas de pago Efectivo y QR.");
      // El QR es exacto (no da vuelto), así que no puede superar el abono.
      if (excede(qrMixtoNum, montoNum))
        return setError(`Por QR no puede ir más que el abono (${fmtMoney(montoNum)}).`);
      // Cada parte por separado: si fuera una sola línea de efectivo, el
      // arqueo esperaría plata que se fue por transferencia. Las partes en 0
      // no se mandan (el backend las rechaza).
      pagos = [
        ...(esPositivo(efectivoDelMixto)
          ? [{ monto: efectivoDelMixto, formaPagoId: formaEfectivo.id }]
          : []),
        ...(esPositivo(qrMixtoNum) ? [{ monto: aCentavos(qrMixtoNum), formaPagoId: formaQr.id }] : []),
      ];
    } else {
      const forma = formasPago.find((f) => f.nombre === formaNombre);
      if (!forma) return setError("Elegí una forma de pago.");
      pagos = [{ monto: aCentavos(montoNum), formaPagoId: forma.id }];
    }
    if (esPositivo(qrDelCobro) && !qrConfirmado)
      return setError("Confirmá que el pago por QR llegó antes de registrar el abono.");

    enVuelo.current = true;
    setGuardando(true);
    try {
      // El mismo id mientras se reintente ESTE cobro de esta cuenta (las
      // mismas partes); con otro monto u otra forma es otro cobro y estrena
      // id: con el mismo, si el intento fallido sí se había grabado, el
      // backend devolvería ese abono como si fuera el nuevo.
      const clienteRequestId = intento.actual(c.id, huellaDeCobro(pagos, "ABONO"));
      // Sin cajaId a propósito: el backend usa la caja abierta de quien cobra,
      // que es la única donde el dinero puede entrar de verdad.
      const respuesta: unknown = await api.registrarAbono(c.id, { pagos, clienteRequestId });
      intento.registrado(c.id);
      // El backend devuelve la cuenta entera como quedó: su saldo es el de
      // verdad, y con lo que se llevó el recibo sale completo.
      const despues = esCuenta(respuesta) ? respuesta : null;
      const pago = reciboDelCobro({
        antes: c,
        partes: pagos.map((p) => ({
          formaPago: formasPago.find((f) => f.id === p.formaPagoId)?.nombre ?? "",
          monto: p.monto,
        })),
        despues,
        fecha: new Date().toISOString(),
        usuario: usuario?.nombre ?? usuario?.username ?? null,
      });
      onGuardado({ credito: despues ?? { ...c, saldo: pago.saldoDespues }, pago });
    } catch (err) {
      // La clave ya entró en OTRA cuenta (CLAVE_USADA): el backend pide que el
      // próximo intento salga con una nueva. Con una clave por cuenta no
      // debería pasar, pero si pasa, reintentar con la misma rebotaría siempre.
      if (err instanceof ApiError && err.codigo === "CLAVE_USADA") intento.registrado(c.id);
      setError(err instanceof Error ? err.message : "No se pudo registrar el abono");
      // Sólo al fallar: si salió bien el modal se cierra y no hay que liberarlo.
      enVuelo.current = false;
      setGuardando(false);
    }
  }

  return (
    <Modal
      abierto
      titulo="Registrar abono"
      subtitulo={`${c.clienteNombre} · ${c.codigo ?? `#${c.id}`}`}
      onClose={onClose}
      ancho="max-w-sm"
      acciones={
        <>
          <Boton variante="ghost" onClick={onClose}>
            Cancelar
          </Boton>
          <Boton
            icono="save"
            onClick={guardar}
            disabled={guardando || (esPositivo(qrDelCobro) && !qrConfirmado)}
          >
            {guardando ? "Guardando…" : "Cobrar"}
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl bg-primary-50 p-3.5">
          <p className="text-[11px] font-semibold uppercase text-texto-4">Saldo pendiente</p>
          <p className="text-xl font-bold tracking-tight text-texto">{fmtMoney(c.saldo)}</p>
        </div>

        <Campo label="Monto del abono">
          <InputMonto
            value={monto}
            onChange={setMonto}
            autoFocus
          />
        </Campo>

        <Boton variante="soft" className="w-full" onClick={() => setMonto(montoParaEditar(c.saldo))}>
          Pagar todo ({fmtMoney(c.saldo)})
        </Boton>

        <Campo
          label="Forma de pago"
          hint={
            cobraSinCaja
              ? "Con tu caja abierta entra ahi; si no, queda registrado a tu nombre"
              : "El abono entra en tu caja abierta"
          }
        >
          <Select
            value={formaNombre}
            onChange={(e) => {
              setFormaNombre(e.target.value);
              setQrConfirmadoPor(null);
            }}
          >
            {formasPago.map((f) => (
              <option key={f.id} value={f.nombre}>
                {f.nombre}
              </option>
            ))}
            {permiteMixto && <option value={MIXTO}>Efectivo + QR (mixto)</option>}
          </Select>
        </Campo>

        {esMixto && (
          <div className="space-y-2">
            <Campo label="Cuánto paga por QR">
              <InputMonto
                value={montoQr}
                onChange={setMontoQr}
                placeholder="0,00"
              />
            </Campo>
            <p className="text-[13px] text-texto-2">
              En efectivo: <strong>{fmtMoney(efectivoDelMixto)}</strong>
            </p>
          </div>
        )}

        {esPositivo(qrDelCobro) && (
          <QrParaCobrar
            confirmado={qrConfirmado}
            onConfirmar={() => setQrConfirmadoPor(qrDelCobro)}
            monto={fmtMoney(qrDelCobro)}
          />
        )}

        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </Modal>
  );
}


/**
 * Techo de deuda de un cliente.
 *
 * "Sin límite" es el campo vacío y no un estado aparte: el backend distingue
 * `null` (sacarle el techo) de no mandar nada, así que acá siempre se manda uno
 * de los dos. Chips con los montos que se usan en el mostrador, más campo libre.
 */
function FormLimiteCredito({
  cliente,
  onClose,
  onGuardado,
}: {
  cliente: ClienteCredito;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const [valor, setValor] = useState(
    cliente.limiteCredito === null ? "" : montoParaEditar(cliente.limiteCredito),
  );
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    if (guardando) return;
    setError("");

    const limite = valor.trim() === "" ? null : leerMonto(valor);
    if (valor.trim() !== "" && (limite === null || limite < 0))
      return setError("El límite tiene que ser un monto válido.");

    setGuardando(true);
    try {
      await api.actualizarLimiteCredito(cliente.id, limite);
      onGuardado();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el límite");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal
      abierto
      titulo="Límite de crédito"
      subtitulo={cliente.nombre}
      onClose={onClose}
      ancho="max-w-sm"
      acciones={
        <>
          <Boton variante="ghost" onClick={onClose}>
            Cancelar
          </Boton>
          <Boton onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar"}
          </Boton>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-[13px] text-texto-3">
          Debe {fmtMoney(cliente.saldoTotal)} hoy. Por encima del límite, fiarle va a
          necesitar la firma de un encargado.
        </p>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setValor("")}
            className={`rounded-xl px-3.5 py-2 text-[13px] font-semibold transition-colors ${
              valor === ""
                ? "bg-primary-boton text-white"
                : "border border-borde bg-white text-texto-2 hover:bg-muted"
            }`}
          >
            Sin límite
          </button>
          {[100, 200, 500].map((v) => (
            <button
              key={v}
              onClick={() => setValor(montoParaEditar(v))}
              className={`rounded-xl px-3.5 py-2 text-[13px] font-semibold transition-colors ${
                leerMonto(valor) === v
                  ? "bg-primary-boton text-white"
                  : "border border-borde bg-white text-texto-2 hover:bg-muted"
              }`}
            >
              {fmtMoney(v)}
            </button>
          ))}
        </div>

        <Campo label="Otro monto">
          <InputMonto
            value={valor}
            onChange={setValor}
            placeholder="Vacío = sin límite"
            className="font-bold"
          />
        </Campo>

        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </Modal>
  );
}
