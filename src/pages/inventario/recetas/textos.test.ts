import { describe, expect, it } from "vitest";
import {
  cantidadDe,
  conArticulo,
  esDePresas,
  nombreDeUnidad,
  plural,
  resumenReceta,
  textoAlcanza,
  textoCausa,
  textoDiferencia,
  textoGanancia,
  textoPresas,
  textoQueQueda,
  tituloAviso,
  unir,
} from "./textos";

/** Las frases de la receta del plato y del tablero: lo que lee el dueño. */

describe("palabras", () => {
  it("une con comas y «y» (o «ni»)", () => {
    expect(unir([])).toBe("");
    expect(unir(["arroz"])).toBe("arroz");
    expect(unir(["arroz", "papa"])).toBe("arroz y papa");
    expect(unir(["arroz", "papa", "fideo"], "ni")).toBe("arroz, papa ni fideo");
  });

  it("los plurales de cocina", () => {
    expect(plural("porción")).toBe("porciones");
    expect(plural("presa")).toBe("presas");
    expect(plural("unidad")).toBe("unidades");
    expect(plural("vaso")).toBe("vasos");
    expect(plural("Quintal")).toBe("Quintales");
    expect(plural("Bidón")).toBe("Bidones");
    expect(cantidadDe(1, "porción")).toBe("1 porción");
    expect(cantidadDe(2, "porción")).toBe("2 porciones");
    expect(cantidadDe(0.5, "presa")).toBe("0,5 presas");
  });

  it("la unidad base en una frase, y el bulto con su artículo", () => {
    expect(nombreDeUnidad("Kilogramo")).toBe("kilo");
    expect(nombreDeUnidad("Litro")).toBe("litro");
    expect(nombreDeUnidad("Unidad")).toBe("unidad");
    expect(nombreDeUnidad(null)).toBe("unidad");
    expect(conArticulo("Quintal")).toBe("el quintal");
    expect(conArticulo("Bolsa")).toBe("la bolsa");
    expect(conArticulo("Bidón")).toBe("el bidón");
    expect(conArticulo("unidad")).toBe("la unidad");
  });
});

describe("el aviso de «Costos de platos»", () => {
  const ARROZ = {
    insumoId: 5,
    nombre: "Arroz",
    compraUnidad: "Quintal",
    compraContenido: 46,
    unidad: "Kilogramo",
    costoAntes: 6,
    costoAhora: 6.3,
  };

  it("la causa se dice por bulto si se compra así", () => {
    expect(textoCausa(ARROZ)).toBe("Arroz: el quintal pasó de Bs 276,00 a Bs 289,80.");
  });

  it("sin bulto, por la unidad base", () => {
    expect(textoCausa({ ...ARROZ, compraUnidad: null, compraContenido: null })).toBe(
      "Arroz: el kilo pasó de Bs 6,00 a Bs 6,30.",
    );
  });

  it("si el costo del insumo es el mismo, lo que cambió fue el rinde", () => {
    expect(textoCausa({ ...ARROZ, costoAhora: 6 })).toBe("Arroz: cambió lo que rinde.");
  });

  it("subió, bajó o cambió, según los platos", () => {
    expect(tituloAviso([{ antes: 13.9, ahora: 14.81 }])).toBe("Subió el costo de 1 plato");
    expect(tituloAviso([{ antes: 14, ahora: 13 }, { antes: 10, ahora: 9 }])).toBe("Bajó el costo de 2 platos");
    expect(tituloAviso([{ antes: 14, ahora: 15 }, { antes: 10, ahora: 9 }])).toBe("Cambió el costo de 2 platos");
    expect(textoDiferencia(13.9, 14.81)).toBe("+ Bs 0,91");
    expect(textoDiferencia(14.81, 13.9)).toBe("− Bs 0,91");
    expect(textoGanancia(13.19)).toBe("Ganás Bs 13,19");
    expect(textoGanancia(-2)).toBe("Perdés Bs 2,00");
  });
});

