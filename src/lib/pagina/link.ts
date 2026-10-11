/**
 * `link.bamardev.com` (PROD) y `link-qa.bamardev.com` (QA): la página del
 * negocio y su reserva online con direcciones cortas, servidas por esta misma
 * web (el mismo proyecto de Pages con un dominio más, PLAN-PAGINA-NEGOCIO §5):
 *
 *   link…/<sub>                  la página        (= app…/p/<sub>)
 *   link…/<sub>/privacidad       su privacidad    (= app…/p/<sub>/privacidad)
 *   link…/<sub>/promo/<slug>     una promoción    (= app…/p/<sub>/promo/<slug>)
 *   link…/<sub>/reservar[/<suc>] la reserva       (= app…/r/<sub>/reservar…)
 *   link…/<sub>/c/<token>        gestión de la cita (= app…/r/<sub>/c/<token>)
 *
 * Lo usan la SPA (qué rutas dibujar) y la Pages Function de la raíz (Open
 * Graph y redirecciones), así que no toca `import.meta.env` ni el DOM: corre
 * igual en el navegador, en vitest y en Cloudflare.
 */

/**
 * El host de las páginas públicas. Mismo criterio que el acortador
 * (`/^(go|ir)(-[a-z0-9]+)?\.bamardev\.com$/`): `link`, `link-qa` y cualquier
 * `link-<ambiente>` futuro.
 */
export const HOST_LINK = /^link(-[a-z0-9]+)?\.bamardev\.com$/;

/**
 * ¿Es el host de las páginas públicas? `link.localhost` también, para probar
 * en la PC (Chrome y curl resuelven `*.localhost` solos): ese nombre nunca
 * llega a Cloudflare, así que aceptarlo no abre nada en producción.
 */
export function esHostLink(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return HOST_LINK.test(h) || h === "link.localhost";
}

const SUB = /^[a-z0-9-]{1,63}$/;
const RESTO = /^[A-Za-z0-9_-]{1,120}$/;

/** El segmento del negocio, decodificado y en minúsculas, o null si no sirve. */
export function subDeSegmento(segmento: string | undefined): string | null {
  if (!segmento) return null;
  try {
    const sub = decodeURIComponent(segmento).toLowerCase();
    return SUB.test(sub) ? sub : null;
  } catch {
    return null;
  }
}

/**
 * La dirección larga (`/p/…` o `/r/…`, la que entiende el resto de la web)
 * que corresponde a una dirección corta del host link, o null si esa forma no
 * existe. Sólo se aceptan las cinco formas de arriba: cualquier otra cosa
 * (`/pos`, `/inventario/productos`…) no es una página de nadie.
 */
export function rutaLargaDeLink(pathname: string): string | null {
  const partes = pathname.split("/").filter(Boolean);
  const [crudo, segundo, tercero, ...sobra] = partes;
  const sub = subDeSegmento(crudo);
  if (!sub || sobra.length) return null;
  if (segundo === undefined) return `/p/${sub}`;
  if (segundo === "privacidad" && tercero === undefined) return `/p/${sub}/privacidad`;
  if (segundo === "reservar") {
    if (tercero === undefined) return `/r/${sub}/reservar`;
    return RESTO.test(tercero) ? `/r/${sub}/reservar/${tercero}` : null;
  }
  if ((segundo === "promo" || segundo === "c") && tercero !== undefined && RESTO.test(tercero)) {
    return segundo === "promo" ? `/p/${sub}/promo/${tercero}` : `/r/${sub}/c/${tercero}`;
  }
  return null;
}

/**
 * Al revés: una dirección vieja (`/p/<sub>…` o `/r/<sub>…`) pegada sobre el
 * host link pasa a su forma corta, si la tiene. `/r/<sub>` (la portada mínima
 * de la reserva) va a la página.
 */
export function rutaCortaDeVieja(pathname: string): string | null {
  const partes = pathname.split("/").filter(Boolean);
  const [raiz, crudo, ...resto] = partes;
  if (raiz !== "p" && raiz !== "r") return null;
  const sub = subDeSegmento(crudo);
  if (!sub) return null;
  const corta = `/${[sub, ...resto].join("/")}`;
  return rutaLargaDeLink(corta) ? corta : null;
}

/** Qué hacer con un pedido al host link. */
export type DestinoLink =
  | { tipo: "raiz" }
  | { tipo: "robots" }
  | { tipo: "archivo" }
  | { tipo: "publica"; larga: string }
  | { tipo: "vieja"; corta: string }
  | { tipo: "ninguna" };

/**
 * Los archivos del build (`/assets/…`, el favicon y compañía) se sirven tal
 * cual. Ninguna dirección pública lleva un punto en el último tramo: ni el
 * subdominio, ni el slug, ni el token.
 */
function esArchivo(pathname: string): boolean {
  if (pathname.startsWith("/assets/")) return true;
  const ultimo = pathname.split("/").pop() ?? "";
  return ultimo.includes(".");
}

export function destinoLink(pathname: string): DestinoLink {
  if (pathname === "/" || pathname === "") return { tipo: "raiz" };
  if (pathname === "/robots.txt") return { tipo: "robots" };
  if (esArchivo(pathname)) return { tipo: "archivo" };
  // Primero las viejas: `p` y `r` están reservados, nunca son un negocio.
  const corta = rutaCortaDeVieja(pathname);
  if (corta) return { tipo: "vieja", corta };
  const larga = rutaLargaDeLink(pathname);
  if (larga) return { tipo: "publica", larga };
  return { tipo: "ninguna" };
}

/**
 * `robots.txt` del host link. Al revés que el de la app (que sólo deja
 * `/p/`), acá casi todo es la página de un negocio, que sí se indexa: es su
 * vitrina. La reserva y el enlace de gestión (con el token en la URL) no,
 * igual que `/r/` en la app; además llevan `X-Robots-Tag: noindex`.
 */
export const ROBOTS_LINK = `User-agent: *
Disallow: /*/reservar
Disallow: /*/c/
Allow: /
`;

/** A dónde va la raíz: como `go.bamardev.com/`, a la landing. */
export const RAIZ_LINK = "https://bamardev.com";
