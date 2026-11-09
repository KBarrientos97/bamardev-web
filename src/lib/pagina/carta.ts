import type { ItemCatalogoPublico } from "./tipos";

/** Las categorías de la carta del sitio, en el orden en que aparecen (el del dueño al fijar). */
export function categoriasDe(items: ItemCatalogoPublico[]): string[] {
  const vistas: string[] = [];
  for (const it of items) {
    const cat = it.categoria?.trim();
    if (cat && !vistas.includes(cat)) vistas.push(cat);
  }
  return vistas;
}
