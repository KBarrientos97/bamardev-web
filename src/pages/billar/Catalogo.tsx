import { useMemo, useState, type ReactNode } from "react";
import { Icon } from "../../components/Icon";
import IconoProducto from "../../components/IconoProducto";
import { iconoPorLlave, inicialesDe } from "../../lib/iconosArticulo";
import { fmtMoney } from "../../lib/format";
import { contiene } from "../../lib/texto";
import { useCoincideMedia } from "../../lib/useCoincideMedia";
import type { Carrito } from "./carrito";
import type { ProductoBillar } from "./tipos";
import { BotonB, ChipFiltro } from "./ui";

/**
 * El catálogo del POS para el billar (§7.4, §7.7): buscador, categorías y la
 * grilla con el stock. Lo usan el consumo de una mesa y la venta rápida.
 *
 * Es el catálogo de la sucursal, el mismo del POS, con lo que queda para
 * vender: lo cargado a mesas abiertas ya está restado (todavía no salió del
 * stock, pero tampoco se puede ofrecer a otra mesa). Los servicios no llevan
 * stock.
 */

/**
 * El color del monograma por categoría, como en la maqueta: las categorías con
 * que arranca un billar (el kit del rubro). Una categoría propia del negocio
 * toma el de la paleta. Va acá y no en `colorDeCategoria` (lib/iconosArticulo)
 * porque ése lo comparten el POS del restaurante y la farmacia: sumarle
 * "Comida" le cambiaría el color a un restaurante que tenga una categoría con
 * ese nombre.
 */
const COLOR_CATEGORIA: Record<string, { bg: string; fg: string }> = {
  Cervezas: { bg: "#FEF3C7", fg: "#B45309" },
  Bebidas: { bg: "#DBEAFE", fg: "#1D4ED8" },
  Snacks: { bg: "#FFE4E6", fg: "#BE123C" },
  Comida: { bg: "#D1FAE5", fg: "#047857" },
  Accesorios: { bg: "#EDE9FE", fg: "#6D28D9" },
};

