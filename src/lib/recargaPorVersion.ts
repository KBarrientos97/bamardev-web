/**
 * Una pestaña abierta durante un deploy sigue con el `index` viejo, que pide
 * pedazos (`MiPagina-<hash>.js`) de esa versión. Si ya no están (o Cloudflare
 * todavía está publicando la nueva), el servidor responde el `index.html` y el
 * navegador lo rechaza: "Failed to fetch dynamically imported module" y la
 * pantalla de error. Visto en QA el 09-oct al entrar a Mi página.
 *
 * Vite avisa con el evento `vite:preloadError` antes de que el error llegue a
 * React. Ahí se recarga la página UNA vez: baja el `index` nuevo y todo
 * coincide. Si vuelve a fallar enseguida (se cortó internet, el deploy está
 * roto), no se recarga en bucle: se deja ver el error con su "Reintentar".
 */

const CLAVE = "bamar-recarga-por-version";
/** Dentro de esta ventana, una segunda falla no recarga otra vez. */
export const VENTANA_MS = 15_000;

export function debeRecargar(ahora: number, ultima: number | null): boolean {
  return ultima == null || !Number.isFinite(ultima) || ahora - ultima > VENTANA_MS;
}

function leer(storage: Pick<Storage, "getItem"> | null): number | null {
  try {
    const v = storage?.getItem(CLAVE);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

export function instalarRecargaPorVersion(
  win: Pick<Window, "addEventListener"> & { location: Pick<Location, "reload"> } = window,
  storage: Pick<Storage, "getItem" | "setItem"> | null = (() => {
    try {
      return window.sessionStorage;
    } catch {
      return null;
    }
  })(),
  reloj: () => number = Date.now,
): void {
  win.addEventListener("vite:preloadError", (e) => {
    const ahora = reloj();
    if (!debeRecargar(ahora, leer(storage))) return;
    try {
      storage?.setItem(CLAVE, String(ahora));
    } catch {
      // Sin sessionStorage igual se recarga; el bucle lo frena el navegador
      // del usuario, que ve la pantalla en blanco un instante y nada más.
    }
    e.preventDefault();
    win.location.reload();
  });
}
