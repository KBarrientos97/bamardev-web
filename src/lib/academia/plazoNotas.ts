import { sumarDias } from "../agenda/horaAgenda";
import { hoyIso } from "./calendario";
import type { GrupoResumen } from "./tipos";

/**
 * Los días después del fin de un módulo en que todavía se cargan sus notas:
 * la copia de `DIAS_GRACIA_NOTAS` del backend (`academia/reglas.ts`, decisión
 * del dueño del 28-oct, L7). Sólo se usa con un backend que todavía no manda
 * `notasHasta`; si cambia allá, cambia acá.
 */
export const DIAS_GRACIA_NOTAS = 5;

/**
 * El último día en que se cargan notas del grupo: lo que dice el backend
 * (`notasHasta`, el fin del último módulo más la gracia) o, de un backend
 * anterior, la misma regla con el fin del grupo (que es el fin de su último
 * módulo).
 */
export function notasHasta(g: Pick<GrupoResumen, "fechaFin" | "notasHasta">): string {
  return g.notasHasta ?? sumarDias(g.fechaFin, DIAS_GRACIA_NOTAS);
}

/**
 * ¿El grupo sale para elegir en Notas? Los que no terminaron y los terminados
 * cuyo plazo de notas sigue abierto (revisión del 08-nov): antes se sacaban
 * todos los TERMINADO y en los 5 días de gracia el docente no llegaba a cargar
 * las notas del último módulo, que el backend todavía aceptaba.
 */
export function grupoConNotasAbiertas(g: Pick<GrupoResumen, "estado" | "fechaFin" | "notasHasta">, hoy = hoyIso()): boolean {
  return g.estado !== "TERMINADO" || notasHasta(g) >= hoy;
}
