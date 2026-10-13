import { esHostLink } from "../pagina/link";

/**
 * Dónde corre la app, para decidir si se ofrece instalarla y con qué pasos
 * (PLAN-IOS §8). Todo puro: recibe lo que necesita y no toca el DOM, así se
 * prueba con cualquier navegador inventado.
 */

/**
 * ¿Esta pantalla es la app y no la página pública de un negocio? La misma SPA
 * sirve las dos (ver `lib/pagina/rutas.ts`), pero sólo la app se instala: si
 * el cliente de una barbería agrega `/p/<negocio>` a su inicio, tiene que
 * quedarle la página de la barbería y no el login de BamarDev. Por eso en lo
 * público no hay manifest ni service worker (ni se baja nada de más).
 */
export function esLaApp(hostname: string, pathname: string): boolean {
  if (esHostLink(hostname)) return false;
  return !/^\/(p|r)\//.test(pathname);
}

/**
 * iPhone, iPod o iPad. El iPad con iPadOS 13+ se presenta como una Mac
 * ("Macintosh" en el user agent), y lo único que lo delata es la pantalla
 * táctil: ninguna Mac la tiene.
 */
export function esIOS(userAgent: string, maxTouchPoints = 0): boolean {
  if (/iPhone|iPad|iPod/.test(userAgent)) return true;
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1;
}

export function esAndroid(userAgent: string): boolean {
  return /Android/i.test(userAgent);
}

/**
 * Con qué navegador está en iOS: cambian los pasos. Safari tiene Compartir
 * abajo (arriba en el iPad); Chrome lo tiene en la barra de dirección. Los
 * demás (Firefox, los navegadores dentro de Instagram o Facebook) a veces no
 * ofrecen "Agregar a inicio": ahí lo honesto es mandar a Safari.
 */
export type NavegadorIOS = "safari" | "chrome" | "edge" | "otro";

export function navegadorIOS(userAgent: string): NavegadorIOS {
  // Primero lo que se hace pasar por Safari: todos dicen "Safari" al final.
  if (/FBAN|FBAV|Instagram|Line\/|WhatsApp|GSA\//.test(userAgent)) return "otro";
  if (/CriOS/.test(userAgent)) return "chrome";
  if (/EdgiOS/.test(userAgent)) return "edge";
  if (/FxiOS|OPiOS|OPT\//.test(userAgent)) return "otro";
  if (/Safari/.test(userAgent)) return "safari";
  return "otro";
}

/**
 * ¿Ya está abierta como app (desde el ícono de inicio)? En iOS lo dice
 * `navigator.standalone`; en el resto, la media query del modo de pantalla.
 */
export function abiertaComoApp(
  coincide: (consulta: string) => boolean,
  standaloneIOS: boolean | undefined,
): boolean {
  if (standaloneIOS) return true;
  return coincide("(display-mode: standalone)") || coincide("(display-mode: fullscreen)");
}
