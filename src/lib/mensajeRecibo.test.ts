import { describe, expect, it } from "vitest";
import { mensajeRecibo, whatsappDelRecibo } from "./mensajeRecibo";
import type { Venta } from "../types";

/** El recibo por WhatsApp (Derick, 04-nov): el texto y el `wa.me`. */

const base = {
  id: 71,
  comprobante: "B-000071",
  fecha: "2026-11-04T15:00:00.000Z",
  total: 300,
  tarifaEnvio: 0,
  clienteNombre: null,
  clienteTelefono: null,
} as unknown as Venta;

const cuota = {
  cuotaId: 901,
  concepto: "Cuota 1/3",
  carrera: "Barbería",
  alumno: "Céspedes Molina, Joaquín",
  cobrado: 300,
  pagado: 300,
  saldo: 200,
  estado: "PARCIAL",
  saldoCurso: 1200,
  proximaCuota: { vence: "2026-11-10", monto: 200 },
  enlacePago: "https://go.bamardev.com/elmana/p/abc",
};

describe("el recibo por WhatsApp", () => {
  it("un cobro de cuotas dice qué pagó, cuánto le queda, la próxima y el enlace a su estado de cuenta", () => {
    const texto = mensajeRecibo({ ...base, cuotas: [cuota] }, "Instituto El Maná");
    expect(texto).toContain("Hola Joaquín, gracias por tu pago en Instituto El Maná.");
    expect(texto).toContain("Recibo B-000071");
    expect(texto).toMatch(/• Barbería · Cuota 1\/3: Bs\s300/);
    expect(texto).toMatch(/Te queda por pagar Bs\s1\.200,00\./);
    expect(texto).toMatch(/Próxima cuota: Bs\s200,00, vence el 10\/11\/2026\./);
    expect(texto).toContain("Tu estado de cuenta: https://go.bamardev.com/elmana/p/abc");
  });

  it("si pagó el tutor, el saludo es para él; al día, lo dice", () => {
    const texto = mensajeRecibo(
      { ...base, pagadorCuotas: { nombre: "Rosa Molina", rol: "TUTOR" }, cuotas: [{ ...cuota, saldoCurso: 0, proximaCuota: null }] },
      "El Maná",
    );
    expect(texto).toMatch(/^Hola Rosa,/);
    expect(texto).toContain("Quedaste al día con el curso.");
    expect(texto).not.toContain("Próxima cuota");
  });

  it("una venta del POS lista los artículos, sin saldo ni enlace", () => {
    const texto = mensajeRecibo(
      {
        ...base,
        total: 40,
        clienteNombre: "Ana Rojas",
        detalles: [{ productoId: 1, producto: "Pollo a la brasa", cantidad: 2, precio: 20, subtotal: 40 }],
      } as unknown as Venta,
      "Pollos Don Omar",
    );
    expect(texto).toMatch(/• 2 × Pollo a la brasa: Bs\s40/);
    expect(texto).not.toContain("Te queda");
    expect(texto).not.toContain("estado de cuenta");
  });

  it("con el teléfono de quien pagó abre su chat; sin teléfono, deja elegir el contacto", () => {
    expect(whatsappDelRecibo({ ...base, telefonoPagador: "70490686", cuotas: [cuota] }, "El Maná")).toMatch(/^https:\/\/wa\.me\/59170490686\?text=Hola%20Joaqu/);
    expect(whatsappDelRecibo({ ...base, clienteTelefono: "71234567" }, "X")).toMatch(/^https:\/\/wa\.me\/59171234567\?text=/);
    expect(whatsappDelRecibo(base, "X")).toMatch(/^https:\/\/wa\.me\/\?text=/);
  });
});

describe("el recibo por WhatsApp con varios locales (PLAN-SUCURSAL-TOTAL, etapa 3)", () => {
  it("dice de qué sucursal es, debajo del recibo", () => {
    const texto = mensajeRecibo(base, "Pollos Don Omar", "Sucursal Sur");
    expect(texto.split("\n").slice(0, 3)).toEqual([
      "Hola, gracias por tu pago en Pollos Don Omar.",
      expect.stringContaining("Recibo B-000071"),
      "Sucursal: Sucursal Sur",
    ]);
  });

  it("con un solo local, el mensaje es exactamente el de siempre", () => {
    expect(mensajeRecibo(base, "Pollos Don Omar", null)).toBe(mensajeRecibo(base, "Pollos Don Omar"));
    expect(mensajeRecibo(base, "Pollos Don Omar", undefined)).not.toContain("Sucursal");
  });

  it("el wa.me lleva la misma línea", () => {
    const url = whatsappDelRecibo(base, "Pollos Don Omar", "Sucursal Sur");
    expect(decodeURIComponent(url)).toContain("Sucursal: Sucursal Sur");
  });
});
