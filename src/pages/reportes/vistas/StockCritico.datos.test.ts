import { describe, expect, it } from "vitest";
import {
  detalleStock,
  estadoStock,
  lineaStock,
  plazo,
  resumenStock,
  ritmoVenta,
  textoCobertura,
  utilDe,
  type ItemStock,
} from "./StockCritico.datos";

function item(extra: Partial<ItemStock>): ItemStock {
  return {
    productoId: 1,
    nombre: "Paceña 620 ml",
    categoria: "Cervezas",
    unidad: "Unidad",
    stock: 10,
    vencido: 0,
    stockMinimo: 0,
    vendidas: 60,
    porDia: 2,
    alcanzaDias: 5,
    encargos: 0,
    sugerido: 20,
    motivo: "SE_ACABA",
    costo: 7,
    subtotal: 140,
    ...extra,
  };
}

describe("el estado de cada fila", () => {
  it("lo agotado va en rojo y lo que se acaba dice para cuántos días alcanza", () => {
    expect(estadoStock(item({ motivo: "AGOTADO", alcanzaDias: 0 }))).toEqual({ texto: "Agotado", tono: "rojo" });
    expect(estadoStock(item({ alcanzaDias: 1 }))).toEqual({ texto: "1 día", tono: "ambar" });
    expect(estadoStock(item({ alcanzaDias: 3 }))).toEqual({ texto: "3 días", tono: "ambar" });
    expect(estadoStock(item({ alcanzaDias: 0 }))).toEqual({ texto: "Menos de 1 día", tono: "ambar" });
  });

  it("un encargo no dice días aunque los tenga: no se acaba, lo piden clientes", () => {
    expect(estadoStock(item({ motivo: "ENCARGO", alcanzaDias: 40 }))).toEqual({ texto: "Encargado", tono: "gris" });
  });

  it("bajo el mínimo y sin ventas lo dice así, porque no hay días que contar", () => {
    expect(estadoStock(item({ motivo: "BAJO_MINIMO", alcanzaDias: null }))).toEqual({ texto: "Bajo el mínimo", tono: "ambar" });
  });
});

describe("lo que queda y a qué ritmo se vende", () => {
  it("lo vencido no cuenta como lo que queda: está en el estante pero no se vende", () => {
    expect(utilDe(item({ stock: 10, vencido: 4 }))).toBe(6);
    expect(utilDe(item({ stock: 3, vencido: 5 }))).toBe(0);
  });

  it("lo que se vende poco va por semana o por mes", () => {
    expect(ritmoVenta(363 / 30)).toBe("se venden unos 12,1 por día");
    expect(ritmoVenta(5 / 30)).toBe("se venden unos 1,2 por semana");
    expect(ritmoVenta(1 / 30)).toBe("se vende 1 por mes");
    expect(ritmoVenta(2 / 30)).toBe("se venden unos 2 por mes");
  });

  it("el ritmo sale de lo vendido y no del porDia redondeado del backend", () => {
    // Una venta en 30 días viene como porDia 0,03, que daba "unos 0,9 por mes".
    expect(lineaStock(item({ stock: 4, vendidas: 1, porDia: 0.03 }), 30)).toBe("Quedan 4 · se vende 1 por mes");
  });

  it("sin ventas en la historia lo dice con los días mirados", () => {
    expect(lineaStock(item({ stock: 2, vendidas: 0, porDia: 0 }), 30)).toBe("Quedan 2 · sin ventas en los últimos 30 días");
  });

  it("el detalle junta lo vencido, el mínimo que no se cumple y lo encargado", () => {
    expect(detalleStock(item({ stock: 5, vencido: 2, stockMinimo: 10, encargos: 1 }))).toBe(
      "2 vencidos en el estante · el mínimo es 10 · 1 encargado por clientes",
    );
    expect(detalleStock(item({}))).toBeNull();
  });
});

describe("los números de arriba", () => {
  it("lo que se acaba en menos de 7 días no cuenta lo que ya está agotado", () => {
    const r = resumenStock([
      item({ motivo: "AGOTADO", alcanzaDias: 0 }),
      item({ alcanzaDias: 2 }),
      item({ alcanzaDias: 6 }),
      item({ alcanzaDias: 7 }),
      item({ motivo: "BAJO_MINIMO", alcanzaDias: null }),
    ]);
    expect(r).toEqual({ agotados: 1, seAcaban: 2 });
  });

  it("catorce días se dicen en semanas", () => {
    expect(textoCobertura(14)).toBe("para 2 semanas");
    expect(plazo(7)).toBe("1 semana");
    expect(plazo(10)).toBe("10 días");
  });
});
