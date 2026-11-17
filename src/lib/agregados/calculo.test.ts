import { describe, expect, it } from "vitest";
import { agruparHijas, tieneHijas } from "./hijas";
import {
  agregadosParaEnviar,
  firmaDeAgregados,
  gruposDelProducto,
  repartirAgregados,
  textoDeAgregados,
  textoIncluye,
  vistaDeAgregados,
} from "./calculo";
import { elegidosDeToques, toquesDeElegidos } from "./toques";
import type { AgregadoElegido, CatalogoAgregados } from "./tipos";

/** El Ganadero: vasos de Bs 20/35/50 con 2 toppings incluidos, y toppings a Bs 5. */
const CATALOGO: CatalogoAgregados = {
  activo: true,
  grupos: [
    {
      id: 7,
      nombre: "Toppings",
      incluidos: 2,
      precioExtra: null,
      maximo: null,
      opciones: [
        { productoId: 31, nombre: "Chubi", precio: 5, icono: null },
        { productoId: 32, nombre: "Oreo", precio: 5, icono: null },
        { productoId: 33, nombre: "Canela", precio: 5, icono: null },
        { productoId: 34, nombre: "Premium", precio: 8, icono: null },
      ],
    },
  ],
  productos: [
    { productoId: 11, grupos: [{ grupoId: 7, incluidos: 1 }] },
    { productoId: 12, grupos: [{ grupoId: 7, incluidos: 2 }] },
  ],
};

const e = (productoId: number, cantidad = 1, grupoId = 7): AgregadoElegido => ({ grupoId, productoId, cantidad });

describe("la regla de los incluidos (la misma del backend)", () => {
  it("2 incluidos + 1 extra: los dos primeros van gratis y el tercero se cobra a su precio", () => {
    const v = vistaDeAgregados([e(32), e(31), e(33)], 12, CATALOGO);
    expect(v.hijas.map((h) => [h.nombre, h.incluido, h.subtotal])).toEqual([
      ["Oreo", true, 0],
      ["Chubi", true, 0],
      ["Canela", false, 5],
    ]);
    expect(v.extraPorUnidad).toBe(5);
  });

  it("el orden de elección manda: el topping caro va gratis si se tocó primero", () => {
    // Premium (Bs 8) tocado primero es incluido; el último, Canela, es el extra.
    const primero = vistaDeAgregados([e(34), e(31), e(33)], 12, CATALOGO);
    expect(primero.extraPorUnidad).toBe(5);
    // Tocado último, Premium paga su precio.
    const ultimo = vistaDeAgregados([e(31), e(33), e(34)], 12, CATALOGO);
    expect(ultimo.extraPorUnidad).toBe(8);
  });

  it("una repetición cuenta: doble Oreo usa los dos incluidos", () => {
    const v = vistaDeAgregados([e(32, 2), e(31)], 12, CATALOGO);
    expect(v.hijas.map((h) => [h.nombre, h.cantidad, h.incluido])).toEqual([
      ["Oreo", 2, true],
      ["Chubi", 1, false],
    ]);
    expect(v.extraPorUnidad).toBe(5);
  });

  it("un topping se parte en incluido y extra cuando cruza el límite", () => {
    // 2 incluidos y triple Oreo: dos gratis y uno de extra, del mismo topping.
    const v = vistaDeAgregados([e(32, 3)], 12, CATALOGO);
    expect(v.hijas.map((h) => [h.nombre, h.cantidad, h.incluido, h.subtotal])).toEqual([
      ["Oreo", 2, true, 0],
      ["Oreo", 1, false, 5],
    ]);
  });

  it("sin ningún topping se vende igual, sin descuento", () => {
    expect(vistaDeAgregados([], 12, CATALOGO)).toEqual({ hijas: [], extraPorUnidad: 0 });
    expect(vistaDeAgregados(undefined, 12, CATALOGO)).toEqual({ hijas: [], extraPorUnidad: 0 });
  });

  it("menos toppings que los incluidos no cobra nada", () => {
    expect(vistaDeAgregados([e(32)], 12, CATALOGO).extraPorUnidad).toBe(0);
  });

  it("los incluidos son los del producto (el vaso chico trae 1)", () => {
    const v = vistaDeAgregados([e(31), e(32), e(33)], 11, CATALOGO);
    expect(v.extraPorUnidad).toBe(10);
  });

  it("el precio fijo del grupo pisa el de cada topping", () => {
    const fijo: CatalogoAgregados = { ...CATALOGO, grupos: [{ ...CATALOGO.grupos[0], precioExtra: 3 }] };
    expect(vistaDeAgregados([e(31), e(32), e(34)], 12, fijo).extraPorUnidad).toBe(3);
  });

  it("repartirAgregados no agrupa un topping tocado en dos momentos si el tramo es el mismo", () => {
    const filas = repartirAgregados({
      incluidos: 0,
      precioExtra: null,
      elecciones: [
        { productoId: 31, cantidad: 1 },
        { productoId: 32, cantidad: 1 },
        { productoId: 31, cantidad: 1 },
      ],
      precioDe: () => 5,
    });
    expect(filas.map((f) => [f.productoId, f.cantidad])).toEqual([
      [31, 2],
      [32, 1],
    ]);
  });

  it("un grupo que el catálogo ya no tiene no suma nada (el backend lo rechazará)", () => {
    expect(vistaDeAgregados([e(31, 1, 99)], 12, CATALOGO).extraPorUnidad).toBe(0);
  });
});

