import { Icon } from "../../components/Icon";
import { Badge } from "../../components/ui";
import { aCentavos } from "../../lib/dinero";
import { fmtCantidad, fmtMoney } from "../../lib/format";
import { BotonB, ChipFiltro, Fila } from "../billar/ui";
import type { EfectivoSupervision, PedidoSupervision, SupervisionRestaurante, VentaSupervision } from "./api";
import {
  buscarVentas,
  conDescuento,
  conteoDeBloques,
  cuando,
  estadoDePedido,
  marcaDePedido,
  mediosDeVenta,
  plural,
  unidades,
  unidadesDeVenta,
  ventasOrdenadas,
} from "./Supervision.datos";

/**
 * Lo que hizo la caja en el turno, de a bloques: las ventas, los pedidos que
 * siguen en camino y el efectivo movido a mano. Son pestañas y no tres listas
 * una abajo de la otra por lo mismo que en la farmacia: en el celular, juntas,
 * eran dos pantallas de scroll antes de llegar a la actividad.
 *
 * Cada venta se toca y se abre ahí mismo con sus renglones y sus pagos (lo
 * trae la misma respuesta), y abierta ofrece Anular a quien puede anular.
 */

export type Pestana = "ventas" | "pedidos" | "efectivo";

const PESTANAS: { clave: Pestana; etiqueta: string }[] = [
  { clave: "ventas", etiqueta: "Ventas" },
  { clave: "pedidos", etiqueta: "Pedidos" },
  { clave: "efectivo", etiqueta: "Efectivo" },
];

const VACIO: Record<Pestana, string> = {
  ventas: "Todavía no hay ventas en este turno.",
  pedidos: "No hay pedidos en camino.",
  efectivo: "No se movió efectivo a mano en este turno.",
};

export function Bloques({
  datos,
  ahora,
  pestana,
  onPestana,
  ventaAbierta,
  onVenta,
  busqueda,
  onBusqueda,
  onAnular,
}: {
  datos: SupervisionRestaurante;
  ahora: number;
  pestana: Pestana;
  onPestana: (p: Pestana) => void;
  /** La venta que se está mirando abierta (también la abre la actividad). */
  ventaAbierta: number | null;
  onVenta: (id: number | null) => void;
  /** Lo escrito en el buscador de ventas: vive arriba para que la actividad lo pueda limpiar. */
  busqueda: string;
  onBusqueda: (texto: string) => void;
  /** Sin el permiso de anular no llega: el botón no existe (no se muestra uno que el servidor rechazaría). */
  onAnular?: (v: VentaSupervision) => void;
}) {
  const conteo = conteoDeBloques(datos);
  const vacio = conteo[pestana] === 0;
  const ventas = pestana === "ventas" ? buscarVentas(ventasOrdenadas(datos.ventas), busqueda) : [];
  return (
    <section aria-label="Lo que hizo la caja" className="card overflow-hidden">
      <div className="flex flex-wrap gap-2 border-b border-borde-soft px-4 py-3">
        {PESTANAS.map((p) => (
          <ChipFiltro key={p.clave} activo={pestana === p.clave} etiqueta={p.etiqueta} cuenta={conteo[p.clave]} onClick={() => onPestana(p.clave)} />
        ))}
      </div>
      {vacio ? (
        <p className="px-5 py-8 text-center text-[13px] text-texto-3">{VACIO[pestana]}</p>
      ) : pestana === "ventas" ? (
        <>
          {/* El dueño llega con el ticket en la mano o con el número que le
              dicta el cajero: buscar es más rápido que bajar por la lista. */}
          <div className="border-b border-borde-soft px-4 py-3 sm:px-5">
            <label className="relative block">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-texto-4">
                <Icon name="search" size={16} />
              </span>
              <input
                type="search"
                value={busqueda}
                onChange={(e) => onBusqueda(e.target.value)}
                aria-label="Buscar una venta"
                placeholder="Comprobante (V-000012), #id o cajero"
                autoComplete="off"
                className="w-full rounded-xl border border-borde bg-white py-2.5 pl-9 pr-3.5 text-sm text-texto outline-none transition-colors placeholder:text-texto-4 focus:border-primary focus:ring-2 focus:ring-primary-100"
              />
            </label>
          </div>
          {ventas.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13px] text-texto-3">Ninguna venta del turno coincide con «{busqueda.trim()}».</p>
          ) : (
            <ul className="divide-y divide-borde-soft">
              {ventas.map((v) => (
                <FilaVenta
                  key={v.id}
                  v={v}
                  ahora={ahora}
                  abierta={ventaAbierta === v.id}
                  onToggle={() => onVenta(ventaAbierta === v.id ? null : v.id)}
                  onAnular={onAnular}
                />
              ))}
            </ul>
          )}
        </>
      ) : pestana === "pedidos" ? (
        <ul className="divide-y divide-borde-soft">
          {datos.pedidos.map((p) => (
            <FilaPedido key={p.id} p={p} ahora={ahora} />
          ))}
        </ul>
      ) : (
        <ul className="divide-y divide-borde-soft">
          {datos.efectivo.map((m) => (
            <FilaEfectivo key={m.id} m={m} ahora={ahora} />
          ))}
        </ul>
      )}
    </section>
  );
}

