import { Icon } from "../../components/Icon";
import MarcaPlataforma from "../../components/MarcaPlataforma";
import { Badge, Boton, Modal } from "../../components/ui";
import { fmtCantidad, fmtFechaHora, fmtHora, fmtMoney } from "../../lib/format";
import type { PedidoPlataformaEncolado } from "../../lib/offline/cola";
import { NOMBRE_PLATAFORMA, type PedidoPlataforma } from "../../lib/pedidosPlataforma/tipos";

/**
 * Las piezas de los pedidos de Yango y PedidosYa en «Ventas del turno»
 * (PLAN-PEDIDOS-PLATAFORMA §10.2). Son filas propias, con la marca de la
 * plataforma y la leyenda «No se cobra»: no son una venta y no suman a nada
 * del turno (eso lo cuida `PantallaHistorial`; acá sólo se dibujan).
 */

/** El N° de la app o, si no lo cargaron, «Pedido #id». */
export const nombreDelPedido = (p: Pick<PedidoPlataforma, "codigoExterno" | "id">): string =>
  p.codigoExterno ? `N° ${p.codigoExterno}` : `Pedido #${p.id}`;

/** Una fila de la lista del turno, mezclada con las ventas. Toda ella abre el detalle. */
export function FilaPedidoDelTurno({ p, onAbrir }: { p: PedidoPlataforma; onAbrir: () => void }) {
  const anulado = !!p.anuladoEn;
  return (
    <li>
      <button
        onClick={onAbrir}
        aria-label={`Ver el pedido de ${NOMBRE_PLATAFORMA[p.plataforma]} ${nombreDelPedido(p)}`}
        className="card flex w-full items-center gap-3 p-3.5 text-left transition-shadow hover:shadow-md lg:rounded-none lg:border-0 lg:px-5 lg:shadow-none lg:hover:bg-muted lg:hover:shadow-none"
      >
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            anulado ? "bg-danger-bg text-danger-text" : "bg-slate-100 text-texto-2"
          }`}
        >
          <Icon name={anulado ? "x" : "bolsa"} size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={`text-[13px] font-bold text-texto ${anulado ? "line-through" : ""}`}>{nombreDelPedido(p)}</span>
            <MarcaPlataforma plataforma={p.plataforma} />
            {anulado && <Badge tono="rojo">Anulado</Badge>}
          </div>
          <p className="mt-0.5 text-xs text-texto-3">
            {fmtHora(p.fecha)} · {p.detalles.length} {p.detalles.length === 1 ? "producto" : "productos"}
            {p.usuario ? ` · ${p.usuario.nombre}` : ""}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className={`text-sm font-bold ${anulado ? "text-texto-4 line-through" : "text-texto"}`}>{fmtMoney(p.total)}</p>
          <p className="text-[11px] font-semibold text-texto-3">No se cobra</p>
        </div>
      </button>
    </li>
  );
}

/** Lo que llevaba, quién lo registró y cuándo; y «Anular» sólo a quien puede. */
export function DetallePedidoDelTurno({
  p,
  sucursal,
  onClose,
  onAnular,
}: {
  p: PedidoPlataforma;
  /** El local, si el negocio tiene varios: de dónde salió el stock. */
  sucursal?: boolean;
  onClose: () => void;
  /** Sin `plataformas.anular` no llega: el botón no existe. */
  onAnular?: () => void;
}) {
  const nombre = NOMBRE_PLATAFORMA[p.plataforma];
  const anulado = !!p.anuladoEn;
  return (
    <Modal
      abierto
      titulo={`Pedido de ${nombre}`}
      subtitulo={`${nombreDelPedido(p)} · ${fmtMoney(p.total)}`}
      onClose={onClose}
      ancho="max-w-md"
      acciones={
        <>
          <Boton variante="ghost" onClick={onClose}>
            Cerrar
          </Boton>
          {onAnular && !anulado && (
            <Boton variante="danger" onClick={onAnular}>
              Anular
            </Boton>
          )}
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <MarcaPlataforma plataforma={p.plataforma} />
          {anulado && <Badge tono="rojo">Anulado</Badge>}
          {p.sinStock && !anulado && (
            <span className="text-[12px] font-semibold text-warning-text">Salió sin stock cargado</span>
          )}
        </div>

        <ul className="divide-y divide-borde-soft rounded-xl border border-borde-soft">
          {p.detalles.map((d, k) => (
            <li key={`${d.productoId ?? "x"}-${k}`} className="flex items-center justify-between gap-3 px-3.5 py-2 text-[13px]">
              <span className="min-w-0 truncate text-texto-2">
                <b className="text-texto">{fmtCantidad(d.cantidad)}×</b> {d.nombre}
              </span>
              <span className="shrink-0 font-semibold tabular-nums text-texto">{fmtMoney(d.subtotal)}</span>
            </li>
          ))}
        </ul>
        <div className="flex items-baseline justify-between px-1 text-base font-extrabold text-texto">
          <span>Total</span>
          <span className={`tabular-nums ${anulado ? "text-texto-4 line-through" : ""}`}>{fmtMoney(p.total)}</span>
        </div>

        <dl className="space-y-1 text-[13px]">
          <div className="flex justify-between gap-3">
            <dt className="text-texto-3">Lo registró</dt>
            <dd className="font-semibold text-texto">{p.usuario?.nombre ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-texto-3">Hora</dt>
            <dd className="font-semibold tabular-nums text-texto">{fmtFechaHora(p.fecha)}</dd>
          </div>
          {sucursal && (
            <div className="flex justify-between gap-3">
              <dt className="text-texto-3">Local</dt>
              <dd className="font-semibold text-texto">{p.almacen.nombre}</dd>
            </div>
          )}
        </dl>

        {anulado ? (
          <p className="rounded-xl bg-danger-bg px-3.5 py-2.5 text-[13px] text-danger-text">
            Anulado el {fmtFechaHora(p.anuladoEn)}
            {p.motivoAnulacion ? ` · «${p.motivoAnulacion}»` : ""}. El stock volvió al local.
          </p>
        ) : (
          <p className="rounded-xl bg-muted px-3.5 py-2.5 text-[13px] text-texto-2">
            No se cobra ni entra a la caja: la app de {nombre} le cobra al cliente y le paga al local después.
            {!onAnular && " Si hay que anularlo, pedíselo a un encargado."}
          </p>
        )}
      </div>
    </Modal>
  );
}

/**
 * Los pedidos tomados sin internet que todavía no subieron (como «Cobradas sin
 * internet» de las ventas): la misma marca de la plataforma y «Sin subir». No
 * se abren: el equipo sólo guarda los productos por su id, y el detalle de
 * verdad lo tiene el servidor cuando suben.
 */
export function PedidosSinSubir({ pedidos }: { pedidos: PedidoPlataformaEncolado[] }) {
  if (pedidos.length === 0) return null;
  return (
    <section>
      <h2 className="mb-2 text-[13px] font-bold uppercase tracking-wide text-texto-4">
        Pedidos de plataforma sin subir ({pedidos.length})
      </h2>
      <ul className="space-y-2">
        {pedidos.map((p) => (
          <li key={p.id} className="card flex items-center gap-3 p-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warning-bg text-warning-text">
              <Icon name="clock" size={19} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-[13px] font-bold text-texto">
                  {p.cuerpo.codigoExterno ? `N° ${p.cuerpo.codigoExterno}` : "Sin sincronizar"}
                </span>
                <MarcaPlataforma plataforma={p.resumen.plataforma} />
                <Badge tono="amarillo">Sin subir</Badge>
              </div>
              <p className="mt-0.5 text-xs text-texto-3">
                {fmtHora(p.cuerpo.fechaCliente)} · {p.resumen.lineas} {p.resumen.lineas === 1 ? "producto" : "productos"}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-bold text-texto">{fmtMoney(p.resumen.total)}</p>
              <p className="text-[11px] font-semibold text-texto-3">No se cobra</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
