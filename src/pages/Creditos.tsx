import { useMemo, useState } from "react";
import { Icon } from "../components/Icon";
import { Buscador, Chips, EncabezadoPagina } from "../components/filtros";
import {
  Badge,
  Boton,
  Campo,
  Cargando,
  ErrorMsg,
  Input,
  Kpi,
  Modal,
  Select,
  useAviso,
  Vacio,
} from "../components/ui";
import { api } from "../lib/api";
import { fmtFecha, fmtFechaHora, fmtMoney, fmtNum } from "../lib/format";
import { useApi } from "../lib/useApi";
import type { ClienteCredito, Credito, EstadoCredito, FiltroCredito, FormaPago } from "../types";

const OPC_FILTRO = [
  ["por_cobrar", "Por cobrar"],
  ["vencidos", "Vencidos"],
  ["vencen_pronto", "Vencen pronto"],
  ["pagados", "Pagados"],
] as const satisfies readonly (readonly [FiltroCredito, string])[];

const TONO_ESTADO: Record<EstadoCredito, "amarillo" | "azul" | "verde" | "gris"> = {
  PENDIENTE: "amarillo",
  ABONADO: "azul",
  PAGADO: "verde",
  ANULADO: "gris",
};

const ETIQUETA_ESTADO: Record<EstadoCredito, string> = {
  PENDIENTE: "Pendiente",
  ABONADO: "Abonado",
  PAGADO: "Pagado",
  ANULADO: "Anulado",
};

/** A partir de acá el vencimiento deja de ser un dato y pasa a ser un aviso. */
const DIAS_AVISO = 3;

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

/** Cuántos días faltan para el compromiso; null si el backend no lo mandó. */
function diasParaVencer(c: CreditoApi): number | null {
  if (typeof c.diasParaVencer === "number") return c.diasParaVencer;
  if (!c.fechaCompromiso) return null;
  const ms = new Date(c.fechaCompromiso).getTime() - Date.now();
  return Number.isNaN(ms) ? null : Math.ceil(ms / 86_400_000);
}

/** El detalle no trae `progreso`: se deriva del pagado sobre el total. */
function progresoDe(c: CreditoApi): number {
  if (typeof c.progreso === "number") return c.progreso;
  if (!c.montoTotal) return 0;
  return Math.min(1, (c.pagado ?? c.montoTotal - c.saldo) / c.montoTotal);
}

