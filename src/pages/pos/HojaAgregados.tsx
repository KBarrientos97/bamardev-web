import { useMemo, useState } from "react";
import { Icon } from "../../components/Icon";
import IconoProducto from "../../components/IconoProducto";
import { Boton, Modal } from "../../components/ui";
import { gruposDelProducto, textoIncluye, totalPorUnidad, vistaDeAgregados } from "../../lib/agregados/calculo";
import { elegidosDeToques, toquesDeElegidos, type Toque } from "../../lib/agregados/toques";
import type { AgregadoElegido, CatalogoAgregados } from "../../lib/agregados/tipos";
import { fmtMoney } from "../../lib/format";
import type { Producto } from "../../types";

/**
 * La hoja de toppings de un producto (PLAN-AGREGADOS §7.4): se abre al tocar un
 * producto con grupo y también al tocar uno del carrito para editarlo.
 *
 * Muestra lo mismo que va a calcular el backend (`vistaDeAgregados` es su misma
 * regla): «2 de 2 incluidos», los extras con su precio y el total en vivo. Se
 * puede agregar sin ningún topping: el vaso se vende igual, sin descuento.
 */
export default function HojaAgregados({
  producto,
  catalogo,
  inicial,
  onConfirmar,
  onClose,
}: {
  producto: Producto;
  catalogo: CatalogoAgregados;
  /** Los toppings que ya tenía la línea que se edita; sin esto, una hoja vacía. */
  inicial?: AgregadoElegido[];
  onConfirmar: (elegidos: AgregadoElegido[]) => void;
  onClose: () => void;
}) {
  const grupos = useMemo(() => gruposDelProducto(catalogo, producto.id), [catalogo, producto.id]);
  const [toques, setToques] = useState<Toque[]>(() => toquesDeElegidos(inicial));

  const elegidos = useMemo(() => elegidosDeToques(toques), [toques]);
  const vista = useMemo(() => vistaDeAgregados(elegidos, producto.id, catalogo), [elegidos, producto.id, catalogo]);
  const total = Math.round((producto.precio + vista.extraPorUnidad) * 100) / 100;

  const cuantos = (grupoId: number, productoId: number) =>
    toques.filter((t) => t.grupoId === grupoId && t.productoId === productoId).length;
  const sumar = (grupoId: number, productoId: number) => setToques((t) => [...t, { grupoId, productoId }]);
  const restar = (grupoId: number, productoId: number) =>
    setToques((t) => {
      // Se saca el ÚLTIMO toque de ese topping: lo que se eligió antes conserva su lugar.
      const i = t.map((x) => x.grupoId === grupoId && x.productoId === productoId).lastIndexOf(true);
      return i < 0 ? t : [...t.slice(0, i), ...t.slice(i + 1)];
    });

  return (
    <Modal
      abierto
      titulo={`Toppings de ${producto.nombre}`}
      subtitulo={`${fmtMoney(producto.precio)} · ${grupos.map((g) => textoIncluye(g.grupo.nombre, g.incluidos)).join(" · ")}`}
      onClose={onClose}
      ancho="max-w-lg"
      cerrarAlClicAfuera={false}
      acciones={
        // En el celular el total y los dos botones no entran en una fila: el
        // total se apretaba y «Bs 10,00» se partía en dos renglones. El monto
        // no se parte y, si no hay lugar, los botones bajan juntos a la fila
        // de abajo; en la compu queda todo en una fila, como siempre.
        <div className="flex w-full flex-wrap items-center justify-end gap-3">
          <div className="mr-auto">
            <p className="text-[11px] font-bold uppercase tracking-wide text-texto-4">Total</p>
            <p className="whitespace-nowrap text-xl font-extrabold text-texto" aria-live="polite" data-testid="total-hoja">
              {fmtMoney(total)}
            </p>
          </div>
          <div className="flex gap-3">
            <Boton variante="ghost" onClick={onClose}>
              Cancelar
            </Boton>
            <Boton icono="check" onClick={() => onConfirmar(elegidos)}>
              {inicial ? "Guardar cambios" : "Agregar al pedido"}
            </Boton>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {grupos.map(({ grupo, incluidos }) => {
          const deEsteGrupo = toques.filter((t) => t.grupoId === grupo.id);
          const hechos = totalPorUnidad(deEsteGrupo.map((t) => ({ productoId: t.productoId, cantidad: 1 })));
          const extras = Math.max(0, hechos - incluidos);
          const alMaximo = grupo.maximo != null && hechos >= grupo.maximo;
          return (
            <section key={grupo.id} aria-label={grupo.nombre}>
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h3 className="text-[13px] font-bold text-texto">{grupo.nombre}</h3>
                <p className="text-[12px] text-texto-3">
                  {grupo.precioExtra != null ? `Extra a ${fmtMoney(grupo.precioExtra)} c/u` : "Extra al precio del topping"}
                </p>
              </div>
              <p
                className={`mb-2 rounded-xl px-3 py-2 text-[13px] font-semibold ${
                  extras > 0 ? "bg-warning-bg text-warning-text" : "bg-primary-50 text-primary-700"
                }`}
              >
                {incluidos > 0 ? `${Math.min(hechos, incluidos)} de ${incluidos} incluidos` : "Sin toppings incluidos"}
                {extras > 0 && ` · ${extras} ${extras === 1 ? "extra" : "extras"}`}
                {grupo.maximo != null && ` · hasta ${grupo.maximo}`}
              </p>
              <ul className="divide-y divide-borde-soft rounded-xl border border-borde">
                {grupo.opciones.map((o) => {
                  const n = cuantos(grupo.id, o.productoId);
                  return (
                    <li key={o.productoId} className="flex items-center gap-2.5 px-3 py-2">
                      <IconoProducto nombre={o.nombre} icono={o.icono} categoria={grupo.nombre} size={32} />
                      <span className="min-w-0 flex-1">
                        {/* El nombre entero, en dos renglones si hace falta (como en
                            la hoja de la página del cliente): cortado con «…», en
                            el celular quedaba «Topping chispas de cho…». */}
                        <span className="block break-words text-sm font-semibold text-texto">{o.nombre}</span>
                        <span className="block text-xs text-texto-3">
                          {fmtMoney(grupo.precioExtra != null ? grupo.precioExtra : o.precio)}
                        </span>
                      </span>
                      <div className="flex items-center gap-1 rounded-lg border border-borde">
                        <button
                          onClick={() => restar(grupo.id, o.productoId)}
                          disabled={n === 0}
                          aria-label={`Quitar ${o.nombre}`}
                          className="p-2.5 text-texto-2 hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent"
                        >
                          <Icon name="minus" size={16} />
                        </button>
                        <span className="min-w-6 text-center text-[13px] font-bold" aria-label={`${o.nombre}: ${n}`}>
                          {n}
                        </span>
                        <button
                          onClick={() => sumar(grupo.id, o.productoId)}
                          disabled={alMaximo}
                          aria-label={`Agregar ${o.nombre}`}
                          className="p-2.5 text-texto-2 hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent"
                        >
                          <Icon name="plus" size={16} />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}

        {vista.hijas.some((h) => !h.incluido) && (
          <dl className="space-y-0.5 rounded-xl bg-muted px-3 py-2.5 text-[13px] text-texto-2">
            {vista.hijas
              .filter((h) => !h.incluido)
              .map((h) => (
                <div key={`${h.productoId}-${h.precio}`} className="flex justify-between gap-2">
                  <dt>
                    Extra: {h.cantidad > 1 ? `${h.cantidad} × ` : ""}
                    {h.nombre}
                  </dt>
                  <dd className="font-bold text-texto">{fmtMoney(h.subtotal)}</dd>
                </div>
              ))}
          </dl>
        )}
      </div>
    </Modal>
  );
}
