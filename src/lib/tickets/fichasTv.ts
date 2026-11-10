/**
 * Las fichas de los listos que van debajo del número grande de la TV de
 * tickets: cuántas entran y cuáles se ven ahora.
 *
 * Van en UNA fila, siempre. Antes eran seis fijas: en la columna de al lado
 * de "En preparación" entran cinco, la sexta bajaba a una segunda fila y el
 * recuadro amarillo se achicaba a menos de lo que mide su contenido; el
 * "TICKET" y el "Su pedido está listo" quedaban la mitad afuera (QA 10-nov,
 * con 30 listos). Ahora entra lo que cabe en la fila y el resto va entrando
 * de a tandas, así cada número pasa por la pantalla aunque haya treinta.
 */

/** Cuánto se queda cada tanda en la TV antes de dar paso a la siguiente. */
export const SEGUNDOS_POR_TANDA = 6;

/** Cuántas fichas de `anchoFicha` entran en una fila de `anchoFila`. Al menos una. */
export function fichasPorFila(anchoFila: number, anchoFicha: number, separacion: number): number {
  return Math.max(1, Math.floor((anchoFila + separacion) / (anchoFicha + separacion)));
}

export interface Tanda<T> {
  visibles: T[];
  /** Cuál se ve (desde 0) y cuántas hay: con una sola, la TV no dibuja los puntitos. */
  actual: number;
  total: number;
}

/**
 * La tanda que toca a la hora `ahora` (ms). Sale de la hora y no de un
 * contador propio: la TV ya redibuja cada segundo con la hora del servidor, y
 * así dos TVs del mismo local muestran la misma tanda a la vez.
 */
export function tandaVisible<T>(lista: T[], porTanda: number, ahora: number): Tanda<T> {
  const cupo = Math.max(1, Math.floor(porTanda));
  const total = Math.max(1, Math.ceil(lista.length / cupo));
  const actual = total > 1 ? Math.floor(ahora / (SEGUNDOS_POR_TANDA * 1000)) % total : 0;
  return { visibles: lista.slice(actual * cupo, actual * cupo + cupo), actual, total };
}
