import { describe, expect, it } from "vitest";
import { contiene, normalizar, posicionDe } from "./texto";

/**
 * Los catálogos están llenos de tildes ("Café", "Limón", "Piña") y el cajero
 * teclea sin ellas. Mismos casos que documenta `Texto.kt`.
 */
describe("texto", () => {
  it("quita tildes y baja a minúsculas", () => {
    expect(normalizar("Café")).toBe("cafe");
    expect(normalizar("LIMÓN")).toBe("limon");
  });

  it("conserva la ñ: es una letra, no una n acentuada", () => {
    // Quien busca "niño" no quiere que le aparezca "nino".
    expect(normalizar("Piña")).toBe("piña");
    expect(normalizar("ÑOQUIS")).toBe("ñoquis");
  });

  it("buscar sin tildes encuentra lo escrito con tildes", () => {
    expect(contiene("Café con leche", "cafe")).toBe(true);
    expect(contiene("Jugo de Limón", "limon")).toBe(true);
  });

  it("y al revés: buscar con tildes encuentra lo escrito sin ellas", () => {
    expect(contiene("Cafe americano", "café")).toBe(true);
  });

  it("no encuentra lo que de verdad no está", () => {
    expect(contiene("Hamburguesa", "pollo")).toBe(false);
  });

  it("un texto ausente no rompe la búsqueda", () => {
    // Los campos opcionales (código, proveedor, descripción) llegan nulos.
    expect(contiene(null, "algo")).toBe(false);
    expect(contiene(undefined, "algo")).toBe(false);
    expect(contiene("", "algo")).toBe(false);
  });

  it("una búsqueda vacía no filtra nada", () => {
    expect(contiene("Café", "")).toBe(true);
  });
});

describe("posicionDe", () => {
  it("ubica la coincidencia en el texto original", () => {
    expect(posicionDe("Paracetamol 500 mg", "para")).toEqual([0, 4]);
    expect(posicionDe("Paracetamol 500 mg", "500")).toEqual([12, 15]);
  });

  it("no se corre cuando el texto tiene tildes", () => {
    // Éste es el motivo de la función: sobre el texto normalizado los índices
    // dejan de corresponder con los del original.
    expect(posicionDe("Solución fisiológica", "fisiolog")).toEqual([9, 17]);
    expect(posicionDe("Inyección", "yeccion")).toEqual([2, 9]);
  });

  it("encuentra aunque el que busca no ponga la tilde", () => {
    expect(posicionDe("Loratadina jarabe", "JARABE")).toEqual([11, 17]);
    expect(posicionDe("Cápsula", "capsula")).toEqual([0, 7]);
  });

  it("devuelve null cuando no hay nada que resaltar", () => {
    expect(posicionDe("Omeprazol", "xyz")).toBeNull();
    expect(posicionDe("Omeprazol", "   ")).toBeNull();
    expect(posicionDe(null, "ome")).toBeNull();
    expect(posicionDe("", "ome")).toBeNull();
  });
});