// ── Ventas ──────────────────────────────────────────────────────────────────

function FilaVenta({
  v,
  ahora,
  abierta,
  onToggle,
  onAnular,
}: {
  v: VentaSupervision;
  ahora: number;
  abierta: boolean;
  onToggle: () => void;
  onAnular?: (v: VentaSupervision) => void;
}) {
  const anulada = v.anulada != null;
  const cual = v.comprobante ?? `#${v.id}`;
  const pedido = marcaDePedido(v.tipoPedido);
  const marcas = anulada || v.fiada || conDescuento(v) || !!pedido;
  return (
    <li id={`venta-${v.id}`} className={abierta ? "bg-primary-50/30" : ""}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={abierta}
        aria-label={`${abierta ? "Cerrar" : "Ver"} el detalle de la venta ${cual}`}
        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none sm:px-5"
      >
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] leading-snug">
            <span className="tabular-nums text-texto-3">{cuando(v.hora, ahora)}</span>
            <b className="font-bold text-texto">{v.quien}</b>
            <span className={`rounded bg-slate-100 px-1.5 py-px text-[12px] font-semibold text-texto-2 ${anulada ? "line-through" : ""}`}>{cual}</span>
            {/* El #id además del comprobante: el V-000001 vuelve a empezar en cada caja y el id no se repite nunca. */}
            {v.comprobante && <span className="text-[11px] tabular-nums text-texto-4">#{v.id}</span>}
          </p>
          <p className="mt-0.5 text-[12px] text-texto-3">
            {plural(v.items.length, "renglón", "renglones")} · {unidades(unidadesDeVenta(v))} · {mediosDeVenta(v)}
            {v.clienteNombre && <> · {v.clienteNombre}</>}
          </p>
          {marcas && (
            <p className="mt-1.5 flex flex-wrap gap-1.5">
              {anulada && <Badge tono="rojo">Anulada</Badge>}
              {v.fiada && <Badge tono="amarillo">Fiada</Badge>}
              {conDescuento(v) && <Badge tono="azul">Con descuento</Badge>}
              {pedido && <Badge tono="gris">{pedido}</Badge>}
            </p>
          )}
          {v.anulada && (
            <p className="mt-1.5 text-[12px] leading-snug text-rose-700">
              Autorizó la anulación <b className="font-semibold">{v.anulada.por}</b> · {cuando(v.anulada.en, ahora)}
              {v.anulada.motivo && <> · «{v.anulada.motivo}»</>}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className={`text-[15px] font-extrabold tabular-nums ${anulada ? "line-through text-texto-3" : "text-texto"}`}>{fmtMoney(v.total)}</span>
          <span aria-hidden className="text-texto-4">
            <Icon name={abierta ? "chevronDown" : "chevronRight"} size={16} />
          </span>
        </div>
      </button>
      {abierta && <DetalleVenta v={v} onAnular={!anulada && onAnular ? () => onAnular(v) : undefined} />}
    </li>
  );
}

/** Los renglones y los pagos de una venta, con lo que ya trae la respuesta; y Anular, si se puede. */
function DetalleVenta({ v, onAnular }: { v: VentaSupervision; onAnular?: () => void }) {
  const pagado = aCentavos(v.pagos.reduce((t, p) => t + p.monto, 0));
  return (
    <div className="border-t border-borde-soft bg-slate-50/60 px-4 py-3 text-[13px] sm:px-5">
      <ul className="space-y-1.5">
        {v.items.map((i, k) => (
          <li key={`${i.productoId}-${k}`} className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 break-words font-semibold text-texto">
              {fmtCantidad(i.cantidad)}× {i.nombre}
            </span>
            <span className="shrink-0 tabular-nums text-texto-2">{fmtMoney(i.subtotal)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 space-y-1 border-t border-borde-soft pt-2">
        {conDescuento(v) && <Fila etiqueta="Descuento" valor={`− ${fmtMoney(v.descuento)}`} />}
        <Fila etiqueta="Total" valor={fmtMoney(v.total)} fuerte />
        {v.pagos.map((p, k) => (
          <Fila key={`${p.medio}-${k}`} etiqueta={`Pagó con ${p.medio}`} valor={fmtMoney(p.monto)} />
        ))}
        {v.fiada && <Fila etiqueta="Quedó fiado" valor={fmtMoney(Math.max(0, aCentavos(v.total - pagado)))} />}
      </div>
      {onAnular && (
        <div className="mt-3 flex justify-end">
          <BotonB variante="rosa" icono="x" onClick={onAnular} aria-label={`Anular la venta ${v.comprobante ?? `#${v.id}`}`}>
            Anular
          </BotonB>
        </div>
      )}
    </div>
  );
}

// ── Pedidos ─────────────────────────────────────────────────────────────────

/**
 * Un delivery o un recoger que salió y no se entregó. No está en lo vendido
 * (todavía no se cobró): es la plata que va a entrar cuando se entregue, y el
 * nombre del repartidor es a quién preguntarle.
 */
function FilaPedido({ p, ahora }: { p: PedidoSupervision; ahora: number }) {
  const estado = estadoDePedido(p.tipo, p.estado);
  return (
    <li className="flex items-start gap-3 px-4 py-3 sm:px-5">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] leading-snug">
          <Badge tono={estado.tono}>{estado.texto}</Badge>
          <span className="font-semibold text-texto">{marcaDePedido(p.tipo) ?? p.tipo}</span>
          <span className="rounded bg-slate-100 px-1.5 py-px text-[12px] font-semibold text-texto-2">{p.comprobante ?? `#${p.id}`}</span>
          {/* Quién vuelve con plata: el pedido que se cobra al entregar. En azul,
              el color de lo que está a medias, y sin mayúsculas para que el
              monto se lea como plata. El ya pagado no lleva marca. */}
          {p.porCobrar && (
            <span className="rounded-lg bg-blue-50 px-2 py-0.5 text-[12px] font-semibold text-blue-800">Por cobrar · {fmtMoney(p.total)}</span>
          )}
        </p>
        <p className="mt-1 break-words text-[13px] font-semibold text-texto">{p.cliente?.trim() || "Sin nombre del cliente"}</p>
        <p className="mt-0.5 text-[12px] text-texto-3">
          <span className="tabular-nums">{cuando(p.hora, ahora)}</span> · tomó <b className="font-semibold text-texto-2">{p.quien}</b>
          {p.repartidor ? (
            <>
              {" "}
              · lo lleva <b className="font-semibold text-texto-2">{p.repartidor}</b>
            </>
          ) : (
            p.tipo === "DELIVERY" && <> · sin repartidor asignado</>
          )}
        </p>
      </div>
      <span className="shrink-0 text-[14px] font-bold tabular-nums text-texto">{fmtMoney(p.total)}</span>
    </li>
  );
}

// ── Efectivo ────────────────────────────────────────────────────────────────

function FilaEfectivo({ m, ahora }: { m: EfectivoSupervision; ahora: number }) {
  const egreso = m.tipo === "EGRESO";
  return (
    <li className="flex items-start gap-3 px-4 py-3 sm:px-5">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] leading-snug text-texto">
          <b className="font-bold">{m.quien}</b> · {m.texto}
        </p>
        <p className="mt-0.5 text-[12px] tabular-nums text-texto-3">{cuando(m.hora, ahora)}</p>
      </div>
      {/* Lo que sale del cajón en rojo, lo que entra en verde: los colores de egreso e ingreso de toda la app. */}
      <span className={`shrink-0 text-[14px] font-bold tabular-nums ${egreso ? "text-rose-700" : "text-primary-700"}`}>
        {egreso ? "−" : "+"} {fmtMoney(m.monto)}
      </span>
    </li>
  );
}
