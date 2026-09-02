/**
 * Cálculos de plata que se mandan al backend. Viven acá y no dentro de la
 * pantalla porque el resultado se guarda en la base: un centavo mal calculado
 * queda en la fila del pago y después se arrastra al arqueo y a los reportes.
 */

/** Redondea a dos decimales, que es lo que el backend guarda. */
export function aCentavos(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Lo que queda por cubrir en efectivo cuando parte se paga por QR.
 *
 * Sin redondear, `100.10 - 33.37` da `66.72999999999999` y ese número se
 * mandaba tal cual como el monto del pago. La venta no se rechazaba (la suma
 * seguía dando exacta en punto flotante), así que el error era silencioso.
 */
export function restoEnEfectivo(total: number, pagadoPorQr: number): number {
  return Math.max(0, aCentavos(total - pagadoPorQr));
}

/**
 * Vuelto. Se calcula sobre lo que el cliente entrega en mano, que en un
 * delivery incluye la tarifa de envío: usar el total de productos le hacía
 * devolver de más al repartidor.
 */
export function vuelto(recibido: number, aCubrir: number): number {
  return aCentavos(Math.max(0, recibido - aCubrir));
}
