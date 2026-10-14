import { isoDia } from "./format";

/**
 * La JORNADA del billar: el "día" de un negocio que abre a la tarde y cierra
 * de madrugada (como el "closeoutHour" de Toast o el "business day start" de
 * Lightspeed).
 *
 * Un billar cierra a las 2 o 4 a. m. Con el día del calendario, "Hoy" a la
 * 1:30 a. m. mostraba casi nada —la noche en curso era "ayer"— y lo cobrado
 * después de medianoche caía en el día siguiente. `corteMin` son los minutos
 * desde la medianoche en que termina la jornada (360 = 6:00 a. m.): lo de
 * antes cuenta para el día anterior.
 *
 * **Con corte 0 todo es exactamente el día del calendario**, que es lo que
 * siguen viendo los demás rubros: el backend devuelve 0 si el negocio no es
 * un billar (`GET /reportes/jornada`, la fuente de verdad).
 */

/** Lo que trae un billar que nunca tocó el ajuste: las 6 de la mañana. */
export const CORTE_JORNADA_DEFECTO = 360;

/** Hasta el mediodía, como el rango de Toast. */
export const CORTE_JORNADA_MAX = 720;

/**
 * La fecha de la jornada (`yyyy-MM-dd`) de un instante, en hora local: con
 * corte a las 6, la 1:30 a. m. del 14 es la jornada del 13 y las 7 ya son la
 * del 14.
 *
 * Por el reloj de pared y no restando milisegundos: el día que un país mueve
 * las agujas, restar 6 h corre el corte una hora.
 */
export function fechaDeJornada(instante: Date, corteMin = 0): string {
  const minutos = instante.getHours() * 60 + instante.getMinutes();
  const antesDelCorte = corteMin > 0 && minutos < corteMin;
  return isoDia(new Date(instante.getFullYear(), instante.getMonth(), instante.getDate() - (antesDelCorte ? 1 : 0)));
}

/** "6:00 a. m.", "12:30 p. m.": la hora del corte como la lee el dueño (como las horas del billar). */
export function horaDeCorte(corteMin: number): string {
  const h = Math.floor(corteMin / 60) % 24;
  const m = corteMin % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${h < 12 ? "a. m." : "p. m."}`;
}
