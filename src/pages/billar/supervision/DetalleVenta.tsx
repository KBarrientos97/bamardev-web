import { Icon, type NombreIcono } from "../../../components/Icon";
import { Cargando, ErrorMsg, Modal } from "../../../components/ui";
import { esPositivo } from "../../../lib/dinero";
import { fmtCantidad, fmtMoney } from "../../../lib/format";
import { useApi } from "../../../lib/useApi";
import { apiBillar, type ActividadApi, type DetalleSupervisionApi, type VentaApi } from "../api";
import { BotonB, Fila, Nota, Rotulo } from "../ui";
import { porMedio, textoPorMedio, tipoDeMedio } from "./Cobros.datos";
import { IconoMedio, PuntoMedio } from "./Cobros";
import { cuandoSeCobro, subtituloVenta, textoJuego } from "./DetalleVenta.datos";
import { cuando, duracion, tonoDeActividad, type TonoActividad } from "./Supervision.datos";

/**
 * El "Detalle de venta" del billar (26-oct): todo lo que se completó en una
 * venta —el tiempo de mesa, los productos, cómo se pagó y a qué hora entró
 * cada pago— y abajo todo lo que se hizo hasta cobrarla. Lo abren la actividad
 * y el detalle de una caja en Supervisión, y Reportes › Ventas y Métodos de
 * pago (Miguel, el administrador: "que me salga cuál fue lo que me pagaron por
 * QR").
 *
 * Dos formas: `ModalDetalleVenta`, su propio diálogo, y `ContenidoDetalleVenta`,
 * para mostrarlo DENTRO de otro diálogo con un "Volver". El Modal no maneja una
 * pila: con dos abiertos, Escape cerraba los dos y el de abajo quedaba tapado.
 */

/** Qué se pide al servidor: la venta, o la mesa o cuenta (que, cobrada, trae su venta). */
export type Consulta = { sesion?: number; venta?: number };

const ICONO_ACTIVIDAD: Record<string, NombreIcono> = {
  CAJA_ABIERTA: "lock",
  CAJA_CERRADA: "lock",
  VENTA: "billetera",
  VENTA_ANULADA: "x",
  CONSUMO: "cart",
  PAUSAR: "pausa",
  REANUDAR: "play",
  ABRIR: "bola",
  ABRIR_CUENTA: "users",
  EFECTIVO: "swap",
  EFECTIVO_CENA: "cubiertos",
};

const TONO_ICONO: Record<TonoActividad, string> = {
  normal: "bg-slate-100 text-slate-600",
  ambar: "bg-amber-100 text-amber-700",
  rosa: "bg-rose-100 text-rose-700",
  verde: "bg-primary-50 text-primary-700",
  azul: "bg-blue-100 text-blue-700",
  violeta: "bg-violet-100 text-violet-700",
};

/** El ícono de un renglón de la actividad, en el color de lo que pasó: el mismo en la lista y en el historial. */
export function IconoDeActividad({ codigo, grande = false }: { codigo: string; grande?: boolean }) {
  return (
    <span
      className={`mt-0.5 flex shrink-0 items-center justify-center rounded-full ${grande ? "h-8 w-8" : "h-7 w-7"} ${TONO_ICONO[tonoDeActividad(codigo)]}`}
    >
      <Icon name={ICONO_ACTIVIDAD[codigo] ?? "info"} size={grande ? 15 : 13} />
    </span>
  );
}

/**
 * Lo que se hizo con una mesa, cuenta o venta, de lo más viejo a lo más nuevo:
 * quién la abrió, qué consumos cargó y a qué hora, las pausas, los cobros y las
 * anulaciones. Es la lista sola: la pide quien la muestra.
 */
