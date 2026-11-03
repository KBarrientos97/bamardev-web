import { describe, expect, it } from "vitest";
import type { CreditoDetalle } from "../types";
import { abonosDe, historialDePagos, reciboDelCobro } from "./historialPagos";

/**
 * Una cuenta de Bs 219: Bs 51 de adelanto y tres abonos que la saldan. Es el
 * caso del maquetado de la app que imprimía, en el recibo del primer abono,
 * "pagado acumulado Bs 370" y "DEUDA CANCELADA" cuando ese día quedaban Bs 68.
 */
const cuenta: CreditoDetalle = {
  id: 7,
  codigo: "CR00007",
  ventaId: 90,
  comprobante: "V-000123",
  fechaVenta: "2026-10-20T19:30:00.000Z",
  clienteId: 5,
  clienteNombre: "Rosa Mamani",
  clienteTelefono: null,
  montoTotal: 219,
  adelanto: 51,
  pagado: 219,
  saldo: 0,
  fechaCompromiso: "2026-10-31T03:59:59.000Z",
  estado: "PAGADO",
  vencido: false,
  registradoPor: "Omar",
  pagos: [
    { id: 11, monto: 100, formaPago: "Efectivo", fecha: "2026-10-22T15:00:00.000Z", usuario: "Caja 1" },
    { id: 12, monto: 50, formaPago: "QR", fecha: "2026-10-25T15:00:00.000Z", usuario: "Caja 2" },
    { id: 13, monto: 18, formaPago: "Efectivo", fecha: "2026-10-27T15:00:00.000Z", usuario: "Omar" },
  ],
};

describe("C-01 / CRE-6: cada pago con la cuenta como quedó ESE día", () => {
  it("el adelanto va primero, con la fecha de la venta y quien la registró", () => {
    const [adelanto] = historialDePagos(cuenta);
    expect(adelanto).toMatchObject({
      id: null,
      esAdelanto: true,
      monto: 51,
      // El adelanto no guarda su forma de pago: no se inventa "Efectivo".
      formaPago: "",
      fecha: cuenta.fechaVenta,
      usuario: "Omar",
      pagadoAcumulado: 51,
      saldoDespues: 168,
      cancela: false,
    });
  });

  it("el acumulado y el saldo son los de cada momento, no los de hoy", () => {
    const pagos = historialDePagos(cuenta);
    expect(pagos.map((p) => [p.pagadoAcumulado, p.saldoDespues])).toEqual([
      [51, 168],
      [151, 68],
      [201, 18],
      [219, 0],
    ]);
  });

  it("el sello de cancelada va sólo en el pago que saldó la cuenta", () => {
    expect(historialDePagos(cuenta).map((p) => p.cancela)).toEqual([false, false, false, true]);
  });

  it("cada abono dice cómo se pagó y quién lo cobró", () => {
    const [, primero, segundo] = historialDePagos(cuenta);
    expect(primero).toMatchObject({ id: 11, formaPago: "Efectivo", usuario: "Caja 1" });
    expect(segundo).toMatchObject({ id: 12, formaPago: "QR", usuario: "Caja 2" });
  });

  it("sin adelanto arranca con el primer abono", () => {
    const sinAdelanto = { ...cuenta, adelanto: 0, pagos: [{ ...cuenta.pagos![0], monto: 219 }] };
    const pagos = historialDePagos(sinAdelanto);
    expect(pagos).toHaveLength(1);
    expect(pagos[0]).toMatchObject({ esAdelanto: false, saldoDespues: 0, cancela: true });
  });

  it("un saldo de centavos sueltos cuenta como cancelado (tolerancia de medio centavo)", () => {
    const pagos = historialDePagos({
      ...cuenta,
      montoTotal: 26.7,
      adelanto: 0,
      // 3 × 8.90 en punto flotante.
      pagos: [{ id: 1, monto: 26.700000000000003, formaPago: "Efectivo", fecha: "x", usuario: null }],
    });
    expect(pagos[0].cancela).toBe(true);
    expect(pagos[0].saldoDespues).toBe(0);
  });
});

describe("CRE-5: los abonos que suma el comprobante", () => {
  it("cuenta los abonos y su total, sin el adelanto: total − adelanto − abonos = saldo", () => {
    const abierta = { ...cuenta, saldo: 18, pagado: 201, pagos: cuenta.pagos!.slice(0, 2) };
    const abonos = abonosDe(abierta);
    expect(abonos).toEqual({ cantidad: 2, monto: 150 });
    expect(abierta.montoTotal - abierta.adelanto - abonos.monto).toBe(abierta.saldo);
  });

  it("si el detalle no trajo los pagos, los deriva de los montos para que el papel cierre", () => {
    const sinLista: CreditoDetalle = { ...cuenta, saldo: 18, pagos: undefined };
    expect(abonosDe(sinLista)).toEqual({ cantidad: null, monto: 150 });
  });
});

describe("BUG-finanzas-7: el recibo de después del abono dice cómo se pagó", () => {
  const antes = { saldo: 168, montoTotal: 219 };

  it("un abono simple lleva su forma de pago, sin partes", () => {
    const recibo = reciboDelCobro({
      antes,
      partes: [{ formaPago: "Efectivo", monto: 100 }],
      despues: { saldo: 68 },
      fecha: "2026-10-22T15:00:00.000Z",
      usuario: "Caja 1",
    });
    expect(recibo).toMatchObject({
      monto: 100,
      formaPago: "Efectivo",
      pagadoAcumulado: 151,
      saldoDespues: 68,
      cancela: false,
      usuario: "Caja 1",
    });
    expect(recibo.partes).toBeUndefined();
  });

  it("un mixto dice cuánto entró por cada forma", () => {
    const recibo = reciboDelCobro({
      antes,
      partes: [
        { formaPago: "Efectivo", monto: 30 },
        { formaPago: "QR", monto: 20 },
      ],
      despues: { saldo: 118 },
      fecha: "2026-10-22T15:00:00.000Z",
      usuario: null,
    });
    expect(recibo.monto).toBe(50);
    expect(recibo.formaPago).toBe("Efectivo + QR");
    expect(recibo.partes).toEqual([
      { formaPago: "Efectivo", monto: 30 },
      { formaPago: "QR", monto: 20 },
    ]);
  });

  it("el saldo es el que devolvió el backend; sin respuesta, se descuenta del de antes", () => {
    const conRespuesta = reciboDelCobro({
      antes,
      partes: [{ formaPago: "QR", monto: 168 }],
      despues: { saldo: 0 },
      fecha: "x",
      usuario: null,
    });
    expect(conRespuesta).toMatchObject({ saldoDespues: 0, pagadoAcumulado: 219, cancela: true });

    const sinRespuesta = reciboDelCobro({
      antes,
      partes: [{ formaPago: "Efectivo", monto: 68.1 }],
      despues: null,
      fecha: "x",
      usuario: null,
    });
    expect(sinRespuesta.saldoDespues).toBe(99.9);
  });
});
