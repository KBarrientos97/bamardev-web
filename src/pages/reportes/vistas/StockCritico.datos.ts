import { fmtCantidad } from "../../../lib/format";
import type { SugerenciaApi } from "../api";
import { plural } from "../formato";

/**
 * Las cuentas de Stock crítico, aparte de la pantalla para poder probarlas.
 *
 * Sale de la sugerencia de compra del backend (`sugerencia-compra.ts`): una
 * foto de HOY con lo que hay que reponer, ya ordenada por urgencia —lo
 * agotado, lo que está bajo el mínimo, lo que se acaba—. `stock-critico` sólo
 * trae el stock; la sugerencia además sabe a qué ritmo se vende y cuánto
 * pedir.
 */

export type ItemStock = SugerenciaApi["items"][number];

/** Las semanas de venta que cubre el pedido sugerido y los días de historia que lo calculan. */
export const DIAS_HISTORIA = 30;
export const DIAS_COBERTURA = 14;

/** Lo que hay para vender: el stock sin lo vencido, que está en el estante pero no se puede vender. */
export function utilDe(i: Pick<ItemStock, "stock" | "vencido">): number {
  return Math.max(0, i.stock - Math.max(0, i.vencido));
}

/**
 * El chip de la fila. Primero lo agotado (en rojo); un encargo no dice "40
 * días" aunque los tenga, porque no se acaba: lo piden clientes. Lo demás dice
 * para cuántos días alcanza, que es lo que el dueño necesita para decidir si
 * pide hoy o la semana que viene.
 */
export function estadoStock(i: Pick<ItemStock, "motivo" | "alcanzaDias">): { texto: string; tono: "rojo" | "ambar" | "gris" } {
  if (i.motivo === "AGOTADO") return { texto: "Agotado", tono: "rojo" };
  if (i.motivo === "ENCARGO") return { texto: "Encargado", tono: "gris" };
  if (i.alcanzaDias != null) {
    const texto = i.alcanzaDias < 1 ? "Menos de 1 día" : `${i.alcanzaDias} ${i.alcanzaDias === 1 ? "día" : "días"}`;
    return { texto, tono: "ambar" };
  }
  if (i.motivo === "BAJO_MINIMO") return { texto: "Bajo el mínimo", tono: "ambar" };
  return { texto: "Se acaba", tono: "ambar" };
}

/**
 * "se venden unos 12,1 por día". Lo que se vende menos de uno por día va por
 * semana o por mes: "unos 0,03 por día" no se entiende, "1 por mes" sí.
 */
export function ritmoVenta(porDia: number): string {
  const [valor, cada] = porDia >= 1 ? [porDia, "día"] : porDia * 7 >= 1 ? [porDia * 7, "semana"] : [porDia * 30, "mes"];
  const redondo = Math.round(valor * 10) / 10;
  if (redondo === 1) return `se vende 1 por ${cada}`;
  return `se venden unos ${fmtCantidad(redondo, 1)} por ${cada}`;
}

/**
 * "Quedan 4 · se venden unos 2,7 por día". El ritmo sale de lo vendido en los
 * días de historia y no del `porDia` del backend, que viene redondeado a dos
 * decimales: una venta en 30 días daba 0,03 por día y "0,9 por mes".
 *
 * Lo que queda va con `fmtCantidad`: es una resta (stock − vencido) y 2,3 − 0,3
 * deja 1,9999999999999998, que salía "Quedan 2,00".
 */
export function lineaStock(i: Pick<ItemStock, "stock" | "vencido" | "vendidas">, dias: number): string {
  const ritmo = i.vendidas > 0 && dias > 0 ? ritmoVenta(i.vendidas / dias) : `sin ventas en los últimos ${dias} días`;
  return `Quedan ${fmtCantidad(utilDe(i))} · ${ritmo}`;
}

/** Lo que además explica el pedido: lo vencido, el mínimo que no se cumple y lo encargado. Null si no hay nada. */
export function detalleStock(i: Pick<ItemStock, "stock" | "vencido" | "stockMinimo" | "encargos">): string | null {
  const partes: string[] = [];
  if (i.vencido > 0) partes.push(`${plural(i.vencido, "vencido", "vencidos")} en el estante`);
  if (i.stockMinimo > 0 && utilDe(i) < i.stockMinimo) partes.push(`el mínimo es ${fmtCantidad(i.stockMinimo)}`);
  if (i.encargos > 0) partes.push(`${plural(i.encargos, "encargado", "encargados")} por clientes`);
  return partes.length ? partes.join(" · ") : null;
}

/** Los dos números de arriba: lo agotado y lo que se acaba en menos de una semana. */
export function resumenStock(items: Pick<ItemStock, "motivo" | "alcanzaDias">[]): { agotados: number; seAcaban: number } {
  return {
    agotados: items.filter((i) => i.motivo === "AGOTADO").length,
    seAcaban: items.filter((i) => i.motivo !== "AGOTADO" && i.alcanzaDias != null && i.alcanzaDias < 7).length,
  };
}

/** "2 semanas", "10 días": catorce días se dicen en semanas, como los piensa quien hace el pedido. */
export function plazo(dias: number): string {
  if (dias > 0 && dias % 7 === 0) {
    const semanas = dias / 7;
    return `${semanas} ${semanas === 1 ? "semana" : "semanas"}`;
  }
  return `${dias} ${dias === 1 ? "día" : "días"}`;
}

/** "para 2 semanas": lo que cubre lo que se pide. */
export function textoCobertura(dias: number): string {
  return `para ${plazo(dias)}`;
}
