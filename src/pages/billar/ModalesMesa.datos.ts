/** Hasta cuánto antes de ahora puede ir el inicio corregido (el backend acepta 24 h). */
export const INICIO_MAX_ATRAS_MS = 12 * 60 * 60_000;

/**
 * "21:05" → hoy a esa hora, o ayer si todavía no llegó (una mesa que arrancó
 * antes de la medianoche). `null` si no es una hora, o si queda a más de 12 h:
 * eso es un error de tipeo, no una mesa de ayer. A las 21:10, tocar sólo los
 * minutos dejaba "21:50", que se tomaba como de ayer: la mesa pasaba a 23 h
 * jugadas y se cobraban Bs 470 en vez del mínimo (revisión del 16-oct).
 */
export function inicioCorregido(
  hora: string,
  ahora: number,
): { inicio: number; deAyer: boolean } | { error: "formato" | "noLlego" } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hora);
  if (!m) return { error: "formato" };
  const d = new Date(ahora);
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  const deAyer = d.getTime() > ahora;
  if (deAyer) d.setDate(d.getDate() - 1);
  if (ahora - d.getTime() > INICIO_MAX_ATRAS_MS) return { error: "noLlego" };
  return { inicio: d.getTime(), deAyer };
}

/** Los motivos de una pausa: el diálogo sin PIN y el de autorización usan los mismos. */
export const MOTIVOS_PAUSA = ["Problema con la mesa", "Corte de luz", "Cliente salió", "Otro"];
