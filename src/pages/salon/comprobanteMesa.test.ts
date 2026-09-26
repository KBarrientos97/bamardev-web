import { describe, expect, it } from "vitest";
import type { Mesa } from "../../types/salon";
import { datosComprobanteMesa } from "./datosComprobanteMesa";

function mesa(p: Partial<Mesa> = {}): Mesa {
  return {
    id: 1,
    codigo: "M3",
    nombre: "Mesa M3",
    zonaCodigo: "salon",
    zonaNombre: "Salón",
    capacidad: 4,
    capacidadTotal: 4,
    unidas: [],
    activa: true,
    estado: "OCUPADA",
    comensales: 2,
    abiertaEn: "2026-09-24T22:08:00.000Z",
    consumo: 47,
    propina: 0,
    comandas: [
      {
        id: 51,
        estado: "SERVIDA",
        enviadaEn: "2026-09-24T22:09:00.000Z",
        items: [
          { id: 1, productoId: 1, nombre: "Brasa cuarto", cantidad: 1, precio: 26 },
          { id: 2, productoId: 2, nombre: "Brasa económico", cantidad: 1, precio: 18 },
          { id: 3, productoId: 3, nombre: "Coca Cola Mini", cantidad: 1, precio: 3 },
        ],
      },
    ],
    ...p,
  };
}

describe("el papel de la mesa", () => {
  it("sin cobro es la cuenta, no un recibo", () => {
    // Una precuenta que dice "recibo" sirve para que alguien crea que ya pagó.
    const d = datosComprobanteMesa(mesa());
    expect(d.esRecibo).toBe(false);
    expect(d.total).toBe(47);
    expect(d.pagos).toEqual([]);
    expect(d.lineas.map((l) => l.nombre)).toEqual([
      "Brasa cuarto",
      "Brasa económico",
      "Coca Cola Mini",
    ]);
  });

  it("cobrada es recibo, y el total es el del cobro", () => {
    const d = datosComprobanteMesa(
      mesa({
        estado: "PAGADA",
        comprobante: "V-000005",
        cobro: {
          fecha: "2026-09-24T22:12:00.000Z",
          total: 47,
          pagos: [{ formaPago: "QR", monto: 47, recibido: 0, entregado: 0 }],
        },
      }),
    );
    expect(d.esRecibo).toBe(true);
    expect(d.comprobante).toBe("V-000005");
    expect(d.fecha).toBe("2026-09-24T22:12:00.000Z");
    expect(d.pagos).toHaveLength(1);
  });

  it("lo anulado no sale en el papel del cliente", () => {
    // Los anulados viajan aparte (en `anulados`), no dentro de `items`.
    const m = mesa();
    m.comandas[0].anulados = [{ nombre: "Salchipapa", cantidad: 1 } as never];
    const d = datosComprobanteMesa(m);
    expect(d.lineas.some((l) => l.nombre === "Salchipapa")).toBe(false);
  });
});
