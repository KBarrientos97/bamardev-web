import { fmtCantidad, fmtFecha, fmtHora } from "../../../lib/format";
import type { VendidoSinStockApi } from "../api";
import { plural } from "../formato";

/**
 * Los textos de "Vendido sin stock", aparte de la pantalla para poder
 * probarlos.
 *
 * Lo que se cuenta es lo que FALTÓ, no la línea entera: con 2 aguas en stock y
 * 5 vendidas, son 3. Por eso cada venta dice "3 de 5" cuando no fue toda.
 */

type Item = VendidoSinStockApi["items"][number];
type Linea = VendidoSinStockApi["ultimas"][number];

/** "12 u", "2,5 kg", o el número solo si el artículo no tiene unidad. */
export function cantidadCon(n: number, unidad: string | null): string {
  return unidad ? `${fmtCantidad(n)} ${unidad}` : fmtCantidad(n);
}

/** "Bebidas · en 2 ventas · la última el 09/11 a las 14:32". */
export function lineaArticulo(i: Pick<Item, "categoria" | "ventas" | "ultima">): string {
  return `${i.categoria} · en ${plural(i.ventas, "venta", "ventas")} · la última el ${fmtFecha(i.ultima).slice(0, 5)} a las ${fmtHora(i.ultima)}`;
}

/**
 * "Venta #123 · V-000004 · 09/11 14:32 · cajera". Va el `#id` interno además
 * del comprobante: el V-000001 reinicia en cada turno y dos ventas del mismo
 * día pueden tener el mismo.
 */
export function lineaVenta(l: Pick<Linea, "ventaId" | "comprobante" | "fecha" | "usuario">): string {
  return [
    `Venta #${l.ventaId}`,
    l.comprobante,
    `${fmtFecha(l.fecha).slice(0, 5)} ${fmtHora(l.fecha)}`,
    l.usuario,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Debajo de la cantidad: si faltó toda la línea o una parte. */
export function pieVenta(l: Pick<Linea, "unidades" | "cantidad" | "unidad">): string {
  return l.unidades < l.cantidad ? `de ${cantidadCon(l.cantidad, l.unidad)} vendidas` : "sin stock";
}

/** El renglón de arriba: cómo está el interruptor hoy y qué quiere decir el reporte. */
export function textoModo(controlaStock: boolean): string {
  return controlaStock
    ? "El control de stock está prendido. Acá aparece lo que se vendió cuando ya no quedaba: lo de una mesa, una venta sin internet, o lo de antes de prenderlo."
    : "Estás vendiendo sin control de stock: cada venta de lo que no se contó aparece acá. Es lo que salió de la heladera o del estante sin estar cargado.";
}
