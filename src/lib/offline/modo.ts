import { abiertaComoApp, esIOS, esLaApp } from "../pwa/entorno";

/**
 * ¿Esta pantalla vende sin internet? (PLAN-IOS F3, decisión del dueño del
 * 13-oct-2026: "igual que Android, pero sólo en modo iOS").
 *
 * Sólo la app instalada en un iPhone o iPad (abierta desde el ícono de
 * inicio). En el navegador común —la compu del local, Safari sin instalar,
 * Chrome de Android— la web sigue como siempre: sin señal no vende. Las
 * razones:
 *
 *  - en el navegador la pestaña se cierra o se recarga sin aviso y la cola se
 *    quedaría en un equipo que nadie vuelve a abrir;
 *  - en Android ya está el APK, que es el que vende sin señal;
 *  - la app instalada guarda el shell entero (service worker), así que abre
 *    sin internet; el navegador no.
 *
 * Todo puro salvo `ventaSinInternet()`, que lee el navegador una vez.
 */
export function modoOfflineDe(e: {
  hostname: string;
  pathname: string;
  userAgent: string;
  maxTouchPoints: number;
  coincide: (consulta: string) => boolean;
  standaloneIOS: boolean | undefined;
  forzado: boolean;
}): boolean {
  if (!esLaApp(e.hostname, e.pathname)) return false;
  if (e.forzado) return true;
  return esIOS(e.userAgent, e.maxTouchPoints) && abiertaComoApp(e.coincide, e.standaloneIOS);
}

/**
 * Para probarlo sin un iPhone: `?offline=1` en la URL lo prende en ese equipo
 * (`?offline=0` lo apaga). Sólo en desarrollo y en QA: en PROD un cajero que
 * reciba el link no puede convertir la compu del local en una caja offline.
 */
const CLAVE_FORZADO = "bamardev.offline.forzado";
const SE_PUEDE_FORZAR = import.meta.env.DEV || import.meta.env.MODE === "qa";

function leerForzado(win: Window): boolean {
  if (!SE_PUEDE_FORZAR) return false;
  try {
    const pedido = new URLSearchParams(win.location.search).get("offline");
    if (pedido === "1") win.localStorage.setItem(CLAVE_FORZADO, "1");
    if (pedido === "0") win.localStorage.removeItem(CLAVE_FORZADO);
    return win.localStorage.getItem(CLAVE_FORZADO) === "1";
  } catch {
    return false;
  }
}

let calculado: boolean | null = null;

/** Se decide una vez por carga: instalar o desinstalar la app recarga igual. */
export function ventaSinInternet(): boolean {
  if (calculado !== null) return calculado;
  if (typeof window === "undefined") return (calculado = false);
  const nav = window.navigator as Navigator & { standalone?: boolean };
  calculado = modoOfflineDe({
    hostname: window.location.hostname,
    pathname: window.location.pathname,
    userAgent: nav.userAgent,
    maxTouchPoints: nav.maxTouchPoints ?? 0,
    coincide: (q) => (typeof window.matchMedia === "function" ? window.matchMedia(q).matches : false),
    standaloneIOS: nav.standalone,
    forzado: leerForzado(window),
  });
  return calculado;
}

/** Para los tests: que la próxima consulta vuelva a mirar el navegador. */
export function fijarVentaSinInternet(valor: boolean | null) {
  calculado = valor;
}
