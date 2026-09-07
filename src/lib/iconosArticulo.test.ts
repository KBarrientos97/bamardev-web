import { describe, expect, it } from "vitest";
import { ICONOS_ARTICULO, colorDeCategoria, iconoPorLlave, inicialesDe } from "./iconosArticulo";

/**
 * Las llaves y el monograma tienen que dar lo mismo que en la app: un artículo
 * con ícono puesto desde Android debe verse igual acá, y el producto sin ícono
 * debe mostrar las mismas iniciales en las dos plataformas.
 */
describe("iconosArticulo", () => {
  it("resuelve una llave del catálogo", () => {
    const i = iconoPorLlave("medio_pollo_broaster");
    expect(i?.etiqueta).toBe("Broaster medio");
    expect(i?.src).toBeTruthy();
  });

  it("una llave desconocida o vacía cae al monograma", () => {
    // Un ícono que existe en una versión más nueva de la app no puede romper
    // la web: simplemente no se dibuja.
    expect(iconoPorLlave("pizza_hawaiana")).toBeNull();
    expect(iconoPorLlave("")).toBeNull();
    expect(iconoPorLlave("   ")).toBeNull();
    expect(iconoPorLlave(null)).toBeNull();
    expect(iconoPorLlave(undefined)).toBeNull();
  });

  it("no hay llaves repetidas en el catálogo", () => {
    const llaves = ICONOS_ARTICULO.map((i) => i.llave);
    expect(new Set(llaves).size).toBe(llaves.length);
  });

  // Los cuatro ejemplos que documenta IconosArticulo.kt / ProductoPosAdapter.
  it.each([
    ["Coca-Cola Lata", "CC"],
    ["Agua sin gas 500ml", "AG"],
    ["Pollo Broaster 1/4", "PB"],
    ["Hamburguesa Clásica", "HC"],
  ])("monograma de %s es %s", (nombre, esperado) => {
    expect(inicialesDe(nombre)).toBe(esperado);
  });

  it("una sola palabra usa sus dos primeras letras", () => {
    expect(inicialesDe("Salchipapas")).toBe("SA");
  });

  it("ignora las palabras de relleno y las medidas", () => {
    // "de" y "1L" no aportan al logo del producto.
    expect(inicialesDe("Jugo de Naranja 1L")).toBe("JN");
  });

  it("un nombre sin letras no revienta", () => {
    expect(inicialesDe("///")).toBe("/");
    expect(inicialesDe("")).toBe("?");
  });

  it("el color de categoría no distingue mayúsculas ni tildes", () => {
    expect(colorDeCategoria("Bebidas")).toEqual(colorDeCategoria("bebidas"));
    // La app acepta la categoría escrita con y sin tilde.
    expect(colorDeCategoria("Acompañamientos")).toEqual(colorDeCategoria("acompanamientos"));
  });

  it("una categoría desconocida o ausente cae al color por defecto", () => {
    const defecto = colorDeCategoria(null);
    expect(colorDeCategoria("Ferretería")).toEqual(defecto);
    expect(colorDeCategoria(undefined)).toEqual(defecto);
  });
});