export function Catalogo({
  productos,
  carrito,
  onAgregar,
}: {
  productos: ProductoBillar[];
  carrito: Carrito;
  onAgregar: (id: number) => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [categoria, setCategoria] = useState<string | null>(null);
  // Las del kit en el orden de la maqueta (las cervezas primero, que es lo que
  // más sale); las que haya creado el negocio, después y por nombre.
  const categorias = useMemo(() => {
    const kit = Object.keys(COLOR_CATEGORIA);
    const lugar = (c: string) => (kit.includes(c) ? kit.indexOf(c) : kit.length);
    return [...new Set(productos.map((p) => p.categoria))].sort(
      (a, b) => lugar(a) - lugar(b) || a.localeCompare(b, "es"),
    );
  }, [productos]);
  // Como el Punto de venta: sin distinguir tildes ni mayúsculas ("mani" encuentra
  // "Maní salado"), por la categoría y por el código de barras. Buscaba sólo
  // con tilde y por el id interno, que ningún cajero conoce (prueba profunda,
  // 18-oct). La ñ sigue siendo otra letra (ver lib/texto.ts).
  const visibles = useMemo(() => {
    const q = busqueda.trim();
    return productos.filter(
      (p) =>
        (!categoria || p.categoria === categoria) &&
        (!q || contiene(p.nombre, q) || contiene(p.categoria, q) || contiene(p.codBarra, q)),
    );
  }, [productos, busqueda, categoria]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative w-full sm:w-72">
          <span className="sr-only">Buscar producto o código</span>
          <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-texto-4">
            <Icon name="search" size={17} />
          </span>
          <input
            autoFocus
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar producto o código"
            className="h-11 w-full rounded-full border border-borde bg-white pl-10 pr-4 text-sm outline-none placeholder:text-texto-4 focus:border-primary focus:ring-2 focus:ring-primary-100"
          />
        </label>
        <div className="-mx-4 flex w-[calc(100%+2rem)] gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:w-auto sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
          <ChipFiltro activo={categoria === null} etiqueta="Todos" onClick={() => setCategoria(null)} />
          {categorias.map((c) => (
            <ChipFiltro key={c} activo={categoria === c} etiqueta={c} onClick={() => setCategoria(c)} />
          ))}
        </div>
      </div>

      {visibles.length === 0 ? (
        <p className="py-10 text-center text-sm text-texto-3">
          {productos.length === 0
            ? "No hay productos para vender en esta sucursal."
            : busqueda
              ? `No hay productos con "${busqueda}".`
              : "No hay productos en esta categoría."}
        </p>
      ) : (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))] sm:[grid-template-columns:repeat(auto-fill,minmax(180px,1fr))]">
          {visibles.map((p) => {
            const enCarrito = carrito.get(p.id) ?? 0;
            // null: un servicio, sin stock que cuidar.
            const disponible = p.stock === null ? null : p.stock - enCarrito;
            const agotado = p.stock !== null && p.stock <= 0;
            const color = COLOR_CATEGORIA[p.categoria] ?? { bg: "var(--monograma-bg)", fg: "var(--monograma-fg)" };
            return (
              <button
                key={p.id}
                type="button"
                disabled={agotado || (disponible !== null && disponible <= 0)}
                onClick={() => onAgregar(p.id)}
                aria-label={`${p.nombre}, ${fmtMoney(p.precio)}${enCarrito ? `, ${enCarrito} en el pedido` : ""}`}
                className={`relative flex flex-col rounded-2xl border bg-white p-3 text-left transition-shadow disabled:cursor-not-allowed ${
                  enCarrito ? "border-primary/60 bg-primary-50/40 shadow-sm" : "border-borde hover:shadow-md"
                } ${agotado ? "opacity-55" : ""}`}
              >
                {enCarrito > 0 && (
                  <span className="absolute right-2 top-2 z-10 flex h-6 min-w-6 items-center justify-center rounded-full bg-primary-boton px-1.5 text-[12px] font-bold text-white">
                    {enCarrito}
                  </span>
                )}
                {/* Con ícono, el mismo del Punto de venta: antes acá salían
                    siempre las iniciales y el cajero no reconocía en el consumo
                    los artículos que en el POS veía con su foto (QA del 23-oct).
                    El fondo neutro y la misma altura dejan la grilla pareja. */}
                {iconoPorLlave(p.icono) ? (
                  <span aria-hidden className="flex h-[68px] items-center justify-center rounded-xl bg-muted">
                    <IconoProducto nombre={p.nombre} icono={p.icono} size={56} />
                  </span>
                ) : (
                  <span
                    aria-hidden
                    className="flex h-[68px] items-center justify-center rounded-xl text-[22px] font-extrabold"
                    style={{ background: color.bg, color: color.fg }}
                  >
                    {inicialesDe(p.nombre)}
                  </span>
                )}
                <span className="mt-2.5 line-clamp-2 min-h-[2.5em] text-[13px] font-semibold leading-tight text-texto">
                  {p.nombre}
                </span>
                <span className="mt-2 flex items-center justify-between gap-1">
                  <span className="text-[14px] font-extrabold tabular-nums text-primary-700">{fmtMoney(p.precio)}</span>
                  {agotado ? (
                    <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-700">
                      Agotado
                    </span>
                  ) : disponible !== null ? (
                    <span className="rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-bold tabular-nums text-primary-700">
                      {disponible} disp.
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Los renglones del pedido, con − / + (o el tachito en el último). */
export function LineasPedido({
  carrito,
  productos,
  onPoner,
}: {
  carrito: Carrito;
  productos: ProductoBillar[];
  onPoner: (id: number, cant: number) => void;
}) {
  return (
    <ul className="divide-y divide-borde-soft">
      {[...carrito.entries()].map(([id, cant]) => {
        const p = productos.find((x) => x.id === id);
        if (!p) return null;
        return (
          <li key={id} className="flex items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-texto">{p.nombre}</p>
              <p className="text-[11px] text-texto-3">{fmtMoney(p.precio)} c/u</p>
            </div>
            <div className="flex items-center rounded-full ring-1 ring-inset ring-borde">
              <button
                type="button"
                onClick={() => onPoner(id, cant - 1)}
                aria-label={cant === 1 ? `Quitar ${p.nombre}` : `Uno menos de ${p.nombre}`}
                className="flex h-9 w-9 items-center justify-center rounded-full text-texto-2 hover:bg-muted"
              >
                <Icon name={cant === 1 ? "trash" : "minus"} size={15} />
              </button>
              <span className="w-6 text-center text-sm font-bold tabular-nums">{cant}</span>
              <button
                type="button"
                onClick={() => onPoner(id, cant + 1)}
                // Un servicio no tiene stock (null): `cant >= null` daba true y el
                // "+" quedaba muerto.
                disabled={p.stock !== null && cant >= p.stock}
                aria-label={`Uno más de ${p.nombre}`}
                className="flex h-9 w-9 items-center justify-center rounded-full text-texto-2 hover:bg-muted disabled:opacity-40"
              >
                <Icon name="plus" size={15} />
              </button>
            </div>
            <span className="w-20 text-right text-[13px] font-bold tabular-nums text-texto">{fmtMoney(p.precio * cant)}</span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Catálogo a la izquierda y pedido a la derecha. En tablet y celular el pedido
 * baja a una barra fija con el total, y se despliega como hoja.
 */
export function PantallaPedido({
  catalogo,
  pedido,
  cantidad,
  total,
}: {
  catalogo: ReactNode;
  pedido: ReactNode;
  cantidad: number;
  total: number;
}) {
  const ancha = useCoincideMedia("(min-width: 1024px)");
  const [hoja, setHoja] = useState(false);
  return (
    <div className="flex min-h-0 flex-1">
      {/* Sin el panel al costado, la barra fija de abajo taparía lo último. */}
      <div className={`min-w-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5 ${ancha ? "" : "pb-28 sm:pb-28"}`}>
        {catalogo}
      </div>
      {ancha ? (
        <aside className="flex w-[400px] shrink-0 flex-col border-l border-borde bg-white xl:w-[420px]">{pedido}</aside>
      ) : (
        <>
          <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t border-borde bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgb(15_23_42/0.06)]">
            <button type="button" onClick={() => setHoja(true)} className="min-w-0 flex-1 text-left">
              <p className="text-[12px] text-texto-3">
                {cantidad} {cantidad === 1 ? "producto" : "productos"}
              </p>
              <p className="text-lg font-extrabold tabular-nums text-texto">{fmtMoney(total)}</p>
            </button>
            <BotonB variante="verde" icono="cart" onClick={() => setHoja(true)}>
              Ver pedido
            </BotonB>
          </div>
          {hoja && (
            <div className="fixed inset-0 z-40">
              <div className="absolute inset-0 bg-slate-900/40" onClick={() => setHoja(false)} />
              <aside className="absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl">
                <div className="flex shrink-0 items-center justify-between px-4 pt-2">
                  <span aria-hidden className="mx-auto h-1.5 w-10 rounded-full bg-slate-200" />
                </div>
                <button
                  type="button"
                  onClick={() => setHoja(false)}
                  aria-label="Cerrar el pedido"
                  className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white text-texto-2 ring-1 ring-inset ring-borde"
                >
                  <Icon name="close" size={16} />
                </button>
                {pedido}
              </aside>
            </div>
          )}
        </>
      )}
    </div>
  );
}