export function ListaHistorial({ historial, ahora }: { historial: ActividadApi[]; ahora: number }) {
  if (historial.length === 0) return <p className="text-texto-3">Todavía no hay nada más que contar.</p>;
  return (
    <ol className="space-y-3">
      {historial.map((h) => (
        <li key={h.id} className="flex gap-3">
          <IconoDeActividad codigo={h.codigo} />
          <div className="min-w-0 flex-1">
            <p className="leading-snug text-texto">
              <b className="font-bold">{h.quien || "Alguien"}</b> · {h.texto}
            </p>
            <p className="flex flex-wrap items-center gap-x-2 text-[12px] text-texto-3">
              <span className="tabular-nums">{cuando(h.hora, ahora)}</span>
              {h.autorizo && <span>Autorizó {h.autorizo}</span>}
              {h.motivo && <span className="min-w-0">«{h.motivo}»</span>}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** El historial de una mesa o cuenta que sigue abierta, al pie de su detalle en vivo. */
export function Historial({ consulta, ahora }: { consulta: Consulta; ahora: number }) {
  const d = useApi(() => apiBillar.detalleSupervision(consulta), [consulta.sesion, consulta.venta]);
  return (
    <div className="space-y-2 border-t border-borde-soft pt-3">
      <Rotulo icono="lista">Lo que se hizo</Rotulo>
      {d.cargando ? (
        <p className="text-texto-3">Cargando…</p>
      ) : d.error ? (
        <ErrorMsg onReintentar={d.recargar}>{d.error}</ErrorMsg>
      ) : (
        <ListaHistorial historial={d.datos?.historial ?? []} ahora={ahora} />
      )}
    </div>
  );
}

/** Lo que se pide de una venta: lo mismo para el diálogo propio y para el que va dentro de otro. */
function useDetalle(consulta: Consulta) {
  return useApi(() => apiBillar.detalleSupervision(consulta), [consulta.sesion, consulta.venta]);
}

/** Una venta ya cobrada (o anulada) en su propio diálogo: el ticket y todo lo que se hizo hasta cobrarla. */
export function ModalDetalleVenta({
  consulta,
  tipos = {},
  ahora,
  onClose,
}: {
  consulta: Consulta;
  /** Los tipos de mesa para nombrar el de la venta; Reportes no los tiene y usa el nombre que manda el backend. */
  tipos?: Record<string, { nombre: string }>;
  ahora: number;
  onClose: () => void;
}) {
  const d = useDetalle(consulta);
  const v = d.datos?.venta ?? null;
  return (
    <Modal
      abierto
      // Una mesa anulada (sin venta) que se abre desde la actividad no es una
      // venta: ahí es sólo "Detalle", con lo que se hizo.
      titulo={v || consulta.venta != null ? "Detalle de venta" : "Detalle"}
      subtitulo={v ? subtituloVenta(v, tipos) : undefined}
      onClose={onClose}
      ancho="max-w-lg"
      acciones={<BotonB onClick={onClose}>Cerrar</BotonB>}
    >
      <CuerpoDetalle d={d} ahora={ahora} />
    </Modal>
  );
}

/**
 * El mismo detalle DENTRO de otro diálogo (el de una caja, el de los cobros de
 * un medio), con su "Volver" arriba: un segundo Modal encima no tiene pila y
 * Escape cerraba los dos.
 */
export function ContenidoDetalleVenta({
  consulta,
  tipos = {},
  ahora,
  volver,
}: {
  consulta: Consulta;
  tipos?: Record<string, { nombre: string }>;
  ahora: number;
  /** "Volver a la caja", "Volver a los cobros". */
  volver: { texto: string; onVolver: () => void };
}) {
  const d = useDetalle(consulta);
  const v = d.datos?.venta ?? null;
  return (
    <div className="space-y-4">
      <div>
        <button
          type="button"
          onClick={volver.onVolver}
          className="-ml-1 inline-flex min-h-10 items-center gap-1.5 rounded-lg px-1 text-[13px] font-semibold text-primary-700 hover:underline focus-visible:underline focus-visible:outline-none"
        >
          <Icon name="arrowLeft" size={16} />
          {volver.texto}
        </button>
        <h3 className="mt-1 text-[16px] font-bold text-texto">Detalle de venta</h3>
        {v && <p className="text-[13px] text-texto-3">{subtituloVenta(v, tipos)}</p>}
      </div>
      <CuerpoDetalle d={d} ahora={ahora} />
    </div>
  );
}

function CuerpoDetalle({
  d,
  ahora,
}: {
  d: { datos: DetalleSupervisionApi | null; cargando: boolean; error: string; recargar: () => void };
  ahora: number;
}) {
  const v = d.datos?.venta ?? null;
  return (
    <div className="space-y-4 text-[13px]">
      {d.cargando ? (
        <Cargando texto="Cargando el detalle…" />
      ) : d.error ? (
        <ErrorMsg onReintentar={d.recargar}>{d.error}</ErrorMsg>
      ) : (
        <>
          {v && <TicketDeVenta v={v} ahora={ahora} />}
          <div className={`space-y-2 ${v ? "border-t border-borde-soft pt-3" : ""}`}>
            <Rotulo icono="lista">Lo que se hizo</Rotulo>
            <ListaHistorial historial={d.datos?.historial ?? []} ahora={ahora} />
          </div>
        </>
      )}
    </div>
  );
}

/** "2 h 5 min", "45 min": el tiempo de la mesa, como se dice en el resto de Supervisión. */
const minutos = (min: number) => duracion(min * 60_000);

/**
 * Lo cobrado en una venta del billar: quién y cuándo, cuánto se jugó, qué se
 * consumió y cómo se pagó, pago por pago, con el medio a la vista.
 */
function TicketDeVenta({ v, ahora }: { v: VentaApi; ahora: number }) {
  const mesa = v.origen === "mesa";
  return (
    <div className="space-y-4">
      {v.anulada && (
        <Nota tono="rosa" icono="alert">
          <b>Venta anulada</b> por {v.anulada.quien} · {cuando(v.anulada.hora, ahora)}
          {v.anulada.motivo ? `: «${v.anulada.motivo}»` : ""}
        </Nota>
      )}
      <div className="space-y-1">
        <Fila etiqueta="Cobró" valor={`${v.cajero} · ${cuando(v.hora, ahora)}`} />
        {v.cliente && <Fila etiqueta="Cliente" valor={v.cliente} />}
        {mesa && v.juego && <Fila etiqueta="Jugaron" valor={textoJuego(v.juego)} />}
        {mesa && <Fila etiqueta="Tiempo cobrado" valor={`${minutos(v.tiempoMin)} · ${fmtMoney(v.tiempoBs + (v.promo?.descuento ?? 0))}`} />}
        {mesa && v.tiempoPrevioMin ? <Fila etiqueta="En otra mesa" valor={`${minutos(v.tiempoPrevioMin)} a su tarifa`} /> : null}
        {mesa && v.pausaMin ? <Fila etiqueta="En pausa (no se cobra)" valor={minutos(v.pausaMin)} /> : null}
        {v.promo && <Fila etiqueta={v.promo.nombre} valor={`−${fmtMoney(v.promo.descuento)}`} />}
      </div>

      {v.items.length > 0 && (
        <div className="space-y-1 border-t border-borde-soft pt-3">
          <Rotulo icono="cart">Consumos</Rotulo>
          {v.items.map((i) => (
            <Fila key={`${i.productoId}-${i.precio}`} etiqueta={`${fmtCantidad(i.cant)} × ${i.nombre}`} valor={fmtMoney(i.precio * i.cant)} />
          ))}
        </div>
      )}

      <div className="border-t border-borde-soft pt-3">
        <Fila etiqueta="Total" valor={fmtMoney(v.total)} fuerte />
      </div>

      <ComoSePago v={v} ahora={ahora} />
    </div>
  );
}

/**
 * Cómo se pagó, pago por pago: el medio con su ícono y su color, cuánto, y
 * cuándo entró (lo cobrado antes de cerrar, con su hora de verdad). Con dos o
 * más medios, arriba lo que fue por cada uno: es lo que Miguel no encontraba,
 * qué parte de la mesa buscar en el banco.
 */
function ComoSePago({ v, ahora }: { v: VentaApi; ahora: number }) {
  const medios = porMedio(v.pagos);
  return (
    <div className="space-y-2.5 border-t border-borde-soft pt-3">
      <Rotulo icono="billetera">Cómo se pagó</Rotulo>
      {medios.length >= 2 && (
        <p className="flex flex-wrap gap-x-4 gap-y-1 rounded-lg bg-slate-50 px-3 py-2">
          {medios.map((m) => (
            <span key={m.medio} className="inline-flex items-center gap-1.5 text-texto-2">
              <PuntoMedio medio={m.medio} />
              {textoPorMedio(m.medio)} <b className="tabular-nums text-texto">{fmtMoney(m.monto)}</b>
            </span>
          ))}
        </p>
      )}
      {v.pagos.length === 0 ? (
        <p className="text-texto-3">Sin pagos registrados.</p>
      ) : (
        // Sin <ul>: los renglones del historial de abajo son la única lista del diálogo.
        <div className="space-y-2.5">
          {v.pagos.map((p) => (
            <div key={p.id} className="flex items-start gap-3">
              <IconoMedio medio={p.metodo} size={30} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 break-words font-semibold text-texto">
                    {tipoDeMedio(p.metodo) === "efectivo" ? "Efectivo" : p.metodo}
                  </span>
                  <span className="shrink-0 font-bold tabular-nums text-texto">{fmtMoney(p.monto)}</span>
                </div>
                <p className="text-[12px] text-texto-3">{cuandoSeCobro(p, ahora)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      {v.devuelto ? (
        <div className="space-y-1">
          {esPositivo(v.devuelto.efectivo) && <Fila etiqueta="Devuelto en efectivo" valor={fmtMoney(v.devuelto.efectivo)} />}
          {v.devuelto.otros.map((o) => (
            <Fila key={o.metodo} etiqueta={`Devuelto por ${o.metodo}`} valor={fmtMoney(o.monto)} />
          ))}
        </div>
      ) : (
        v.recibido !== undefined && (
          <div className="space-y-1">
            <Fila etiqueta="Le dieron" valor={fmtMoney(v.recibido)} />
            <Fila etiqueta="Cambio" valor={fmtMoney(v.cambio ?? 0)} />
          </div>
        )
      )}
    </div>
  );
}
