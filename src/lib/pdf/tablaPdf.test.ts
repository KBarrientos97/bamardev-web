import { describe, expect, it } from "vitest";
import { limpio, repartirEnHojas, type Renglon } from "./tablaPdf";

const grupo = (t: string): Renglon => ({ tipo: "grupo", alto: 20, grupo: { titulo: t, celdas: [], filas: [] } });
const fila = (n: string): Renglon => ({ tipo: "fila", alto: 20, fila: { nombre: n, celdas: [] }, lineas: [n] });
const total: Renglon = { tipo: "total", alto: 20, total: { etiqueta: "TOTAL", celdas: [] } };
const nombres = (h: Renglon[]) =>
  h.map((r) => (r.tipo === "grupo" ? `#${r.grupo.titulo}` : r.tipo === "fila" ? r.fila.nombre : "TOTAL"));

describe("dónde se corta la hoja del PDF", () => {
  it("todo entra: una sola hoja", () => {
    const hojas = repartirEnHojas([grupo("POLLOS"), fila("a"), fila("b"), total], () => 1000);
    expect(hojas.map(nombres)).toEqual([["#POLLOS", "a", "b", "TOTAL"]]);
  });

  it("una categoría no queda sola al pie: baja con su primer producto", () => {
    // Entran 4 renglones por hoja: POLLOS, a, b y el título de BEBIDAS
    // quedaría solo abajo.
    const hojas = repartirEnHojas(
      [grupo("POLLOS"), fila("a"), fila("b"), grupo("BEBIDAS"), fila("c"), total],
      () => 80,
    );
    expect(hojas.map(nombres)).toEqual([
      ["#POLLOS", "a", "b"],
      ["#BEBIDAS", "c", "TOTAL"],
    ]);
  });

  it("el TOTAL no arranca una hoja solo: se lleva el último producto", () => {
    const hojas = repartirEnHojas([grupo("POLLOS"), fila("a"), fila("b"), fila("c"), total], () => 80);
    expect(hojas.map(nombres)).toEqual([
      ["#POLLOS", "a", "b"],
      ["c", "TOTAL"],
    ]);
  });

  it("los espacios finos de la hora no llegan al PDF", () => {
    expect(limpio("09:59 p. m.")).toBe("09:59 p. m.");
  });
});
