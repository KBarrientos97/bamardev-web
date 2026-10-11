/**
 * Una cantidad de insumo como se lee en el salón: "60", "0,5", "12,25" — sin
 * ceros de más ("60,000 g" se lee como sesenta mil).
 */
export function fmtCantidad(n: number | null | undefined): string {
  return Number(n ?? 0).toLocaleString("es-BO", { maximumFractionDigits: 3 });
}

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
