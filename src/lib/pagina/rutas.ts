/** Rutas públicas de la página del negocio (dentro de la web por ahora). */

/** La reserva online (la hace otro módulo, `/r/...`). */
export const urlReservaDe = (subdominio: string) => `/r/${encodeURIComponent(subdominio)}/reservar`;
export const urlPrivacidadDe = (subdominio: string) => `/p/${encodeURIComponent(subdominio)}/privacidad`;

/**
 * `/p/<subdominio>` y su privacidad se atienden antes de mirar el token (ver
 * RutasPagina.tsx).
 */
export function esRutaDePaginaPublica(pathname: string): boolean {
  // `/p/<negocio>/promo/<slug>`: la página de una promoción (enlaces de
  // campaña, PLAN-CRM-Y-PROMOCIONES §6.6), también sin sesión.
  return /^\/p\/[^/]+(\/privacidad|\/promo\/[^/]+)?\/?$/.test(pathname);
}
