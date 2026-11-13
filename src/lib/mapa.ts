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

/** De donde salen el TileJSON, los mosaicos, los íconos y las letras del mapa. */
export const ORIGEN_MOSAICOS = "https://tiles.openfreemap.org";

/** Donde arranca el mapa si la sucursal todavía no tiene ubicación. */
export const SANTA_CRUZ: Ubicacion = { lat: -17.7834, lng: -63.1821 };

type MapLibre = typeof import("maplibre-gl");
let carga: Promise<MapLibre> | null = null;

/**
 * MapLibre pesa ~1 MB: se baja recién cuando hace falta un mapa, nunca con
 * el resto de la app. El worker va como archivo propio (el paquete lo busca
 * al lado de su .mjs y después del build de Vite ahí no está).
 *
 * Una sola vez por página: la precarga y el mapa piden lo mismo, y
 * `setWorkerUrl` tiene que ir antes de `prewarm` y del primer mapa. Si falla
 * (sin red) se olvida, para que el próximo intento vuelva a pedirlo.
 */
export function cargarMaplibre(): Promise<MapLibre> {
  if (!carga) {
    carga = Promise.all([
      import("maplibre-gl"),
      import("maplibre-gl/dist/maplibre-gl-worker.mjs?url"),
      import("maplibre-gl/dist/maplibre-gl.css"),
    ]).then(([ml, worker]) => {
      ml.setWorkerUrl(worker.default);
      return ml;
    });
    carga.catch(() => {
      carga = null;
    });
  }
  return carga;
}

/**
 * Deja la atribución («OpenFreeMap © OpenMapTiles…») plegada detrás del botón
 * «i». MapLibre la abre sola en los mapas chicos y en el celular tapa un tercio
 * del mapa y los pines de abajo; sigue a un toque, así que no se esconde. Va al
 * crear el control y otra vez al cargar, porque MapLibre la reabre al medirse.
 */
export function plegarAtribucion(m: { getContainer(): HTMLElement; once(ev: "load", fn: () => void): unknown }) {
  const plegar = () => {
    const el = m.getContainer().querySelector(".maplibregl-ctrl-attrib");
    el?.classList.remove("maplibregl-compact-show");
    el?.removeAttribute("open");
  };
  plegar();
  m.once("load", plegar);
}

/**
 * Corre `fn` cuando el navegador está libre, después de pintar lo primero de
 * la pantalla (Safari no tiene requestIdleCallback: ahí, un rato después).
 * Devuelve cómo cancelarlo.
 */
export function alDescansar(fn: () => void, tope = 1500): () => void {
  if (typeof requestIdleCallback === "function") {
    const id = requestIdleCallback(fn, { timeout: tope });
    return () => cancelIdleCallback(id);
  }
  const id = setTimeout(fn, 200);
  return () => clearTimeout(id);
}

/**
 * Adelanta lo que más tarda del mapa (03-nov: ~5 s en 4G con el celular
 * lento, todo en serie): baja MapLibre y arranca su worker (`prewarm`, que
 * también baja el .mjs del worker), y además el pedazo que dibuja el mapa
 * (`pedazo`, que trae el estilo). No crea ningún mapa ni pide mosaicos.
 *
 * En los tests no hace nada: jsdom no tiene WebGL y bajar 1 MB de JS en cada
 * render los haría lentos.
 */
export function precargarMapa(pedazo?: () => Promise<unknown>) {
  if (import.meta.env.MODE === "test") return;
  cargarMaplibre()
    .then((ml) => ml.prewarm())
    .catch(() => {
      // Sin red: el mapa lo vuelve a intentar al dibujarse.
    });
  pedazo?.().catch(() => {
    // Ídem: el lazy() lo pide de nuevo.
  });
}

/** Seis decimales son ~10 cm: más es ruido del GPS. */
export const redondear = (u: Ubicacion): Ubicacion => ({
  lat: Math.round(u.lat * 1e6) / 1e6,
  lng: Math.round(u.lng * 1e6) / 1e6,
});

/** "Cómo llegar" con las coordenadas: la ruta exacta en Google Maps. */
export const urlRuta = (u: Ubicacion) => `https://www.google.com/maps/dir/?api=1&destination=${u.lat},${u.lng}`;
