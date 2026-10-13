import { esPositivo } from "../../../lib/dinero";
import { fmtMoney } from "../../../lib/format";
import type { InsumosApi } from "../api";
import { cantidadConUnidad } from "./Compras.datos";

/**
 * Las cuentas de Insumos, aparte de la pantalla para poder probarlas.
 *
 * Es lo que se GASTÓ en comprar materia prima en el período, nada más. El
 * backend manda además `ganancia` (ventas − compras de insumos) y la pantalla
 * no la usa: no resta el alquiler ni los sueldos, y parte de lo comprado
 * sigue en el stock. Era la tercera "ganancia" distinta del mismo mes, junto
 * con la bruta y la neta del Estado de resultado (Android lo sacó el 12-oct,
 * ea9b8ac).
 */

export type CompraInsumo = InsumosApi["compras"][number];

/**
 * Cuánto de lo vendido se fue en comprar insumos: 0,61 = "el 61 %". Null sin
 * ventas: no hay con qué comparar, y un "0 %" o un "∞" se leerían como un
 * dato. No se recorta en 1: comprar más de lo que se vendió es justo lo que
 * hay que ver (la barra sí se recorta).
 */
export function proporcionSobreVentas(invertido: number, ingresos: number): number | null {
  return esPositivo(ingresos) ? Math.max(0, invertido) / ingresos : null;
}

/** "12 kilogramos · Bs 15,00 c/u". */
export function lineaInsumo(c: Pick<CompraInsumo, "cantidad" | "unidad" | "costoUnitario">): string {
  return `${cantidadConUnidad(c.cantidad, c.unidad)} · ${fmtMoney(c.costoUnitario)} c/u`;
}

/** Las filas de la lista, de lo que más se gastó a lo que menos, con la barra contra el primero. */
export function armarInsumos(compras: CompraInsumo[]): (CompraInsumo & { fraccion: number })[] {
  const filas = [...compras].sort((a, b) => b.total - a.total);
  const tope = filas.length ? Math.max(0, filas[0].total) : 0;
  return filas.map((c) => ({ ...c, fraccion: esPositivo(tope) ? Math.max(0, c.total) / tope : 0 }));
}
