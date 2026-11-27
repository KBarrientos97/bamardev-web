import type { SesionNegocio, SesionRecetas } from "../../types";

/**
 * Dónde valen las recetas del plato (27-nov): el interruptor de Configuración ›
 * Inventario y stock, apagado de fábrica y sólo para el restaurante.
 *
 * Todo lo nuevo (el stock de los insumos a la vista, el formulario por bulto y
 * rinde, la compra por quintal en Movimientos, el tipo «Con receta» en
 * Artículos, «Costos de platos», la hoja de la presa en el POS) se dibuja sólo
 * con esto en `true`. Apagado, o en otro rubro, o con una sesión o un backend
 * que no mandan el dato, todo queda exactamente como antes.
 */
export function recetasActivas(negocio: Pick<SesionNegocio, "tipoNegocio" | "recetas"> | null | undefined): boolean {
  return negocio?.tipoNegocio === "RESTAURANTE" && negocio?.recetas?.activas === true;
}

/** Lo que la sesión sabe de las recetas, o null si no viajó (otro rubro, backend viejo). */
export function recetasDe(negocio: Pick<SesionNegocio, "recetas"> | null | undefined): SesionRecetas | null {
  return negocio?.recetas ?? null;
}

/**
 * Lo que viene del backend (`/licencia/estado`, la respuesta del ajuste), ya
 * completo para guardarlo en la sesión: lo que falte, con lo de fábrica del
 * backend (apagadas, sin elegir la presa, «puro» doble).
 */
export function sesionRecetas(crudo: unknown): SesionRecetas {
  const c = crudo && typeof crudo === "object" ? (crudo as Record<string, unknown>) : {};
  return {
    activas: c.activas === true,
    elegirPresa: c.elegirPresa === true,
    puroDoble: c.puroDoble !== false,
  };
}

/** Si dos dicen lo mismo (para no reescribir la sesión en cada chequeo de la licencia). */
export function mismasRecetas(a: SesionRecetas, b: SesionRecetas): boolean {
  return a.activas === b.activas && a.elegirPresa === b.elegirPresa && a.puroDoble === b.puroDoble;
}
