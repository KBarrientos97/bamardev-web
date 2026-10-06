/**
 * Vista previa de WhatsApp, Facebook y compañía para la página del negocio
 * (`/p/<sub>`) y la reserva online (`/r/<sub>/…`) — B06 de la ronda 1 de QA.
 *
 * Esos lectores no ejecutan JavaScript: de la SPA sólo ven el `index.html`
 * con el título fijo de la app ("BamarDev — Inventario y Punto de Venta") y
 * sin Open Graph. Las Pages Functions de `functions/p` y `functions/r` usan
 * esto para pedirle al backend los datos públicos (`GET /publico/pagina/
 * :sub/og`, el mismo criterio que el acortador en `html-publico.ts`) y
 * devolver el mismo `index.html` con `<title>` y `og:*` adentro.
 *
 * Sólo a los lectores de vista previa (y buscadores): a una persona se le
 * sirve la SPA tal cual, sin esperar al backend. Si el backend no responde a
 * tiempo, también la SPA tal cual: una vista previa pobre es mejor que una
 * página que no abre.
 *
 * Vive en `src/` (y no en `functions/`) para que lo chequee `tsc` y lo pruebe
 * vitest; wrangler lo empaqueta al armar las funciones.
 */

export interface DatosOg {
  titulo: string;
  descripcion: string;
  imagen: string | null;
  url: string;
}

export type DestinoOg =
  | { de: "pagina"; sub: string }
  | { de: "reserva"; sub: string }
  | { de: "promo"; sub: string; slug: string };

const SUB = /^[a-z0-9-]{1,63}$/;
const SLUG = /^[a-z0-9-]{1,80}$/;

/** Qué vista previa corresponde a la ruta, o null si no lleva. */
export function destinoDe(pathname: string): DestinoOg | null {
  const partes = pathname.split("/").filter(Boolean);
  const [raiz, crudo, tercero, cuarto] = partes;
  let sub: string;
  try {
    sub = decodeURIComponent(crudo ?? "").toLowerCase();
  } catch {
    return null;
  }
  if (!SUB.test(sub)) return null;
  if (raiz === "r") return { de: "reserva", sub };
  if (raiz !== "p") return null;
  if (tercero === "promo" && cuarto) {
    const slug = cuarto.toLowerCase();
    return SLUG.test(slug) ? { de: "promo", sub, slug } : { de: "pagina", sub };
  }
  return { de: "pagina", sub };
}

/**
 * Lectores de vista previa y buscadores. La misma lista que el backend
 * (`urls-publicas.ts`, `esLectorDeVistaPrevia`), para que el enlace corto y
 * la página respondan igual a los mismos lectores.
 */
const BOTS =
  /whatsapp|facebookexternalhit|facebot|telegrambot|twitterbot|slackbot|discordbot|linkedinbot|googlebot|bingbot|applebot|embedly|skypeuripreview|pinterest|redditbot|yandex|baiduspider|duckduckbot|ia_archiver|bot\b|crawler|spider|preview/i;

export function esLectorDeVistaPrevia(userAgent: string | null | undefined): boolean {
  return !!userAgent && BOTS.test(userAgent);
}

/**
 * La URL del API. `API_URL` (variable de entorno de Pages) manda; si no está,
 * se deduce del dominio: la web de PROD habla con el API de PROD y todo lo
 * demás (QA, previews, local) con el de QA, que es el lado seguro de errar.
 */
export function baseApi(env: { API_URL?: string } | undefined, hostname: string): string {
  const fija = env?.API_URL?.trim();
  if (fija) return fija.replace(/\/+$/, "");
  if (hostname === "app.bamardev.com" || hostname === "bamar-app.pages.dev") {
    return "https://api.bamardev.com/api";
  }
  return "https://api-qa.bamardev.com/api";
}

/** La ruta del API que da los datos de esa vista previa. */
export function rutaApi(d: DestinoOg): string {
  const sub = encodeURIComponent(d.sub);
  if (d.de === "reserva") return `/publico/pagina/${sub}/og?de=reserva`;
  if (d.de === "promo") return `/publico/promo/${sub}/${encodeURIComponent(d.slug)}`;
  return `/publico/pagina/${sub}/og`;
}

const absoluta = (url: string | null | undefined, base: string) =>
  !url ? null : /^https?:\/\//.test(url) ? url : `${base}${url.startsWith("/") ? "" : "/"}${url}`;

const texto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * La respuesta del API, validada: lo que no tiene la forma esperada es null
 * (y se sirve la SPA sin tocar). La de la promo es su JSON público de siempre.
 */
export function aDatosOg(d: DestinoOg, cuerpo: unknown, base: string): DatosOg | null {
  if (!cuerpo || typeof cuerpo !== "object") return null;
  const c = cuerpo as Record<string, unknown>;
  if (d.de === "promo") {
    const promo = (c.promo ?? {}) as Record<string, unknown>;
    const negocio = (c.negocio ?? {}) as Record<string, unknown>;
    const titulo = texto(promo.nombre, 120);
    const url = texto(promo.url, 500);
    if (!titulo || !url) return null;
    const nombreNegocio = texto(negocio.nombre, 80);
    const descripcion =
      texto(promo.descripcion, 300) || texto(promo.beneficio, 300) || (nombreNegocio ? `Promoción de ${nombreNegocio}` : "");
    return {
      titulo: nombreNegocio ? `${titulo} · ${nombreNegocio}` : titulo,
      descripcion,
      imagen: absoluta(texto(negocio.logoUrl, 500), base),
      url,
    };
  }
  const titulo = texto(c.titulo, 120);
  const url = texto(c.url, 500);
  if (!titulo || !url) return null;
  return {
    titulo,
    descripcion: texto(c.descripcion, 300),
    imagen: absoluta(texto(c.imagen, 500), base),
    url,
  };
}

