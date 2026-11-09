import { capitalizar, diaCorto } from "../agenda/horaAgenda";
import { fechaCorta } from "./formato";

/*
 * Lo que dicen de una clase puntual Clases de hoy, la lista de clases del
 * grupo y Mis clases (tanda 2 de la revisión del 08-nov), aparte para
 * probarlo sin dibujar nada.
 */

/** ¿Está suspendida? El backend nuevo manda `suspendida`; el estado lo dice igual. */
export const estaSuspendida = (c: { estado?: string; suspendida?: boolean }) => c.suspendida === true || c.estado === "SUSPENDIDA";

/** «Lun 10-nov, 19:00»: de qué clase se habla en los diálogos. Sin fecha, «Hoy, 19:00». */
export function cuandoEsClase(c: { fecha?: string; horaInicio: string }): string {
  return c.fecha ? `${capitalizar(diaCorto(c.fecha).toLowerCase())} ${fechaCorta(c.fecha)}, ${c.horaInicio}` : `Hoy, ${c.horaInicio}`;
}
