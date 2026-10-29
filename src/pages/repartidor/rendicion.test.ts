import { describe, expect, it } from "vitest";
import type { Venta } from "../../types";
import { cobradoPorQr, rendicionDelTurno } from "./rendicion";

/**
 * La cuenta de la rendición del repartidor (port de `RendicionRepartidor.kt`).
 * La tarifa de envío es suya; lo cobrado por QR ya está en la cuenta del
 * negocio. Lo único que entrega en mano es el efectivo.
 */

const QR = { formaPagoId: 11, formaPago: "QR" };
const EFECTIVO = { formaPagoId: 10, formaPago: "Efectivo" };

/** Bs 100 de productos y Bs 8 de envío, cobrado al entregar. */
function pedido(datos: Partial<Venta> = {}): Venta {
  return {
    id: 1,
    comprobante: "V-000001",
    estado: "APROBADO",
    fecha: "2026-10-29T20:00:00.000Z",
    total: 100,
    tipoPedido: "DELIVERY",
    estadoEntrega: "ENTREGADO",
    prepagado: false,
    clienteNombre: "Juan Pérez",
    clienteDireccion: "Av. Blanco Galindo km 4",
    clienteTelefono: "70490686",
    tarifaEnvio: 8,
    minutosEstimados: null,
    notaPedido: null,
    entregadoEn: "2026-10-29T20:30:00.000Z",
    totalACobrar: 108,
    montoRendicion: 100,
    formasPago: ["Efectivo"],
    pagos: [{ ...EFECTIVO, monto: 100 }],
    ...datos,
  } as Venta;
}

describe("DEL-2: el mixto se reparte con lo que entró por cada forma de pago", () => {
  it("Bs 100 cobrados con 60 por QR y 40 en efectivo: efectivo 40, QR 60", () => {
    // El bug: la web miraba sólo los nombres y, con un "QR" entre ellos,
    // contaba el pedido entero como QR. Al repartidor con Bs 40 en el
    // bolsillo le decía "Efectivo en mano Bs 0 · Ya cobrado por QR Bs 100".
    const r = rendicionDelTurno([
      pedido({
        formasPago: ["QR", "Efectivo"],
        pagos: [
          { ...QR, monto: 60 },
          { ...EFECTIVO, monto: 40 },
        ],
      }),
    ]);
    expect(r).toMatchObject({ rendido: 100, porQr: 60, enEfectivo: 40 });
  });

  it("todo por QR no deja nada en efectivo, y todo en efectivo nada por QR", () => {
    expect(cobradoPorQr(pedido({ formasPago: ["QR"], pagos: [{ ...QR, monto: 100 }] }))).toBe(100);
    expect(cobradoPorQr(pedido())).toBe(0);
  });

  it("lo que entró por QR no pasa de lo que se rinde", () => {
    // Si el QR se llevó también la tarifa, ese excedente es del repartidor
    // y no del negocio: no le puede achicar el efectivo de otro pedido.
    expect(cobradoPorQr(pedido({ formasPago: ["QR"], pagos: [{ ...QR, monto: 108 }] }))).toBe(100);
  });

  it("sin los montos (un backend anterior) sólo es QR lo cobrado únicamente con QR", () => {
    // Como la app: un mixto sin montos cuenta como efectivo, que es lo que
    // el negocio le va a pedir; antes la web lo daba entero por QR.
    expect(cobradoPorQr(pedido({ pagos: undefined, formasPago: ["QR"] }))).toBe(100);
    expect(cobradoPorQr(pedido({ pagos: undefined, formasPago: ["QR", "Efectivo"] }))).toBe(0);
    expect(cobradoPorQr(pedido({ pagos: undefined, formasPago: [] }))).toBe(0);
  });

  it("un prepagado no rinde, aunque la caja lo haya cobrado por QR", () => {
    const prepagado = pedido({
      prepagado: true,
      montoRendicion: 0,
      totalACobrar: 8,
      formasPago: ["QR"],
      pagos: [{ ...QR, monto: 100 }],
    });
    expect(cobradoPorQr(prepagado)).toBe(0);
    expect(rendicionDelTurno([prepagado])).toMatchObject({ rendido: 0, porQr: 0, enEfectivo: 0, tarifas: 8 });
  });
});

describe("BUG-pedidos-3: al negocio se le entrega sólo el efectivo", () => {
  it("con un pedido por QR y otro en efectivo, lo que se entrega es el efectivo", () => {
    // El número grande ("A entregar al negocio") y el KPI sumaban el QR: le
    // pedían al repartidor en mano una plata que ya estaba en el banco.
    const r = rendicionDelTurno([
      pedido({ id: 1, formasPago: ["QR"], pagos: [{ ...QR, monto: 100 }] }),
      pedido({ id: 2, total: 50, montoRendicion: 50, totalACobrar: 58, pagos: [{ ...EFECTIVO, monto: 50 }] }),
    ]);
    expect(r.enEfectivo).toBe(50);
    expect(r.porQr).toBe(100);
    expect(r.rendido).toBe(150);
  });

  it("las tarifas son aparte y lo pendiente no suma", () => {
    const r = rendicionDelTurno([
      pedido({ id: 1 }),
      pedido({ id: 2, estadoEntrega: "PENDIENTE", entregadoEn: null }),
    ]);
    expect(r.entregadas.map((p) => p.id)).toEqual([1]);
    expect(r.pendientes.map((p) => p.id)).toEqual([2]);
    expect(r).toMatchObject({ rendido: 100, enEfectivo: 100, tarifas: 8 });
  });

  it("los centavos no dejan residuos binarios", () => {
    const r = rendicionDelTurno([
      pedido({ id: 1, total: 33.37, montoRendicion: 33.37, pagos: [{ ...QR, monto: 10.1 }, { ...EFECTIVO, monto: 23.27 }] }),
      pedido({ id: 2, total: 66.73, montoRendicion: 66.73, pagos: [{ ...QR, monto: 20.2 }, { ...EFECTIVO, monto: 46.53 }] }),
    ]);
    expect(r).toMatchObject({ rendido: 100.1, porQr: 30.3, enEfectivo: 69.8 });
  });
});
