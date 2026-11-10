import { describe, expect, it } from "vitest";
import { fichasPorFila, SEGUNDOS_POR_TANDA, tandaVisible } from "./fichasTv";

const TANDA_MS = SEGUNDOS_POR_TANDA * 1000;
const numeros = (desde: number, cuantos: number) => Array.from({ length: cuantos }, (_, i) => desde + i);

describe("cuántas fichas entran en la fila de la TV", () => {
  it("las que caben enteras con su separación, sin la última apretada", () => {
    expect(fichasPorFila(872, 158, 16)).toBe(5);
    expect(fichasPorFila(1424, 158, 16)).toBe(8);
    expect(fichasPorFila(173, 158, 16)).toBe(1);
  });

  it("aunque la fila sea más angosta que una ficha, entra una", () => {
    expect(fichasPorFila(100, 158, 16)).toBe(1);
  });
});

describe("las tandas de fichas", () => {
  it("si todo entra hay una sola tanda y no cambia con la hora", () => {
    const lista = numeros(1, 5);
    for (const ahora of [0, TANDA_MS, 7 * TANDA_MS + 123]) {
      expect(tandaVisible(lista, 5, ahora)).toEqual({ visibles: lista, actual: 0, total: 1 });
    }
  });

  it("sin listos no hay nada que mostrar, y tampoco puntitos", () => {
    expect(tandaVisible([], 5, 12_345)).toEqual({ visibles: [], actual: 0, total: 1 });
  });

  it("lo que no entra va pasando de a tandas y cada número sale alguna vez", () => {
    // QA 10-nov: con 30 listos la TV mostraba seis fijas en dos filas y el
    // resto nunca salía; ahora pasa todo, de a cinco.
    const lista = numeros(1, 29);
    const vistos = new Set<number>();
    for (let k = 0; k < 6; k++) {
      const t = tandaVisible(lista, 5, k * TANDA_MS);
      expect(t.total).toBe(6);
      expect(t.actual).toBe(k);
      expect(t.visibles.length).toBeLessThanOrEqual(5);
      for (const n of t.visibles) vistos.add(n);
    }
    expect([...vistos].sort((a, b) => a - b)).toEqual(lista);
  });

  it("la última tanda trae lo que sobra, sin repetir los primeros", () => {
    expect(tandaVisible(numeros(1, 12), 5, 2 * TANDA_MS).visibles).toEqual([11, 12]);
  });

  it("después de la última vuelve a la primera", () => {
    expect(tandaVisible(numeros(1, 12), 5, 3 * TANDA_MS).actual).toBe(0);
  });

  it("cada tanda se queda sus segundos enteros en pantalla", () => {
    const lista = numeros(1, 12);
    expect(tandaVisible(lista, 5, TANDA_MS - 1).actual).toBe(0);
    expect(tandaVisible(lista, 5, TANDA_MS).actual).toBe(1);
  });
});
