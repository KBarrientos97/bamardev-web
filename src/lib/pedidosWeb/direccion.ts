/**
 * La dirección de un pedido de la página es opcional desde el 18-nov
 * (CONTRATO-DELIVERY-FULL-18NOV §6): el pin del mapa es lo obligatorio. El
 * backend manda `direccion: null` cuando el cliente no escribió nada, y cada
 * pantalla que la muestra dice esto en su lugar (la app dice lo mismo).
 */
export const TEXTO_SIN_DIRECCION = "Ubicación marcada en el mapa";

/** La dirección para mostrar: la escrita o, si no hay, la frase del pin. */
export function direccionParaMostrar(direccion: string | null | undefined): string {
  return direccion?.trim() || TEXTO_SIN_DIRECCION;
}
