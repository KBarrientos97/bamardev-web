import { describe, expect, it } from "vitest";
import type { EstadoConteoSucursal } from "../types";
import {
  avisoDeConteo,
  conteoDeCategoria,
  conteoEnUso,
  cuadra,
  descontarDelConteo,
  entraOtra,
  fraseContar,
  gastoPorUnidad,
  libreDeConteo,
  lineasCambiadas,
  mismoConteo,
  nombreConteo,
  nombreEnFrase,
  normalizarConfigConteo,
  QUEDA_POCO,
  saldosDeConteo,
  topeDeLinea,
  unidadesPorCategoria,
  type LineaParaConteo,
} from "./conteo";

describe("nombreConteo y fraseContar", () => {
  it("sin nombre se lee «Unidades»", () => {
    expect(nombreConteo(null)).toBe("Unidades");
    expect(nombreConteo("   ")).toBe("Unidades");
  });

  it("el nombre se recorta y se respeta", () => {
    expect(nombreConteo("  Vasos ")).toBe("Vasos");
  });

  it("la frase con verbo baja la primera letra", () => {
    expect(fraseContar("Vasos")).toBe("Contar vasos");
    expect(fraseContar(undefined)).toBe("Contar unidades");
    expect(fraseContar("Cajas de pizza")).toBe("Contar cajas de pizza");
  });
});

describe("normalizarConfigConteo", () => {
  it.each([undefined, null, "x", 3])("sin un objeto (%s): apagado", (crudo) => {
    expect(normalizarConfigConteo(crudo)).toEqual({ activo: false, nombre: "Unidades", categorias: [] });
  });

  it("lo que viene bien se respeta y la basura de las categorías se descarta", () => {
    const c = normalizarConfigConteo({
      activo: true,
      nombre: "Vasos",
      categorias: [{ id: 1, nombre: "C" }, { id: "2", nombre: "M" }, null, { id: 3 }],
    });
    expect(c).toEqual({ activo: true, nombre: "Vasos", categorias: [{ id: 1, nombre: "C" }] });
  });

  it("devuelve copias: tocar el resultado no cambia lo de fábrica", () => {
    normalizarConfigConteo(null).categorias.push({ id: 9, nombre: "X" });
    expect(normalizarConfigConteo(null).categorias).toEqual([]);
  });
});

describe("conteoEnUso y mismoConteo", () => {
  it("prendido sin categorías no cuenta nada", () => {
    expect(conteoEnUso({ activo: true, nombre: "Vasos", categorias: [] })).toBe(false);
    expect(conteoEnUso({ activo: false, nombre: "Vasos", categorias: [{ id: 1, nombre: "C" }] })).toBe(false);
    expect(conteoEnUso({ activo: true, nombre: "Vasos", categorias: [{ id: 1, nombre: "C" }] })).toBe(true);
  });

  it("compara por contenido y por orden", () => {
    const a = { activo: true, nombre: "V", categorias: [{ id: 1, nombre: "C" }, { id: 2, nombre: "M" }] };
    expect(mismoConteo(a, { ...a, categorias: [...a.categorias] })).toBe(true);
    expect(mismoConteo(a, { ...a, categorias: [a.categorias[1], a.categorias[0]] })).toBe(false);
  });
});

describe("lineasCambiadas: lo que viaja en la apertura", () => {
  it("una fila que el cajero no tocó no viaja", () => {
    // A propósito: mandar todo pisaría el saldo con una foto vieja de la pantalla.
    expect(lineasCambiadas([{ categoriaId: 1, quedaban: 20, cantidad: 20 }])).toEqual([]);
  });

  it("una fila con otro número viaja (le quedaban 20 y repuso hasta 100)", () => {
    expect(lineasCambiadas([{ categoriaId: 1, quedaban: 20, cantidad: 100 }])).toEqual([
      { categoriaId: 1, cantidad: 100 },
    ]);
  });

  it("una que nunca se contó y ahora tiene número viaja, aunque sea 0", () => {
    expect(lineasCambiadas([{ categoriaId: 2, quedaban: null, cantidad: 0 }])).toEqual([
      { categoriaId: 2, cantidad: 0 },
    ]);
  });

  it("una que nunca se contó y sigue vacía no viaja", () => {
    expect(lineasCambiadas([{ categoriaId: 2, quedaban: null, cantidad: null }])).toEqual([]);
  });

  it("si lo que quedaba era negativo y el cajero lo deja, no viaja; si escribe un número, sí", () => {
    expect(lineasCambiadas([{ categoriaId: 1, quedaban: -3, cantidad: null }])).toEqual([]);
    expect(lineasCambiadas([{ categoriaId: 1, quedaban: -3, cantidad: 0 }])).toEqual([{ categoriaId: 1, cantidad: 0 }]);
  });

  it("un número negativo o roto no viaja", () => {
    expect(
      lineasCambiadas([
        { categoriaId: 1, quedaban: 5, cantidad: -1 },
        { categoriaId: 2, quedaban: 5, cantidad: NaN },
      ]),
    ).toEqual([]);
  });
});

