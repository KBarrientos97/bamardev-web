/**
 * Los billetes y las monedas que circulan en Bolivia (25-oct-2026, QA de Kevin:
 * "no tenemos billete de 300"). Los atajos de efectivo de los cobros y de la
 * apertura de caja ofrecen sólo estos valores: nada de montos que no existen
 * como un billete o una moneda.
 */
export const BILLETES_BOLIVIA = [10, 20, 50, 100, 200] as const;

/** Las monedas, de mayor a menor. Las de 0,10 y 0,20 entran igual: la caja tiene que cuadrar al centavo. */
export const MONEDAS_BOLIVIA = [5, 2, 1, 0.5, 0.2, 0.1] as const;

/** Todas las denominaciones, de menor a mayor. */
const DENOMINACIONES = [...MONEDAS_BOLIVIA, ...BILLETES_BOLIVIA].sort((a, b) => a - b);

/**
 * Lo que el cliente puede entregar de un solo billete o moneda para pagar
 * `total`: las denominaciones que lo cubren, las más chicas primero. El justo
 * va aparte, así que siempre por encima del total.
 *
 * Con Bs 80 son el de 100 y el de 200; con Bs 3,50, la moneda de 5 y los de 10
 * y 20. Desde Bs 200 ningún billete alcanza solo: no hay atajo (el cajero toca
 * «Justo» o escribe lo que recibió, que será la suma de varios billetes).
 */
export function atajosDeEfectivo(total: number, cuantos = 3): number[] {
  if (!(total > 0)) return [];
  return DENOMINACIONES.filter((d) => d > total + 0.005).slice(0, cuantos);
}
