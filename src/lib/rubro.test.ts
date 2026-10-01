import { describe, expect, it } from "vitest";
import { esFarmacia, esRubro, termino } from "./rubro";

describe("termino", () => {
  it("en una farmacia los artículos son medicamentos", () => {
    expect(termino("FARMACIA", "articulos")).toBe("Medicamentos");
    expect(termino("FARMACIA", "articulo")).toBe("medicamento");
    expect(termino("FARMACIA", "articuloCap")).toBe("Medicamento");
  });

  it("los demás rubros hablan como siempre", () => {
    // Lo que no está en la tabla usa la palabra de base: un rubro nuevo no
    // puede cambiarle los textos a un negocio que ya trabaja.
    expect(termino("RESTAURANTE", "articulos")).toBe("Artículos");
    expect(termino("MINIMARKET", "articulo")).toBe("artículo");
    expect(termino("REPUESTOS", "articuloCap")).toBe("Artículo");
  });

  it("sin rubro, o con uno que no conoce, usa la palabra de siempre", () => {
    // Pasa con una sesión vieja: el login empezó a mandar `tipoNegocio`
    // después, y quien no volvió a entrar todavía no lo tiene guardado.
    expect(termino(undefined, "articulos")).toBe("Artículos");
    expect(termino(null, "articulos")).toBe("Artículos");
    expect(termino("PELUQUERIA", "articulos")).toBe("Artículos");
  });
});

describe("esRubro / esFarmacia", () => {
  it("reconoce los rubros del backend", () => {
    expect(esRubro("FARMACIA")).toBe(true);
    expect(esRubro("RESTAURANTE")).toBe(true);
  });

  it("no se come cualquier texto", () => {
    expect(esRubro("farmacia")).toBe(false); // el enum viaja en MAYÚSCULAS
    expect(esRubro("")).toBe(false);
    expect(esRubro(undefined)).toBe(false);
  });

  it("esFarmacia es el atajo del rubro con más piezas propias", () => {
    expect(esFarmacia("FARMACIA")).toBe(true);
    expect(esFarmacia("MINIMARKET")).toBe(false);
    expect(esFarmacia(undefined)).toBe(false);
  });
});
