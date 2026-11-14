import { fmtMoney } from "../format";
import type { PedidoWebDeEntrega } from "./tipos";

/**
 * Lo que el repartidor y la caja tienen que decirle al cliente sobre la plata de
 * un pedido de la página. El envío NO entra al total de la venta (es del
 * repartidor, D7), así que hay dos números y hace falta que la pantalla diga
 * cuál se cobra y cuánto se devuelve (QA R1: «cobra 103 y los 9 van aparte»).
 */

/**
 * Las frases de cobro de un pedido de la página:
 * - cuánto se le cobra al cliente en mano (productos + envío);
 * - con efectivo: con cuánto dijo que paga y cuánto cambio devolver;
 * - con QR: que los productos van por QR y el envío en efectivo.
 *
 * `productos` es lo que se registra en la venta; `envio` es la tarifa del
 * repartidor; `aCobrar` es la suma, la misma que muestra la tarjeta.
 */
export function frasesDeCobro(
  web: Pick<PedidoWebDeEntrega, "formaPago" | "pagaCon">,
  cobro: { productos: number; envio: number; aCobrar: number },
): string[] {
  const frases: string[] = [];
  const { productos, envio, aCobrar } = cobro;
  frases.push(
    envio > 0
      ? `Cobrale ${fmtMoney(aCobrar)}: ${fmtMoney(productos)} del pedido + ${fmtMoney(envio)} de envío.`
      : `Cobrale ${fmtMoney(aCobrar)}.`,
  );
  if (web.formaPago === "QR") {
    frases.push(
      envio > 0
        ? `Paga con QR: los ${fmtMoney(productos)} van por el QR del local y el envío (${fmtMoney(envio)}) te lo da en efectivo.`
        : "Paga con QR.",
    );
    return frases;
  }
  if (web.pagaCon != null) {
    const dif = Math.round((web.pagaCon - aCobrar) * 100) / 100;
    frases.push(
      dif > 0
        ? `Dice que paga con ${fmtMoney(web.pagaCon)}: devolvele ${fmtMoney(dif)} de cambio.`
        : dif === 0
          ? `Dice que paga con ${fmtMoney(web.pagaCon)}: justo, sin cambio.`
          : `Dice que paga con ${fmtMoney(web.pagaCon)}, pero no alcanza: faltan ${fmtMoney(-dif)}.`,
    );
  }
  return frases;
}

/**
 * La nota de la venta sin el «Paga con Bs 100» / «Paga con QR» / «Paga en
 * efectivo» que el sistema le agrega al aceptar: la pantalla ya lo dice con el
 * cambio calculado, y repetirlo se leía como un dato nuevo (QA R1, N14). Lo que
 * escribió el cliente y el motivo del envío se quedan.
 */
export function notaSinPago(nota: string | null | undefined): string | null {
  if (!nota) return null;
  const partes = nota.split(" · ").filter((p) => !/^Paga (con|en)\b/.test(p.trim()));
  const limpia = partes.join(" · ").trim();
  return limpia || null;
}

/** Con cuánto paga el cliente si alcanza para lo que se cobra: para arrancar «Efectivo recibido» (QA R1, N17). */
export function recibidoSugerido(pagaCon: number | null | undefined, aCobrar: number): number | null {
  if (pagaCon == null || !Number.isFinite(pagaCon) || pagaCon < aCobrar) return null;
  return pagaCon;
}
