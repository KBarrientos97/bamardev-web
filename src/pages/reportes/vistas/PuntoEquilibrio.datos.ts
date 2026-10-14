import { aCentavos, esCero, esPositivo } from "../../../lib/dinero";
import type { HojaNueva } from "../../../lib/planilla";
import type { LineaGasto, PuntoEquilibrio } from "../../../lib/resultado";
import type { BillarReporteApi } from "../api";
import { hoja } from "../contexto";
import { bsEntero, horas, plural, variacion } from "../formato";

/**
 * Lo que la pantalla de Punto de equilibrio le agrega a la cuenta de
 * `lib/resultado.ts` (que no se toca acá: tiene sus tests y es la misma de la
 * app): la meta dicha en la unidad del rubro, cómo se va contra ella y los
 * textos que cambian con el signo.
 */

/**
 * Lo que deja una hora de mesa, contando lo que se consume en ella. Es el
 * "Bs por hora" del billar: con el tiempo solo, las horas que hacen falta
 * salían de más, porque la gaseosa de la mesa también paga el alquiler.
 * Null sin horas jugadas (no hay de dónde sacarlo).
 */
export function bsPorHoraDeMesa(
  b: Pick<BillarReporteApi, "tiempoBs" | "consumosBs" | "horas"> | null | undefined,
): number | null {
  if (!b || !(b.horas > 0)) return null;
  const bs = (b.tiempoBs ?? 0) + (b.consumosBs ?? 0);
  return esPositivo(bs) ? bs / b.horas : null;
}

/** En qué se cuenta la meta además de la plata: horas de mesa en un billar, ventas en el resto. */
export type UnidadRubro = { tipo: "horas"; bsPorHora: number } | { tipo: "ventas"; ticket: number };

/**
 * La meta diaria en la unidad del rubro: "≈ 12,7 h de mesa por día, con sus
 * consumos" o "≈ 11 ventas por día con el ticket promedio de Bs 58". Un "Bs
 * 626 por día" solo no le dice al dueño si es mucho o poco; en mesas o en
 * clientes sí. Null si falta con qué convertir.
 */
export function lineaUnidad(ventaDiaria: number | null, unidad: UnidadRubro | null): string | null {
  if (ventaDiaria == null || !esPositivo(ventaDiaria) || !unidad) return null;
  if (unidad.tipo === "horas") {
    if (!esPositivo(unidad.bsPorHora)) return null;
    return `≈ ${horas(ventaDiaria / unidad.bsPorHora)} de mesa por día, con sus consumos`;
  }
  if (!esPositivo(unidad.ticket)) return null;
  // Para arriba: 10,2 ventas son 11. Con 10 no se llega, y la meta es justo
  // lo mínimo para no perder.
  const ventas = Math.ceil(ventaDiaria / unidad.ticket - 1e-9);
  return `≈ ${plural(ventas, "venta", "ventas")} por día con el ticket promedio de ${bsEntero(unidad.ticket)}`;
}

/**
 * "vas 159 % arriba" / "vas 12 % abajo": lo vendido contra la meta del
 * período, que es lo mismo que el promedio diario contra la meta diaria. Null
 * sin meta (sin gastos fijos la meta es cero y cualquier venta sería "+∞ %").
 */
export function comoVas(ventas: number, meta: number | null): string | null {
  const v = variacion(ventas, meta);
  if (v == null) return null;
  const entero = Math.round(v * 100);
  if (entero === 0) return "vas justo en el equilibrio";
  return entero > 0 ? `vas ${entero} % arriba` : `vas ${Math.abs(entero)} % abajo`;
}

export interface SobraOFalta {
  etiqueta: string;
  detalle: string;
  monto: number;
  tono: "marca" | "rojo" | "normal";
}

