/**
 * Lo que el service worker guarda del mapa (va en `runtimeCaching` de
 * vite.config.ts). Antes no se guardaba nada y abrirlo de nuevo costaba casi
 * lo mismo que la primera vez (03-nov).
 *
 * No va en el precache: MapLibre pesa ~1 MB y lo bajaría cada cajero al
 * instalar la app. Se guarda recién cuando alguien abre un mapa, y desde ahí
 * sale del celular. Vale para la app y para las páginas públicas que se abren
 * en un equipo que ya tiene la app (el SW cubre todo el dominio); la página
 * pública por sí sola no registra el SW.
 *
 * Todas las respuestas son CORS (OpenFreeMap manda Access-Control-Allow-Origin),
 * así que sólo se guarda el 200: una respuesta opaca (estado 0) podría ser un
 * error y quedaría guardada como buena.
 *
 * Está aparte y sin dependencias para poder probar los patrones sin red.
 */

const DIA = 24 * 60 * 60;

/** Los pedazos de MapLibre del build (js, css y el worker). Llevan hash: nunca cambian. */
export const RE_CODIGO_MAPA = /\/assets\/maplibre-gl[^/]*\.(?:js|mjs|css)$/;

/** El TileJSON: dice en qué carpeta están los mosaicos de esta semana. */
export const RE_TILEJSON = /^https:\/\/tiles\.openfreemap\.org\/planet$/;

/** Los íconos (sprites) y las letras (glyphs) del estilo. Van en carpetas con versión. */
export const RE_RECURSOS_MAPA = /^https:\/\/tiles\.openfreemap\.org\/(?:sprites|fonts)\//;

/** Los mosaicos: `planet/<versión>/<z>/<x>/<y>.pbf`. */
export const RE_MOSAICOS = /^https:\/\/tiles\.openfreemap\.org\/planet\/[^/]+\/\d+\/\d+\/\d+\.pbf$/;

export const CACHE_MAPA = [
  {
    urlPattern: RE_CODIGO_MAPA,
    handler: "CacheFirst" as const,
    options: {
      cacheName: "mapa-codigo",
      // Una versión son 4 archivos; con 8 entran la de ahora y la anterior.
      expiration: { maxEntries: 8, maxAgeSeconds: 60 * DIA },
      cacheableResponse: { statuses: [200] },
    },
  },
  {
    // OpenFreeMap publica mosaicos nuevos cada semana y el TileJSON pasa a
    // la carpeta nueva: se usa el guardado (el mapa abre sin esperarlo) y se
    // actualiza por detrás para la próxima vez.
    urlPattern: RE_TILEJSON,
    handler: "StaleWhileRevalidate" as const,
    options: {
      cacheName: "mapa-tilejson",
      expiration: { maxEntries: 2, maxAgeSeconds: 30 * DIA },
      cacheableResponse: { statuses: [200] },
    },
  },
  {
    urlPattern: RE_RECURSOS_MAPA,
    handler: "CacheFirst" as const,
    options: {
      cacheName: "mapa-recursos",
      expiration: { maxEntries: 60, maxAgeSeconds: 60 * DIA, purgeOnQuotaError: true },
      cacheableResponse: { statuses: [200] },
    },
  },
  {
    // Los mosaicos pesan hasta ~200 KB en el centro de una ciudad (casi
    // siempre mucho menos): con 120 como máximo no pasa de ~20 MB ni en el
    // peor caso, y a las dos semanas (dos versiones) se van solos. Si el teléfono se queda sin espacio, esta caché es la
    // primera en vaciarse.
    urlPattern: RE_MOSAICOS,
    handler: "CacheFirst" as const,
    options: {
      cacheName: "mapa-mosaicos",
      expiration: { maxEntries: 120, maxAgeSeconds: 14 * DIA, purgeOnQuotaError: true },
      cacheableResponse: { statuses: [200] },
    },
  },
];