describe("lo que viaja a vender", () => {
  it("manda el orden de elección y el precio unitario de los extras", () => {
    const elegidos = [e(32), e(31), e(33)];
    const vista = vistaDeAgregados(elegidos, 12, CATALOGO);
    expect(agregadosParaEnviar(elegidos, vista)).toEqual([
      { productoId: 32, cantidad: 1, grupoId: 7 },
      { productoId: 31, cantidad: 1, grupoId: 7 },
      { productoId: 33, cantidad: 1, grupoId: 7, precio: 5 },
    ]);
  });

  it("sin toppings no manda el campo", () => {
    expect(agregadosParaEnviar(undefined, { hijas: [], extraPorUnidad: 0 })).toBeUndefined();
    expect(agregadosParaEnviar([], { hijas: [], extraPorUnidad: 0 })).toBeUndefined();
  });

  it("dos vasos con toppings distintos tienen firma distinta", () => {
    expect(firmaDeAgregados([e(31)])).not.toBe(firmaDeAgregados([e(32)]));
    expect(firmaDeAgregados([e(31), e(32)])).not.toBe(firmaDeAgregados([e(32), e(31)]));
    expect(firmaDeAgregados(undefined)).toBe("");
  });
});

describe("lo que dice la tarjeta", () => {
  it("«Incluye N toppings» con el nombre del grupo en minúscula", () => {
    expect(textoIncluye("Toppings", 2)).toBe("Incluye 2 toppings");
    expect(textoIncluye("Extras", 3)).toBe("Incluye 3 extras");
  });

  it("con 1 incluido lo dice en singular", () => {
    expect(textoIncluye("Toppings", 1)).toBe("Incluye 1 topping");
  });

  it("sin incluidos no promete nada gratis", () => {
    expect(textoIncluye("Toppings", 0)).toBe("Con toppings");
  });

  it("sólo los productos con grupo lo llevan, y sólo con el ajuste prendido", () => {
    expect(gruposDelProducto(CATALOGO, 12)[0].incluidos).toBe(2);
    expect(gruposDelProducto(CATALOGO, 11)[0].incluidos).toBe(1);
    expect(gruposDelProducto(CATALOGO, 999)).toEqual([]);
    expect(gruposDelProducto({ ...CATALOGO, activo: false }, 12)).toEqual([]);
    expect(gruposDelProducto(null, 12)).toEqual([]);
  });

  it("el texto de los diálogos lista los toppings con el precio de los extras", () => {
    const vista = vistaDeAgregados([e(32), e(31), e(33)], 12, CATALOGO);
    expect(textoDeAgregados(vista)).toMatch(/^\+ Oreo, Chubi, Canela \(Bs\s?5/);
    expect(textoDeAgregados({ hijas: [], extraPorUnidad: 0 })).toBeUndefined();
  });
});

describe("los toques de la hoja", () => {
  it("los repetidos seguidos se juntan en una cantidad y el orden se conserva", () => {
    const toques = [
      { grupoId: 7, productoId: 32 },
      { grupoId: 7, productoId: 32 },
      { grupoId: 7, productoId: 31 },
      { grupoId: 7, productoId: 32 },
    ];
    expect(elegidosDeToques(toques)).toEqual([e(32, 2), e(31), e(32)]);
  });

  it("de lo elegido vuelve a los toques (para editar una línea del carrito)", () => {
    const elegidos = [e(32, 2), e(31)];
    expect(elegidosDeToques(toquesDeElegidos(elegidos))).toEqual(elegidos);
    expect(toquesDeElegidos(undefined)).toEqual([]);
  });
});

describe("las líneas hijas del recibo", () => {
  const venta = [
    { id: 501, lineaPadreId: null, nombre: "Vaso M" },
    { id: 502, lineaPadreId: 501, nombre: "Oreo", incluido: true },
    { id: 503, lineaPadreId: 501, nombre: "Canela", incluido: false },
    { id: 504, lineaPadreId: null, nombre: "Vaso L" },
  ];

  it("cuelgan de su vaso y no cuentan como otro producto", () => {
    const g = agruparHijas(venta);
    expect(g.map((x) => [x.linea.nombre, x.hijas.map((h) => h.nombre)])).toEqual([
      ["Vaso M", ["Oreo", "Canela"]],
      ["Vaso L", []],
    ]);
  });

  it("una venta sin toppings queda como estaba", () => {
    const sola = [{ id: 1, nombre: "Pollo" }, { id: 2, nombre: "Gaseosa" }];
    expect(agruparHijas(sola).map((x) => x.hijas.length)).toEqual([0, 0]);
    expect(tieneHijas(sola)).toBe(false);
    expect(tieneHijas(venta)).toBe(true);
  });

  it("una hija sin su padre se dibuja suelta: no se pierde un renglón del recibo", () => {
    const g = agruparHijas([{ id: 2, lineaPadreId: 99, nombre: "Huérfana" }]);
    expect(g).toHaveLength(1);
    expect(g[0].linea.nombre).toBe("Huérfana");
  });
});
