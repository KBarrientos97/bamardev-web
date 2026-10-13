import { describe, expect, it } from "vitest";
import type { CategoriaApi } from "../api";
import { PALETA } from "../trazos";
import { armarCategorias, colorCategoria, etiquetaCategoria, partePct } from "./Categorias.datos";

function categoria(nombre: string, ingresos: number, utilidad = ingresos / 2): CategoriaApi {
  return { nombre, ingresos, utilidad, unidades: 10, margenPct: 50, porcentaje: 0 };
}

describe("categorías", () => {
  it("van de la que más vende a la que menos, con su parte del total y los colores en orden", () => {
    const r = armarCategorias([categoria("Bebidas", 1145), categoria("Cervezas", 3905), categoria("Snacks", 785)], "RESTAURANTE");
    expect(r.filas.map((f) => f.nombre)).toEqual(["Cervezas", "Bebidas", "Snacks"]);
    expect(r.total).toBe(5835);
    expect(r.filas[0].fraccion).toBeCloseTo(3905 / 5835);
    expect(r.filas.map((f) => f.color)).toEqual([PALETA[0], PALETA[1], PALETA[2]]);
    expect(r.partes.map((p) => p.etiqueta)).toEqual(["Cervezas", "Bebidas", "Snacks"]);
  });

  it("en un billar, Sin categoría aclara que ahí está el tiempo de mesa; en otro rubro no", () => {
    // El tiempo de mesa no tiene categoría y suele ser la porción más grande:
    // "Sin categoría" a secas parecía un error de carga.
    expect(etiquetaCategoria("Sin categoría", "BILLAR")).toBe("Sin categoría (incluye el tiempo de mesa)");
    expect(etiquetaCategoria("Sin categoría", "RESTAURANTE")).toBe("Sin categoría");
    expect(etiquetaCategoria("Cervezas", "BILLAR")).toBe("Cervezas");
  });

  it("con más categorías que colores, las últimas van juntas en Otras y en gris", () => {
    // Repetir colores hacía que dos categorías distintas se vieran como la misma.
    const muchas = Array.from({ length: 10 }, (_, i) => categoria(`C${i}`, 1000 - i * 10));
    const r = armarCategorias(muchas, undefined);
    const gris = PALETA[PALETA.length - 1];
    expect(r.partes).toHaveLength(PALETA.length);
    expect(r.partes[PALETA.length - 1]).toMatchObject({ etiqueta: "Otras (3)", color: gris, valor: 930 + 920 + 910 });
    expect(r.filas.slice(PALETA.length - 1).every((f) => f.color === gris)).toBe(true);
    expect(colorCategoria(0, 10)).toBe(PALETA[0]);
  });

  it("sin ingresos el margen no se calcula", () => {
    const r = armarCategorias([categoria("Regalos", 0, -5)], undefined);
    expect(r.filas[0].margen).toBeNull();
    expect(r.filas[0].fraccion).toBe(0);
  });

  it("una categoría que vendió poquito dice <1 % y no 0 %", () => {
    expect(partePct(0.003)).toBe("<1 %");
    expect(partePct(0)).toBe("0 %");
    expect(partePct(0.58)).toBe("58 %");
  });
});
