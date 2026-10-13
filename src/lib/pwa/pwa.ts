import { useSyncExternalStore } from "react";
import { reportarError } from "../telemetria";
import { abiertaComoApp, esLaApp } from "./entorno";

/**
 * La web como app instalable (PWA, PLAN-IOS §8): el manifest, el service
 * worker y lo que la guía de instalar necesita saber. Es el mismo código de
 * siempre; esto sólo le agrega la "cáscara" para que el celular la instale.
 *
 * Vive en la entrada (main.tsx), así que no importa nada de la app: lo
 * público no puede arrastrarla (ver separacion.test.ts).
 */

/** El evento de Chrome/Android para ofrecer instalar. iOS no lo tiene. */
export interface EventoInstalar extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export interface EstadoPwa {
  /** Chrome avisó que se puede instalar: el botón "Instalar" lo usa. */
  instalable: EventoInstalar | null;
  /** Ya corre como app (desde el ícono) o se acaba de instalar. */
  instalada: boolean;
  /** Un deploy nuevo ya está en el celular: falta recargar para usarlo. */
  versionNueva: boolean;
}

let estado: EstadoPwa = { instalable: null, instalada: false, versionNueva: false };
const oyentes = new Set<() => void>();

function cambiar(parcial: Partial<EstadoPwa>) {
  estado = { ...estado, ...parcial };
  for (const avisar of oyentes) avisar();
}

function suscribir(avisar: () => void) {
  oyentes.add(avisar);
  return () => oyentes.delete(avisar);
}

const leer = () => estado;

export function usePwa(): EstadoPwa {
  return useSyncExternalStore(suscribir, leer, leer);
}

/** Para los tests: arrancar de cero. */
export function reiniciarEstadoPwa(inicial: Partial<EstadoPwa> = {}) {
  estado = { instalable: null, instalada: false, versionNueva: false, ...inicial };
  for (const avisar of oyentes) avisar();
}

/** Abre el diálogo de instalar de Chrome. Devuelve si quedó instalada. */
export async function instalar(): Promise<boolean> {
  const evento = estado.instalable;
  if (!evento) return false;
  await evento.prompt();
  const { outcome } = await evento.userChoice;
  // El evento sirve una sola vez: Chrome manda otro si vuelve a ofrecerse.
  cambiar({ instalable: null, instalada: outcome === "accepted" });
  return outcome === "accepted";
}

const esQA = import.meta.env.MODE === "qa";
const NOMBRE = esQA ? "BamarDev QA" : "BamarDev";

/**
 * El manifest y las etiquetas de iOS van por código y no en index.html: el
 * mismo index sirve las páginas públicas de los negocios, y ésas no se
 * instalan como BamarDev (ver `esLaApp`). iOS las lee del documento en el
 * momento de "Agregar a inicio", así que alcanza con que estén para entonces.
 *
 * QA lleva otro nombre e ícono: en un mismo celular conviven las dos y
 * confundirlas es cobrar en la equivocada.
 */
function ponerCabecera(doc: Document) {
  const link = doc.createElement("link");
  link.rel = "manifest";
  link.href = esQA ? "/manifest-qa.webmanifest" : "/manifest.webmanifest";
  doc.head.appendChild(link);

  if (esQA) {
    doc.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')?.setAttribute("href", "/apple-touch-icon-qa.png");
  }

  for (const [name, content] of [
    // Sin manifest (iOS viejo) esto es lo que la abre sin la barra de Safari.
    ["apple-mobile-web-app-capable", "yes"],
    ["mobile-web-app-capable", "yes"],
    // "default": la barra de la hora queda blanca y la app empieza debajo. Con
    // "black-translucent" la cabecera quedaría tapada por la hora.
    ["apple-mobile-web-app-status-bar-style", "default"],
    ["apple-mobile-web-app-title", NOMBRE],
  ]) {
    const meta = doc.createElement("meta");
    meta.name = name;
    meta.content = content;
    doc.head.appendChild(meta);
  }

  // `viewport-fit=cover`: abajo la app llega hasta el borde y el Layout se
  // corre lo que mide la barrita de inicio del iPhone (safe-area). Sólo en la
  // app: las páginas públicas no están preparadas para el notch acostado.
  const viewport = doc.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (viewport && !viewport.content.includes("viewport-fit")) {
    viewport.content = `${viewport.content}, viewport-fit=cover`;
  }
}

