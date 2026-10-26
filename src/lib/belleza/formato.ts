/**
 * Una cantidad de insumo como se lee en el salón: "60", "0,5", "12,25" — sin
 * ceros de más ("60,000 g" se lee como sesenta mil). Es la de toda la app: hasta
 * el 25-oct había dos `fmtCantidad` y la de `lib/format` cortaba en 2 decimales,
 * así que 0,125 salía "0,125" o "0,13" según de dónde se importara.
 */
export { fmtCantidad } from "../format";

/** Una fórmula de color en una línea: "Igora 7.1 · 1:1,5 · 20 vol · 35 min". */
export function lineaFormula(f: {
  marca?: string;
  tono?: string;
  proporcion?: string;
  oxidante?: string;
  tiempoMin?: number;
  nota?: string;
}): string {
  const partes = [
    [f.marca, f.tono].filter(Boolean).join(" "),
    f.proporcion,
    f.oxidante,
    f.tiempoMin != null ? `${f.tiempoMin} min` : "",
    f.nota,
  ].filter((x) => x && String(x).trim());
  return partes.join(" · ");
}