describe("cuadra", () => {
  it("al abrir + repuesto − vendido = quedan: cuadra", () => {
    expect(cuadra({ alAbrir: 100, repuesto: 20, vendido: 30, quedan: 90 })).toBe(true);
  });

  it("si el local vendió en otra caja, no cuadra", () => {
    expect(cuadra({ alAbrir: 100, repuesto: 0, vendido: 30, quedan: 60 })).toBe(false);
  });

  it("sin con qué comparar (sin contar) no se avisa nada", () => {
    expect(cuadra({ alAbrir: null, repuesto: 0, vendido: 3, quedan: null })).toBe(true);
    expect(cuadra({ alAbrir: 10, repuesto: 0, vendido: 3, quedan: null })).toBe(true);
  });

  it("los decimales de más no cuentan", () => {
    expect(cuadra({ alAbrir: 10, repuesto: 0, vendido: 0.1 + 0.2, quedan: 9.7 })).toBe(true);
  });
});

// ── El tope en el punto de venta (18-nov) ────────────────────────────────────

const C = { id: 1, nombre: "C" };
const L = { id: 3, nombre: "L" };
/** La categoría de los toppings: el conteo de vasos no la incluye. */
const TOPPINGS = { id: 9, nombre: "Toppings" };

type Hija = { productoId: number; cantidad: number; incluido: boolean };

/** Una línea del carrito como la mira el conteo: el producto, su categoría, cuántas y los toppings de cada vaso. */
function linea(id: number, categoria: { id: number } | null, cantidad: number, hijas: Hija[] = []): LineaParaConteo {
  return { producto: { id, categoria }, cantidad, ...(hijas.length ? { vista: { hijas } } : {}) };
}

function estado(
  items: { categoriaId: number; quedan: number | null; vendido?: number }[],
  activo = true,
): EstadoConteoSucursal {
  return {
    activo,
    nombre: "Vasos",
    sucursalId: 1,
    items: items.map((i) => ({
      categoriaId: i.categoriaId,
      nombre: `Cat ${i.categoriaId}`,
      contado: i.quedan,
      contadoEn: 0,
      repuesto: 0,
      vendido: i.vendido ?? 0,
      quedan: i.quedan,
    })),
  };
}

/** C y L contados; M (2) contado pero nunca en este local; los toppings no se cuentan. */
const SALDOS = new Map<number, number | null>([
  [C.id, 100],
  [2, null],
  [L.id, 5],
]);

describe("nombreEnFrase", () => {
  it("baja sólo la primera letra: lo demás queda como lo escribió el admin", () => {
    expect(nombreEnFrase("Vasos")).toBe("vasos");
    expect(nombreEnFrase("Vasos PET")).toBe("vasos PET");
    expect(nombreEnFrase("  ")).toBe("unidades");
  });
});

describe("saldosDeConteo: lo que la caja mira del conteo de su local", () => {
  it("apagado o sin respuesta: vacío, el punto de venta de siempre", () => {
    expect(saldosDeConteo(null).size).toBe(0);
    expect(saldosDeConteo(undefined).size).toBe(0);
    expect(saldosDeConteo(estado([{ categoriaId: 1, quedan: 40 }], false)).size).toBe(0);
  });

  it("prendido: cuántos quedan de cada categoría, la sin contar en null y el negativo tal cual", () => {
    const s = saldosDeConteo(
      estado([
        { categoriaId: 1, quedan: 40 },
        { categoriaId: 2, quedan: null },
        { categoriaId: 3, quedan: -2 },
      ]),
    );
    expect([...s]).toEqual([
      [1, 40],
      [2, null],
      [3, -2],
    ]);
  });
});