export default function Creditos() {
  const [filtro, setFiltro] = useState<FiltroCredito>("por_cobrar");
  const [q, setQ] = useState("");
  // El backend busca por nombre y por código (CR00007), así que la búsqueda va
  // como parámetro y no filtrando en el cliente: los créditos pagados de meses
  // viejos no están en la lista que ya se descargó.
  const [qBuscado, setQBuscado] = useState("");

  const creditos = useApi<CreditoApi[]>(
    () => api.getCreditos({ filtro, q: qBuscado || undefined }),
    [filtro, qBuscado],
  );
  const clientes = useApi(() => api.getClientesCredito(), []);
  const formasPago = useApi(() => api.getFormasPago(), []);

  const [detalleId, setDetalleId] = useState<number | null>(null);
  const [abonando, setAbonando] = useState<CreditoApi | null>(null);
  const [aviso, setAviso] = useAviso();

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
          tono="azul"
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
          tono="amarillo"
        />
      </div>

      <div className="space-y-3">
        <div className="flex gap-2">
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
        <Chips valor={filtro} opciones={OPC_FILTRO} onChange={setFiltro} />
      </div>

      <ErrorMsg>{creditos.error}</ErrorMsg>
      {aviso && (
        <div className="flex items-start gap-2 rounded-xl bg-primary-50 px-3.5 py-2.5 text-sm text-primary-700">
          <Icon name="check" size={17} />
          <span>{aviso}</span>
        </div>
      )}

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
              <TarjetaCliente key={c.id} cliente={c} />
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

      {abonando && (
        <FormAbono
          key={abonando.id}
          credito={abonando}
          formasPago={formasPago.datos ?? []}
          onClose={() => setAbonando(null)}
          onGuardado={(monto) => {
            setAbonando(null);
            setAviso(`Abono de ${fmtMoney(monto)} registrado.`);
            creditos.recargar();
            clientes.recargar();
          }}
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
  if (c.saldo > 0 && faltan !== null && faltan <= DIAS_AVISO) {
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

function TarjetaCliente({ cliente: c }: { cliente: ClienteCredito }) {
  return (
    <li className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-bold text-texto">{c.nombre}</h3>
          <p className="mt-0.5 truncate text-[13px] text-texto-3">
            {c.telefono || "Sin teléfono"}
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

      <p className="mt-2 text-xs text-texto-4">
        {fmtNum(c.creditosAbiertos)} {c.creditosAbiertos === 1 ? "abierto" : "abiertos"} ·{" "}
        {fmtNum(c.vecesFiado)} {c.vecesFiado === 1 ? "vez fiado" : "veces fiado"}
      </p>
    </li>
  );
}

/** Detalle del crédito con lo que el listado no trae: ítems y abonos. */
interface CreditoDetalle extends CreditoApi {
  clienteNota?: string | null;
  registradoPor?: string | null;
  detalles?: { producto: string; cantidad: number; precio: number; subtotal: number }[];
  pagos?: { id?: number; fecha?: string; monto: number; formaPago?: string; usuario?: string }[];
}

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

  return (
    <Modal
      abierto
      titulo="Detalle del crédito"
      subtitulo={c ? `${c.codigo ?? `#${c.id}`} · ${c.clienteNombre}` : "Cargando…"}
      onClose={onClose}
      acciones={
        c && c.saldo > 0 && c.estado !== "ANULADO" ? (
          <Boton icono="dollar" onClick={() => onAbonar(c)}>
            Registrar abono
          </Boton>
        ) : undefined
      }
    >
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

          {(c.nota || c.clienteNota) && (
            <div className="rounded-xl bg-muted p-3">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-texto-4">
                Nota
              </dt>
              <dd className="mt-0.5 whitespace-pre-wrap text-sm text-texto-2">
                {c.nota || c.clienteNota}
              </dd>
            </div>
          )}

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

          <div>
            <h4 className="mb-2 text-[13px] font-bold text-texto">Abonos</h4>
            {!c.pagos?.length ? (
              <p className="text-[13px] text-texto-3">Todavía no se abonó nada.</p>
            ) : (
              <ul className="divide-y divide-borde-soft rounded-xl border border-borde">
                {c.pagos.map((p, i) => (
                  <li key={p.id ?? i} className="flex items-center justify-between gap-2 px-3.5 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] text-texto">
                        {p.formaPago ?? "Abono"}
                        {p.usuario && <span className="text-texto-4"> · {p.usuario}</span>}
                      </p>
                      <p className="text-[11px] text-texto-4">{fmtFechaHora(p.fecha)}</p>
                    </div>
                    <span className="shrink-0 text-[13px] font-bold text-texto">
                      {fmtMoney(p.monto)}
                    </span>
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

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="rounded-xl bg-muted p-3">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-texto-4">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-bold text-texto">{valor}</dd>
    </div>
  );
}

function FormAbono({
  credito: c,
  formasPago,
  onClose,
  onGuardado,
}: {
  credito: CreditoApi;
  formasPago: FormaPago[];
  onClose: () => void;
  onGuardado: (monto: number) => void;
}) {
  const [monto, setMonto] = useState("");
  // Las formas de pago se resuelven por NOMBRE porque los ids son por negocio:
  // el "1" de un negocio no es el efectivo de otro.
  const [formaNombre, setFormaNombre] = useState(
    () => formasPago.find((f) => f.nombre === "Efectivo")?.nombre ?? formasPago[0]?.nombre ?? "",
  );
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    setError("");
    const montoNum = Number(monto);
    if (!Number.isFinite(montoNum) || montoNum <= 0)
      return setError("Poné un monto mayor a cero.");
    if (montoNum > c.saldo)
      return setError(`El abono no puede pasar el saldo (${fmtMoney(c.saldo)}).`);

    const forma = formasPago.find((f) => f.nombre === formaNombre);
    if (!forma) return setError("Elegí una forma de pago.");

    setGuardando(true);
    try {
      // Sin cajaId a propósito: el backend usa la caja abierta de quien cobra,
      // que es la única donde el dinero puede entrar de verdad.
      await api.registrarAbono(c.id, { monto: montoNum, formaPagoId: forma.id });
      onGuardado(montoNum);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar el abono");
    } finally {
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
          <Boton icono="save" onClick={guardar} disabled={guardando}>
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
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            max={c.saldo}
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            autoFocus
          />
        </Campo>

        <Boton variante="soft" className="w-full" onClick={() => setMonto(String(c.saldo))}>
          Pagar todo ({fmtMoney(c.saldo)})
        </Boton>

        <Campo label="Forma de pago" hint="El abono entra en tu caja abierta">
          <Select value={formaNombre} onChange={(e) => setFormaNombre(e.target.value)}>
            {formasPago.map((f) => (
              <option key={f.id} value={f.nombre}>
                {f.nombre}
              </option>
            ))}
          </Select>
        </Campo>

        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </Modal>
  );
}
