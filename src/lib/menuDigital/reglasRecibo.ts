/**
 * Cuándo la caja usa el diseño del recibo y cuándo hay comanda: las mismas
 * reglas que `PermisosPantallas` de Android (`pideDisenoRecibo`,
 * `aplicaDisenoRecibo`, `conTickets`), sin React para poder probarlas solas.
 *
 * Desde el 15-nov «Ticket y recibo» es de base en el restaurante (backend
 * `c3e880f`): antes el diseño venía sólo con los extras de las TVs (`tickets_pedido`
 * o `menu_digital`). Abrirlo a todos no puede cambiarle el papel a quien nunca
 * lo tocó (otra letra, los bloques EN MESA en lugar de la M y la LL), así que
 * sin los extras el diseño se usa sólo si el backend dice `configurado`.
 *
 * Las features se miran CONFIRMADAS en la lista, no con el fail-open de
 * `tieneFeature`: los dos extras son estrictos (ver `permisos.ts`) y con la
 * lista vacía el recibo tiene que salir como siempre.
 */

type Features = readonly string[] | null | undefined;
type Rubro = string | null | undefined;

const esRestaurante = (rubro: Rubro) => rubro === "RESTAURANTE";

/** Con alguno de los extras de las TVs: el diseño se usa como hasta el 15-nov. */
function conExtras(features: Features): boolean {
  return !!features?.includes("tickets_pedido") || !!features?.includes("menu_digital");
}

/**
 * Si la caja le pide al servidor el diseño (logo, letra, QR, imprimir al
 * cobrar). Con los extras, como siempre y sin mirar el rubro (la feature ya la
 * ata el panel al restaurante); sin ellos, en todo restaurante.
 */
export function pideDisenoRecibo(features: Features, rubro: Rubro): boolean {
  return conExtras(features) || esRestaurante(rubro);
}

/**
 * Si el recibo sale con el diseño que llegó. Con los extras, siempre. Sin
 * ellos, sólo si el negocio guardó su diseño o subió su logo (`configurado`
 * del backend): el restaurante que nunca abrió «Ticket y recibo» sigue
 * imprimiendo su recibo de siempre. Un backend anterior no lo manda, y sin el
 * dato es lo seguro: no se usa.
 */
export function aplicaDisenoRecibo(features: Features, rubro: Rubro, configurado: boolean | undefined): boolean {
  return conExtras(features) || (esRestaurante(rubro) && configurado === true);
}

/** Si el negocio saca número de pedido: sin él no hay comanda de cocina. */
export function usaTickets(features: Features, rubro: Rubro): boolean {
  return esRestaurante(rubro) && !!features?.includes("tickets_pedido");
}

/**
 * «Imprimir solo al cobrar» en una venta sin número de pedido. Con tickets no:
 * es una venta de la cola sin internet y la comanda saldría sin el número.
 * En el restaurante que no usa tickets sí: no tiene comanda, y lo que prendió
 * es el recibo del cliente. Fuera del restaurante, como siempre (no imprime).
 */
export function imprimeReciboSinNumero(features: Features, rubro: Rubro): boolean {
  return esRestaurante(rubro) && !usaTickets(features, rubro);
}
