/**
 * Los íconos propios del negocio («Mis íconos», 16-nov): una foto que el
 * negocio subió y usa como ícono de sus productos. El producto guarda una llave
 * `mio:<token>` en el mismo campo `icono` que las del catálogo; la imagen se
 * pide SIN sesión a `/publico/iconos/<token>`, porque también la dibujan la TV
 * y la página pública.
 *
 * PURO a propósito: no importa `lib/api` ni pide nada. Lo usan
 * `iconosArticulo` e `IconoProducto`, que se dibujan en la TV y en la página
 * pública sin sesión (ver `separacion.test.ts`), y decenas de pruebas que
 * reemplazan `lib/api` por objetos fijos.
 */

/** `mio:` + 24 hex en minúscula (12 bytes al azar). No choca con las del catálogo (`[a-z0-9_]+`). */
const LLAVE_PROPIA = /^mio:([0-9a-f]{24})$/;

/** La misma regla que `lib/api.ts` y la TV: en `npm run dev` queda en `/api` (el proxy de Vite). */
const BASE = import.meta.env.VITE_API_URL || "/api";

/** Si la llave es la de un ícono subido por el negocio. */
export function esLlavePropia(llave: string | null | undefined): llave is string {
  return !!llave && LLAVE_PROPIA.test(llave);
}

/** El token de una llave propia, o null si no lo es. */
export function tokenDeLlave(llave: string | null | undefined): string | null {
  return llave ? (LLAVE_PROPIA.exec(llave)?.[1] ?? null) : null;
}

/**
 * La URL de la imagen de un ícono propio, o null si la llave no es propia. El
 * contenido de un token no cambia nunca: el navegador la guarda para siempre.
 */
export function urlIconoPropio(llave: string | null | undefined): string | null {
  const token = tokenDeLlave(llave);
  return token ? `${BASE}/publico/iconos/${token}` : null;
}

/**
 * La imagen de un ícono de la lista del servidor: por su llave (la MISMA URL
 * que usa el resto de la app, así sale de la caché) o, si la llave no tuviera
 * la forma de siempre, por la `ruta` que manda el servidor.
 */
export function srcDeIconoPropio(icono: { llave: string; ruta: string }): string {
  return urlIconoPropio(icono.llave) ?? `${BASE}${icono.ruta}`;
}

/** Lo más largo que acepta el backend para el nombre de un ícono. */
export const LARGO_NOMBRE_ICONO = 40;

/**
 * El nombre con el que arranca un ícono: el del archivo, sin la extensión ni
 * los guiones bajos de la cámara, y cortado a lo que acepta el backend
 * («coca_cola-2L.jpg» → «coca cola 2L»).
 */
export function nombreDesdeArchivo(archivo: string): string {
  const sinExtension = archivo.replace(/\.[a-z0-9]{2,5}$/i, "");
  const limpio = sinExtension.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return limpio.slice(0, LARGO_NOMBRE_ICONO).trim();
}
