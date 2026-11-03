import { describe, expect, it } from "vitest";
import { ESTILO_MAPA, estiloMapa } from "./estiloMapa";

/** El estilo del mapa va dentro de la app (03-nov): sin red, sin el relieve. */
describe("estilo local del mapa", () => {
  it("no trae el relieve del mundo ni su fuente raster", () => {
    expect(ESTILO_MAPA.sources).not.toHaveProperty("ne2_shaded");
    expect(ESTILO_MAPA.layers.map((c) => c.id)).not.toContain("natural_earth");
    expect(ESTILO_MAPA.layers.some((c) => c.type === "raster")).toBe(false);
  });

  it("tampoco los edificios en 3D ni los escudos de EEUU; los edificios planos van en todos los zooms", () => {
    const ids = ESTILO_MAPA.layers.map((c) => c.id);
    expect(ids).not.toContain("building-3d");
    expect(ids).not.toContain("road_shield_us");
    expect(ids).not.toContain("highway-shield-us-interstate");
    expect(ESTILO_MAPA.layers.find((c) => c.id === "building")).not.toHaveProperty("maxzoom");
  });

  it("deja lo que importa en una página de negocio: calles y sus nombres, agua, parques, edificios y lugares", () => {
    const ids = ESTILO_MAPA.layers.map((c) => c.id);
    for (const id of ["background", "water", "park", "building", "road_minor", "highway-name-minor", "poi_r1"]) {
      expect(ids).toContain(id);
    }
  });

  it("los mosaicos van al TileJSON de OpenFreeMap (nunca a una versión fija) y los íconos y letras también", () => {
    expect(ESTILO_MAPA.sources).toEqual({
      openmaptiles: { type: "vector", url: "https://tiles.openfreemap.org/planet" },
    });
    expect(ESTILO_MAPA.sprite).toMatch(/^https:\/\/tiles\.openfreemap\.org\/sprites\//);
    expect(ESTILO_MAPA.glyphs).toBe("https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf");
  });

  it("cada mapa recibe su copia: lo que MapLibre toque no le llega al siguiente", () => {
    const a = estiloMapa();
    a.layers.pop();
    expect(estiloMapa().layers).toHaveLength(ESTILO_MAPA.layers.length);
    expect(a).not.toBe(ESTILO_MAPA);
  });
});
