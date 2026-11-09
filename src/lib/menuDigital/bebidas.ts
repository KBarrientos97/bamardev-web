import { iconoPorLlave } from "../iconosArticulo";

/**
 * Qué es bebida en el menú digital: para el «Sólo comida / Sólo bebidas» del
 * editor (Kevin, 8-nov: "destiquear todo lo que es bebidas rápido") y para que
 * los diseños animados muestren primero lo elaborado y las bebidas aparte.
 *
 * No hay un campo "es bebida" en el artículo, así que se adivina, en este
 * orden:
 * 1. Por el nombre de la categoría ("Bebidas", "Gaseosas", "Jugos"…). Es lo
 *    que arma el dueño y lo que más acierta.
 * 2. Si el nombre no dice nada, por los íconos de sus platos: una categoría
 *    "Varios" con la gaseosa, el agua y la cerveza es de bebidas.
 *
 * Un nombre de comida gana aunque nombre una bebida: "Combos con gaseosa" es
 * comida.
 */

const PALABRAS_BEBIDA =
  /\b(bebidas?|refrescos?|gaseosas?|sodas?|jugos?|aguas?|cervezas?|licor(es)?|tragos?|cocteles?|coctel|cafes?|infusion(es)?|batidos?|limonadas?|vinos?|drinks?|frappes?|malteadas?|tes|te|mates?)\b/;

const PALABRAS_COMIDA =
  /\b(combos?|pollos?|platos?|almuerzos?|hamburguesas?|comidas?|broaster|brasa|menus?|promos?|pizzas?|sandwich(es)?|postres?|alitas?|salchipapas?|parrillas?)\b/;

/** Íconos de bebida que el catálogo guarda en otras secciones (pollería, licorería). */
const ICONO_BEBIDA_SUELTO =
  /^(soda|jugos|cerveza_|vino_tinto|cuba_libre|red_bull|monster|black_energy|sirius|powerade|urbano_blue|agua_botella)/;

const normal = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export function iconoDeBebida(llave: string | null | undefined): boolean {
  const i = iconoPorLlave(llave);
  if (!i) return false;
  return i.categoria === "bebidas" || ICONO_BEBIDA_SUELTO.test(i.llave);
}

/** Por el nombre: true = bebida, false = comida, null = no dice. */
function porNombre(nombre: string): boolean | null {
  const n = normal(nombre);
  if (PALABRAS_COMIDA.test(n)) return false;
  if (PALABRAS_BEBIDA.test(n)) return true;
  return null;
}

/**
 * Los ids de las categorías de bebidas. Por íconos hace falta que la mayoría
 * clara (3 de cada 4) lo sean, y al menos dos platos: una categoría con un solo
 * jugo no alcanza para decidir.
 */
export function categoriasDeBebidas(
  categorias: { id: number; nombre: string }[],
  platos: { categoriaId: number | null; icono: string | null }[],
): Set<number> {
  const r = new Set<number>();
  for (const c of categorias) {
    const dice = porNombre(c.nombre);
    if (dice !== null) {
      if (dice) r.add(c.id);
      continue;
    }
    const suyos = platos.filter((p) => p.categoriaId === c.id);
    const bebidas = suyos.filter((p) => iconoDeBebida(p.icono)).length;
    if (suyos.length >= 2 && bebidas / suyos.length >= 0.75) r.add(c.id);
  }
  return r;
}

/** Un plato es bebida si su categoría lo es; sin categoría, por su ícono. */
export function esBebida(
  plato: { categoriaId: number | null; icono: string | null },
  deBebidas: Set<number>,
): boolean {
  return plato.categoriaId != null ? deBebidas.has(plato.categoriaId) : iconoDeBebida(plato.icono);
}
