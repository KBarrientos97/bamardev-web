import { colorDeClave } from "../colores/paleta";
import type { Plataforma } from "./tipos";

/**
 * El tono de cada plataforma, de la paleta única de la app (nada de hex
 * propios ni los colores de marca de Yango y PedidosYa), PLAN-PEDIDOS-PLATAFORMA
 * §10.4:
 *
 *  - Yango: Rojo (familia roja), `#C0262D`.
 *  - PedidosYa: Naranja (familia naranja), `#B4501A`.
 *
 * Son los mismos hex que usa Android, para que las dos apps coincidan. El
 * rojo se parece al de «Anulada»: por eso la marca lleva SIEMPRE el nombre y
 * un anulado va además tachado y con su badge.
 *
 * El color sólo acompaña: el texto «Yango» / «PedidosYa» va siempre. Las dos
 * claves superan 4.5:1 sobre blanco (ver `colores/paleta`), así que sirven de
 * letra sobre una tinta suave de sí mismas.
 */
const CLAVE_DE_PALETA: Record<Plataforma, string> = {
  YANGO: "ROJO",
  PEDIDOS_YA: "NARANJA",
};

/** El hex de la paleta de esa plataforma. */
export function colorDePlataforma(p: Plataforma): string {
  // Si la paleta cambiara de clave, el gris neutro es mejor que una marca invisible.
  return colorDeClave(CLAVE_DE_PALETA[p])?.hex ?? "#475569";
}

/** Fondo (tinta de ~12 % del color) y letra de la marca. */
export function estiloDePlataforma(p: Plataforma): { backgroundColor: string; color: string; borderColor: string } {
  const hex = colorDePlataforma(p);
  return { backgroundColor: `${hex}1F`, color: hex, borderColor: `${hex}55` };
}
