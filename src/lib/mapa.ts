/**
 * Lo común de los mapas de la web (PLAN-PAGINA-WEB §3.1): el de la página
 * del negocio y el de la ficha de la sucursal, donde se marca la ubicación.
 *
 * Mismo mapa que la Prospección del panel: MapLibre con los mosaicos de
 * OpenFreeMap (OpenStreetMap), gratis, sin API key ni tope de uso.
 */

export interface Ubicacion {
  lat: number;
  lng: number;
}

/** "liberty" es el de calles con colores: el que la gente reconoce como mapa. */
export const ESTILO_MAPA = "https://tiles.openfreemap.org/styles/liberty";

/** Donde arranca el mapa si la sucursal todavía no tiene ubicación. */
export const SANTA_CRUZ: Ubicacion = { lat: -17.7834, lng: -63.1821 };

/**
 * MapLibre pesa ~1 MB: se baja recién cuando hace falta un mapa, nunca con
 * el resto de la app. El worker va como archivo propio (el paquete lo busca
 * al lado de su .mjs y después del build de Vite ahí no está).
 */
export async function cargarMaplibre() {
  const [ml, worker] = await Promise.all([
    import("maplibre-gl"),
    import("maplibre-gl/dist/maplibre-gl-worker.mjs?url"),
    import("maplibre-gl/dist/maplibre-gl.css"),
  ]);
  ml.setWorkerUrl(worker.default);
  return ml;
}

/** Seis decimales son ~10 cm: más es ruido del GPS. */
export const redondear = (u: Ubicacion): Ubicacion => ({
  lat: Math.round(u.lat * 1e6) / 1e6,
  lng: Math.round(u.lng * 1e6) / 1e6,
});

/** "Cómo llegar" con las coordenadas: la ruta exacta en Google Maps. */
export const urlRuta = (u: Ubicacion) => `https://www.google.com/maps/dir/?api=1&destination=${u.lat},${u.lng}`;