export function escapar(t: string): string {
  return t
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * El `index.html` con el título y las etiquetas Open Graph. Texto y no
 * HTMLRewriter: el `index.html` es nuestro (lo arma Vite, se conoce entero),
 * y así esto corre igual en vitest que en Cloudflare.
 */
export function inyectarOg(html: string, og: DatosOg): string {
  const metas = [
    `<meta name="description" content="${escapar(og.descripcion)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="BamarDev" />`,
    `<meta property="og:title" content="${escapar(og.titulo)}" />`,
    `<meta property="og:description" content="${escapar(og.descripcion)}" />`,
    `<meta property="og:url" content="${escapar(og.url)}" />`,
    og.imagen
      ? `<meta property="og:image" content="${escapar(og.imagen)}" /><meta name="twitter:card" content="summary_large_image" />`
      : `<meta name="twitter:card" content="summary" />`,
  ].join("\n    ");
  const titulo = `<title>${escapar(og.titulo)}</title>`;
  const conTitulo = /<title>[\s\S]*?<\/title>/i.test(html)
    ? html.replace(/<title>[\s\S]*?<\/title>/i, titulo)
    : html.replace(/<\/head>/i, `  ${titulo}\n  </head>`);
  return conTitulo.replace(/<\/head>/i, `  ${metas}\n  </head>`);
}

/**
 * Las cabeceras de `public/_headers` (B19): Pages NO las aplica a lo que
 * responde una Function, y desde que `/p/*` y `/r/*` pasan por una, hay que
 * ponerlas acá. Si cambia `_headers`, cambia esto (lo cuida un test).
 */
export function cabecerasSeguridad(pathname: string): Record<string, string> {
  if (pathname.startsWith("/r/")) {
    return {
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "DENY",
      "Content-Security-Policy": "frame-ancestors 'none'",
    };
  }
  if (pathname.startsWith("/p/")) {
    return {
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Frame-Options": "DENY",
      "Content-Security-Policy": "frame-ancestors 'none'",
    };
  }
  return {};
}

/** Cuánto se espera al backend antes de servir la SPA sin vista previa. */
export const ESPERA_API_MS = 2500;

export interface Contexto {
  request: Request;
  env?: { API_URL?: string };
  /** El `index.html` de la SPA (en Pages: `env.ASSETS.fetch`). */
  traerIndex: (url: URL) => Promise<Response>;
  /** `fetch` al API (inyectable para los tests). */
  pedirApi: (url: string) => Promise<Response>;
}

/** Lo que responde la Function para una ruta `/p/*` o `/r/*`. */
export async function responder(ctx: Contexto): Promise<Response> {
  const url = new URL(ctx.request.url);
  const index = await ctx.traerIndex(new URL("/", url));
  const cabeceras = new Headers(index.headers);
  for (const [k, v] of Object.entries(cabecerasSeguridad(url.pathname))) cabeceras.set(k, v);
  // La misma URL responde distinto a un lector de vista previa y a una
  // persona: lo que se cachee en el medio tiene que separarlos.
  cabeceras.append("vary", "User-Agent");
  const destino = destinoDe(url.pathname);
  const sinTocar = () => new Response(index.body, { status: index.status, headers: cabeceras });
  if (!index.ok || !destino || !esLectorDeVistaPrevia(ctx.request.headers.get("user-agent"))) {
    return sinTocar();
  }
  const base = baseApi(ctx.env, url.hostname);
  let og: DatosOg | null = null;
  try {
    const r = await ctx.pedirApi(`${base}${rutaApi(destino)}`);
    if (r.ok) og = aDatosOg(destino, await r.json(), base);
  } catch {
    og = null;
  }
  if (!og) return sinTocar();
  const html = inyectarOg(await index.text(), og);
  // El cuerpo cambió: la huella y el largo del index ya no valen.
  cabeceras.delete("etag");
  cabeceras.delete("content-length");
  cabeceras.set("content-type", "text/html; charset=utf-8");
  cabeceras.set("cache-control", "public, max-age=300");
  return new Response(html, { status: 200, headers: cabeceras });
}

/** Lo que Pages le pasa a una Function (lo justo que se usa). */
export interface ContextoPages {
  request: Request;
  env: { ASSETS: { fetch: (input: string) => Promise<Response> }; API_URL?: string };
}

/**
 * El manejador de `functions/p/[[ruta]].ts` y `functions/r/[[ruta]].ts`. El
 * pedido al API se guarda 5 minutos en la caché de Cloudflare (`cf`), así un
 * grupo de WhatsApp que pega el mismo enlace no le pega al backend por cada
 * vista previa.
 */
export function manejarVistaPrevia(ctx: ContextoPages): Promise<Response> {
  return responder({
    request: ctx.request,
    env: ctx.env,
    traerIndex: (url) => ctx.env.ASSETS.fetch(url.toString()),
    pedirApi: (url) =>
      fetch(url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(ESPERA_API_MS),
        cf: { cacheTtl: 300, cacheEverything: true },
      } as RequestInit),
  });
}
