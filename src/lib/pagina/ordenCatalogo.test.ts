import { describe, expect, it } from "vitest";
import {
  categoriasDe,
  compararNombres,
  estaAgrupada,
  mismoOrden,
  moverUno,
  ordenAlfabetico,
  ordenPorCategoria,
  puedeDeshacer,
  rangoInicialCategorias,
  SIN_CATEGORIA,
  type ParaOrdenar,
} from "./ordenCatalogo";

/** Las herramientas de «Ordenar» de «Mis productos» (16-nov). */

const p = (id: number, nombre: string, categoria: string | null, elaborado?: boolean): ParaOrdenar => ({
  id,
  nombre,
  categoria,
  ...(elaborado === undefined ? {} : { elaborado }),
});

describe("orden alfabético", () => {
  it("sin mirar mayúsculas ni tildes, y los números por su valor", () => {
    expect(compararNombres("ají", "Aji")).toBe(0);
    expect(compararNombres("Soda 2 L", "Soda 10 L")).toBeLessThan(0);
    const lista = [p(1, "Soda 10 L", null), p(2, "Ñoquis", null), p(3, "ensalada", null), p(4, "Soda 2 L", null), p(5, "Ají de fideo", null)];
    expect(ordenAlfabetico(lista)).toEqual([5, 3, 2, 4, 1]);
  });

  it("es estable: dos nombres iguales quedan como estaban", () => {
    expect(ordenAlfabetico([p(9, "Café", "A"), p(3, "cafe", "B"), p(5, "Agua", null)])).toEqual([5, 9, 3]);
  });
});

describe("agrupar por categoría", () => {
  const lista = [
    p(1, "Coca-Cola", "Bebidas", false),
    p(2, "Pollo entero", "Pollos", true),
    p(3, "Fanta", "Bebidas", false),
    p(4, "Servilletas", null, false),
    p(5, "Medio pollo", "Pollos", true),
    p(6, "Agua", "Bebidas", false),
  ];

  it("es estable dentro de cada categoría, salvo que se pida A–Z", () => {
    expect(ordenPorCategoria(lista, ["Pollos", "Bebidas", null])).toEqual([2, 5, 1, 3, 6, 4]);
    expect(ordenPorCategoria(lista, ["Pollos", "Bebidas", null], "alfabetico")).toEqual([5, 2, 6, 1, 3, 4]);
  });

  it("una categoría que no viene en el orden va al final, como aparece; sin repetir", () => {
    expect(ordenPorCategoria(lista, ["Bebidas", "Bebidas", "Inexistente"])).toEqual([1, 3, 6, 2, 5, 4]);
  });

  it("la categoría se compara sin espacios de más; vacía es «Sin categoría»", () => {
    const sucia = [p(1, "A", " Bebidas "), p(2, "B", "Bebidas"), p(3, "C", ""), p(4, "D", null)];
    expect(categoriasDe(sucia).map((c) => [c.clave, c.nombre, c.cantidad])).toEqual([
      ["Bebidas", "Bebidas", 2],
      [null, SIN_CATEGORIA, 2],
    ]);
  });

  it("detecta si la lista ya está agrupada", () => {
    expect(estaAgrupada(lista)).toBe(false);
    expect(estaAgrupada([p(1, "a", "X"), p(2, "b", "X"), p(3, "c", null), p(4, "d", null), p(5, "e", "Y")])).toBe(true);
    expect(estaAgrupada([p(1, "a", null), p(2, "b", "X"), p(3, "c", null)])).toBe(false);
    expect(estaAgrupada([])).toBe(true);
  });
});

describe("el orden con que abren las categorías", () => {
  it("ya agrupada: el que tiene, aunque «Sin categoría» no esté al final", () => {
    const lista = [p(1, "Agua", "Bebidas"), p(2, "Bolsa", null), p(3, "Pollo", "Pollos", true)];
    expect(rangoInicialCategorias(lista)).toEqual(["Bebidas", null, "Pollos"]);
  });

  it("si no: elaboradas primero, después las demás, por nombre, y «Sin categoría» al final", () => {
    const lista = [
      p(1, "Agua", "Bebidas", false),
      p(2, "Pollo", "Pollos", true),
      p(3, "Bolsa", null, true),
      p(4, "Fanta", "Bebidas", false),
      p(5, "Sopa", "Entradas", true),
      p(6, "Chicle", "Almacén", false),
      p(7, "Pollo frito", "Pollos", true),
    ];
    expect(rangoInicialCategorias(lista)).toEqual(["Entradas", "Pollos", "Almacén", "Bebidas", null]);
  });

  it("elaborada es la mitad o más de sus fijados; sin el dato (backend anterior), por nombre", () => {
    const mitad = [p(1, "Combo", "Combos", true), p(2, "Soda", "Combos", false), p(3, "x", "Almacén", false), p(4, "y", "Combos")];
    // Combos: 1 de 3 elaborados → no; quedan por nombre.
    expect(rangoInicialCategorias([...mitad, p(5, "z", "Almacén")])).toEqual(["Almacén", "Combos"]);
    const justa = [p(1, "Combo", "Combos", true), p(2, "Soda", "Bebidas", false), p(3, "Lata", "Combos", false)];
    expect(categoriasDe(justa).find((c) => c.clave === "Combos")?.elaborada).toBe(true);
    expect(rangoInicialCategorias([p(1, "a", "Zeta"), p(2, "b", "Alfa"), p(3, "c", "Zeta")])).toEqual(["Alfa", "Zeta"]);
  });
});

describe("deshacer y flechas", () => {
  it("«Deshacer» vale mientras la lista siga como la dejó el ordenado", () => {
    const d = { antes: [3, 1, 2], despues: [1, 2, 3] };
    expect(puedeDeshacer(d, [1, 2, 3])).toBe(true);
    // Deshacer es volver a la lista de antes, tal cual.
    expect(d.antes).toEqual([3, 1, 2]);
    // Después de otro cambio (una flecha, quitar, sumar) ya no.
    expect(puedeDeshacer(d, [2, 1, 3])).toBe(false);
    expect(puedeDeshacer(d, [1, 2])).toBe(false);
    expect(puedeDeshacer(null, [1, 2, 3])).toBe(false);
    // Un ordenado que no cambió nada no tiene qué deshacer.
    expect(puedeDeshacer({ antes: [1, 2], despues: [1, 2] }, [1, 2])).toBe(false);
  });

  it("mover una categoría un lugar; en el borde, igual", () => {
    expect(moverUno(["a", "b", "c"], 2, -1)).toEqual(["a", "c", "b"]);
    expect(moverUno(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
    const tal = ["a", "b"];
    expect(moverUno(tal, 0, -1)).toBe(tal);
    expect(moverUno(tal, 1, 1)).toBe(tal);
    expect(mismoOrden([1, 2], [1, 2])).toBe(true);
    expect(mismoOrden([1, 2], [2, 1])).toBe(false);
  });
});
