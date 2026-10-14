import { esFarmacia } from "../../../lib/rubro";

/**
 * La palabra de lo que se vende, con la MISMA regla que los títulos del
 * catálogo de reportes (`catalogo.ts`): la farmacia vende medicamentos y el
 * resto, productos. No sale de `termino()` porque ahí lo de un restaurante es
 * "artículos", y el reporte se titularía "Productos lentos" con una tarjeta
 * que dice "Plata parada en estos artículos".
 */
export function palabraProductos(rubro: string | undefined, plural = true): string {
  if (esFarmacia(rubro)) return plural ? "medicamentos" : "medicamento";
  return plural ? "productos" : "producto";
}

export function conMayuscula(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}
