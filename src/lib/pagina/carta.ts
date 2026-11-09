import type { ItemCatalogoPublico } from "./tipos";

/**
 * Reglas de la carta del sitio (09-nov): las categorías, la búsqueda de la
 * tienda y la separación entre servicios de agenda y productos. Puras, para
 * probarlas sin dibujar nada.
 */

/** Cuántos ítems salen en la portada del sitio; el resto, en la tienda. */
export const TOPE_PORTADA = 6;

/** Las categorías de la carta, en el orden en que aparecen (el del dueño al fijar). */
export function categoriasDe(items: ItemCatalogoPublico[]): string[] {
  const vistas: string[] = [];
  for (const it of items) {
    const cat = it.categoria?.trim();
    if (cat && !vistas.includes(cat)) vistas.push(cat);
  }
  return vistas;
}

/** Sin tildes ni mayúsculas: «cafe» encuentra «Café». */
function plano(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** ¿El ítem entra en la búsqueda? Cada palabra tiene que estar en el nombre, la categoría o la descripción. */
export function coincideBusqueda(it: ItemCatalogoPublico, busqueda: string): boolean {
  const palabras = plano(busqueda).split(/\s+/).filter(Boolean);
  if (!palabras.length) return true;
  const texto = plano(`${it.titulo} ${it.categoria ?? ""} ${it.descripcion ?? ""}`);
  return palabras.every((p) => texto.includes(p));
}

/** Los servicios de agenda (un corte: se reservan) y los productos (se piden por cantidad), sin cambiar el orden. */
export function partirCarta(items: ItemCatalogoPublico[]): { servicios: ItemCatalogoPublico[]; productos: ItemCatalogoPublico[] } {
  const servicios: ItemCatalogoPublico[] = [];
  const productos: ItemCatalogoPublico[] = [];
  for (const it of items) (it.servicioId != null ? servicios : productos).push(it);
  return { servicios, productos };
}
