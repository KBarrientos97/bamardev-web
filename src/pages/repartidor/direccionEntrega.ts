import { TEXTO_SIN_DIRECCION } from "../../lib/pedidosWeb/direccion";
import type { Venta } from "../../types";

/**
 * El texto que usa el backend cuando el cliente de la página marcó el pin y no
 * escribió dirección (18-nov, CONTRATO-delivery-full §6): la venta exige una
 * dirección, así que se guarda «Ubicación marcada en el mapa» (con la
 * referencia detrás, si la puso). El mismo que muestran las pantallas del
 * pedido web.
 */
const SIN_DIRECCION_CON_PIN = TEXTO_SIN_DIRECCION;

/**
 * Dónde se entrega, para mostrar: la dirección tal cual o, si no vino, qué hay
 * en su lugar. Un pedido de la página sin dirección tiene el pin: «Ubicación
 * marcada en el mapa». Cualquier otro delivery sin dirección: «Sin dirección».
 * Nunca vacío: un renglón en blanco (o uno que arranca con « · ») se leía como
 * una pantalla rota.
 */
export function direccionParaMostrar(v: Pick<Venta, "clienteDireccion" | "pedidoWeb">): string {
  const dir = v.clienteDireccion?.trim();
  if (dir) return dir;
  return v.pedidoWeb ? SIN_DIRECCION_CON_PIN : "Sin dirección";
}

/**
 * La dirección que escribió el cliente (con la referencia que el backend le
 * pega detrás, como siempre se copió). null si no escribió ninguna y sólo está
 * el texto de respaldo, con o sin referencia: no hay nada que copiar (para
 * llegar están el pin, Google Maps y Waze).
 */
export function direccionEscrita(direccion: string | null | undefined): string | null {
  const dir = direccion?.trim();
  if (!dir || dir.startsWith(SIN_DIRECCION_CON_PIN)) return null;
  return dir;
}
