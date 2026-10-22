/**
 * La versión de la app (21-oct): cada build se marca con la hora y el commit,
 * y publica la misma marca en `/version.json`. Con eso la app sabe si quedó
 * vieja sin depender de que el navegador revise el service worker: en QA
 * Cloudflare sirve `sw.js` con 4 horas de caché (pisa el `no-cache` de
 * `_headers`), y un iPhone con la app instalada se quedó con una versión
 * vieja aunque el deploy ya estaba arriba.
 */

/** "2026-10-22T02:40:11Z+28944d4". En los tests y en `npm run dev`, "dev". */
export const VERSION_APP: string = import.meta.env.VITE_VERSION_APP || "dev";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/**
 * "21-oct 22:40 · 28944d4", en la hora de Bolivia: es lo que se lee en el
 * menú para saber qué versión tiene un equipo sin abrir nada técnico.
 */
export function versionLegible(version: string = VERSION_APP): string {
  const [iso, commit] = version.split("+");
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return version;
  // Bolivia es UTC-4 todo el año (sin horario de verano).
  const local = new Date(fecha.getTime() - 4 * 3600_000);
  const dos = (n: number) => String(n).padStart(2, "0");
  const texto = `${local.getUTCDate()}-${MESES[local.getUTCMonth()]} ${dos(local.getUTCHours())}:${dos(local.getUTCMinutes())}`;
  return commit ? `${texto} · ${commit}` : texto;
}

/**
 * La versión publicada ahora. `no-store` y un parámetro distinto cada vez:
 * ni el navegador ni ninguna caché del camino pueden contestar con una vieja.
 * null si no hay red o el archivo no se entiende (no se decide nada con eso).
 */
export async function versionDelServidor(pedir: typeof fetch = fetch): Promise<string | null> {
  try {
    const r = await pedir(`/version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) return null;
    const cuerpo = (await r.json()) as { version?: unknown };
    return typeof cuerpo.version === "string" && cuerpo.version ? cuerpo.version : null;
  } catch {
    return null;
  }
}
