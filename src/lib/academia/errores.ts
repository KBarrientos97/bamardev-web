import { ApiError } from "../api";
import { CODIGOS_ACADEMIA } from "./apiAcademia";

/**
 * Cómo se le cuenta al usuario un rechazo del backend de academia. La regla es
 * una sola: el `message` del backend ya viene en español y dice qué pasó y qué
 * hacer («pasalos a otro grupo o retiralos antes de cancelarlo»), así que se
 * muestra TAL CUAL, sin reescribirlo ni taparlo con un «No se pudo guardar».
 * El texto de respaldo es sólo para lo que no es un error del servidor.
 */
export function mensajeDelBackend(e: unknown, respaldo: string): string {
  return e instanceof Error && e.message ? e.message : respaldo;
}

/** ¿El rechazo trae este código de negocio? */
export function tieneCodigo(e: unknown, ...codigos: string[]): boolean {
  return e instanceof ApiError && !!e.codigo && codigos.includes(e.codigo);
}

/**
 * `CUOTAS_CAMBIARON` (409): entró o se anuló un pago mientras se guardaba un
 * cambio de plan o un retiro. No es un error de quien lo hizo: se recarga la
 * ficha y se ofrece «Reintentar».
 */
export const esReintentable = (e: unknown) => tieneCodigo(e, CODIGOS_ACADEMIA.CUOTAS_CAMBIARON);

/**
 * Rechazos que dicen que lo que se ve en pantalla ya no es lo que hay (la
 * cuota ya no debe nada, el grupo se canceló): conviene recargar la lista.
 */
export const esDatoViejo = (e: unknown) => tieneCodigo(e, CODIGOS_ACADEMIA.CUOTA_SIN_SALDO, CODIGOS_ACADEMIA.GRUPO_CANCELADO);
