/**
 * Orden en el que cada cajero ve las cards del Punto de Venta.
 *
 * Port de `OrdenProductosPos.kt` (Android): mismas reglas, para que el cajero
 * que usa la tablet y la web no encuentre dos comportamientos distintos.
 *
 * Es una preferencia de presentación del equipo, no un dato del negocio: vive
 * en localStorage y no viaja al backend. La clave incluye el usuario (dos
 * cajeros de la misma máquina acomodan la grilla distinto) y el alias del
 * negocio (para que el orden de un cliente no se le aplique a otro).
 */

const PREFIJO = "bamardev.pos.orden";
const SEPARADOR = ",";

function clave(alias: string | null | undefined, usuario: string | null | undefined): string {
  return `${PREFIJO}_${alias || "sin_negocio"}_${usuario || "sin_usuario"}`;
}

/** Ids de artículo en el orden guardado; vacío si el cajero nunca movió nada. */
export function leerOrden(
  alias: string | null | undefined,
  usuario: string | null | undefined,
): number[] {
  try {
    const raw = localStorage.getItem(clave(alias, usuario));
    if (!raw) return [];
    return raw
      .split(SEPARADOR)
      .map((s) => Number(s))
      .filter((n) => Number.isInteger(n));
  } catch {
    // Modo privado o storage lleno: se trabaja sin orden guardado, que es
    // exactamente lo que pasa la primera vez.
    return [];
  }
}

export function guardarOrden(
  alias: string | null | undefined,
  usuario: string | null | undefined,
  ids: number[],
): void {
  try {
    localStorage.setItem(clave(alias, usuario), ids.join(SEPARADOR));
  } catch {
    /* si no se puede guardar, la grilla igual quedó ordenada en pantalla */
  }
}

/**
 * Ordena `items` según lo guardado. Lo que no figure en el orden —un artículo
 * recién creado en el backend— queda al final respetando el orden en que vino:
 * así aparece igual aunque el cajero todavía no lo acomode.
 */
export function aplicarOrden<T>(items: T[], orden: number[], id: (x: T) => number): T[] {
  if (orden.length === 0) return items;
  const posicionDe = new Map(orden.map((idGuardado, i) => [idGuardado, i]));
  // `sort` de JS es estable (ES2019+), así que los que no están en el orden
  // conservan entre sí el que traía el backend.
  return [...items].sort(
    (a, b) =>
      (posicionDe.get(id(a)) ?? Number.MAX_SAFE_INTEGER) -
      (posicionDe.get(id(b)) ?? Number.MAX_SAFE_INTEGER),
  );
}

/**
 * Devuelve `todos` con los productos visibles reacomodados según `idsVisibles`,
 * que es el orden en que quedaron en pantalla al arrastrar.
 *
 * La grilla puede estar filtrada por categoría o por búsqueda, así que sólo se
 * reasignan las posiciones que YA ocupaban los visibles: lo que no se ve se
 * queda donde estaba. Sin esto, reordenar dentro de "Pollos" mandaría al fondo
 * a todas las demás categorías.
 *
 * Devuelve `null` si los visibles no calzan con la lista completa (p. ej. el
 * catálogo se recargó mientras se arrastraba): en ese caso no hay nada
 * confiable que guardar.
 */
export function reordenarVisibles<T>(
  todos: T[],
  idsVisibles: number[],
  id: (x: T) => number,
): T[] | null {
  if (idsVisibles.length === 0) return null;
  const visibles = new Set(idsVisibles);
  const huecos = todos.map((x, i) => (visibles.has(id(x)) ? i : -1)).filter((i) => i >= 0);
  if (huecos.length !== idsVisibles.length) return null;

  const porId = new Map(todos.map((x) => [id(x), x]));
  const reordenado = [...todos];
  for (let i = 0; i < huecos.length; i++) {
    const item = porId.get(idsVisibles[i]);
    if (item === undefined) return null;
    reordenado[huecos[i]] = item;
  }
  return reordenado;
}
