import { fmtCantidad, fmtMoney } from "../../../lib/format";
import {
  descuentoDelPedido,
  observacionesDelPedido,
  type PedidoPlataforma,
  type PeriodoLiquidacion,
  type ReportePedidosPlataforma,
} from "../../../lib/pedidosPlataforma/tipos";
import { aDia } from "../periodo";

/**
 * Las cuentas chicas del reporte de Yango y PedidosYa. Los períodos NO se
 * calculan acá: los arma el backend en hora de Bolivia (`periodos.ts`, con las
 * reglas de §6 del plan) y esta pantalla sólo los muestra. Lo único que se
 * hace con una fecha es ponerle nombre de día.
 */

/** «vie 20/11» desde un yyyy-MM-dd (el día que paga la app, un día del desglose). */
export function diaCorto(ymd: string): string {
  const d = aDia(ymd);
  const dia = d.toLocaleDateString("es-BO", { weekday: "short" }).replace(".", "");
  const num = d.toLocaleDateString("es-BO", { day: "2-digit", month: "2-digit" });
  return `${dia} ${num}`;
}

/**
 * El último día del período, con las palabras de la etiqueta que armó el
 * backend («lun 16 al jue 19 de nov» → «jue 19»). Se lee de ahí y no de
 * `hasta`: ése es exclusivo, y restarle un día sería calcular el período acá.
 */
export function ultimoDiaDeLaEtiqueta(etiqueta: string): string | null {
  const m = / al ([^\s\d]+\.?\s+\d{1,2})\b/i.exec(etiqueta);
  return m ? m[1] : null;
}

/** «En curso: cierra el jue 19, paga el vie 20/11». Un período cerrado dice sólo cuándo paga. */
export function textoDelPeriodo(p: PeriodoLiquidacion): string {
  const paga = `paga el ${diaCorto(p.pagaEl)}`;
  if (!p.enCurso) return `Pago: ${diaCorto(p.pagaEl)}`;
  const cierra = ultimoDiaDeLaEtiqueta(p.etiqueta);
  return cierra ? `En curso: cierra el ${cierra}, ${paga}` : `En curso: ${paga}`;
}

/** «2× Arroz con leche L, 1× Gaseosa»: las líneas de un pedido en una sola. */
export function resumenDeLineas(p: Pick<PedidoPlataforma, "detalles">): string {
  return p.detalles.map((d) => `${fmtCantidad(d.cantidad)}× ${d.nombre}`).join(", ");
}

/** Lo que dice la fila de un anulado: cuándo y por qué. */
export function textoAnulado(p: Pick<PedidoPlataforma, "motivoAnulacion">): string {
  return p.motivoAnulacion ? `Anulado: ${p.motivoAnulacion}` : "Anulado";
}

/** «1 anulado · Bs 35,00 no suma» (null si no hubo). */
export function textoAnulados(a: { cantidad: number; total: number }): string | null {
  if (a.cantidad <= 0) return null;
  return `${a.cantidad} ${a.cantidad === 1 ? "anulado" : "anulados"} · ${fmtMoney(a.total)} no ${a.cantidad === 1 ? "suma" : "suman"}`;
}

/**
 * Lo que las apps descontaron en el período (CONTRATO-PRECIO-PLATAFORMA,
 * 19-nov): el «Total» ya es neto y esto dice cuánto se restó. Un backend viejo
 * no lo manda: 0, como si no hubiera habido.
 */
export function descuentosDelReporte(r: Pick<ReportePedidosPlataforma, "descuentos">): number {
  const d = Number(r.descuentos ?? 0);
  return Number.isFinite(d) && d > 0 ? Math.round(d * 100) / 100 : 0;
}

/** «Descuentos: Bs 3,00» debajo del Total (null si no hubo). */
export function textoDescuentos(r: Pick<ReportePedidosPlataforma, "descuentos">): string | null {
  const d = descuentosDelReporte(r);
  return d > 0 ? `Descuentos: ${fmtMoney(d)}` : null;
}

/** «Descuento Bs 1,00» en la fila de un pedido (null si no tuvo). */
export function textoDescuentoDelPedido(p: Pick<PedidoPlataforma, "descuento">): string | null {
  const d = descuentoDelPedido(p);
  return d > 0 ? `Descuento ${fmtMoney(d)}` : null;
}

/** «Obs.: sin ají» en la fila de un pedido (null si no tiene). */
export function textoObservacionesDelPedido(p: Pick<PedidoPlataforma, "observaciones">): string | null {
  const o = observacionesDelPedido(p);
  return o ? `Obs.: ${o}` : null;
}
