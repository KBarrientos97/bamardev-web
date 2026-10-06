import posthog from "posthog-js";
import { esHostLink } from "./pagina/link";
import { enHostLink } from "./pagina/rutas";

/**
 * Reporte de errores a PostHog. Espejo de `Telemetria.kt` (Android): mismos
 * nombres de evento y de propiedades, para que un error de la web y uno de la
 * app se puedan comparar en el mismo tablero.
 *
 * Por qué existe: el navegador vive en el local del cliente. Si algo falla, esa
 * información se pierde salvo que viaje a algún lado — y en la web ni siquiera
 * hay un logcat que alguien pueda ir a mirar después.
 *
 * Sin VITE_POSTHOG_KEY queda inerte: nada se envía y nada falla. Todas las
 * llamadas van envueltas en try/catch — la telemetría jamás puede romper lo que
 * observa, y menos en un POS a mitad de un cobro.
 *
 * Analytics apagado a propósito (igual que en Android): sin session replay, sin
 * autocapture y sin pageviews automáticos. Esto es un POS con datos de clientes;
 * sólo mandamos errores y su contexto.
 */

let activa = false;

/**
 * Las páginas del cliente final del negocio: la reserva online (`/r/…`, con
 * el token secreto del enlace de gestión en `/r/<sub>/c/<token>`) y la página
 * del negocio (`/p/…`), y TODO el host `link(-qa).bamardev.com`, que no tiene
 * otra cosa (`/<sub>/c/<token>`). **Nada de ellas va a PostHog** (PLAN-AGENDA-
 * BELLEZA §8.6 regla 5): ni la URL, ni el token, ni un identificador en el
 * localStorage de alguien que no es usuario de BamarDev (B01).
 */
export function esRutaPublica(ruta = typeof location === "undefined" ? "" : location.pathname): boolean {
  return enHostLink() || /^\/(r|p)(\/|$)/.test(ruta);
}

/**
 * Último filtro antes de que un evento salga: si la app ya estaba iniciada y
 * se navegó a una ruta pública sin recargar, el evento se descarta (llevaría
 * la URL). Exportado para probarlo.
 */
export function filtrarEvento<T extends { properties?: Record<string, unknown> } | null>(evento: T): T | null {
  if (!evento) return evento;
  const props = evento.properties ?? {};
  const url = String(props.$current_url ?? "");
  const ruta = String(props.$pathname ?? "");
  let deUrl = "";
  let hostUrl = "";
  try {
    if (url) ({ pathname: deUrl, hostname: hostUrl } = new URL(url));
  } catch {
    deUrl = "";
  }
  if (esRutaPublica() || esRutaPublica(ruta) || esRutaPublica(deUrl) || esHostLink(hostUrl)) return null;
  return evento;
}

/** Propiedades que acompañan a TODO evento (el `register` de Android). */
let comunes: Record<string, unknown> = {};

export function iniciarTelemetria() {
  // En una página del cliente final ni se inicia: así tampoco queda un
  // `distinct_id` en su navegador ni se baja ningún script de PostHog.
  if (esRutaPublica()) return;
  const key = import.meta.env.VITE_POSTHOG_KEY?.trim();
  if (!key) {
    console.warn("Sin VITE_POSTHOG_KEY: los errores no se reportarán.");
    return;
  }
  try {
    posthog.init(key, {
      api_host: import.meta.env.VITE_POSTHOG_HOST?.trim() || "https://us.i.posthog.com",
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      disable_session_recording: true,
      // Los errores se mandan a mano desde el interceptor: el handler global
      // de posthog-js duplicaría cada fallo de red que ya reportamos ahí.
      capture_exceptions: false,
      // La configuración remota del proyecto prendía web vitals y los "dead
      // clicks", que mandan la URL sola (con el token del enlace de gestión,
      // B01). Se apagan acá y no se baja ningún script extra.
      capture_performance: false,
      capture_dead_clicks: false,
      capture_heatmaps: false,
      disable_surveys: true,
      disable_web_experiments: true,
      disable_external_dependency_loading: true,
      before_send: filtrarEvento,
      persistence: "localStorage",
    });
    activa = true;

    comunes = {
      // Sin esto, un error del `npm run dev` de un dev se ve igual que uno del
      // navegador que está en el mostrador: hay que poder filtrar production.
      entorno: import.meta.env.MODE,
      cliente: "web",
      // A qué backend apunta este build (QA o prod): un error puede venir de
      // estar pegándole al ambiente equivocado.
      api_url: import.meta.env.VITE_API_URL || "/api",
    };
    posthog.register(comunes);
  } catch (e) {
    console.error("No se pudo iniciar PostHog:", e);
  }
}

/**
 * Asocia los eventos siguientes al usuario logueado, para poder responder "a
 * quién le pasó" sin preguntar. No se envía la contraseña ni el token.
 */
export function identificar(alias: string, username: string, rol: string | null) {
  // El alias va aunque PostHog esté apagado: el interceptor lo adjunta a cada
  // error y en dev sirve igual para leerlo por consola.
  comunes = { ...comunes, negocio_alias: alias };
  if (!activa) return;
  try {
    posthog.register({ negocio_alias: alias });
    // El id incluye el alias: dos negocios pueden tener un "admin" cada uno y
    // no deben mezclarse en el mismo perfil.
    posthog.identify(`${alias}_${username}`, {
      username,
      rol: rol ?? "sin_rol",
      negocio_alias: alias,
    });
  } catch {
    /* la telemetría nunca rompe el login */
  }
}

/** Al cerrar sesión los eventos dejan de atribuirse a ese usuario. */
export function olvidarUsuario() {
  if (!activa) return;
  try {
    posthog.reset();
  } catch {
    /* ídem */
  }
}

/**
 * Reporta un error atrapado. `donde` describe la operación ("cobrar",
 * "abrir caja") o, desde el interceptor, el método y la ruta del request.
 */
export function reportarError(
  donde: string,
  e: unknown,
  extra: Record<string, unknown> = {},
) {
  const error = e instanceof Error ? e : new Error(String(e));
  console.error(`Error en ${donde}`, error);
  if (!activa || esRutaPublica()) return;
  try {
    posthog.capture("error_app", {
      ...comunes,
      donde,
      excepcion: error.name,
      mensaje: error.message || "sin mensaje",
      stack: error.stack?.slice(0, 4000) ?? "",
      ...extra,
    });
  } catch {
    /* ídem */
  }
}
