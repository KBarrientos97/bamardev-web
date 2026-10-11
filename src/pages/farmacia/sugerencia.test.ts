import { describe, expect, it } from "vitest";
import type { ItemSugerencia } from "../../types";
import { porLaboratorio, SIN_LABORATORIO, textoMotivo, totalesPedido } from "./sugerencia";

function item(over: Partial<ItemSugerencia>): ItemSugerencia {
  return {
    productoId: 1,
    nombre: "Ibuprofeno 400 mg",
    principioActivo: "Ibuprofeno",
    concentracion: "400 mg",
    laboratorio: "INTI",
    categoria: null,
    unidad: null,
    stock: 5,
    vencido: 0,
    stockMinimo: 10,
    vendidas: 30,
    porDia: 1,
    alcanzaDias: 5,
    encargos: 0,
    sugerido: 20,
    motivo: "BAJO_MINIMO",
    costo: 0.5,
    subtotal: 10,
    ...over,
  };
}

describe("textoMotivo", () => {
  it("dice qué tan urgente es, con el color de la urgencia", () => {
    expect(textoMotivo(item({ motivo: "AGOTADO" }))).toEqual({ texto: "Agotado", tono: "rojo" });
    expect(textoMotivo(item({ motivo: "BAJO_MINIMO" })).tono).toBe("amarillo");
    expect(textoMotivo(item({ motivo: "SE_ACABA", alcanzaDias: 6 })).texto).toBe("Alcanza 6 días");
    expect(textoMotivo(item({ motivo: "SE_ACABA", alcanzaDias: 1 })).texto).toBe("Se acaba mañana");
    expect(textoMotivo(item({ motivo: "ENCARGO" })).texto).toBe("Encargado");
  });
});

describe("totalesPedido", () => {
  const a = item({ productoId: 1, sugerido: 20, costo: 0.5 });
  const b = item({ productoId: 2, sugerido: 4, costo: 10 });

  it("sin cambios, suma lo sugerido", () => {
    expect(totalesPedido([a, b], new Map())).toEqual({ articulos: 2, unidades: 24, inversion: 50 });
  });

  it("con lo que el dueño cambió; 0 es no pedirlo", () => {
    expect(
      totalesPedido(
        [a, b],
        new Map([
          [1, 10],
          [2, 0],
        ]),
      ),
    ).toEqual({ articulos: 1, unidades: 10, inversion: 5 });
  });
});

describe("porLaboratorio", () => {
  it("agrupa por laboratorio, en orden, y lo que no tiene va al final", () => {
    const grupos = porLaboratorio([
      item({ productoId: 1, laboratorio: "TERBOL" }),
      item({ productoId: 2, laboratorio: null }),
      item({ productoId: 3, laboratorio: "BAGÓ" }),
      item({ productoId: 4, laboratorio: "TERBOL" }),
    ]);
    expect(grupos.map((g) => g.laboratorio)).toEqual(["BAGÓ", "TERBOL", SIN_LABORATORIO]);
    // Dentro del grupo se respeta el orden de urgencia del servidor.
    expect(grupos[1].items.map((i) => i.productoId)).toEqual([1, 4]);
  });
});
