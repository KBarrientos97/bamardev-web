import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../components/Icon";
import { Buscador, Chips, EncabezadoPagina } from "../components/filtros";
import {
  AvisoOk,
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
import { cubre, esPositivo, excede, parsearMonto } from "../lib/dinero";
import { fmtFecha, fmtMoney } from "../lib/format";
import { useApi } from "../lib/useApi";
import { useSucursales } from "../lib/useSucursales";
import type {
  EstadoGasto,
  FiltroGasto,
  Gasto,
  GastoInput,
  MetodoPagoGasto,
  TipoCostoGasto,
} from "../types";

/**
 * Gastos operativos: el libro del RESULTADO.
 *
 * La regla que gobierna todo el módulo: **un gasto NO es un movimiento de
 * caja**. Son dos libros distintos y cada uno responde otra pregunta. El del
 * resultado (esto) dice qué gastó el negocio este mes —el alquiler de
 * septiembre es gasto de septiembre aunque se pague en octubre—; el del
 * efectivo (los movimientos de caja) dice qué salió del cajón y cuándo.
 *
 * Por eso registrar un gasto acá no abre ningún egreso de caja. Si el dueño
 * además quiere reflejar la salida de plata, la carga a mano: decisión suya,
 * no efecto lateral.
 *
 * Espejo de la pantalla de Android (`GastosFragment`): las dos leen el mismo
 * backend y tienen que decir lo mismo.
 */

const OPC_FILTRO = [
  ["TODOS", "Todos"],
  ["PENDIENTES", "Pendientes"],
  ["VENCIDOS", "Vencidos"],
  ["PAGADOS", "Pagados"],
] as const satisfies readonly (readonly [FiltroGasto, string])[];

const TONO_ESTADO: Record<EstadoGasto, "amarillo" | "azul" | "verde"> = {
  PENDIENTE: "amarillo",
  PARCIAL: "azul",
  PAGADO: "verde",
};

const ETIQUETA_ESTADO: Record<EstadoGasto, string> = {
  PENDIENTE: "Pendiente",
  PARCIAL: "Parcial",
  PAGADO: "Pagado",
};

/**
 * **Vencido gana sobre el estado**, igual que `GastoUi.labelEstado` en la app:
 * a quien mira la lista le importa más que la luz se atrasó que si está
 * pendiente o a medio pagar. Sin esto el mismo alquiler vencido salía
 * "Pendiente" en amarillo en la web y "VENCIDO" en rojo en el celular.
 */
function badgeEstado(g: Gasto): { tono: "amarillo" | "azul" | "verde" | "rojo"; texto: string } {
  if (g.vencido && !saldado(g)) return { tono: "rojo", texto: "Vencido" };
  return { tono: TONO_ESTADO[g.estado], texto: ETIQUETA_ESTADO[g.estado] };
}

const METODOS = [
  ["EFECTIVO", "Efectivo"],
  ["TRANSFERENCIA", "Transferencia"],
  ["QR", "QR"],
  ["TARJETA", "Tarjeta"],
] as const satisfies readonly (readonly [MetodoPagoGasto, string])[];

/** El respiro antes de consultar lo tecleado, igual que en la app. */
const DEBOUNCE_MS = 350;

/** Hoy en la zona del navegador, en el `yyyy-MM-dd` que espera el backend. */
function hoyIso(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** El primer día del mes que se está mirando. */
function inicioDeMes(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

/**
 * El corte del mes: el **día 1 del mes siguiente**.
 *
 * `hasta` es EXCLUSIVO en el backend (`fecha < hasta`, el mismo criterio que
 * los reportes), así que mandar el último día del mes dejaba afuera todo lo
 * cargado ese día: el alquiler del 30 no aparecía en septiembre y el mes
 * cerraba con un gasto menos. Es el mismo par que arma la app para
 * "mes pasado": del primero de un mes al primero del siguiente.
 */
function finDeMes(iso: string): string {
  const [a, m] = iso.split("-").map(Number);
  // `m` ya viene 1-based, así que esto es el mes siguiente. Diciembre rueda
  // solo a enero del año que viene.
  const siguiente = new Date(a, m, 1);
  const mm = String(siguiente.getMonth() + 1).padStart(2, "0");
  return `${siguiente.getFullYear()}-${mm}-01`;
}

/**
 * Un gasto **saldado** no debe nada.
 *
 * **Monto cero NO es saldado**, y ésa es toda la razón de que esto no sea
 * `saldo === 0`. El gasto que crea una regla de monto variable —la luz, el
 * agua, el gas— nace con monto 0 y saldo 0 mientras no llega la factura, y el
 * servidor lo manda PENDIENTE a propósito. Tomarlo por saldado le saca el
 * botón de pagar y lo manda a la pestaña "Pagados": la luz figura paga sin que
 * nadie la haya pagado. Es el mismo bug que se corrigió en Android.
 */
function saldado(g: Gasto): boolean {
  return g.estado === "PAGADO" || (g.saldo === 0 && g.monto > 0);
}

/** Lo que la fila dice del vencimiento, o null si no hay nada urgente. */
function textoVencimiento(g: Gasto): string | null {
  if (saldado(g) || !g.fechaVencimiento) return null;
  if (g.vencido) {
    return g.diasAtraso <= 1 ? "Venció ayer" : `Venció hace ${g.diasAtraso} días`;
  }
  if (g.diasParaVencer === 0) return "Vence hoy";
  if (g.diasParaVencer === 1) return "Vence mañana";
  return `Vence en ${g.diasParaVencer} días`;
}

export default function Gastos() {
  const [mes, setMes] = useState(() => hoyIso().slice(0, 7));
  const [filtro, setFiltro] = useState<FiltroGasto>("TODOS");
  /** Lo que se está tecleando. */
  const [q, setQ] = useState("");
  /** Lo que de verdad se consultó. Sin esto salía una petición por letra:
   *  escribir "delapaz" eran siete consultas y la lista parpadeaba con
   *  resultados de búsquedas viejas. */
  const [qBuscado, setQBuscado] = useState("");

  useEffect(() => {
    // Vaciar el campo recarga al instante; escribir espera un respiro.
    if (q === "") {
      setQBuscado("");
      return;
    }
    const t = setTimeout(() => setQBuscado(q.trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q]);
  // `elegir` ya encapsula la condicion: usuario de organizacion Y mas de un
  // local. Con un solo local el filtro no aparece, que es lo correcto.
  const { sucursalId, valorSelect, alElegirSelect, sucursales, elegir } =
    useSucursales();

  const [editando, setEditando] = useState<Gasto | null | undefined>(undefined);
  const [pagando, setPagando] = useState<Gasto | null>(null);
  const [aviso, mostrarAviso] = useAviso();

  const desde = inicioDeMes(`${mes}-01`);
  const hasta = finDeMes(`${mes}-01`);

  const resumen = useApi(
    () => api.getResumenGastos({ desde, hasta, sucursalId }),
    [desde, hasta, sucursalId],
  );
  const lista = useApi(
    () =>
      api.getGastos({
        desde,
        hasta,
        // "TODOS" es una pestana de la pantalla, no un valor del backend: alla
        // se representa NO mandando el parametro. Enviarlo devolvia 400 y la
        // lista arrancaba rota en su estado inicial. Igual que `FiltroGasto`
        // en la app, donde TODOS lleva `query = null`.
        filtro: filtro === "TODOS" ? undefined : filtro,
        q: qBuscado || undefined,
        sucursalId,
      }),
    [desde, hasta, filtro, qBuscado, sucursalId],
  );
  const categorias = useApi(() => api.getCategoriasGasto(), []);

  const recargar = () => {
    lista.recargar();
    resumen.recargar();
  };

  const gastos = lista.datos ?? [];
  const r = resumen.datos;

  /**
   * Cuánto de las ventas del período se fue en gastos.
   *
   * Con tope en 100 y un decimal fijo, igual que la app: un mes flojo con los
   * gastos fijos ya cargados daba "400%" acá y "100.0%" en el celular, para el
   * mismo negocio y el mismo mes.
   */
  const sobreVentas = useMemo(() => {
    if (!r || r.ventasPeriodo <= 0) return null;
    return Math.min(100, (r.total / r.ventasPeriodo) * 100).toFixed(1);
  }, [r]);

  return (
    <div className="space-y-5">
      <EncabezadoPagina
        titulo="Gastos operativos"
        subtitulo="Lo que gasta el negocio, aparte de lo que sale de la caja"
        accion={
          <Boton onClick={() => setEditando(null)}>
            <Icon name="plus" size={16} /> Nuevo gasto
          </Boton>
        }
      />

      {aviso && <AvisoOk>{aviso}</AvisoOk>}

      {/* El hero. Si el resumen falla se muestra el error y NO los números del
          período anterior: un total viejo al lado de la lista nueva miente sin
          que nada lo diga. */}
      {resumen.error ? (
        <ErrorMsg onReintentar={resumen.recargar}>{resumen.error}</ErrorMsg>
      ) : resumen.cargando || !r ? (
        // `useApi` conserva los datos viejos mientras vuela la consulta nueva,
        // asi que sin esto el hero mostraba el total de septiembre arriba de la
        // lista de octubre durante todo el viaje.
        <Cargando texto="Cargando el resumen…" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            etiqueta="Total del período"
            valor={fmtMoney(r?.total ?? 0)}
            pie={`${r?.cantidad ?? 0} gastos`}
          />
          <Kpi etiqueta="Pagado" valor={fmtMoney(r?.pagado ?? 0)} />
          <Kpi
            etiqueta="Pendiente"
            valor={fmtMoney(r?.pendiente ?? 0)}
            pie={
              // Con el MONTO, no sólo el conteo: "3 vencidos" no dice si son
              // Bs 300 o Bs 9.500, y el dato ya viene en la misma respuesta.
              r && r.cantidadVencidos > 0
                ? `${r.cantidadVencidos} vencidos · ${fmtMoney(r.vencido)}`
                : undefined
            }
          />
          <Kpi
            etiqueta="Sobre las ventas"
            valor={sobreVentas == null ? "—" : `${sobreVentas}%`}
            pie={
              r && r.ventasPeriodo > 0
                ? `Ventas ${fmtMoney(r.ventasPeriodo)}`
                : "Sin ventas en el período"
            }
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Campo label="Mes">
          <Input type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
        </Campo>
        {elegir && (
          <Campo label="Sucursal">
            <Select
              value={valorSelect}
              onChange={(e) => alElegirSelect(e.target.value)}
            >
              <option value="">Todas las sucursales</option>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </Select>
          </Campo>
        )}
        <div className="min-w-[220px] flex-1">
          <Buscador valor={q} onChange={setQ} placeholder="Buscar concepto o proveedor…" />
        </div>
      </div>

      <Chips valor={filtro} opciones={OPC_FILTRO} onChange={setFiltro} />

      {/* La puerta a las reglas, en el mismo lugar que en la app: es la
          pregunta que sigue cuando uno ve el alquiler repetido cada mes. */}
      <Link
        to="/gastos/automaticos"
        className="flex items-center gap-3 rounded-xl border border-primary-200 bg-primary-50 p-4 transition hover:bg-primary-100"
      >
        <Icon name="swap" size={20} />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-primary-700">
            Gastos automáticos
          </span>
          <span className="block text-sm text-texto-3">
            Los que se repiten todos los meses: la app los carga sola el día que
            corresponde
          </span>
        </span>
      </Link>

      {lista.cargando ? (
        <Cargando />
      ) : lista.error ? (
        <ErrorMsg onReintentar={lista.recargar}>{lista.error}</ErrorMsg>
      ) : gastos.length === 0 ? (
        <Vacio
          icono="archive"
          titulo="Todavía no cargaste ningún gasto en este período"
          texto="Acá van el alquiler, los sueldos y los servicios."
        />
      ) : (
        <ul className="space-y-2">
          {gastos.map((g) => {
            const vence = textoVencimiento(g);
            return (
              <li
                key={g.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-borde bg-fondo-1 p-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{g.concepto}</span>
                    <Badge tono="gris">{g.categoriaNombre ?? g.categoria}</Badge>
                    {g.sucursal && <Badge tono="gris">{g.sucursal}</Badge>}
                  </div>
                  <div className="mt-1 text-sm text-texto-3">
                    {fmtFecha(g.fecha)}
                    {g.beneficiario ? ` · ${g.beneficiario}` : ""}
                    {vence && (
                      <span className={g.vencido ? "text-rojo" : undefined}>
                        {" · "}
                        {vence}
                      </span>
                    )}
                  </div>
                  {/* La barra sólo aparece cuando hay un pago parcial: un gasto
                      sin pagos o ya saldado no tiene nada que mostrar. */}
                  {!saldado(g) && esPositivo(g.pagado) && (
                    <div className="mt-2 text-xs text-texto-3">
                      Pagado {fmtMoney(g.pagado)} · saldo {fmtMoney(g.saldo)}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="font-semibold">{fmtMoney(g.monto)}</div>
                  {(() => {
                    const b = badgeEstado(g);
                    return <Badge tono={b.tono}>{b.texto}</Badge>;
                  })()}
                </div>
                <div className="flex gap-2">
                  {!saldado(g) && (
                    <Boton variante="ghost" onClick={() => setPagando(g)}>
                      Registrar pago
                    </Boton>
                  )}
                  <Boton variante="ghost" onClick={() => setEditando(g)}>
                    Editar
                  </Boton>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editando !== undefined && (
        <FormGasto
          gasto={editando}
          categorias={categorias.datos ?? []}
          sucursalSugerida={sucursalId}
          onCerrar={() => setEditando(undefined)}
          onGuardado={(texto) => {
            setEditando(undefined);
            mostrarAviso(texto);
            recargar();
          }}
        />
      )}

      {pagando && (
        <PanelPago
          gasto={pagando}
          onCerrar={() => setPagando(null)}
          onPagado={(texto) => {
            setPagando(null);
            mostrarAviso(texto);
            recargar();
          }}
        />
      )}
    </div>
  );
}

// ── Formulario ──────────────────────────────────────────────────────────────

function FormGasto({
  gasto,
  categorias,
  sucursalSugerida,
  onCerrar,
  onGuardado,
}: {
  /** null = alta. */
  gasto: Gasto | null;
  categorias: { codigo: string; nombre: string; tipoCosto: TipoCostoGasto }[];
  sucursalSugerida: number | null;
  onCerrar: () => void;
  onGuardado: (texto: string) => void;
}) {
  const [concepto, setConcepto] = useState(gasto?.concepto ?? "");
  const [categoria, setCategoria] = useState(gasto?.categoria ?? "");
  const [monto, setMonto] = useState(gasto ? String(gasto.monto) : "");
  const [fecha, setFecha] = useState(gasto?.fecha ?? hoyIso());
  const [vence, setVence] = useState(gasto?.fechaVencimiento ?? "");
  const [beneficiario, setBeneficiario] = useState(gasto?.beneficiario ?? "");
  const [nota, setNota] = useState(gasto?.nota ?? "");
  /** Sólo en el alta: al editar, lo que salió se corrige con un pago. */
  const [pagado, setPagado] = useState(false);
  const [metodo, setMetodo] = useState<MetodoPagoGasto>("EFECTIVO");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  /** Ver `PanelPago`: el estado no frena el segundo clic del mismo tick. */
  const enVuelo = useRef(false);

  const guardar = async () => {
    if (enVuelo.current) return;
    const m = parsearMonto(monto);
    if (!concepto.trim()) return setError("Ponele un concepto al gasto.");
    if (!categoria) return setError("Elegí una categoría.");
    if (m == null || !esPositivo(m)) return setError("El monto tiene que ser mayor a cero.");
    if (vence && vence < fecha) {
      return setError("El vencimiento no puede ser anterior a la fecha del gasto.");
    }

    const input: GastoInput = {
      concepto: concepto.trim(),
      categoria,
      monto: m,
      fecha,
      fechaVencimiento: vence || null,
      beneficiario: beneficiario.trim() || null,
      nota: nota.trim() || null,
      // Al editar se conserva el local que ya tenía; al crear, el que está
      // filtrado en la pantalla (si el dueño mira la Sucursal Sur, el gasto
      // que carga es casi seguro de ahí).
      sucursalId: gasto ? gasto.sucursalId : sucursalSugerida,
      ...(gasto ? {} : { pagado, metodoPago: pagado ? metodo : null }),
    };

    enVuelo.current = true;
    setGuardando(true);
    setError("");
    try {
      if (gasto) {
        await api.actualizarGasto(gasto.id, input);
        onGuardado("Gasto actualizado");
      } else {
        await api.crearGasto(input);
        onGuardado("Gasto cargado");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el gasto");
      enVuelo.current = false;
      setGuardando(false);
    }
  };

  return (
    <Modal
      abierto
      titulo={gasto ? "Editar gasto" : "Nuevo gasto"}
      onClose={onCerrar}
      cerrarAlClicAfuera={false}
      acciones={
        <>
          <Boton variante="ghost" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Boton>
          <Boton onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar"}
          </Boton>
        </>
      }
    >
      <div className="space-y-3">
        <Campo label="Concepto">
          <Input
            value={concepto}
            onChange={(e) => setConcepto(e.target.value)}
            placeholder="Ej: Alquiler del local"
            autoFocus
          />
        </Campo>
        <Campo label="Categoría">
          <Select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            <option value="">Elegí una categoría</option>
            {categorias.map((c) => (
              <option key={c.codigo} value={c.codigo}>
                {c.nombre} ({c.tipoCosto === "FIJO" ? "Fijo" : "Variable"})
              </option>
            ))}
          </Select>
        </Campo>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Monto (Bs)">
            <Input
              inputMode="decimal"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder="0.00"
            />
          </Campo>
          <Campo label="Fecha del gasto">
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Campo>
        </div>
        <Campo label="Vence (opcional)">
          <Input type="date" value={vence} onChange={(e) => setVence(e.target.value)} />
        </Campo>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Beneficiario (opcional)">
            <Input
              value={beneficiario}
              onChange={(e) => setBeneficiario(e.target.value)}
              placeholder="Ej: DELAPAZ"
            />
          </Campo>
          <Campo label="Nota (opcional)">
            <Input value={nota} onChange={(e) => setNota(e.target.value)} />
          </Campo>
        </div>

        {/* Al editar no se toca: el backend no deja que un PATCH escriba la
            plata, y tiene razón —`pagado` es la suma de los pagos, cada uno con
            su fecha y su método— así que mostrarlo tocable sería mentir. */}
        {!gasto && (
          <div className="rounded-xl border border-borde p-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={pagado}
                onChange={(e) => setPagado(e.target.checked)}
              />
              Ya lo pagué
            </label>
            {pagado && (
              <div className="mt-2">
                <Campo label="Método de pago">
                  <Select
                    value={metodo}
                    onChange={(e) => setMetodo(e.target.value as MetodoPagoGasto)}
                  >
                    {METODOS.map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </Campo>
              </div>
            )}
          </div>
        )}

        {error && <ErrorMsg>{error}</ErrorMsg>}
      </div>
    </Modal>
  );
}

// ── Registrar pago ──────────────────────────────────────────────────────────

function PanelPago({
  gasto,
  onCerrar,
  onPagado,
}: {
  gasto: Gasto;
  onCerrar: () => void;
  onPagado: (texto: string) => void;
}) {
  const [monto, setMonto] = useState(String(gasto.saldo));
  const [fechaPago, setFechaPago] = useState(hoyIso());
  const [metodo, setMetodo] = useState<MetodoPagoGasto>(gasto.metodoPago ?? "EFECTIVO");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  /**
   * El candado de verdad.
   *
   * `setGuardando(true)` no frena un segundo clic en el MISMO tick: React
   * batchea el estado y las dos llamadas entran antes del re-render. Con
   * "Deshacer el último pago" eso duele: el endpoint no es idempotente, borra
   * el último pago que encuentra, y un doble clic nervioso sobre un sueldo
   * pagado en dos veces se lleva también el adelanto que estaba bien.
   */
  const enVuelo = useRef(false);

  const confirmar = async () => {
    if (enVuelo.current) return;
    const m = parsearMonto(monto);
    if (m == null || !esPositivo(m) || excede(m, gasto.saldo)) {
      return setError("El pago tiene que ser mayor a cero y no puede superar el saldo.");
    }
    enVuelo.current = true;
    setGuardando(true);
    setError("");
    try {
      await api.pagarGasto(gasto.id, {
        // Cuando se paga el saldo entero se manda `undefined` y no el número:
        // entre que se abrió la pantalla y se confirma pudo entrar otro pago, y
        // el saldo viejo lo sobrepagaría.
        monto: cubre(m, gasto.saldo) ? undefined : m,
        fechaPago,
        metodoPago: metodo,
      });
      onPagado("Pago registrado");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar el pago");
      enVuelo.current = false;
      setGuardando(false);
    }
  };

  const deshacer = async () => {
    if (enVuelo.current) return;
    enVuelo.current = true;
    setGuardando(true);
    setError("");
    try {
      await api.deshacerUltimoPagoGasto(gasto.id);
      onPagado("Se deshizo el último pago");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo deshacer el pago");
      enVuelo.current = false;
      setGuardando(false);
    }
  };

  return (
    <Modal
      abierto
      titulo="Registrar pago"
      onClose={onCerrar}
      cerrarAlClicAfuera={false}
      acciones={
        <>
          <Boton variante="ghost" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Boton>
          <Boton onClick={confirmar} disabled={guardando}>
            {guardando ? "Registrando…" : "Confirmar pago"}
          </Boton>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-texto-3">
          {gasto.concepto} · saldo <strong>{fmtMoney(gasto.saldo)}</strong>
        </p>
        <Campo label="Cuánto pagaste (Bs)">
          <Input
            inputMode="decimal"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            autoFocus
          />
        </Campo>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Cuándo se pagó">
            <Input
              type="date"
              value={fechaPago}
              onChange={(e) => setFechaPago(e.target.value)}
            />
          </Campo>
          <Campo label="Método de pago">
            <Select
              value={metodo}
              onChange={(e) => setMetodo(e.target.value as MetodoPagoGasto)}
            >
              {METODOS.map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </Select>
          </Campo>
        </div>

        {/* Deshacer es lo que arregla haberlo cargado por error. Sólo aparece
            si hay algo que deshacer. */}
        {esPositivo(gasto.pagado) && (
          <button
            type="button"
            onClick={deshacer}
            disabled={guardando}
            className="text-sm text-texto-3 underline disabled:opacity-50"
          >
            Deshacer el último pago de {fmtMoney(gasto.pagado)}
          </button>
        )}

        {error && <ErrorMsg>{error}</ErrorMsg>}
      </div>
    </Modal>
  );
}
