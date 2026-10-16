import { esHostLink } from "./link";

/**
 * Rutas públicas de la página del negocio. Viven en dos lados con la misma
 * SPA: `app(-qa).bamardev.com/p/<sub>` (y la reserva en `/r/<sub>…`), que
 * siguen andando por los carteles y enlaces ya compartidos, y
 * `link(-qa).bamardev.com/<sub>` con las direcciones cortas (ver `link.ts`).
 * Los enlaces de una página a otra se quedan en el host en el que se entró.
 */

/**
 * ¿Esta pestaña está en el host link? En desarrollo también con
 * `link.localhost:5173`, o con `VITE_HOST_LINK=1` en `.env.local` para el
 * navegador que no resuelve `*.localhost`. Fuera de desarrollo la variable no
 * cuenta: un build con ella puesta no puede esconder la app.
 */
export function enHostLink(): boolean {
  if (typeof location !== "undefined" && esHostLink(location.hostname)) return true;
  return import.meta.env.DEV && import.meta.env.VITE_HOST_LINK === "1";
}

const sub = (subdominio: string) => encodeURIComponent(subdominio);

/** La página del negocio. */
export const urlPaginaDe = (subdominio: string) => (enHostLink() ? `/${sub(subdominio)}` : `/p/${sub(subdominio)}`);

/** La reserva online (la hace otro módulo, `/r/...` en la app). */
export const urlReservaDe = (subdominio: string) =>
  enHostLink() ? `/${sub(subdominio)}/reservar` : `/r/${sub(subdominio)}/reservar`;

export const urlPrivacidadDe = (subdominio: string) => `${urlPaginaDe(subdominio)}/privacidad`;

/** El formulario de preinscripción a un grupo (P2, academias). */
export const urlInscribirmeDe = (subdominio: string, grupoId: number) =>
  `${urlPaginaDe(subdominio)}/inscribirme/${grupoId}`;

/**
 * `/p/<subdominio>` y su privacidad se atienden antes de mirar el token (ver
 * RutasPagina.tsx). En el host link no se usa: ahí no hay app (RutasLink.tsx).
 */
export function esRutaDePaginaPublica(pathname: string): boolean {
  // `/p/<negocio>/promo/<slug>`: la página de una promoción (enlaces de
  // campaña, PLAN-CRM-Y-PROMOCIONES §6.6), también sin sesión.
  // `/p/<negocio>/regalo/<token>`: la gift card que se comparte (IDEAS/6 #6).
  // `/p/<negocio>/inscribirme/<grupo>`: la preinscripción de una academia (P2).
  return /^\/p\/[^/]+(\/privacidad|\/promo\/[^/]+|\/regalo\/[^/]+|\/inscribirme\/\d+)?\/?$/.test(pathname);
}

/**
 * La dirección pública de una gift card, para copiar y mandar por WhatsApp.
 * Absoluta: se comparte fuera de la app. Con el host link si estamos en él.
 */
export function urlRegaloDe(subdominio: string, token: string): string {
  const base = typeof location !== "undefined" ? location.origin : "";
  return `${base}${urlPaginaDe(subdominio)}/regalo/${encodeURIComponent(token)}`;
}
