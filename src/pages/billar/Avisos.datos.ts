import { fmtMoney } from "../../lib/format";
import { round2, textoDevolucion } from "./calculo";
import type { Pago, VentaBillar } from "./tipos";

/** El mismo criterio que `esEfectivo` del backend: el nombre lo dice. */
const esDeEfectivo = (metodo: string) => metodo.toLowerCase().includes("efectivo");

/** "Bs 40,00 entraron en la caja de Ana y Bs 10,00 en la de Beto". */
export function dondeEntro(partes: { cajero: string; monto: number }[]): string {
  const textos = partes.map(
    (p, i) => `${fmtMoney(p.monto)} ${i === 0 ? "entraron en la caja de" : "en la de"} ${p.cajero || "otro cajero"}`,
  );
  return textos.length > 1 ? `${textos.slice(0, -1).join(", ")} y ${textos[textos.length - 1]}` : (textos[0] ?? "");
}

/**
 * Qué decir al anular una venta del billar: cuánto devolver y por dónde, qué
 * era fiado, y qué parte del efectivo está en el cajón de otra caja.
 *
 * Decía "el monto sale de la caja del turno": con parte por QR el cajero
 * devolvía todo del cajón, y si el adelanto lo había cobrado otra caja, esa
 * caja dejaba de esperarlo y la de quien anulaba quedaba corta (revisión del
 * 16-oct). Si cada uno pasa lo suyo, las dos cajas cuadran.
 */
export function detalleAnularVenta(v: Pick<VentaBillar, "origen" | "mesaId" | "pagos" | "adelantosOtraCaja">): string {
  const reales = v.pagos.filter((p) => p.metodo !== "Fiado");
  const efectivo = round2(reales.filter((p) => esDeEfectivo(p.metodo)).reduce((t, p) => t + p.monto, 0));
  const otros = new Map<string, number>();
  for (const p of reales) {
    if (esDeEfectivo(p.metodo)) continue;
    otros.set(p.metodo, round2((otros.get(p.metodo) ?? 0) + p.monto));
  }
  const fiado = round2(v.pagos.filter((p) => p.metodo === "Fiado").reduce((t, p) => t + p.monto, 0));
  const devolver = textoDevolucion({ efectivo, otros: [...otros].map(([metodo, monto]) => ({ metodo, monto })) });
  const deOtra = (v.adelantosOtraCaja ?? []).filter((x) => x.monto > 0.005);

  return [
    `${v.origen === "rapida" ? "Venta rápida" : `Mesa ${v.mesaId}`}. Los productos vuelven al stock.`,
    devolver ? `Devolvé al cliente ${devolver}.` : "",
    fiado > 0.005 ? `${fmtMoney(fiado)} eran fiado: salen de Cuentas por cobrar.` : "",
    deOtra.length ? `De ese efectivo, ${dondeEntro(deOtra)}: pedíselos, porque su arqueo deja de esperarlos.` : "",
    // Anular por "Error de cobro" (marcó QR y era efectivo) dejaba la mesa sin
    // poder cobrarse de nuevo: el tiempo de mesa no se vende fuera del cierre
    // (revisión del 16-oct). Que se sepa antes de poner el PIN.
    v.origen === "mesa" ? "Ojo: el tiempo de la mesa no se puede volver a cobrar." : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Al anular una mesa abierta: qué parte del efectivo cobrado entró en otra
 * caja (no en `miCaja`), por quién lo cobró. Vacío si todo está en la propia.
 */
export function efectivoEnOtraCaja(
  pagos: Pick<Pago, "metodo" | "monto" | "cajaId" | "cobradoPor">[],
  miCaja: number | undefined,
): string {
  const porCajero = new Map<string, number>();
  for (const p of pagos) {
    if (!esDeEfectivo(p.metodo) || p.cajaId == null || p.cajaId === miCaja) continue;
    const quien = p.cobradoPor ?? "";
    porCajero.set(quien, round2((porCajero.get(quien) ?? 0) + p.monto));
  }
  return dondeEntro([...porCajero].map(([cajero, monto]) => ({ cajero, monto })));
}
