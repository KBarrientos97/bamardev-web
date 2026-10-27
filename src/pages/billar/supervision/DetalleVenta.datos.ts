import type { PagoVentaApi, VentaApi } from "../api";
import { horaCorta, textoConcepto, tipoDeMedio } from "./Cobros.datos";
import { cuando } from "./Supervision.datos";

/**
 * Lo del "Detalle de venta" (26-oct) que no es dibujo: de dónde salió la
 * venta y cuándo entró cada pago. Lo abren la actividad y las cajas de
 * Supervisión y Reportes › Ventas, que no tiene la lista de tipos de mesa.
 */

/**
 * "Mesa 1 · Pool", "Cuenta «Juan»" o "Venta rápida". El tipo de mesa con el
 * nombre que manda el backend (`tipoNombre`); sin él, el de la lista de tipos
 * si se tiene (Supervisión), y si no, el código.
 */
export function lugarDeVenta(
  v: Pick<VentaApi, "origen" | "mesaId" | "cuenta" | "tipoMesa" | "tipoNombre">,
  tipos: Record<string, { nombre: string }> = {},
): string {
  if (v.origen === "rapida") return "Venta rápida";
  if (v.origen === "cuenta") return `Cuenta «${v.cuenta ?? ""}»`;
  const tipo = v.tipoNombre ?? (v.tipoMesa ? (tipos[v.tipoMesa]?.nombre ?? v.tipoMesa) : null);
  return `Mesa ${v.mesaId ?? ""}${tipo ? ` · ${tipo}` : ""}`.trim();
}

/** "V-000010 · Mesa 1 · Pool": el subtítulo del detalle. */
export function subtituloVenta(
  v: Pick<VentaApi, "codigo" | "origen" | "mesaId" | "cuenta" | "tipoMesa" | "tipoNombre">,
  tipos: Record<string, { nombre: string }> = {},
): string {
  return `${v.codigo} · ${lugarDeVenta(v, tipos)}`;
}

/**
 * Cuándo entró un pago. Lo cobrado antes de cerrar la mesa va con su hora de
 * verdad y quién lo cobró ("Adelanto · 21:30 · cobró Flavia"): antes todos
 * los pagos decían la hora de la venta, y un QR de las 21:30 no aparecía en el
 * banco a las 23:10. Lo demás se cobró al cerrar ("Al cobrar · 23:11").
 */
export function cuandoSeCobro(p: Pick<PagoVentaApi, "metodo" | "hora" | "nota" | "previo">, ahora: number): string {
  if (tipoDeMedio(p.metodo) === "fiado") return p.nota ? `Lo debe ${p.nota}` : "Quedó debiendo";
  if (p.previo) {
    return [textoConcepto(p.previo.concepto) ?? "Adelanto", cuando(p.previo.hora, ahora), p.previo.por ? `cobró ${p.previo.por}` : null]
      .filter(Boolean)
      .join(" · ");
  }
  return `Al cobrar · ${cuando(p.hora, ahora)}`;
}

/** "de 21:05 a 23:10": cuándo se jugó en la mesa. Pasada la medianoche se lee igual: es la misma noche. */
export function textoJuego(j: { desde: number; hasta: number }): string {
  return `de ${horaCorta(j.desde)} a ${horaCorta(j.hasta)}`;
}
