import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Un reintento no duplica plata (entrega del 19-oct): con wifi malo el cajero
 * toca "Confirmar", la respuesta no llega y vuelve a tocar. La misma acción
 * tiene que viajar con la misma clave (y el backend no la repite); una acción
 * corregida, con otra.
 */

vi.mock("../../lib/api", () => ({
  request: vi.fn(() => Promise.resolve({})),
}));

import { request } from "../../lib/api";
import { useIntentoDeCobro } from "../pos/useIntentoDeCobro";
import { apiBillar } from "./api";
import { huellaAdelanto, huellaConsumos, huellaExtension } from "./reintentos";

const pedir = vi.mocked(request);

/** El cuerpo que salió en el último pedido al backend. */
function cuerpoEnviado(): Record<string, unknown> {
  const [, opciones] = pedir.mock.calls.at(-1)!;
  return JSON.parse(String(opciones?.body)) as Record<string, unknown>;
}

describe("huellaAdelanto", () => {
  const efectivo = { metodo: "Efectivo", monto: 20 };

  it("el mismo adelanto da la misma huella aunque cambie el billete que entregó", () => {
    // Dar Bs 50 en vez de Bs 20 por el mismo adelanto es el mismo cobro: con
    // otra clave, el reintento entraba dos veces al cajón.
    expect(huellaAdelanto("88", { ...efectivo, recibido: 50 })).toBe(huellaAdelanto("88", efectivo));
    expect(huellaAdelanto("88", { metodo: "Efectivo", monto: 20.000000001 })).toBe(huellaAdelanto("88", efectivo));
  });

  it("otro monto u otra forma de pago es otro adelanto", () => {
    // Con la misma clave el backend devolvía el adelanto viejo y el corregido
    // no quedaba registrado.
    expect(huellaAdelanto("88", { metodo: "Efectivo", monto: 25 })).not.toBe(huellaAdelanto("88", efectivo));
    expect(huellaAdelanto("88", { metodo: "QR", monto: 20 })).not.toBe(huellaAdelanto("88", efectivo));
    expect(huellaAdelanto("88", { metodo: "Mixto", monto: 20, partes: { efectivo: 10, qr: 10 } })).not.toBe(
      huellaAdelanto("88", { metodo: "Mixto", monto: 20, partes: { efectivo: 5, qr: 15 } }),
    );
  });

  it("el mismo adelanto en otra mesa es otro", () => {
    expect(huellaAdelanto("89", efectivo)).not.toBe(huellaAdelanto("88", efectivo));
  });
});

describe("huellaExtension", () => {
  it("las mismas horas, cobradas igual, son la misma extensión", () => {
    expect(huellaExtension("88", 1)).toBe(huellaExtension("88", 1));
    expect(huellaExtension("88", 1, { metodo: "QR", monto: 20 })).toBe(huellaExtension("88", 1, { metodo: "QR", monto: 20 }));
  });

  it("otras horas, o pasar de cobrar al final a cobrar ahora, es otra extensión", () => {
    expect(huellaExtension("88", 2)).not.toBe(huellaExtension("88", 1));
    expect(huellaExtension("88", 1, { metodo: "Efectivo", monto: 20 })).not.toBe(huellaExtension("88", 1));
  });
});

describe("huellaConsumos", () => {
  it("lo mismo cargado en otro orden es la misma carga", () => {
    expect(
      huellaConsumos("88", [
        { productoId: 3, cant: 2 },
        { productoId: 1, cant: 1 },
      ]),
    ).toBe(
      huellaConsumos("88", [
        { productoId: 1, cant: 1 },
        { productoId: 3, cant: 2 },
      ]),
    );
  });

  it("lo que quedó en cero no cuenta: no viaja", () => {
    expect(
      huellaConsumos("88", [
        { productoId: 1, cant: 1 },
        { productoId: 5, cant: 0 },
      ]),
    ).toBe(huellaConsumos("88", [{ productoId: 1, cant: 1 }]));
  });

  it("otra cantidad u otra mesa es otra carga", () => {
    expect(huellaConsumos("88", [{ productoId: 1, cant: 2 }])).not.toBe(huellaConsumos("88", [{ productoId: 1, cant: 1 }]));
    expect(huellaConsumos("89", [{ productoId: 1, cant: 1 }])).not.toBe(huellaConsumos("88", [{ productoId: 1, cant: 1 }]));
  });
});

describe("la clave con la huella (useIntentoDeCobro)", () => {
  it("el reintento de la misma acción repite la clave; la corregida estrena otra", () => {
    const { result } = renderHook(() => useIntentoDeCobro());
    const primera = result.current.actual(huellaAdelanto("88", { metodo: "Efectivo", monto: 20 }));
    // Se perdió la respuesta y el cajero vuelve a tocar "Registrar".
    expect(result.current.actual(huellaAdelanto("88", { metodo: "Efectivo", monto: 20 }))).toBe(primera);
    // Corrigió el monto: es otro adelanto.
    const corregida = result.current.actual(huellaAdelanto("88", { metodo: "Efectivo", monto: 15 }));
    expect(corregida).not.toBe(primera);
    // Entró: el siguiente adelanto, aunque sea igual, es otro.
    result.current.registrado();
    expect(result.current.actual(huellaAdelanto("88", { metodo: "Efectivo", monto: 15 }))).not.toBe(corregida);
  });
});

describe("apiBillar: la clave viaja en las acciones que mueven plata", () => {
  beforeEach(() => pedir.mockClear());

  it("el adelanto", async () => {
    await apiBillar.pagar("88", [{ formaPagoId: 7, monto: 20 }], "clave-1");
    expect(pedir.mock.calls.at(-1)?.[0]).toBe("/billar/sesiones/88/pagos");
    expect(cuerpoEnviado()).toEqual({ pagos: [{ formaPagoId: 7, monto: 20 }], clienteRequestId: "clave-1" });
  });

  it("la extensión, cobrada o al final", async () => {
    // En minutos desde el 27-oct (la web vende media hora).
    await apiBillar.extender("88", 30, undefined, "clave-2");
    expect(cuerpoEnviado()).toEqual({ minutos: 30, clienteRequestId: "clave-2" });
    await apiBillar.extender("88", 60, [{ formaPagoId: 9, monto: 20 }], "clave-3");
    expect(cuerpoEnviado()).toEqual({ minutos: 60, pagos: [{ formaPagoId: 9, monto: 20 }], clienteRequestId: "clave-3" });
  });

  it("la carga de consumos", async () => {
    await apiBillar.consumos("88", [{ productoId: 1, cantidad: 2 }], "clave-4");
    expect(cuerpoEnviado()).toEqual({ items: [{ productoId: 1, cantidad: 2 }], clienteRequestId: "clave-4" });
  });

  it("anular la mesa, con el PIN", async () => {
    await apiBillar.anular("88", "Se abrió por error", { autorizadorPin: "1234" }, "clave-5");
    expect(cuerpoEnviado()).toEqual({ motivo: "Se abrió por error", autorizadorPin: "1234", clienteRequestId: "clave-5" });
  });
});
