import { api } from "../../lib/api";
import { normalizarRendicion, type RendicionReparto } from "../../lib/repartoRendicion";

/**
 * `GET /reparto/rendicion`, ya leída. Falla como cualquier pedido (sin red, un
 * 403): quien muestra la pantalla decide si dice el error o si hace como si no
 * existiera. Una respuesta que no es una rendición da null.
 *
 * Arranca dentro de una promesa a propósito: si el cliente del API no tiene el
 * método (un mock de otra pantalla) es un rechazo más, no una excepción que
 * rompe el render de quien la llama.
 */
export function pedirRendicion(almacenId?: number | null): Promise<RendicionReparto | null> {
  return Promise.resolve()
    .then(() => api.rendicionReparto(almacenId != null ? { almacenId } : {}))
    .then(normalizarRendicion);
}

/**
 * La misma, para lo que es sólo un agregado (el botón «Repartidores» del
 * cierre, el cuadre en la vista del repartidor): un backend anterior (404),
 * sin permiso (403), sin la feature o sin señal dan null, y no aparece nada.
 */
export function pedirRendicionSiHay(almacenId?: number | null): Promise<RendicionReparto | null> {
  return pedirRendicion(almacenId).catch(() => null);
}
