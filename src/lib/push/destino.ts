/**
 * A dónde lleva tocar una notificación. El backend manda en `data.url` una
 * ruta de la app ("/reportes/cierres", "/?creditos=comprar"); cualquier otra
 * cosa (una dirección completa, "//otro.sitio", basura) se ignora y se abre el
 * inicio. Una push no tiene que poder sacar a nadie de la app: si algún día se
 * cuela una URL ajena en los datos, lo peor que pasa es que abre "/".
 *
 * `public/push-sw.js` tiene la MISMA regla copiada (el service worker no pasa
 * por Vite y no puede importar esto); `pushSw.test.ts` prueba las dos con la
 * misma tabla para que no se separen.
 */
export const EVENTO_NAVEGAR_PUSH = "bamardev:abrir-url";

export function rutaDePush(url: unknown): string {
  if (typeof url !== "string" || !url.startsWith("/") || url.startsWith("//") || url.startsWith("/\\")) return "/";
  try {
    const base = "https://app.invalid";
    const u = new URL(url, base);
    if (u.origin !== base) return "/";
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return "/";
  }
}