describe("unidadesPorCategoria: el tope es del vaso, no del producto", () => {
  it("«Dulce de leche C» y «Nutella C» gastan el mismo vaso C; lo que no se cuenta no suma", () => {
    const u = unidadesPorCategoria(
      [linea(10, C, 3), linea(11, C, 2), linea(20, L, 1), linea(30, TOPPINGS, 4), linea(40, null, 7)],
      SALDOS,
    );
    expect([...u]).toEqual([
      [C.id, 5],
      [L.id, 1],
    ]);
  });

  it("el topping incluido en el vaso no gasta nada, aunque su categoría se cuente", () => {
    const categoriaDe = () => C.id;
    const u = unidadesPorCategoria(
      [linea(20, L, 2, [{ productoId: 50, cantidad: 1, incluido: true }])],
      SALDOS,
      categoriaDe,
    );
    expect([...u]).toEqual([[L.id, 2]]);
  });

  it("un topping EXTRA de una categoría contada gasta lo suyo por cada vaso, si el catálogo sabe su categoría", () => {
    const hijas = [
      { productoId: 50, cantidad: 2, incluido: false },
      { productoId: 51, cantidad: 1, incluido: false },
    ];
    // 50 es de C (contada); 51 es de los toppings, que no se cuentan.
    const categoriaDe = (id: number) => (id === 50 ? C.id : TOPPINGS.id);
    expect([...unidadesPorCategoria([linea(20, L, 3, hijas)], SALDOS, categoriaDe)]).toEqual([
      [L.id, 3],
      [C.id, 6],
    ]);
    // Sin saber de qué categoría son los toppings, cuentan sólo los vasos.
    expect([...unidadesPorCategoria([linea(20, L, 3, hijas)], SALDOS)]).toEqual([[L.id, 3]]);
  });

  it("sin conteo no hay nada que contar", () => {
    expect(unidadesPorCategoria([linea(10, C, 3)], new Map()).size).toBe(0);
  });
});

describe("libreDeConteo: cuánto más se puede cargar", () => {
  it("sin tope si la categoría no se cuenta, nunca se contó en el local o el producto no tiene", () => {
    expect(libreDeConteo(TOPPINGS.id, SALDOS, 0)).toBe(Infinity);
    expect(libreDeConteo(2, SALDOS, 3)).toBe(Infinity);
    expect(libreDeConteo(null, SALDOS, 0)).toBe(Infinity);
  });

  it("lo que queda menos lo del carrito, nunca menos de 0", () => {
    expect(libreDeConteo(C.id, SALDOS, 60)).toBe(40);
    expect(libreDeConteo(L.id, SALDOS, 5)).toBe(0);
    expect(libreDeConteo(L.id, SALDOS, 8)).toBe(0);
    expect(libreDeConteo(3, new Map([[3, -4]]), 0)).toBe(0);
  });
});

describe("entraOtra y topeDeLinea: el cálculo del carrito", () => {
  it("entra otra mientras quede lugar en cada categoría que gasta", () => {
    expect(entraOtra(new Map([[C.id, 1]]), SALDOS, new Map([[C.id, 99]]))).toBe(true);
    expect(entraOtra(new Map([[C.id, 1]]), SALDOS, new Map([[C.id, 100]]))).toBe(false);
    // Un vaso L con un extra C: entra el vaso, pero no el extra.
    const vasoConExtra = new Map([
      [L.id, 1],
      [C.id, 2],
    ]);
    expect(entraOtra(vasoConExtra, SALDOS, new Map([[C.id, 99]]))).toBe(false);
    // Lo sin contar nunca frena.
    expect(entraOtra(new Map([[2, 1]]), SALDOS, new Map([[2, 500]]))).toBe(true);
  });

  it("el tope de una línea es lo que queda menos lo que gastan las OTRAS líneas de ese tamaño", () => {
    // En el carrito: 60 de dulce de leche C y estos 10 de Nutella C.
    expect(topeDeLinea(linea(11, C, 10), SALDOS, new Map([[C.id, 70]]))).toBe(40);
  });

  it("puede dar menos de lo que la línea ya lleva (otra caja vendió): el carrito decide qué hacer", () => {
    expect(topeDeLinea(linea(20, L, 8), SALDOS, new Map([[L.id, 8]]))).toBe(5);
    expect(topeDeLinea(linea(21, L, 2), SALDOS, new Map([[L.id, 9]]))).toBe(-2);
  });

  it("con un extra contado en cada vaso, el tope cuenta los dos gastos", () => {
    const conExtra = linea(20, L, 1, [{ productoId: 50, cantidad: 2, incluido: false }]);
    const categoriaDe = () => C.id;
    expect([...gastoPorUnidad(conExtra, SALDOS, categoriaDe)]).toEqual([
      [L.id, 1],
      [C.id, 2],
    ]);
    // L: 5 libres. C: 100 − 95 de otras líneas = 5 → 2 vasos (cada uno gasta 2 C).
    const enCarrito = new Map([
      [L.id, 1],
      [C.id, 97],
    ]);
    expect(topeDeLinea(conExtra, SALDOS, enCarrito, categoriaDe)).toBe(2);
  });

  it("sin nada contado no hay tope", () => {
    expect(topeDeLinea(linea(30, TOPPINGS, 4), SALDOS, new Map())).toBe(Infinity);
    expect(topeDeLinea(linea(31, { id: 2 }, 4), SALDOS, new Map([[2, 4]]))).toBe(Infinity);
  });
});

