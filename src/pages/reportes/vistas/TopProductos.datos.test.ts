import { describe, expect, it } from "vitest";
import type { TopProductoApi } from "../api";
import {
  armarTop,
  cuantosSinCosto,
  esTiempoDeMesa,
  filasExportTop,
  fraccionTop,
  lineaTiempoMesa,
  lineaTop,
} from "./TopProductos.datos";

function producto(nombre: string, ingresos: number, utilidad: number, extra: Partial<TopProductoApi> = {}): TopProductoApi {
  return {
    nombre,
    categoria: "Bebidas",
    ingresos,
    utilidad,
    unidades: 10,
    margenPct: ingresos ? Math.round((utilidad / ingresos) * 100) : 0,
    ...extra,
  };
}

describe("los dos rankings", () => {
  it("más vendidos ordena por ingresos y más rentables por la ganancia de cada artículo", () => {
    const datos = [producto("Cerveza", 1000, 100), producto("Coca Cola", 600, 300), producto("Agua", 500, 250)];
    expect(armarTop(datos, "vendidos", "RESTAURANTE").filas.map((f) => f.nombre)).toEqual(["Cerveza", "Coca Cola", "Agua"]);
    expect(armarTop(datos, "rentables", "RESTAURANTE").filas.map((f) => f.nombre)).toEqual(["Coca Cola", "Agua", "Cerveza"]);
  });

  it("a igual ganancia desempata el que más vendió", () => {
    const datos = [producto("Maní", 200, 100), producto("Papas", 400, 100)];
    expect(armarTop(datos, "rentables", undefined).filas.map((f) => f.nombre)).toEqual(["Papas", "Maní"]);
  });

  it("la barra es contra el primero del ranking y una pérdida no tiene barra", () => {
    const top = armarTop([producto("A", 1000, 400), producto("B", 500, 100), producto("C", 300, -20)], "rentables", undefined);
    const [a, b, c] = top.filas;
    expect(fraccionTop(a, a, "rentables")).toBe(1);
    expect(fraccionTop(b, a, "rentables")).toBeCloseTo(0.25);
    expect(fraccionTop(c, a, "rentables")).toBe(0);
  });
});

describe("el tiempo de mesa del billar", () => {
  it("va aparte del ranking y no le gana a los productos en más rentables", () => {
    // A propósito: es un servicio sin costo, entra entero como ganancia y
    // metido en el ranking quedaba primero por paliza, con las barras de
    // todos los productos achicadas a una rayita.
    const datos = [producto("Tiempo de mesa", 4601, 4601, { categoria: "Sin categoría", unidades: 57 }), producto("Paceña", 2460, 934.8)];
    const top = armarTop(datos, "rentables", "BILLAR");
    expect(top.tiempoMesa?.nombre).toBe("Tiempo de mesa");
    expect(top.filas.map((f) => f.nombre)).toEqual(["Paceña"]);
    expect(fraccionTop(top.filas[0], top.filas[0], "rentables")).toBe(1);
  });

  it("fuera del billar, un producto que se llame así es uno más del ranking", () => {
    const top = armarTop([producto("Tiempo de mesa", 100, 100)], "vendidos", "RESTAURANTE");
    expect(top.tiempoMesa).toBeNull();
    expect(top.filas).toHaveLength(1);
  });

  it("se reconoce sin importar mayúsculas, tildes ni espacios, y nada más que ese nombre", () => {
    expect(esTiempoDeMesa("  TIEMPO DE MESA ", "BILLAR")).toBe(true);
    expect(esTiempoDeMesa("Tiémpo de mesa", "BILLAR")).toBe(true);
    expect(esTiempoDeMesa("Tiempo de mesa VIP", "BILLAR")).toBe(false);
  });

  it("sus unidades son mesas cobradas, no unidades", () => {
    // Cada mesa cerrada entra a la venta como un renglón con cantidad 1:
    // "57 uds" de tiempo de mesa no se entendía.
    const top = armarTop([producto("Tiempo de mesa", 4601, 4601, { unidades: 57 })], "vendidos", "BILLAR");
    expect(lineaTiempoMesa(top.tiempoMesa!)).toBe("57 mesas cobradas · no tiene costo");
  });
});

describe("el margen que no es un dato", () => {
  it("un artículo sin costo cargado dice eso y no margen 100 %", () => {
    // Con costo cero el backend da margen 100 % y el artículo encabezaba "más
    // rentables" como el mejor de la carta, cuando lo que falta es el costo.
    const top = armarTop([producto("Hielo", 50, 50), producto("Coca Cola", 600, 300)], "vendidos", undefined);
    const hielo = top.filas.find((f) => f.nombre === "Hielo")!;
    expect(hielo.margen).toBeNull();
    expect(lineaTop(hielo)).toBe("Bebidas · 10 uds · sin costo cargado");
    expect(cuantosSinCosto(top)).toBe(1);
  });

  it("sin ingresos el margen se escribe —, no 0 %", () => {
    const top = armarTop([producto("Regalo", 0, -5, { unidades: 1 })], "vendidos", undefined);
    expect(top.filas[0].margen).toBeNull();
    expect(lineaTop(top.filas[0])).toBe("Bebidas · 1 ud · margen —");
  });

  it("con costo cargado muestra el margen entero", () => {
    const top = armarTop([producto("Paceña", 2460, 934.8, { categoria: "Cervezas", unidades: 164 })], "vendidos", undefined);
    expect(lineaTop(top.filas[0])).toBe("Cervezas · 164 uds · margen 38 %");
  });
});

describe("la planilla", () => {
  it("pone el tiempo de mesa arriba y sin puesto, y el margen con un decimal", () => {
    const top = armarTop(
      [producto("Tiempo de mesa", 4601, 4601), producto("Paceña", 2460, 934.8), producto("Hielo", 50, 50)],
      "vendidos",
      "BILLAR",
    );
    const filas = filasExportTop(top);
    expect(filas.map((f) => [f.puesto, f.nombre])).toEqual([
      [null, "Tiempo de mesa"],
      [1, "Paceña"],
      [2, "Hielo"],
    ]);
    expect(filas[1].margenPct).toBe(38);
    expect(filas[2]).toMatchObject({ margenPct: null, nota: "Sin costo cargado" });
  });
});
