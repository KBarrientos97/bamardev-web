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
export function detalleAnularVenta(
  v: Pick<
    VentaBillar,
    | "origen"
    | "mesaId"
    | "cuenta"
    | "pagos"
    | "adelantosOtraCaja"
    | "anulada"
    | "devuelto"
    | "pagoCorregido"
    | "cobradoEnOtraCaja"
  >,
): string {
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

  const origen =
    v.origen === "rapida" ? "Venta rápida" : v.origen === "cuenta" ? `Cuenta «${v.cuenta ?? ""}»` : `Mesa ${v.mesaId}`;

  return [
    `${origen}. Los productos vuelven al stock.`,
    devolver ? `Devolvé al cliente ${devolver}.` : "",
    fiado > 0.005 ? `${fmtMoney(fiado)} eran fiado: salen de Cuentas por cobrar.` : "",
    deOtra.length ? `De ese efectivo, ${dondeEntro(deOtra)}: pedíselos, porque su arqueo deja de esperarlos.` : "",
    // Anular por "Error de cobro" (marcó QR y era efectivo) dejaba la mesa sin
    // poder cobrarse de nuevo: el tiempo de mesa no se vende fuera del cierre
    // (revisión del 16-oct). Que se sepa antes de poner el PIN.
    v.origen === "mesa" ? `Ojo: anular deja SIN COBRAR el tiempo de la Mesa ${v.mesaId}: no se puede volver a cobrar.` : "",
    // La cuenta abierta tampoco se vuelve a abrir: lo tomado se cobra de nuevo
    // como una venta rápida.
    v.origen === "cuenta" ? "La cuenta no se vuelve a abrir: si hay que cobrarla de nuevo, hacelo con una venta rápida." : "",
    // Desde el 17-oct el medio se corrige sin anular: si fue eso, que no se
    // pierda la venta (ni el tiempo de la mesa) por un medio mal marcado.
    sePuedeCorregirPago(v) ? "Si sólo se marcó mal el medio de pago, no la anules: usá «Corregir pago»." : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Si el medio de pago de una venta del turno se puede corregir sin anularla.
 * La misma regla que el backend (`CorreccionPagoBillarService`, que además
 * exige la caja abierta): sin fiado (es una cuenta por cobrar, no un medio),
 * sin devolución por pago de más y con todo lo cobrado en esta caja.
 */
export function sePuedeCorregirPago(
  v: Pick<VentaBillar, "anulada" | "pagos" | "devuelto" | "adelantosOtraCaja" | "pagoCorregido" | "cobradoEnOtraCaja">,
): boolean {
  return (
    !v.anulada &&
    // Cualquier adelanto de otra caja, también por QR (ADELANTO_OTRA_CAJA).
    !v.cobradoEnOtraCaja &&
    // Una vez por venta (el backend rechaza la segunda con YA_CORREGIDA).
    !v.pagoCorregido &&
    !v.pagos.some((p) => p.metodo === "Fiado") &&
    !v.devuelto &&
    !(v.adelantosOtraCaja ?? []).some((x) => x.monto > 0.005)
  );
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
