import { describe, expect, it } from "vitest";
import type { Producto } from "../../types";
import { agruparPorCategoria, columnasQueEntran, repartirEnColumnas } from "./columnasPos";

/**
 * «Columnas por categoría» (16-nov): cómo se agrupan los productos y cómo se
 * acomodan los bloques, sin dibujar nada.
 */

const POLLOS = { id: 1, nombre: "Pollos" };
const BEBIDAS = { id: 2, nombre: "Bebidas" };
const EXTRAS = { id: 3, nombre: "Extras" };

const p = (id: number, nombre: string, categoria: { id: number; nombre: string } | null) =>
  ({ id, nombre, categoria }) as unknown as Producto;

const ENTERO = p(1, "Pollo entero", POLLOS);
const CUARTO = p(2, "Cuarto de pollo", POLLOS);
const COCA = p(3, "Coca 2 L", BEBIDAS);
const PAPAS = p(4, "Papas extra", EXTRAS);
const SERVILLETAS = p(5, "Servilletas", null);

const resumen = (bloques: ReturnType<typeof agruparPorCategoria>) =>
  bloques.map((b) => [b.nombre, b.productos.map((x) => x.nombre)]);

describe("agruparPorCategoria", () => {
  it("un bloque por categoría, en el orden de las categorías (el del dueño)", () => {
    expect(resumen(agruparPorCategoria([ENTERO, COCA, PAPAS, CUARTO], [BEBIDAS, POLLOS, EXTRAS]))).toEqual([
      ["Bebidas", ["Coca 2 L"]],
      ["Pollos", ["Pollo entero", "Cuarto de pollo"]],
      ["Extras", ["Papas extra"]],
    ]);
  });

  it("dentro de cada bloque, el orden en que vienen (el del cajero)", () => {
    expect(resumen(agruparPorCategoria([CUARTO, ENTERO], [POLLOS]))).toEqual([["Pollos", ["Cuarto de pollo", "Pollo entero"]]]);
  });

  it("una categoría sin nada a la vista no se dibuja", () => {
    expect(resumen(agruparPorCategoria([COCA], [POLLOS, BEBIDAS, EXTRAS]))).toEqual([["Bebidas", ["Coca 2 L"]]]);
  });

  it("los que no tienen categoría van a «Otros», al final", () => {
    const bloques = agruparPorCategoria([SERVILLETAS, ENTERO], [POLLOS]);
    expect(resumen(bloques)).toEqual([
      ["Pollos", ["Pollo entero"]],
      ["Otros", ["Servilletas"]],
    ]);
    expect(bloques.at(-1)?.lugar).toBe(-1);
  });

  it("una categoría que no está en la lista no se pierde: arma su bloque después de las conocidas", () => {
    // Las categorías no cargaron, o el producto es de una inactiva.
    expect(resumen(agruparPorCategoria([PAPAS, SERVILLETAS, ENTERO, COCA], [POLLOS]))).toEqual([
      ["Pollos", ["Pollo entero"]],
      ["Extras", ["Papas extra"]],
      ["Bebidas", ["Coca 2 L"]],
      ["Otros", ["Servilletas"]],
    ]);
    expect(resumen(agruparPorCategoria([COCA, ENTERO], []))).toEqual([
      ["Bebidas", ["Coca 2 L"]],
      ["Pollos", ["Pollo entero"]],
    ]);
  });

  it("el lugar de cada bloque es el de su categoría (el color no cambia al filtrar)", () => {
    const [extras] = agruparPorCategoria([PAPAS], [POLLOS, BEBIDAS, EXTRAS]);
    expect(extras.lugar).toBe(2);
  });
});