/**
 * El último renglón del cálculo. Cambia de nombre con el signo: un faltante
 * no se llama "sobró" ni se pinta del color de la marca. Lo que sobra es lo
 * vendido por encima del equilibrio, no la ganancia: se aclara, porque "te
 * sobró" a secas se leía como plata en el bolsillo.
 */
export function sobraOFalta(ventas: number, meta: number): SobraOFalta {
  const diferencia = aCentavos(ventas - meta);
  if (esCero(diferencia)) return { etiqueta: "Justo en el equilibrio", detalle: "Ni sobra ni falta", monto: 0, tono: "normal" };
  if (diferencia > 0) return { etiqueta: "Te sobró", detalle: "Lo vendido por encima del equilibrio", monto: diferencia, tono: "marca" };
  return { etiqueta: "Te faltan", detalle: "Para llegar al equilibrio", monto: -diferencia, tono: "rojo" };
}

/**
 * La nota de cómo leer el margen: "De cada Bs 100 vendidos te quedan Bs 67…".
 * En un billar se agrega por qué el margen es alto: el tiempo de mesa no tiene
 * costo de mercadería. Null sin margen positivo: ahí no hay meta y el aviso de
 * arriba ya dice por qué.
 */
export function textoMargen(margenPct: number | null, conVariables: boolean, enBillar: boolean): string | null {
  if (margenPct == null || !(margenPct > 0)) return null;
  const queda = Math.round(Math.min(1, margenPct) * 100);
  const despues = conVariables
    ? "después de pagar lo que costó el producto y los gastos que se mueven con cada venta"
    : "después de pagar lo que costó el producto";
  const billar = enBillar ? " El tiempo de mesa sube este margen porque no tiene costo." : "";
  return `De cada ${bsEntero(100)} vendidos te quedan ${bsEntero(queda)} ${despues}. Con eso se pagan los gastos fijos (alquiler, luz, sueldos); lo que sobra es ganancia.${billar}`;
}

/** "3 gastos · 12 % de las ventas": la línea de cada categoría del desglose. */
export function lineaGasto(l: Pick<LineaGasto, "cantidad" | "sobreVentasPct">): string {
  const partes = [plural(l.cantidad, "gasto", "gastos")];
  if (l.sobreVentasPct != null) partes.push(`${Math.round(l.sobreVentasPct * 100)} % de las ventas`);
  return partes.join(" · ");
}

/** El Excel: la cuenta entera y, aparte, de qué está hecho cada lado. */
export function hojasEquilibrio(pe: PuntoEquilibrio): HojaNueva[] {
  const cuenta: [string, number | null][] = [
    ["Ventas", pe.ventas],
    ["Costo de lo vendido", pe.costoVentas],
    ["Gastos variables", pe.gastosVariables],
    ["Margen de contribución (Bs)", pe.margenContribucion],
    ["Margen de contribución (%)", pe.margenContribucionPct == null ? null : Math.round(pe.margenContribucionPct * 1000) / 10],
    ["Gastos fijos", pe.gastosFijos],
    ["Punto de equilibrio (Bs)", pe.puntoEquilibrio],
    ["Por día (Bs)", pe.ventaDiariaNecesaria],
    ["Días del período", pe.dias],
  ];
  const columnasGasto: [string, (l: LineaGasto) => string | number | null][] = [
    ["Categoría", (l) => l.nombre],
    ["Gastos", (l) => l.cantidad],
    ["Monto (Bs)", (l) => l.monto],
  ];
  const hojas = [
    hoja<[string, number | null]>(
      "Punto de equilibrio",
      [
        ["Concepto", (f) => f[0]],
        ["Valor", (f) => f[1]],
      ],
      cuenta,
    ),
  ];
  if (pe.lineasFijas.length > 0) hojas.push(hoja("Gastos fijos", columnasGasto, pe.lineasFijas));
  if (pe.lineasVariables.length > 0) hojas.push(hoja("Gastos variables", columnasGasto, pe.lineasVariables));
  return hojas;
}
