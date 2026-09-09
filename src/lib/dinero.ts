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

/**
 * Medio centavo: por debajo de esto dos montos son "el mismo" en Bs.
 *
 * Los precios son `number` y en IEEE-754 muchos decimales de 2 cifras no son
 * exactos. `3 × 8.90` da `26.700000000000003`, así que comparar el total contra
 * los `26.70` que teclea el cajero lo dejaba "faltando Bs 0.00" con el botón de
 * cobrar bloqueado. Regla: comparar siempre con esta tolerancia, nunca con `>=`
 * pelado. Mismo criterio que `Dinero.kt` en la app.
 */
export const TOLERANCIA = 0.005;

/** `true` si `recibido` alcanza para pagar `requerido`. */
export function cubre(recibido: number, requerido: number): boolean {
  return recibido >= requerido - TOLERANCIA;
}

/** `true` si `monto` supera de verdad a `limite` (y no por un residuo binario). */
export function excede(monto: number, limite: number): boolean {
  return monto > limite + TOLERANCIA;
}

/** `true` si el monto es cero en la práctica (incluye residuos tipo 3.6e-15). */
export function esCero(monto: number): boolean {
  return Math.abs(monto) < TOLERANCIA;
}

/** `true` si hay algo real que cobrar o mostrar (mayor a medio centavo). */
export function esPositivo(monto: number): boolean {
  return monto > TOLERANCIA;
}

/**
 * Parsea un monto tecleado por el usuario, aceptando coma decimal.
 *
 * En Bolivia se teclea "150,50" y `Number("150,50")` da `NaN`, que con el
 * `|| 0` habitual se convierte en un 0 silencioso: el conteo físico de un
 * cierre de caja quedaba en cero y la diferencia mostraba un faltante enorme
 * que nadie había cometido.
 *
 * Devuelve `null` si el texto no es un número — el llamador decide si eso es un
 * error a mostrar o un 0 legítimo.
 */
export function parsearMonto(texto: string | null | undefined): number | null {
  const limpio = texto?.trim().replace(",", ".");
  if (!limpio) return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

/** `parsearMonto` con valor por defecto, para inputs donde vacío = 0 es correcto. */
export function parsearMontoO(texto: string | null | undefined, porDefecto = 0): number {
  return parsearMonto(texto) ?? porDefecto;
}