describe("la receta", () => {
  it("para cuántos platos alcanza", () => {
    expect(textoAlcanza(120)).toBe("Alcanza para 120 platos");
    expect(textoAlcanza(1)).toBe("Alcanza para 1 plato");
    expect(textoAlcanza(0)).toBe("Ya no alcanza para ningún plato");
    expect(textoAlcanza(-3)).toBe("Ya no alcanza para ningún plato");
    expect(textoAlcanza(null)).toBeNull();
  });

  it("qué insumos van en «Presas»", () => {
    expect(esDePresas({ porcionNombre: "presa", partes: null })).toBe(true);
    expect(esDePresas({ porcionNombre: "porción", partes: "POLLO_8" })).toBe(true);
    expect(esDePresas({ porcionNombre: "porción", partes: null })).toBe(false);
  });

  it("qué pasa al vender según las presas (y el ajuste de elegirla)", () => {
    expect(textoPresas(4, "POLLO_8", false)).toMatch(/^Una de cada una/);
    expect(textoPresas(8, "POLLO_8", true)).toMatch(/^Las ocho/);
    expect(textoPresas(1, "POLLO_8", true)).toMatch(/^Al vender, el cajero toca cuál salió/);
    expect(textoPresas(2, "POLLO_8", true)).toMatch(/^Al vender: «Ala» es pecho y ala; «Pierna» es pierna y contra/);
    // Sin el ajuste no se pregunta; y sin pollo entero no se reparte nada.
    expect(textoPresas(1, "POLLO_8", false)).toBe("No se pregunta al vender: sale de la presa que haya.");
    expect(textoPresas(4, null, true)).toBe("No se pregunta al vender: sale de la presa que haya.");
    expect(textoPresas(3, "POLLO_8", true)).toBe("No se pregunta al vender: sale de la presa que haya.");
  });

  it("el resumen de una línea, por grupo", () => {
    expect(
      resumenReceta([
        { nombre: "Aceite", grupo: "FIJO", porciones: 1 },
        { nombre: "Bandeja", grupo: "FIJO", porciones: 1 },
        { nombre: "Arroz", grupo: "GUARNICION", porciones: 1 },
        { nombre: "Papa", grupo: "GUARNICION", porciones: 1 },
        { nombre: "Pollo para broaster", grupo: "PRESA", porciones: 2 },
      ]),
    ).toBe("Lleva siempre Aceite y Bandeja · Guarnición: Arroz y Papa · 2 presas de Pollo para broaster");
    expect(resumenReceta([])).toBe("Todavía no lleva ningún insumo.");
  });
});

describe("lo que queda de un insumo", () => {
  const BASE = { id: 1, nombre: "Arroz", seCuenta: false, stock: 46, unidad: "Kilogramo", porciones: 552, porcionNombre: "porción" };

  it("lo que se estima: «deberían quedar», con «unas» porciones", () => {
    expect(textoQueQueda(BASE)).toBe("Deberían quedar 46 kilos, unas 552 porciones.");
  });

  it("lo que se cuenta: «quedan»", () => {
    expect(
      textoQueQueda({ ...BASE, nombre: "Pollo", seCuenta: true, stock: 30, unidad: "Unidad", porciones: 240, porcionNombre: "presa" }),
    ).toBe("Quedan 30 unidades, 240 presas.");
  });

  it("no repite cuando la porción es la misma unidad", () => {
    expect(
      textoQueQueda({ ...BASE, seCuenta: true, stock: 12, unidad: "Unidad", porciones: 12, porcionNombre: "unidad" }),
    ).toBe("Quedan 12 unidades.");
  });

  it("en cero o negativo lo dice (la venta no se frena por un insumo)", () => {
    expect(textoQueQueda({ ...BASE, stock: 0, porciones: 0 })).toBe("No debería quedar nada.");
    expect(textoQueQueda({ ...BASE, seCuenta: true, stock: -3, unidad: "Unidad", porciones: -24 })).toBe(
      "Faltan 3 unidades: se vendió más de lo que entró.",
    );
  });
});
