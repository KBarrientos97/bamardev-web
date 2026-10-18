import { pausadoAntesDe } from "./calculo";
import type { Sesion } from "./tipos";

/** Hasta cuánto antes de ahora puede ir el inicio corregido (el backend acepta 24 h). */
export const INICIO_MAX_ATRAS_MS = 12 * 60 * 60_000;

/**
 * La sesión con el inicio corregido, como la deja el backend (editarInicio):
 * corrido hacia adelante, lo pausado antes de la hora nueva deja de
 * descontarse y una pausa en curso cuenta desde ahí. Sin esto el diálogo
 * decía "queda con 0:30 jugadas" y el backend cobraba 1:00 (prueba profunda,
 * 18-oct). Con un backend sin `pausas`, como antes.
 */
export function conInicioCorregido(
  s: Pick<Sesion, "start" | "pausedAt" | "pausedTotal" | "pausas" | "pausaDesde">,
  inicio: number,
): Pick<Sesion, "start" | "pausedAt" | "pausedTotal"> {
  if (inicio <= s.start) {
    // Hacia atrás vuelven las pausas que una corrección anterior había sacado
    // (ir adelante por error y volver cobraba de más), y la pausa en curso
    // vuelve a contar desde que empezó de verdad. Igual que el backend.
    const devuelto = pausadoAntesDe(s.pausas ?? [], inicio, s.start);
    return {
      start: inicio,
      pausedTotal: s.pausedTotal + devuelto,
      pausedAt: s.pausedAt !== null ? Math.max(Math.min(s.pausaDesde ?? s.pausedAt, s.pausedAt), inicio) : null,
    };
  }
  const quitado = Math.min(s.pausedTotal, pausadoAntesDe(s.pausas ?? [], s.start, inicio));
  return {
    start: inicio,
    pausedTotal: s.pausedTotal - quitado,
    pausedAt: s.pausedAt !== null && s.pausedAt < inicio ? inicio : s.pausedAt,
  };
}

/**
 * "21:05" → hoy a esa hora, o ayer si todavía no llegó (una mesa que arrancó
 * antes de la medianoche). Un error si no es una hora, o si queda a más de
 * 12 h: eso es un error de tipeo, no una mesa de ayer. A las 21:10, tocar sólo
 * los minutos dejaba "21:50", que se tomaba como de ayer: la mesa pasaba a
 * 23 h jugadas y se cobraban Bs 470 en vez del mínimo (revisión del 16-oct).
 * Con el error va `cuando`, la hora que se descartó, para que el aviso la
 * escriba con a. m./p. m. como el resto del diálogo.
 */
export function inicioCorregido(
  hora: string,
  ahora: number,
):
  | { inicio: number; deAyer: boolean }
  | { error: "formato" }
  | { error: "noLlego" | "muyAtras"; cuando: number } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hora);
  if (!m) return { error: "formato" };
  const d = new Date(ahora);
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  const deAyer = d.getTime() > ahora;
  if (deAyer) d.setDate(d.getDate() - 1);
  // Una hora de hoy que ya pasó hace más de 12 h no "todavía no llegó": decía
  // eso a las 21:00 con las 08:00 (prueba profunda, 18-oct).
  if (ahora - d.getTime() > INICIO_MAX_ATRAS_MS) {
    return { error: deAyer ? "noLlego" : "muyAtras", cuando: d.getTime() };
  }
  return { inicio: d.getTime(), deAyer };
}

/** Los motivos de una pausa: el diálogo sin PIN y el de autorización usan los mismos. */
export const MOTIVOS_PAUSA = ["Problema con la mesa", "Corte de luz", "Cliente salió", "Otro"];
