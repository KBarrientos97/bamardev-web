import { abiertaComoApp, esIOS } from "../pwa/entorno";

/**
 * En qué está este navegador con las notificaciones, para la pantalla
 * Notificaciones. Puro (recibe lo que mira), así se prueba con cualquier
 * navegador inventado; `entornoActual()` lo lee del de verdad.
 *
 * - `ios-sin-instalar`: iPhone o iPad abierto desde Safari. Ahí la push web no
 *   existe: sólo llega con la app agregada a la pantalla de inicio (iOS 16.4+).
 *   Va antes que "sin soporte" porque es lo mismo visto desde el navegador,
 *   pero tiene arreglo y hay que decir cuál.
 * - `sin-soporte`: no hay `Notification` o service worker (un navegador viejo,
 *   el de adentro de Instagram, un iPhone con iOS anterior al 16.4).
 * - `denegado`: el usuario dijo que no. El navegador no vuelve a preguntar:
 *   sólo se arregla desde sus ajustes.
 * - `concedido`: ya está; el token se registra solo (ver `registroPush`).
 * - `pendiente`: nunca se preguntó.
 */
export type SituacionPush = "ios-sin-instalar" | "sin-soporte" | "denegado" | "concedido" | "pendiente";

export interface EntornoPush {
  hayNotification: boolean;
  hayServiceWorker: boolean;
  permiso: NotificationPermission | null;
  ios: boolean;
  instalada: boolean;
}

export function situacionPush(e: EntornoPush): SituacionPush {
  if (e.ios && !e.instalada) return "ios-sin-instalar";
  if (!e.hayNotification || !e.hayServiceWorker || e.permiso == null) return "sin-soporte";
  if (e.permiso === "denied") return "denegado";
  if (e.permiso === "granted") return "concedido";
  return "pendiente";
}

export function entornoActual(): EntornoPush {
  const hayNotification = typeof window !== "undefined" && "Notification" in window;
  const nav = navigator as Navigator & { standalone?: boolean };
  return {
    hayNotification,
    hayServiceWorker: "serviceWorker" in navigator,
    permiso: hayNotification ? Notification.permission : null,
    ios: esIOS(nav.userAgent, nav.maxTouchPoints ?? 0),
    instalada: abiertaComoApp((q) => window.matchMedia?.(q).matches ?? false, nav.standalone),
  };
}
