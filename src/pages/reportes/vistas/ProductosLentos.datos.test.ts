import { describe, expect, it } from "vitest";
import type { FilaLentoApi } from "../api";
import { armarLentos, consejoLentos, lineaLento } from "./ProductosLentos.datos";
import { palabraProductos } from "./vocabularioProductos";

function fila(nombre: string, stock: number, valorParado: number, vendidas = 0): FilaLentoApi {
  return { nombre, categoria: "Snacks", stock, valorParado, vendidas };
}

describe("productos lentos", () => {
  it("van de la plata parada más grande a la más chica, juntando sin ventas y poca rotación", () => {
    const r = armarLentos({
      sinMovimiento: [fila("Alquiler taco", 4, 10), fila("Salchipapa", 18, 168.3)],
      pocaRotacion: [fila("Hamburguesa", 12, 132, 3)],
    });
    expect(r.filas.map((f) => f.nombre)).toEqual(["Salchipapa", "Hamburguesa", "Alquiler taco"]);
    expect(r.plataParada).toBe(310.3);
  });

  it("lo que no tiene stock no es lento: no hay plata parada y quizá no se vendió por eso", () => {
    // El backend manda todo el catálogo sin ventas: la lista se llenaba de
    // filas en Bs 0 que en realidad estaban agotadas.
    const r = armarLentos({ sinMovimiento: [fila("Agotado", 0, 0), fila("Negativo", -2, 0)], pocaRotacion: [] });
    expect(r.filas).toHaveLength(0);
  });

  it("con stock pero sin costo cargado no suma a la plata parada y se cuenta aparte", () => {
    const r = armarLentos({ sinMovimiento: [fila("Sin costo", 30, 0), fila("Con costo", 2, 20)], pocaRotacion: [] });
    expect(r.filas.map((f) => [f.nombre, f.sinCosto])).toEqual([
      ["Con costo", false],
      ["Sin costo", true],
    ]);
    expect(r.plataParada).toBe(20);
    expect(r.sinCosto).toBe(1);
  });

  it("la línea dice cuánto se vendió en el período, o que no se vendió nada", () => {
    expect(lineaLento({ vendidas: 11, stock: 18 })).toBe("11 vendidos en el período · stock 18");
    expect(lineaLento({ vendidas: 1, stock: 3 })).toBe("1 vendido en el período · stock 3");
    expect(lineaLento({ vendidas: 0, stock: 4 })).toBe("Sin ventas en el período · stock 4");
  });

  it("un stock con fracción no se redondea", () => {
    // Con fmtNum, 2,5 kg salía "stock 3".
    expect(lineaLento({ vendidas: 0, stock: 2.5 })).toBe("Sin ventas en el período · stock 2,5");
    expect(lineaLento({ vendidas: 1.5, stock: 0.125 })).toBe("1,5 vendidos en el período · stock 0,125");
  });

  it("el consejo habla el idioma del rubro", () => {
    expect(consejoLentos("BILLAR")).toContain("tiempo de mesa");
    expect(consejoLentos("FARMACIA")).not.toContain("combo");
    expect(consejoLentos("RESTAURANTE")).toContain("combo");
  });

  it("la farmacia habla de medicamentos, igual que el título del catálogo", () => {
    expect(palabraProductos("FARMACIA")).toBe("medicamentos");
    expect(palabraProductos("FARMACIA", false)).toBe("medicamento");
    expect(palabraProductos("RESTAURANTE")).toBe("productos");
    expect(palabraProductos(undefined)).toBe("productos");
  });
});
