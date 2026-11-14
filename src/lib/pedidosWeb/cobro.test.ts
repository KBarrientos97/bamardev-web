import { describe, expect, it } from "vitest";
import { fmtMoney } from "../format";
import { frasesDeCobro, notaSinPago, recibidoSugerido } from "./cobro";

describe("frasesDeCobro: la plata de un pedido de la página (QA R1)", () => {
  const efectivo = (pagaCon: number | null) => ({ formaPago: "EFECTIVO" as const, pagaCon });

  it("con envío dice cuánto cobrarle, de qué se compone y el cambio", () => {
    const f = frasesDeCobro(efectivo(200), { productos: 103, envio: 9, aCobrar: 112 });
    expect(f[0]).toBe(`Cobrale ${fmtMoney(112)}: ${fmtMoney(103)} del pedido + ${fmtMoney(9)} de envío.`);
    expect(f[1]).toBe(`Dice que paga con ${fmtMoney(200)}: devolvele ${fmtMoney(88)} de cambio.`);
  });

  it("sin envío (recoger) es sólo el total", () => {
    expect(frasesDeCobro(efectivo(null), { productos: 35, envio: 0, aCobrar: 35 })).toEqual([`Cobrale ${fmtMoney(35)}.`]);
  });

  it("paga justo, o el billete no alcanza", () => {
    expect(frasesDeCobro(efectivo(112), { productos: 103, envio: 9, aCobrar: 112 })[1]).toMatch(/justo, sin cambio/);
    expect(frasesDeCobro(efectivo(100), { productos: 103, envio: 9, aCobrar: 112 })[1]).toBe(
      `Dice que paga con ${fmtMoney(100)}, pero no alcanza: faltan ${fmtMoney(12)}.`,
    );
  });

  it("con QR, los productos van por QR y el envío en efectivo", () => {
    const f = frasesDeCobro({ formaPago: "QR", pagaCon: null }, { productos: 103, envio: 9, aCobrar: 112 });
    expect(f[1]).toBe(`Paga con QR: los ${fmtMoney(103)} van por el QR del local y el envío (${fmtMoney(9)}) te lo da en efectivo.`);
    expect(frasesDeCobro({ formaPago: "QR", pagaCon: null }, { productos: 35, envio: 0, aCobrar: 35 })[1]).toBe("Paga con QR.");
  });
});

describe("notaSinPago: sin el «Paga con» que ya dice la pantalla (QA R1 N14)", () => {
  it("saca lo de pago y deja lo que escribió el cliente y el motivo del envío", () => {
    expect(notaSinPago("sin apuro · Paga con Bs 100")).toBe("sin apuro");
    expect(notaSinPago("Paga con QR")).toBeNull();
    expect(notaSinPago("Paga en efectivo")).toBeNull();
    expect(notaSinPago("Sin cebolla · Paga con Bs 100 · Envío Bs 9 en vez de Bs 7: lejos")).toBe("Sin cebolla · Envío Bs 9 en vez de Bs 7: lejos");
  });

  it("sin nota, null; una nota sin pago queda igual", () => {
    expect(notaSinPago(null)).toBeNull();
    expect(notaSinPago("")).toBeNull();
    expect(notaSinPago("tocar timbre dos veces")).toBe("tocar timbre dos veces");
  });
});

describe("recibidoSugerido: con cuánto arranca «Efectivo recibido» (QA R1 N17)", () => {
  it("es lo que dijo el cliente si alcanza", () => {
    expect(recibidoSugerido(100, 47)).toBe(100);
    expect(recibidoSugerido(47, 47)).toBe(47);
  });
  it("si no dijo nada o no alcanza, nada (queda como hoy)", () => {
    expect(recibidoSugerido(null, 47)).toBeNull();
    expect(recibidoSugerido(undefined, 47)).toBeNull();
    expect(recibidoSugerido(40, 47)).toBeNull();
  });
});
