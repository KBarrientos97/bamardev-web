import { describe, expect, it } from "vitest";
import { fmtMoney } from "../../../lib/format";
import { armarInsumos, lineaInsumo, proporcionSobreVentas } from "./Insumos.datos";

describe("insumos", () => {
  it("dice qué parte de lo vendido se fue en comprar insumos", () => {
    expect(proporcionSobreVentas(6059.12, 9906)).toBeCloseTo(0.6117, 3);
  });

  it("sin ventas no hay porcentaje: no se escribe 0 % ni infinito", () => {
    expect(proporcionSobreVentas(500, 0)).toBeNull();
    expect(proporcionSobreVentas(500, 0.004)).toBeNull();
  });

  it("comprar más de lo que se vendió no se recorta: es justo lo que hay que ver", () => {
    expect(proporcionSobreVentas(1300, 1000)).toBeCloseTo(1.3);
  });

  it("cada insumo dice cuánto se compró y a cuánto la unidad", () => {
    expect(lineaInsumo({ cantidad: 12, unidad: "Kilogramo", costoUnitario: 15 })).toBe(`12 kilogramos · ${fmtMoney(15)} c/u`);
  });

  it("la lista va de lo que más se gastó a lo que menos, con la barra contra el primero", () => {
    const filas = armarInsumos([
      { nombre: "Aceite", unidad: "Litro", cantidad: 10, total: 150, costoUnitario: 15 },
      { nombre: "Pollo", unidad: "Kilogramo", cantidad: 40, total: 600, costoUnitario: 15 },
    ]);
    expect(filas.map((f) => [f.nombre, f.fraccion])).toEqual([
      ["Pollo", 1],
      ["Aceite", 0.25],
    ]);
  });
});
