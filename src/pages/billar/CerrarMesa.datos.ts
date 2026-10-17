import { fmtMoney } from "../../lib/format";
import { imputarPagos, round2 } from "./calculo";
import type { PagoNuevo } from "./store";
import type { Pago, VentaBillar } from "./tipos";

/**
 * "en efectivo", "por QR": el medio en el botón de cobrar. El cobro arranca en
 * Efectivo y el botón decía sólo "Confirmar cobro", así que el medio mal
 * marcado salía de la propia pantalla (revisión del 17-oct).
 */
export function medioDelBoton(metodo: PagoNuevo["metodo"]): string {
  if (metodo === "Efectivo") return "en efectivo";
  if (metodo === "QR") return "por QR";
  return "mixto (efectivo + QR)";
}

/** Los pagos finales de un cobro, como los guarda la venta (el mixto, en dos). */
export function pagosFinales(p: PagoNuevo): { metodo: string; monto: number }[] {
  if (p.metodo === "Mixto") {
    return [
      { metodo: "Efectivo", monto: p.partes?.efectivo ?? 0 },
      { metodo: "QR", monto: p.partes?.qr ?? 0 },
    ];
  }
  return [{ metodo: p.metodo, monto: p.monto }];
}

const norm = (metodo: string) => (metodo.toLowerCase().includes("efectivo") ? "efectivo" : metodo.trim().toLowerCase());

const firma = (pagos: { metodo: string; monto: number }[]) =>
  pagos
    .filter((p) => p.monto > 0.005)
    .map((p) => `${norm(p.metodo)}:${round2(p.monto).toFixed(2)}`)
    .sort()
    .join("|");

/**
 * Si la venta que devolvió un reintento quedó con OTROS pagos que los que se
 * mandaron, cómo figura ("Efectivo Bs 45,00"); null si coincide.
 *
 * El reintento de un cobro manda la misma clave aunque el cajero haya cambiado
 * de medio (la clave es la mesa y la hora de la cuenta): si la primera
 * respuesta se cortó y el cliente dijo "le pago por QR", el backend devolvía
 * la venta ya grabada en efectivo y el aviso decía "QR". La caja esperaba un
 * efectivo que no estaba y nadie se enteraba (revisión del 17-oct).
 *
 * Lo esperado es lo que arma el backend al cerrar: lo que cubre la cuenta de
 * cada adelanto (`imputarPagos`, lo no efectivo primero) más los pagos finales.
 */
export function cobroQueFigura(
  figura: VentaBillar["pagos"],
  previos: Pick<Pago, "metodo" | "monto">[],
  total: number,
  finales: { metodo: string; monto: number }[],
): string | null {
  const real = figura.filter((p) => p.metodo !== "Fiado");
  if (!real.length) return null;
  const esperado = [
    ...imputarPagos(previos, total)
      .filter((x) => x.cubre > 0.005)
      .map((x) => ({ metodo: x.pago.metodo, monto: x.cubre })),
    ...finales,
  ];
  if (firma(real) === firma(esperado)) return null;
  return real.map((p) => `${p.metodo} ${fmtMoney(p.monto)}`).join(" + ");
}
