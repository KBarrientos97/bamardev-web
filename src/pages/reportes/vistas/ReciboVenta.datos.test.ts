import { describe, expect, it } from "vitest";
import { fmtFechaHora, fmtMoney } from "../../../lib/format";
import type { PagoVenta, Venta } from "../../../types";
import { abreRecibo, cobradoPorMedio, datosPedido, efectivoDelRecibo, textoFormaPago } from "./ReciboVenta.datos";

/**
 * El recibo de una venta abierto desde Reportes › Ventas en el restaurante
 * (REP-02, 28-oct), como el de la app (`ReciboVentaDialog`).
 */

const pago = (formaPago: string, monto: number, extra: Partial<PagoVenta> = {}): PagoVenta => ({
  formaPagoId: 1,
  formaPago,
  monto,
  recibido: monto,
  entregado: 0,
  ...extra,
});

type Pedido = Parameters<typeof datosPedido>[0];

const pedido = (p: Partial<Pedido> = {}): Pedido => ({
  tipoPedido: "DELIVERY",
  clienteNombre: "Juan Pérez",
  clienteTelefono: "70490686",
  clienteDireccion: "Av. Blanco Galindo km 4",
  repartidor: { id: 9, nombre: "Rodrigo" },
  notaPedido: "Sin picante",
  estadoEntrega: "ENTREGADO",
  entregadoEn: "2026-10-27T23:40:00.000Z",
  ...p,
});

describe("quién abre el recibo desde el reporte", () => {
  it("en el restaurante, con el permiso del historial de ventas", () => {
    expect(abreRecibo("RESTAURANTE", { permisos: ["reportes.ver", "ventas.historial"] })).toBe(true);
    // El backend pide ese permiso para leer una venta: sin él, el recibo no abriría.
    expect(abreRecibo("RESTAURANTE", { permisos: ["reportes.ver"] })).toBe(false);
  });

  it("los demás rubros siguen como siempre: el billar abre su propio detalle", () => {
    for (const rubro of ["BILLAR", "FARMACIA", "PELUQUERIA", "ACADEMIA", undefined]) {
      expect(abreRecibo(rubro, { permisos: ["ventas.historial"] })).toBe(false);
    }
  });
});

describe("cómo se cobró", () => {
  it("con un solo medio se nombra el medio", () => {
    expect(textoFormaPago([pago("QR", 45)])).toBe("QR");
  });

  it("un mixto dice cuánto entró por cada medio, en el orden en que se cobró", () => {
    // La fila del reporte dice "Mixto" y no cuánto buscar en el banco.
    expect(textoFormaPago([pago("Efectivo", 50), pago("QR", 30)])).toBe(`Efectivo ${fmtMoney(50)} · QR ${fmtMoney(30)}`);
  });

  it("lo que entró dos veces por el mismo medio es uno solo", () => {
    expect(cobradoPorMedio([pago("QR", 20), pago("Efectivo", 10.1), pago("QR", 10.2)])).toEqual([
      { medio: "QR", monto: 30.2 },
      { medio: "Efectivo", monto: 10.1 },
    ]);
    expect(textoFormaPago([pago("QR", 20), pago("QR", 10)])).toBe("QR");
  });

  it("sin pagos es un pedido que todavía no se cobró", () => {
    expect(textoFormaPago([])).toBe("Sin cobrar");
    expect(textoFormaPago(undefined)).toBe("Sin cobrar");
  });
});

describe("lo recibido y el cambio", () => {
  it("salen de lo que se pagó en efectivo", () => {
    expect(efectivoDelRecibo([pago("Efectivo", 70, { recibido: 100, entregado: 30 })])).toEqual({ recibido: 100, cambio: 30 });
  });

  it("un QR no es efectivo recibido", () => {
    // El backend guarda como "recibido" de un QR su mismo monto: sumado, una
    // venta pagada entera por QR decía "Efectivo recibido Bs 30".
    expect(efectivoDelRecibo([pago("QR", 30)])).toBeNull();
    expect(efectivoDelRecibo([pago("Efectivo", 50, { recibido: 60, entregado: 10 }), pago("QR", 30)])).toEqual({
      recibido: 60,
      cambio: 10,
    });
  });
});

describe("los datos del pedido", () => {
  it("un domicilio dice cliente, teléfono, dirección, repartidor y nota (el envío va en los totales)", () => {
    // El envío decía acá "va aparte del total" y el TOTAL no lo sumaba: la
    // misma venta daba Bs 58 en el ticket del POS y Bs 50 en éste
    // (BUG-pedidos-11). Ahora suma en los totales, como en el POS.
    const d = datosPedido(pedido())!;
    expect(d.titulo).toBe("Pedido a domicilio");
    expect(d.datos).toEqual([
      { etiqueta: "Cliente", valor: "Juan Pérez" },
      { etiqueta: "Teléfono", valor: "+591 70490686" },
      { etiqueta: "Dirección", valor: "Av. Blanco Galindo km 4" },
      { etiqueta: "Repartidor", valor: "Rodrigo" },
      { etiqueta: "Entregado", valor: fmtFechaHora("2026-10-27T23:40:00.000Z") },
      { etiqueta: "Nota", valor: "Sin picante" },
    ]);
  });

  it("para recoger no lleva dirección ni repartidor, y lo que no se cargó no se escribe", () => {
    const d = datosPedido(pedido({ tipoPedido: "RECOGER", clienteTelefono: null, notaPedido: "  ", estadoEntrega: "PENDIENTE" }))!;
    expect(d.titulo).toBe("Pedido para recoger");
    expect(d.datos).toEqual([
      { etiqueta: "Cliente", valor: "Juan Pérez" },
      { etiqueta: "Entrega", valor: "Todavía no se entregó" },
    ]);
  });

  it("una venta de mostrador no tiene bloque de pedido", () => {
    expect(datosPedido(pedido({ tipoPedido: "LOCAL" } as Partial<Venta>))).toBeNull();
  });
});
