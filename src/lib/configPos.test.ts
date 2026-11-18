import { describe, expect, it } from "vitest";
import { CONFIG_POS_DE_SIEMPRE, configPosDe, mismaConfigPos, normalizarConfigPos, ordenarCategorias } from "./configPos";

/**
 * Configuración › Punto de venta (16-nov): lo que no viene vale lo de fábrica,
 * que es el POS de siempre. Una sesión vieja o un backend que todavía no lo
 * manda no pueden cambiar cómo se cobra.
 */

// Los billetes (Configuración › Caja, 17-nov) valen «sí» de fábrica: contar al abrir y al cerrar es lo de siempre.
const DE_SIEMPRE = {
  vista: "TARJETAS",
  cobro: "APARTE",
  iconos: true,
  filtros: true,
  ordenCategorias: [],
  billetesAlAbrir: true,
  billetesAlCerrar: true,
};

describe("normalizarConfigPos", () => {
  it.each([undefined, null, "COLUMNAS", 3, []])("sin un objeto (%s): lo de fábrica", (crudo) => {
    expect(normalizarConfigPos(crudo)).toEqual(DE_SIEMPRE);
  });

  it("lo que viene bien se respeta", () => {
    expect(
      normalizarConfigPos({ vista: "COLUMNAS", cobro: "EN_VENTA", iconos: false, filtros: false, ordenCategorias: [4, 2] }),
    ).toEqual({
      vista: "COLUMNAS",
      cobro: "EN_VENTA",
      iconos: false,
      filtros: false,
      ordenCategorias: [4, 2],
      billetesAlAbrir: true,
      billetesAlCerrar: true,
    });
  });

  it("un campo roto no tira abajo a los demás: vale lo de fábrica sólo ése", () => {
    expect(normalizarConfigPos({ vista: "MOSAICO", cobro: "EN_VENTA", iconos: "no", filtros: null })).toEqual({
      ...DE_SIEMPRE,
      cobro: "EN_VENTA",
    });
  });

  it("el orden sin repetidos ni basura", () => {
    expect(normalizarConfigPos({ ordenCategorias: [3, "1", 3, 2.5, 7, null] }).ordenCategorias).toEqual([3, 7]);
    expect(normalizarConfigPos({ ordenCategorias: "3,1" }).ordenCategorias).toEqual([]);
  });

  it("un campo que esta versión no conoce (el destino del pedido, que no es un ajuste) se ignora", () => {
    expect(normalizarConfigPos({ consumo: "LLEVAR" })).toEqual(DE_SIEMPRE);
  });

  it("los billetes se leen aparte: apagar uno no toca al otro, y un dato roto vale «sí»", () => {
    expect(normalizarConfigPos({ billetesAlAbrir: false })).toEqual({ ...DE_SIEMPRE, billetesAlAbrir: false });
    expect(normalizarConfigPos({ billetesAlCerrar: false })).toEqual({ ...DE_SIEMPRE, billetesAlCerrar: false });
    expect(normalizarConfigPos({ billetesAlAbrir: "no", billetesAlCerrar: null })).toEqual(DE_SIEMPRE);
  });

  it("devuelve copias: tocar el resultado no cambia lo de fábrica", () => {
    const c = normalizarConfigPos(null);
    c.ordenCategorias.push(9);
    expect(CONFIG_POS_DE_SIEMPRE.ordenCategorias).toEqual([]);
  });
});

describe("configPosDe: la de la sesión", () => {
  it("el restaurante lee la suya", () => {
    expect(configPosDe({ tipoNegocio: "RESTAURANTE", pos: { vista: "COLUMNAS" } }).vista).toBe("COLUMNAS");
  });

  it("una sesión sin el campo: el POS de siempre", () => {
    expect(configPosDe({ tipoNegocio: "RESTAURANTE" })).toEqual(DE_SIEMPRE);
    expect(configPosDe(null)).toEqual(DE_SIEMPRE);
  });

  it.each(["FARMACIA", "PELUQUERIA", "MINIMARKET", "BILLAR", undefined])(
    "%s no tiene la pantalla: aunque llegue algo, el POS de siempre",
    (rubro) => {
      expect(configPosDe({ tipoNegocio: rubro, pos: { vista: "COLUMNAS", cobro: "EN_VENTA" } })).toEqual(DE_SIEMPRE);
    },
  );
});

describe("mismaConfigPos", () => {
  it("compara por contenido, con el orden", () => {
    const a = normalizarConfigPos({ ordenCategorias: [1, 2] });
    expect(mismaConfigPos(a, normalizarConfigPos({ ordenCategorias: [1, 2] }))).toBe(true);
    expect(mismaConfigPos(a, normalizarConfigPos({ ordenCategorias: [2, 1] }))).toBe(false);
    expect(mismaConfigPos(a, normalizarConfigPos({ ordenCategorias: [1, 2], iconos: false }))).toBe(false);
  });
});

describe("ordenarCategorias", () => {
  const cat = (id: number, nombre: string) => ({ id, nombre });
  const POLLOS = cat(1, "Pollos");
  const BEBIDAS = cat(2, "Bebidas");
  const EXTRAS = cat(3, "Extras");
  const POSTRES = cat(4, "Postres");

  it("sin orden elegido: el mismo arreglo, tal cual llegó", () => {
    const lista = [POLLOS, BEBIDAS, EXTRAS];
    expect(ordenarCategorias(lista, [])).toBe(lista);
  });

  it("en el orden del dueño", () => {
    expect(ordenarCategorias([POLLOS, BEBIDAS, EXTRAS], [3, 1, 2]).map((c) => c.nombre)).toEqual([
      "Extras",
      "Pollos",
      "Bebidas",
    ]);
  });

  it("las que no están en la lista van después, en el orden en que llegan", () => {
    // Postres se creó después de ordenar: aparece igual, al final.
    expect(ordenarCategorias([POLLOS, POSTRES, BEBIDAS, EXTRAS], [2, 1]).map((c) => c.nombre)).toEqual([
      "Bebidas",
      "Pollos",
      "Postres",
      "Extras",
    ]);
  });

  it("una categoría borrada que seguía en la lista no deja hueco", () => {
    expect(ordenarCategorias([POLLOS, BEBIDAS], [99, 2, 1]).map((c) => c.nombre)).toEqual(["Bebidas", "Pollos"]);
  });

  it("no toca el arreglo que recibe", () => {
    const lista = [POLLOS, BEBIDAS];
    ordenarCategorias(lista, [2, 1]);
    expect(lista).toEqual([POLLOS, BEBIDAS]);
  });
});
