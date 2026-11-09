/**
 * La Pages Function de la raíz (`functions/_middleware.ts`): atiende el host
 * `link(-qa).bamardev.com` (ver `lib/pagina/link.ts`) y deja pasar todo lo
 * demás sin tocarlo.
 *
 * Por qué un middleware en la raíz y no otra cosa: las direcciones cortas
 * (`/<sub>`, `/<sub>/reservar`…) empiezan con un nombre cualquiera, así que
 * sólo una función de la raíz las alcanza; y `_redirects` de Pages no sabe de
 * hosts. El costo es que también ve los pedidos de `app…`: ahí lo primero es
 * `next()`, que sigue exactamente como sin middleware (las Functions de
 * `/p/*` y `/r/*`, o los archivos con `_redirects` y `_headers`). Para que ni
 * eso pase con los archivos del build, `public/_routes.json` los deja afuera
 * de las Functions.
 */
import { destinoLink, esHostLink, paginasDeSitemap, RAIZ_LINK, robotsLink, sitemapXml } from "../lib/pagina/link";
import {
  baseApi,
  cabecerasSeguridad,
  esHostIndexable,
  inyectarNoDisponible,
  pedirApiConCache,
  responder,
  type Contexto,
} from "./og";

/**
 * `robots.txt` de QA, de las copias de Pages y de la PC: nada se indexa
 * (PLAN-PAGINA-PRO M0). Antes `app-qa` dejaba indexar `/p/` con datos de
 * prueba (IDEAS/7 §1).
 */
export const ROBOTS_PRUEBA = `User-agent: *
Disallow: /
`;

const textoPlano = (cuerpo: string) =>
  new Response(cuerpo, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
  });

export interface ContextoLink extends Omit<Contexto, "ruta"> {
  /** Lo que habría respondido Pages sin este middleware. */
  siguiente: () => Promise<Response>;
}

const redirigir = (destino: string, status: 301 | 302) =>
  new Response(null, { status, headers: { location: destino, "cache-control": "public, max-age=300" } });

/** Lo que responde el middleware a cualquier pedido. */
export async function responderLink(ctx: ContextoLink): Promise<Response> {
  const url = new URL(ctx.request.url);
  // Va antes que todo: también en `app-qa`, que no es host link.
  if (url.pathname === "/robots.txt" && !esHostIndexable(url.hostname)) return textoPlano(ROBOTS_PRUEBA);
  if (!esHostLink(url.hostname)) return ctx.siguiente();
  // Sólo se leen páginas: cualquier otro método sigue su camino de siempre.
  if (ctx.request.method !== "GET" && ctx.request.method !== "HEAD") return ctx.siguiente();

  const d = destinoLink(url.pathname);
  switch (d.tipo) {
    case "archivo":
      return ctx.siguiente();
    case "raiz":
      // Como la raíz del acortador (`go.bamardev.com/`, bloque de Caddy).
      return redirigir(RAIZ_LINK, 302);
    case "robots":
      return textoPlano(robotsLink(url.hostname));
    case "sitemap":
      return responderSitemap(ctx, url);
    case "vieja":
      // `link…/p/<sub>` pegado a mano o reescrito: a la forma corta, en el
      // mismo host (la dirección vieja sigue viva en `app…`).
      return redirigir(`${d.corta}${url.search}`, 301);
    case "publica":
      return responder({ ...ctx, ruta: d.larga });
    case "ninguna": {
      // `/pos`, `/inventario/…`: la app no existe acá. El mismo index (la SPA
      // en modo link dibuja "Esta página no está disponible") con un 404 de
      // verdad, sin indexar y sin el título de la app.
      const index = await ctx.traerIndex(new URL("/", url));
      if (!index.ok) return index;
      const cabeceras = new Headers(index.headers);
      for (const [k, v] of Object.entries(cabecerasSeguridad("/p/"))) cabeceras.set(k, v);
      cabeceras.set("X-Robots-Tag", "noindex, nofollow");
      cabeceras.set("content-type", "text/html; charset=utf-8");
      cabeceras.set("cache-control", "public, max-age=60");
      cabeceras.delete("etag");
      cabeceras.delete("content-length");
      return new Response(inyectarNoDisponible(await index.text()), { status: 404, headers: cabeceras });
    }
  }
}

/**
 * `link.bamardev.com/sitemap.xml` (PLAN-PAGINA-PRO M0): las páginas que se
 * ven hoy, de `GET /publico/paginas/sitemap`, con la caché de borde de
 * siempre. Fuera de PROD no hay sitemap (404): QA y las copias de Pages no
 * se indexan. Si el API falla, un 503 corto: Google vuelve a pedirlo, y un
 * sitemap vacío le diría que las páginas ya no existen.
 */
async function responderSitemap(ctx: ContextoLink, url: URL): Promise<Response> {
  if (!esHostIndexable(url.hostname)) {
    return new Response("No hay sitemap en este ambiente.\n", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex, nofollow" },
    });
  }
  try {
    const r = await ctx.pedirApi(`${baseApi(ctx.env, url.hostname)}/publico/paginas/sitemap`);
    if (!r.ok) throw new Error(`API ${r.status}`);
    const paginas = paginasDeSitemap(await r.json(), url.hostname.toLowerCase());
    return new Response(sitemapXml(paginas), {
      headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=600" },
    });
  } catch {
    return new Response("El sitemap no está disponible ahora. Probá en un rato.\n", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8", "retry-after": "600", "cache-control": "no-store" },
    });
  }
}

/** Lo que Pages le pasa a un middleware (lo justo que se usa). */
export interface ContextoMiddleware {
  request: Request;
  env: { ASSETS: { fetch: (input: string) => Promise<Response> }; API_URL?: string };
  next: () => Promise<Response>;
}

/** El manejador de `functions/_middleware.ts`. */
export function manejarLink(ctx: ContextoMiddleware): Promise<Response> {
  return responderLink({
    request: ctx.request,
    env: ctx.env,
    siguiente: () => ctx.next(),
    traerIndex: (url) => ctx.env.ASSETS.fetch(url.toString()),
    pedirApi: pedirApiConCache,
  });
}