/** Cada cuánto, como mucho, se pregunta por una versión nueva al volver a la app. */
const BUSCAR_VERSION_MS = 30 * 60_000;

/**
 * Registra el service worker. Lo genera vite-plugin-pwa (ver vite.config.ts):
 * guarda la app en el celular para que abra sin bajarla, pero NUNCA guarda
 * lo que viene del API, que va siempre por internet.
 *
 * El SW nuevo de un deploy toma el control solo (skipWaiting) y NO recarga
 * la página: un cajero a mitad de un cobro no puede ver la pantalla
 * reiniciarse. Se le avisa ("hay una versión nueva") y recarga cuando quiere;
 * si antes la app pide un pedazo que ya no existe, `recargaPorVersion` hace lo
 * mismo que hacía sin SW.
 */
async function registrar(doc: Document) {
  try {
    const { Workbox } = await import("workbox-window");
    const wb = new Workbox("/sw.js");
    wb.addEventListener("controlling", (e) => {
      if (e.isUpdate) cambiar({ versionNueva: true });
    });
    const registro = await wb.register();
    // Instalada en el iPhone, la app puede quedar días en memoria sin una
    // navegación que dispare la búsqueda: se pregunta al volver a ella.
    let ultima = Date.now();
    doc.addEventListener("visibilitychange", () => {
      if (doc.visibilityState !== "visible" || Date.now() - ultima < BUSCAR_VERSION_MS) return;
      ultima = Date.now();
      registro?.update().catch(() => {
        // Sin red no hay versión que buscar: se reintenta la próxima vez.
      });
    });
  } catch (e) {
    // Sin SW la web anda igual que antes; sólo se pierde lo de instalarla.
    reportarError("pwa.registrar", e, { tipo: "js" });
  }
}

/** Arranque, desde main.tsx. En lo público no hace nada. */
export function iniciarPwa(win: Window = window) {
  if (!esLaApp(win.location.hostname, win.location.pathname)) return;
  ponerCabecera(win.document);

  cambiar({
    instalada: abiertaComoApp(
      (consulta) => !!win.matchMedia?.(consulta)?.matches,
      (win.navigator as Navigator & { standalone?: boolean }).standalone,
    ),
  });
  win.addEventListener("beforeinstallprompt", (e) => {
    // Sin esto Chrome muestra su propia barrita; se ofrece desde el menú.
    e.preventDefault();
    cambiar({ instalable: e as EventoInstalar });
  });
  win.addEventListener("appinstalled", () => cambiar({ instalable: null, instalada: true }));

  // En desarrollo no: un SW en localhost sirve el build viejo y confunde.
  if (!import.meta.env.PROD || !("serviceWorker" in win.navigator)) return;
  const alCargar = () => void registrar(win.document);
  if (win.document.readyState === "complete") alCargar();
  else win.addEventListener("load", alCargar, { once: true });
}

/** La guía de instalar se abre sola una vez por equipo, después del login. */
const CLAVE_OFRECIDA = "bamardev.pwa.ofrecida";

export function yaSeOfrecio(): boolean {
  try {
    return localStorage.getItem(CLAVE_OFRECIDA) === "1";
  } catch {
    // Sin almacenamiento, mejor no insistir en cada pantalla.
    return true;
  }
}

export function marcarOfrecida() {
  try {
    localStorage.setItem(CLAVE_OFRECIDA, "1");
  } catch {
    // Ver `yaSeOfrecio`.
  }
}