describe("avisoDeConteo: los textos de §1, iguales en la web, la app y el backend", () => {
  it("no queda nada (0 o negativo)", () => {
    expect(avisoDeConteo("Vasos", "L", 0)).toBe("Vasos L: no quedan. Avisale al encargado para que reponga.");
    expect(avisoDeConteo("Vasos", "L", -3)).toBe("Vasos L: no quedan. Avisale al encargado para que reponga.");
  });

  it("queda uno, y quedan varios", () => {
    expect(avisoDeConteo("Vasos", "XL", 1)).toBe("Vasos XL: sólo queda 1.");
    expect(avisoDeConteo("Vasos", "C", 45)).toBe("Vasos C: sólo quedan 45.");
  });

  it("el nombre va tal cual lo escribió el admin, adelante; sin nombre, «Unidades»", () => {
    expect(avisoDeConteo("Vasos PET", "M", 3)).toBe("Vasos PET M: sólo quedan 3.");
    expect(avisoDeConteo("", "M", 2)).toBe("Unidades M: sólo quedan 2.");
  });
});

describe("conteoDeCategoria: lo que dice la pantalla de venta", () => {
  it("nada que decir sin categoría, si no se cuenta o si nunca se contó en el local", () => {
    expect(conteoDeCategoria(null, "Vasos", SALDOS, new Map())).toBeNull();
    expect(conteoDeCategoria(TOPPINGS, "Vasos", SALDOS, new Map())).toBeNull();
    expect(conteoDeCategoria({ id: 2, nombre: "M" }, "Vasos", SALDOS, new Map())).toBeNull();
  });

  it("lo libre baja con lo que lleva el carrito de ese tamaño", () => {
    expect(conteoDeCategoria(C, "Vasos", SALDOS, new Map([[C.id, 58]]))).toEqual({
      quedan: 100,
      libre: 42,
      agotado: false,
      lleno: false,
      poco: false,
      etiqueta: "Quedan 42 vasos C",
    });
  });

  it(`con ${QUEDA_POCO} libres o menos sale en tono de aviso`, () => {
    expect(conteoDeCategoria(C, "Vasos", SALDOS, new Map([[C.id, 90]]))?.poco).toBe(true);
    expect(conteoDeCategoria(C, "Vasos", SALDOS, new Map([[C.id, 89]]))?.poco).toBe(false);
  });

  it("sin nada en el local (0 o negativo) es un agotado, con el aviso de reponer", () => {
    expect(conteoDeCategoria(L, "Vasos", new Map([[L.id, -1]]), new Map())).toMatchObject({
      agotado: true,
      lleno: false,
      aviso: "Vasos L: no quedan. Avisale al encargado para que reponga.",
    });
  });

  it("si el carrito ya lleva todo lo que queda, está lleno: «0 u.» y el texto de cuántos quedan", () => {
    expect(conteoDeCategoria(L, "Vasos", SALDOS, new Map([[L.id, 5]]))).toMatchObject({
      libre: 0,
      agotado: false,
      lleno: true,
      poco: true,
      etiqueta: "Quedan 0 vasos L",
      aviso: "Vasos L: sólo quedan 5.",
    });
  });
});

describe("descontarDelConteo: la venta que quedó en la cola", () => {
  it("baja lo que queda y sube lo vendido en las categorías con saldo; lo demás queda igual", () => {
    const antes = estado([
      { categoriaId: 1, quedan: 40, vendido: 2 },
      { categoriaId: 2, quedan: null },
      { categoriaId: 3, quedan: 5 },
    ]);
    const despues = descontarDelConteo(
      antes,
      new Map([
        [1, 3],
        [2, 4],
      ]),
    );
    expect(despues.items.map((i) => [i.categoriaId, i.quedan, i.vendido])).toEqual([
      [1, 37, 5],
      [2, null, 0],
      [3, 5, 0],
    ]);
    // Sin tocar lo de antes: es lo que tiene la pantalla hasta que se dibuja lo nuevo.
    expect(antes.items[0].quedan).toBe(40);
  });

  it("sin nada que bajar devuelve el mismo estado", () => {
    const e = estado([{ categoriaId: 1, quedan: 40 }]);
    expect(descontarDelConteo(e, new Map())).toBe(e);
  });
});
