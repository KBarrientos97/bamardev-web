/**
 * DÓNDE se usan los toppings (PLAN-AGREGADOS §8): `usaAgregados` es el
 * interruptor general y, con él prendido, el dueño elige la página del cliente
 * y/o el punto de venta. La sesión trae las dos ya efectivas (`false` si el
 * general está apagado). La página no consulta la sesión: el backend manda
 * `agregados: null` en el JSON público cuando no los usa.
 */

interface NegocioConAgregados {
  usaAgregados?: boolean;
  agregadosEnPos?: boolean;
  agregadosEnPagina?: boolean;
}

/**
 * ¿La caja ofrece la hoja de toppings? Un backend anterior no manda
 * `agregadosEnPos` (nació con el POS como único lugar): se toma el general.
 */
export function agregadosEnPos(negocio: NegocioConAgregados | null | undefined): boolean {
  if (!negocio || negocio.usaAgregados !== true) return false;
  return negocio.agregadosEnPos ?? true;
}
