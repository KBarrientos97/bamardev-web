import type { ResumenCaja } from "../../types";

/**
 * "Movimiento del turno" del cierre del restaurante, en bloques que suman.
 *
 * Kevin, 10-nov, con un turno real: "es lioso, confunde al personal y hasta a
 * mí me confunde". Los números estaban bien (953 + 362 + 114 = 1.429), pero la
 * pantalla los mezclaba:
 *
 * - "Ventas (13) Bs 1.429" iba arriba y sus filas debajo, con dos renglones
 *   grises iguales: "Fiado otorgado", que SÍ está dentro de las ventas, y
 *   "Abonos por QR", que NO lo está. Sumando lo que se veía no daba nada.
 * - Lo abonado por QR salía arriba y lo abonado en efectivo abajo: el mismo
 *   tipo de plata en dos lugares.
 * - "QR Bs 362" no crecía al cobrar un fiado por QR (eran ventas), y no había
 *   ningún número con lo que tiene que haber en la cuenta del QR, que es lo que
 *   el cajero revisa en el celular al cerrar.
 *
 * Ahora cada plata va donde está, y cada bloque termina en su total:
 *
 * 1. Lo que se vendió: en efectivo + por QR + al fiado = Total vendido.
 * 2. Por cada medio que no es efectivo (el QR): ventas + abonos de fiado =
 *    lo que tiene que figurar en la cuenta.
 * 3. El cajón (`FilasDelCajon`): fondo + ventas en efectivo + abonos de fiado
 *    en efectivo ± movimientos − lo de los meseros = efectivo esperado.
 *
 * Un abono de fiado no es venta del turno (lo vendido no sube), pero sí plata
 * que entró: suma en el bloque del medio por donde entró, nunca en dos.
 */

/** El mismo criterio que el backend (`common/formas-pago`) y los reportes. */
export function esEfectivo(nombre: string): boolean {
  return nombre.toLowerCase().includes("efectivo");
}

export interface FilaVendido {
  etiqueta: string;
  monto: number;
  /** Ámbar: plata que se debe (la regla de color de toda la app). */
  fiado?: true;
}

/**
 * Lo vendido en el turno por cómo se cobró. Las filas suman `total`, que es
 * el `totalVentas` del arqueo: el fiado va adentro porque es venta, sólo que
 * se cobra después.
 */
export function vendidoDelTurno(r: ResumenCaja): { filas: FilaVendido[]; total: number } {
  const formas = [...r.porFormaPago]
    .filter((f) => f.monto !== 0)
    // El efectivo primero: es el renglón que se compara con el cajón.
    .sort((a, b) => Number(esEfectivo(b.nombre)) - Number(esEfectivo(a.nombre)));
  const filas: FilaVendido[] = formas.map((f) => ({
    etiqueta: esEfectivo(f.nombre) ? "En efectivo" : `Por ${f.nombre}`,
    monto: f.monto,
  }));
  if (r.creditoOtorgado > 0) filas.push({ etiqueta: "Al fiado", monto: r.creditoOtorgado, fiado: true });
  return { filas, total: r.totalVentas };
}

export interface MedioDelTurno {
  /** "QR", "Tarjeta"… como se llama la forma de pago en el negocio. */
  nombre: string;
  /** Lo cobrado por este medio en ventas del turno (adelantos de fiado incluidos). */
  ventas: number;
  /** Lo abonado por este medio a cuentas fiadas, de este turno o de antes. */
  abonos: number;
  /** Lo que tiene que haber entrado a la cuenta por este medio. */
  total: number;
}

/**
 * Lo que entró por cada medio que no es efectivo: el número que el cajero
 * busca en el celular. Sin ventas ni abonos por un medio, no aparece.
 */
export function mediosDelTurno(r: ResumenCaja): MedioDelTurno[] {
  const nombres: string[] = [];
  for (const f of [...r.porFormaPago, ...(r.abonosPorFormaPago ?? [])]) {
    if (!esEfectivo(f.nombre) && !nombres.includes(f.nombre)) nombres.push(f.nombre);
  }
  const de = (lista: { nombre: string; monto: number }[] | undefined, nombre: string) =>
    (lista ?? []).filter((f) => f.nombre === nombre).reduce((s, f) => s + f.monto, 0);
  return nombres
    .map((nombre) => {
      const ventas = de(r.porFormaPago, nombre);
      const abonos = de(r.abonosPorFormaPago, nombre);
      return { nombre, ventas, abonos, total: Math.round((ventas + abonos) * 100) / 100 };
    })
    .filter((m) => m.total > 0);
}