describe("columnasQueEntran", () => {
  it("columnas de al menos el mínimo, con su separación", () => {
    expect(columnasQueEntran(658, 240, 12)).toBe(2);
    expect(columnasQueEntran(1212, 240, 12)).toBe(4);
    expect(columnasQueEntran(240, 240, 12)).toBe(1);
  });

  it("sin medir todavía (o más angosto que una): una", () => {
    expect(columnasQueEntran(0, 240, 12)).toBe(1);
    expect(columnasQueEntran(150, 240, 12)).toBe(1);
    expect(columnasQueEntran(Number.NaN, 240, 12)).toBe(1);
  });
});

describe("repartirEnColumnas", () => {
  type Bloque = { nombre: string; n: number };
  const alto = (b: Bloque) => b.n;
  const nombres = (pilas: Bloque[][]) => pilas.map((pila) => pila.map((b) => b.nombre));

  it("con tantas categorías como columnas, cada una tiene la suya aunque una sea larga", () => {
    // Lo que el navegador hacía con columnas de CSS: Pollos sola y las otras dos juntas.
    const bloques = [
      { nombre: "Pollos", n: 21 },
      { nombre: "Bebidas", n: 9 },
      { nombre: "Extras", n: 7 },
    ];
    expect(nombres(repartirEnColumnas(bloques, 3, alto))).toEqual([["Pollos"], ["Bebidas"], ["Extras"]]);
  });

  it("con más categorías, en orden como un diario y con la columna más alta lo más baja posible", () => {
    const bloques = [
      { nombre: "A", n: 10 },
      { nombre: "B", n: 3 },
      { nombre: "C", n: 3 },
      { nombre: "D", n: 8 },
      { nombre: "E", n: 2 },
    ];
    expect(nombres(repartirEnColumnas(bloques, 3, alto))).toEqual([["A"], ["B", "C"], ["D", "E"]]);
  });

  it("seis categorías en dos columnas se leen en el orden del dueño, no salteadas (QA 16-nov)", () => {
    // «A la columna más baja» dejaba M, XL a la izquierda y C, L a la derecha.
    const bloques = [
      { nombre: "M", n: 4 },
      { nombre: "C", n: 3 },
      { nombre: "L", n: 4 },
      { nombre: "XL", n: 4 },
      { nombre: "Toppings", n: 10 },
      { nombre: "Arroz con leche", n: 5 },
    ];
    expect(nombres(repartirEnColumnas(bloques, 2, alto))).toEqual([
      ["M", "C", "L", "XL"],
      ["Toppings", "Arroz con leche"],
    ]);
  });

  it("con empate, la columna de la izquierda lleva más", () => {
    const parejos = ["A", "B", "C"].map((nombre) => ({ nombre, n: 1 }));
    expect(nombres(repartirEnColumnas(parejos, 2, alto))).toEqual([["A", "B"], ["C"]]);
  });

  it("ninguna columna queda vacía si hay categorías para todas", () => {
    const bloques = [
      { nombre: "A", n: 30 },
      { nombre: "B", n: 1 },
      { nombre: "C", n: 1 },
      { nombre: "D", n: 1 },
    ];
    const pilas = repartirEnColumnas(bloques, 4, alto);
    expect(pilas.every((p) => p.length === 1)).toBe(true);
    expect(nombres(repartirEnColumnas(bloques, 2, alto))).toEqual([["A"], ["B", "C", "D"]]);
  });

  it("con más columnas que categorías sobran columnas vacías (cada bloque conserva su ancho)", () => {
    expect(nombres(repartirEnColumnas([{ nombre: "A", n: 1 }], 3, alto))).toEqual([["A"], [], []]);
    expect(nombres(repartirEnColumnas([], 2, alto))).toEqual([[], []]);
  });

  it("una columna: todo en orden, uno debajo del otro", () => {
    const bloques = [
      { nombre: "A", n: 1 },
      { nombre: "B", n: 9 },
    ];
    expect(nombres(repartirEnColumnas(bloques, 1, alto))).toEqual([["A", "B"]]);
    expect(nombres(repartirEnColumnas(bloques, 0, alto))).toEqual([["A", "B"]]);
  });
});
