import type { FirebaseApp } from "firebase/app";
import { registrarTokenSiCambio } from "./registroPush";

/**
 * Push en la PWA (FCM). Se baja aparte (import dinámico) y sólo cuando hace
 * falta: la página de prueba (QA) o un navegador que ya dio el permiso. Lo que
 * llega lo muestra el service worker (public/push-sw.js), con la app abierta
 * o cerrada.
 *
 * Un solo proyecto de Firebase (bamardev-tech) para QA y PROD: decisión del
 * dueño (16-oct), para no duplicar la configuración. Nada de esto es secreto:
 * la config web y la clave VAPID pública viajan igual al navegador. Sin
 * Analytics a propósito (la analítica está apagada; ver CLAUDE.md).
 */
const CONFIG = {
  apiKey: "AIzaSyAz5Vj9IdO_5L3y_p3wjDjt6Vinr2NOhLs",
  authDomain: "bamardev-tech.firebaseapp.com",
  projectId: "bamardev-tech",
  storageBucket: "bamardev-tech.firebasestorage.app",
  messagingSenderId: "1034117698431",
  appId: "1:1034117698431:web:f9285b72a6760e5f22804a",
};

/** Clave pública de "Certificados push web" (Cloud Messaging). */
const VAPID =
  "BEFuLdOAfX94Duv0culuRbaocRuVp4G-mVNqWPFrjgKeKJcIFhUkznCPVXAdXFPXQE55BF0oHDAx154QrhHKQrg";

export type ResultadoPush =
  | { ok: true; token: string; registrado: boolean }
  | { ok: false; motivo: string };

let app: FirebaseApp | null = null;

/**
 * El token de FCM de este navegador, con el permiso YA dado (no pregunta
 * nada). Usa el service worker que ya tiene la PWA: no registra otro.
 */
export async function tokenFcm(): Promise<string | null> {
  const { initializeApp } = await import("firebase/app");
  const { getMessaging, getToken, isSupported } = await import("firebase/messaging");
  if (!(await isSupported())) return null;
  const registro = await navigator.serviceWorker.ready;
  app ??= initializeApp(CONFIG);
  const token = await getToken(getMessaging(app), {
    vapidKey: VAPID,
    serviceWorkerRegistration: registro,
  });
  return token || null;
}

/**
 * Pide el permiso (tiene que salir de un toque: iOS no lo deja pedir solo),
 * trae el token y, si hay sesión, lo registra en el backend.
 */
export async function activarPushPrueba(): Promise<ResultadoPush> {
  if (!("serviceWorker" in navigator) || !("Notification" in window)) {
    return { ok: false, motivo: "Este navegador no tiene notificaciones push. En el iPhone: iOS 16.4 o más y la app instalada en la pantalla de inicio." };
  }
  const { isSupported } = await import("firebase/messaging");
  if (!(await isSupported())) {
    return { ok: false, motivo: "Firebase dice que este navegador no soporta push. En el iPhone tiene que estar abierta desde el ícono de inicio, no desde Safari." };
  }
  const permiso = await Notification.requestPermission();
  if (permiso !== "granted") {
    return { ok: false, motivo: `Permiso de notificaciones: ${permiso}. Hay que permitirlo en los ajustes del navegador o del teléfono.` };
  }
  try {
    const token = await tokenFcm();
    if (!token) return { ok: false, motivo: "Firebase no devolvió token." };
    return { ok: true, token, registrado: await registrarTokenSiCambio(token) };
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : String(e) };
  }
}
