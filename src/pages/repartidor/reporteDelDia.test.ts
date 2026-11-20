import { describe, expect, it } from "vitest";
import { estadoEnLaCaja } from "../../lib/repartoRendicion";
import type { Venta } from "../../types";
import { comoPago, reporteDelDia } from "./reporteDelDia";

/**
 * «Mi día» del repartidor: cuántos pedidos llevó hoy y cuánto envío se cobró
 * en cada uno, con lo que ya trae «Mis entregas» (nada inventado).
 */

const v = (extra: Partial<Venta>): Venta =>
  ({
    id: 1,
    comprobante: "V-000001",
    fecha: "2026-11-20T18:00:00.000Z",
    total: 50,
    tarifaEnvio: 7,
    montoRendicion: 50,
    prepagado: false,
    estadoEntrega: "ENTREGADO",
    clienteNombre: "Carla",
    entregadoEn: "2026-11-20T19:00:00.000Z",
    formasPago: ["Efectivo"],
    pagos: [{ formaPagoId: 10, formaPago: "Efectivo", monto: 50 }],
    ...extra,
  }) as Venta;

describe("reporteDelDia", () => {
  it("cuenta entregados y en camino, suma los envíos de lo entregado y ordena del primero al último", () => {
    const r = reporteDelDia([
      v({ id: 1, entregadoEn: "2026-11-20T20:00:00.000Z", tarifaEnvio: 7.5 }),
      v({ id: 2, comprobante: null, entregadoEn: "2026-11-20T19:00:00.000Z", tarifaEnvio: 8, clienteNombre: null }),
      // En camino: su envío todavía no se cobró.
      v({ id: 3, estadoEntrega: "PENDIENTE", entregadoEn: null, tarifaEnvio: 10 }),
    ]);
    expect(r.entregados).toBe(2);
    expect(r.enCamino).toBe(1);
    expect(r.envioCobrado).toBe(15.5);
    expect(r.filas.map((f) => f.id)).toEqual([2, 1]);
    expect(r.filas[0]).toMatchObject({ numero: "#2", cliente: "Sin nombre", envio: 8, pago: "Efectivo" });
  });

  it("un pedido sin envío cuenta como llevado, con envío Bs 0", () => {
    const r = reporteDelDia([v({ tarifaEnvio: 0 })]);
    expect(r.entregados).toBe(1);
    expect(r.envioCobrado).toBe(0);
    expect(r.filas[0].envio).toBe(0);
  });

  it("sin nada, todo en cero y sin filas", () => {
    expect(reporteDelDia([])).toEqual({ entregados: 0, enCamino: 0, envioCobrado: 0, filas: [] });
  });
});

describe("comoPago", () => {
  it("efectivo, QR y mixto con los montos reales", () => {
    expect(comoPago(v({}))).toBe("Efectivo");
    expect(comoPago(v({ pagos: [{ formaPagoId: 11, formaPago: "QR", monto: 50 }] }))).toBe("QR");
    expect(
      comoPago(
        v({
          pagos: [
            { formaPagoId: 11, formaPago: "QR", monto: 30 },
            { formaPagoId: 10, formaPago: "Efectivo", monto: 20 },
          ],
        }),
      ),
    ).toBe("QR + efectivo");
  });

  it("prepagado: lo cobró la caja; sin montos (backend anterior), los nombres", () => {
    expect(comoPago(v({ prepagado: true, montoRendicion: 0 }))).toBe("Ya estaba pagado");
    expect(comoPago(v({ pagos: undefined, formasPago: ["QR", "Efectivo"] }))).toBe("QR + Efectivo");
  });
});

describe("estadoEnLaCaja", () => {
  const base = { estado: null, recibidaEn: null, recibidaPorNombre: null, cobroLaCaja: false } as const;
  it("recibida dice quién y a qué hora; pendiente, que falta; la de la caja, que la cobró la caja", () => {
    expect(estadoEnLaCaja({ ...base, estado: "RECIBIDA", recibidaPorNombre: "Caja Uno", recibidaEn: "2026-11-20T19:30:00.000Z" })).toMatchObject({
      tono: "recibida",
      texto: expect.stringMatching(/^Recibida por Caja Uno · /),
    });
    expect(estadoEnLaCaja({ ...base, estado: "RECIBIDA" })?.texto).toBe("Recibida por la caja");
    expect(estadoEnLaCaja({ ...base, estado: "PENDIENTE" })).toEqual({ texto: "Falta entregarla a la caja", tono: "pendiente" });
    expect(estadoEnLaCaja({ ...base, cobroLaCaja: true, estado: "PENDIENTE" })?.texto).toBe("La cobró la caja");
  });

  it("sin plata que pase por la caja (QR, control apagado), no dice nada", () => {
    expect(estadoEnLaCaja(base)).toBeNull();
  });
});
