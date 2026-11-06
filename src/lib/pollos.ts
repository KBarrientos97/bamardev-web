/**
 * Cuántos pollos salieron, contando presas (pollería, 6-nov).
 *
 * Kevin, mirando Ventas y ganancia: "1 pollo entero se saca 8 presas… esos 36,
 * cuántos pollos fueron". Cada artículo dice cuántas presas lleva
 * (`presasPollo`: 8 el entero, 4 el medio, 2 el cuarto, 1 la presa) y acá se
 * suma cantidad × presas y se pasa a pollos enteros más las presas que sobran.
 *
 * Se escribe "12 pollos y 3 presas" y no "12,4 pollos": un decimal de pollo no
 * se lee (¿12,4 son 12 y 4 presas o 12 y 3?), y lo que el dueño compara con la
 * cocina es eso, pollos enteros y presas sueltas.
 *
 * Lo que no lleva pollo no tiene `presas` y no suma: en un negocio sin
 * artículos con presas el total es 0 y la pantalla no muestra nada.
 */

/** Un pollo se corta en 8 presas: lo que dijo Kevin de su pollería. */
export const PRESAS_POR_POLLO = 8;

/** Algo vendido que puede llevar pollo: cuántos salieron y cuántas presas lleva cada uno. */
export interface ConPresas {
  cantidad: number;
  /** Presas por unidad; ausente o 0 = no lleva pollo. */
  presas?: number | null;
}

/**
 * Las presas que salieron en total. Se redondea a la presa: una cantidad
 * fraccionada (lo vendido por peso) no lleva presas, y el ruido de sumar
 * decimales no tiene que asomar como "0,0000001 presas".
 */
export function presasVendidas(items: readonly ConPresas[]): number {
  let total = 0;
  for (const i of items) if (i.presas && i.presas > 0) total += i.cantidad * i.presas;
  return Math.round(total);
}

/** Pollos enteros y presas que sobran. */
export function enPollos(presas: number): { pollos: number; presas: number } {
  const p = Math.max(0, Math.round(presas));
  return { pollos: Math.floor(p / PRESAS_POR_POLLO), presas: p % PRESAS_POR_POLLO };
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/**
 * "12 pollos y 3 presas", "1 pollo", "5 presas". Sin presas, `null`: un
 * "0 pollos" en un negocio que no vende pollo se lee como un dato y no lo es.
 */
export function textoPollos(presas: number): string | null {
  const e = enPollos(presas);
  if (e.pollos === 0 && e.presas === 0) return null;
  if (e.pollos === 0) return plural(e.presas, "presa", "presas");
  if (e.presas === 0) return plural(e.pollos, "pollo", "pollos");
  return `${plural(e.pollos, "pollo", "pollos")} y ${plural(e.presas, "presa", "presas")}`;
}

/**
 * Para una celda de tabla: "12", "12 y 3 pr.", "3 pr.". La columna ya dice
 * POLLOS arriba; sin presas, "—" (la fila no lleva pollo).
 */
export function textoPollosCorto(presas: number): string {
  const e = enPollos(presas);
  if (e.pollos === 0 && e.presas === 0) return "—";
  if (e.pollos === 0) return `${e.presas} pr.`;
  if (e.presas === 0) return String(e.pollos);
  return `${e.pollos} y ${e.presas} pr.`;
}
