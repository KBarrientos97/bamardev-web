import { describe, expect, it } from "vitest";
import { CACHE_MAPA, RE_CODIGO_MAPA, RE_MOSAICOS, RE_RECURSOS_MAPA, RE_TILEJSON } from "./cacheMapa";

/**
 * Lo que el service worker guarda del mapa (vite.config.ts → runtimeCaching).
 * Se prueban los patrones contra URLs reales, sin red; que el sw.js generado
 * los lleve lo dice el build.
 */

const BASE = "https://tiles.openfreemap.org";
const DE = (url: string) => CACHE_MAPA.filter((r) => r.urlPattern.test(url));

describe("caché del mapa en el service worker", () => {
  it("el código de MapLibre del build (js, css y worker), con CacheFirst", () => {
    for (const archivo of [
      "maplibre-gl-DoJDlSbr.js",
      "maplibre-gl-CEya5O3P.css",
      "maplibre-gl-worker-DxGNRm0a.mjs",
      "maplibre-gl-worker-NRYVIb2k.js",
    ]) {
      const reglas = DE(`https://app.bamardev.com/assets/${archivo}`);
      expect(reglas.map((r) => r.handler)).toEqual(["CacheFirst"]);
    }
    expect(RE_CODIGO_MAPA.test("https://app.bamardev.com/assets/index-COSKCG7q.js")).toBe(false);
  });

  it("el TileJSON con StaleWhileRevalidate: cambia de versión cada semana", () => {
    expect(DE(`${BASE}/planet`).map((r) => r.handler)).toEqual(["StaleWhileRevalidate"]);
    expect(RE_TILEJSON.test(`${BASE}/planet/20261101_080013_pt/14/5316/9014.pbf`)).toBe(false);
  });

  it("íconos, letras y mosaicos de OpenFreeMap con CacheFirst", () => {
    for (const url of [
      `${BASE}/sprites/ofm_f384/ofm@2x.json`,
      `${BASE}/sprites/ofm_f384/ofm@2x.png`,
      `${BASE}/fonts/Noto%20Sans%20Regular/0-255.pbf`,
      `${BASE}/planet/20261101_080013_pt/14/5316/9014.pbf`,
    ]) {
      expect(DE(url).map((r) => r.handler)).toEqual(["CacheFirst"]);
    }
    expect(RE_RECURSOS_MAPA.test(`${BASE}/planet`)).toBe(false);
    expect(RE_MOSAICOS.test(`${BASE}/sprites/ofm_f384/ofm.png`)).toBe(false);
  });

  it("nada del API ni de otros sitios: los datos van siempre por internet", () => {
    for (const url of [
      "https://api.bamardev.com/api/publico/pagina/buensabor",
      "https://api-qa.bamardev.com/api/sucursales",
      "https://otro.com/tiles.openfreemap.org/planet",
      "https://tiles.openfreemap.org.evil.com/planet",
      `${BASE}/styles/liberty`,
    ]) {
      expect(DE(url)).toEqual([]);
    }
  });

  it("con tope de entradas y de días, y guardando sólo respuestas 200", () => {
    for (const r of CACHE_MAPA) {
      expect(r.options.expiration.maxEntries).toBeGreaterThan(0);
      expect(r.options.expiration.maxAgeSeconds).toBeGreaterThan(0);
      expect(r.options.cacheableResponse.statuses).toEqual([200]);
    }
    const mosaicos = CACHE_MAPA.find((r) => r.options.cacheName === "mapa-mosaicos")!;
    expect(mosaicos.options.expiration.maxEntries).toBeLessThanOrEqual(150);
  });

  it("cada regla con su caché", () => {
    const nombres = CACHE_MAPA.map((r) => r.options.cacheName);
    expect(new Set(nombres).size).toBe(nombres.length);
  });
});
