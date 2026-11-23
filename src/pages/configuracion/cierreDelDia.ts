import { CORTE_JORNADA_MAX, horaDeCorte } from "../../lib/jornada";

/** De 00:00 a 12:00, de a media hora (el rango de Toast), como la jornada del billar. */
export function opcionesDeCorte(actual: number): number[] {
  const opciones = Array.from({ length: CORTE_JORNADA_MAX / 30 + 1 }, (_, i) => i * 30);
  // Un valor fuera de los pasos (escrito a mano) se ofrece igual, para no cambiarlo sin que nadie lo toque.
  if (!opciones.includes(actual)) opciones.push(actual);
  return opciones.sort((x, y) => x - y);
}

/** Cómo se lee cada opción: la medianoche es el día del calendario de siempre. */
export function textoDeCorte(min: number): string {
  return min === 0 ? "Medianoche (el día del calendario)" : horaDeCorte(min);
}
