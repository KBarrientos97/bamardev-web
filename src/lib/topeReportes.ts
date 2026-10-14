/**
 * El tope de los reportes: TRES MESES (regla del dueño, 13-oct-2026). Vale
 * para todos —los de Reportes, las comisiones, la agenda, el billar— y es el
 * mismo número que `MAX_DIAS_REPORTE` del backend, que rechaza con 400 lo que
 * pase. Acá se frena antes, con un mensaje que dice qué hacer.
 *
 * 92 días y no 90: el trimestre más largo (julio a septiembre, noviembre a
 * enero) tiene 92, y "de julio a septiembre" tiene que entrar entero.
 */
export const MAX_DIAS_REPORTE = 92;

export const MENSAJE_TOPE = "Un reporte puede abarcar hasta 3 meses (92 días). Acortá el rango.";

/** Medianoche UTC del día `yyyy-MM-dd`: contar en UTC evita que un cambio de hora corra un día. */
function diaUtc(iso: string): number {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(a, m - 1, d);
}

/** Días del rango, contando los dos extremos (del 2 al 8 son siete). */
export function diasDelRango(desde: string, hasta: string): number {
  return Math.round((diaUtc(hasta) - diaUtc(desde)) / 86_400_000) + 1;
}

/** ¿El rango pasa del tope? */
export function excedeTope(desde: string, hasta: string): boolean {
  return diasDelRango(desde, hasta) > MAX_DIAS_REPORTE;
}

/** El día `iso` corrido `dias` días (`yyyy-MM-dd`). Para el min/max de los calendarios. */
export function correrDia(iso: string, dias: number): string {
  const f = new Date(diaUtc(iso) + dias * 86_400_000);
  return f.toISOString().slice(0, 10);
}
