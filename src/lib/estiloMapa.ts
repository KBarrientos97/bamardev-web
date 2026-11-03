import type { StyleSpecification } from "maplibre-gl";
import estilo from "./estiloMapa.json";

/**
 * El estilo de los mapas (PLAN-PAGINA-WEB §3.1): "liberty" de OpenFreeMap,
 * el de calles con colores que la gente reconoce como mapa.
 *
 * Va dentro de la app en vez de pedirlo a
 * https://tiles.openfreemap.org/styles/liberty: era el primer eslabón de una
 * cadena en serie (estilo → TileJSON → mosaicos → letras) y con 4G lento
 * tardaba hasta 2 s sólo él (03-nov). Así el mapa arranca pidiendo
 * directamente el TileJSON, los íconos y los mosaicos.
 *
 * Es una copia recortada (sin el relieve del mundo, sin edificios en 3D, sin
 * escudos de rutas de EEUU) que arma `scripts/estilo-mapa.mjs`; para
 * actualizarla, `node scripts/estilo-mapa.mjs`. Los íconos, las letras y los
 * mosaicos se siguen bajando de OpenFreeMap, y la fuente apunta al TileJSON
 * `planet` (no a una versión fija de mosaicos, que cambia cada semana).
 *
 * Vive aparte de `mapa.ts` a propósito: este archivo pesa ~70 KB y sólo lo
 * cargan los pedazos del mapa, no cada página que muestra "Cómo llegar".
 */
export const ESTILO_MAPA = estilo as unknown as StyleSpecification;

/**
 * Una copia para cada mapa: MapLibre se queda con el objeto que recibe y no
 * conviene que dos mapas (o el mismo, al volver a abrirlo) compartan uno.
 */
export const estiloMapa = (): StyleSpecification => structuredClone(ESTILO_MAPA);
