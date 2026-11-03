// Baja el estilo "liberty" de OpenFreeMap y lo deja en src/lib/estiloMapa.json
// sin lo que no sirve en el mapa de una página de negocio (ver
// src/lib/estiloMapa.ts, que explica por qué va dentro de la app).
//
// Uso: node scripts/estilo-mapa.mjs
//
// Conviene correrlo cada tanto (o si OpenFreeMap anuncia cambios en el
// estilo): los mosaicos NO dependen de esto, porque la fuente apunta al
// TileJSON `planet`, que siempre dice cuál es la versión de esta semana.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ORIGEN = "https://tiles.openfreemap.org/styles/liberty";
const DESTINO = fileURLToPath(new URL("../src/lib/estiloMapa.json", import.meta.url));

/**
 * Capas que se sacan:
 * - `natural_earth`: el relieve sombreado del mundo (fuente raster
 *   `ne2_shaded`), sólo se ve hasta el zoom 7; el mapa de una sucursal está
 *   en la cuadra.
 * - `building-3d`: los edificios con altura. Sin inclinar el mapa se ven
 *   igual que planos y cuestan más dibujarlos; queda `building` para todos
 *   los zooms.
 * - Los escudos de rutas de EEUU: en Bolivia no hay ninguno.
 */
const CAPAS_FUERA = new Set(["natural_earth", "building-3d", "road_shield_us", "highway-shield-us-interstate"]);
const FUENTES_FUERA = new Set(["ne2_shaded"]);

const res = await fetch(ORIGEN);
if (!res.ok) throw new Error(`OpenFreeMap respondió ${res.status}`);
const estilo = await res.json();

for (const f of FUENTES_FUERA) delete estilo.sources[f];
estilo.layers = estilo.layers.filter((c) => !CAPAS_FUERA.has(c.id) && !FUENTES_FUERA.has(c.source));
const edificios = estilo.layers.find((c) => c.id === "building");
if (edificios) delete edificios.maxzoom;

// La fuente de los mosaicos va al TileJSON, nunca a una versión fija: esa
// carpeta (planet/2026xxxx_...) cambia cada semana y la vieja desaparece.
const mosaicos = estilo.sources.openmaptiles;
if (!mosaicos || mosaicos.url !== "https://tiles.openfreemap.org/planet") {
  throw new Error("La fuente openmaptiles ya no es el TileJSON planet: revisar a mano antes de guardar");
}
for (const clave of ["sprite", "glyphs"]) {
  if (!String(estilo[clave]).startsWith("https://tiles.openfreemap.org/")) {
    throw new Error(`${clave} ya no está en tiles.openfreemap.org: revisar a mano antes de guardar`);
  }
}

writeFileSync(DESTINO, JSON.stringify(estilo, null, 1) + "\n");
console.log(`${DESTINO}: ${estilo.layers.length} capas`);
