import { describe, expect, it, vi } from "vitest";
import { plegarAtribucion } from "./mapa";

/** Un contenedor como el que deja MapLibre: el control de atribución abierto. */
function mapaFalso() {
  const contenedor = document.createElement("div");
  contenedor.innerHTML = '<details class="maplibregl-ctrl maplibregl-ctrl-attrib maplibregl-compact maplibregl-compact-show" open></details>';
  let alCargar: (() => void) | null = null;
  const m = {
    getContainer: () => contenedor,
    once: vi.fn((_: "load", fn: () => void) => {
      alCargar = fn;
    }),
  };
  return { m, contenedor, cargar: () => alCargar?.() };
}

describe("plegarAtribucion", () => {
  it("cierra la atribución al crear el control y otra vez al cargar, que es cuando MapLibre la reabre", () => {
    const { m, contenedor, cargar } = mapaFalso();
    plegarAtribucion(m);
    const el = contenedor.querySelector(".maplibregl-ctrl-attrib")!;
    expect(el.hasAttribute("open")).toBe(false);
    expect(el.classList.contains("maplibregl-compact-show")).toBe(false);

    // MapLibre la reabre al medir el mapa.
    el.setAttribute("open", "");
    el.classList.add("maplibregl-compact-show");
    cargar();
    expect(el.hasAttribute("open")).toBe(false);
    expect(el.classList.contains("maplibregl-compact-show")).toBe(false);
  });

  it("sin el control no hace nada ni falla", () => {
    const m = { getContainer: () => document.createElement("div"), once: vi.fn() };
    expect(() => plegarAtribucion(m)).not.toThrow();
  });
});
