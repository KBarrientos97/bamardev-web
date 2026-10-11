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
import { destinoLink, esHostLink, RAIZ_LINK, ROBOTS_LINK } from "../lib/pagina/link";
import { cabecerasSeguridad, inyectarNoDisponible, pedirApiConCache, responder, type Contexto } from "./og";

export interface ContextoLink extends Omit<Contexto, "ruta"> {
  /** Lo que habría respondido Pages sin este middleware. */
  siguiente: () => Promise<Response>;
}

const redirigir = (destino: string, status: 301 | 302) =>
  new Response(null, { status, headers: { location: destino, "cache-control": "public, max-age=300" } });

/** Lo que responde el middleware a cualquier pedido. */
export async function responderLink(ctx: ContextoLink): Promise<Response> {
  const url = new URL(ctx.request.url);
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
      return new Response(ROBOTS_LINK, {
        headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
      });
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
