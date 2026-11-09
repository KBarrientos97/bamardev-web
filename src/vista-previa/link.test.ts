import { describe, expect, it, vi } from "vitest";
import { baseApi } from "./og";
import { responderLink, ROBOTS_PRUEBA, type ContextoLink } from "./link";
import { paginaDePrueba } from "./paginaDePrueba";

/** El middleware de la raíz: el host link y el resto que no se toca. */

const INDEX = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <title>BamarDev — Inventario y Punto de Venta</title>
  </head>
  <body><div id="root"></div></body>
</html>`;

const WHATSAPP = "WhatsApp/2.23.20.0 A";
const CHROME = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36";
const SIGUIENTE = "lo de siempre";

const json = (cuerpo: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(cuerpo), { status, headers: { "content-type": "application/json" } }));

function contexto(
  url: string,
  {
    ua = CHROME,
    metodo = "GET",
    api = () => json({}),
  }: { ua?: string; metodo?: string; api?: (url: string) => Promise<Response> } = {},
) {
  const siguiente = vi.fn(async () => new Response(SIGUIENTE, { status: 200 }));
  const traerIndex = vi.fn(async () =>
    new Response(INDEX, { status: 200, headers: { "content-type": "text/html", etag: '"abc"' } }),
  );
  const pedirApi = vi.fn(api);
  const ctx: ContextoLink = {
    request: new Request(url, { method: metodo, headers: { "user-agent": ua } }),
    siguiente,
    traerIndex,
    pedirApi,
  };
  return { ctx, siguiente, traerIndex, pedirApi };
}

describe("fuera del host link no hace nada", () => {
  it("app, app-qa, pages.dev y localhost siguen de largo sin mirar nada", async () => {
    for (const url of [
      "https://app.bamardev.com/pos",
      "https://app-qa.bamardev.com/",
      "https://app-qa.bamardev.com/p/bellavista",
      "https://app-qa.bamardev.com/r/bellavista/reservar",
      "https://qa.bamar-app.pages.dev/assets/index.js",
      "http://localhost:8788/bellavista",
    ]) {
      const { ctx, siguiente, traerIndex, pedirApi } = contexto(url, { ua: WHATSAPP });
      const r = await responderLink(ctx);
      expect(await r.text()).toBe(SIGUIENTE);
      expect(siguiente).toHaveBeenCalledOnce();
      expect(traerIndex).not.toHaveBeenCalled();
      expect(pedirApi).not.toHaveBeenCalled();
    }
  });
});

describe("en link-qa.bamardev.com", () => {
  it("la raíz va a la landing; robots.txt deja indexar la página sólo en PROD", async () => {
    const raiz = await responderLink(contexto("https://link-qa.bamardev.com/").ctx);
    expect(raiz.status).toBe(302);
    expect(raiz.headers.get("location")).toBe("https://bamardev.com");

    const robots = await responderLink(contexto("https://link.bamardev.com/robots.txt").ctx);
    expect(robots.headers.get("content-type")).toContain("text/plain");
    const texto = await robots.text();
    expect(texto).toContain("Allow: /");
    expect(texto).toContain("Disallow: /*/reservar");

    // QA, la app de QA y las copias de Pages: nada se indexa.
    for (const url of [
      "https://link-qa.bamardev.com/robots.txt",
      "https://app-qa.bamardev.com/robots.txt",
      "https://qa.bamar-app.pages.dev/robots.txt",
    ]) {
      const { ctx, siguiente } = contexto(url);
      expect(await (await responderLink(ctx)).text()).toBe(ROBOTS_PRUEBA);
      expect(siguiente).not.toHaveBeenCalled();
    }
    // La app de PROD sigue con su public/robots.txt.
    const app = contexto("https://app.bamardev.com/robots.txt");
    expect(await (await responderLink(app.ctx)).text()).toBe(SIGUIENTE);
  });

  it("los archivos del build y lo que no es GET siguen de largo", async () => {
    for (const [url, metodo] of [
      ["https://link-qa.bamardev.com/assets/index-abc.js", "GET"],
      ["https://link-qa.bamardev.com/favicon.ico", "GET"],
      ["https://link-qa.bamardev.com/bellavista", "POST"],
    ]) {
      const { ctx, siguiente } = contexto(url, { metodo });
      expect(await (await responderLink(ctx)).text()).toBe(SIGUIENTE);
      expect(siguiente).toHaveBeenCalledOnce();
    }
  });

  it("a una persona le da la SPA sin esperar al API, con las cabeceras de cada página", async () => {
    const pagina = contexto("https://link-qa.bamardev.com/bellavista");
    const r = await responderLink(pagina.ctx);
    expect(r.status).toBe(200);
    expect(await r.text()).toBe(INDEX);
    expect(pagina.pedirApi).not.toHaveBeenCalled();
    expect(pagina.siguiente).not.toHaveBeenCalled();
    expect(r.headers.get("x-frame-options")).toBe("DENY");
    // En QA no se indexa; en PROD, sí.
    expect(r.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    const prod = await responderLink(contexto("https://link.bamardev.com/bellavista").ctx);
    expect(prod.headers.get("x-robots-tag")).toBeNull();

    // La reserva y el enlace de gestión, como `/r/*` en la app.
    for (const ruta of ["/bellavista/reservar", "/bellavista/c/TOKENSECRETO"]) {
      const reserva = await responderLink(contexto(`https://link-qa.bamardev.com${ruta}`).ctx);
      expect(reserva.status).toBe(200);
      expect(reserva.headers.get("x-robots-tag")).toBe("noindex, nofollow");
      expect(reserva.headers.get("referrer-policy")).toBe("no-referrer");
    }
  });

  it("a WhatsApp: el mismo Open Graph que en la app, pedido al API de QA", async () => {
    const pagina = contexto("https://link-qa.bamardev.com/bellavista", {
      ua: WHATSAPP,
      api: () => json(paginaDePrueba()),
    });
    const html = await (await responderLink(pagina.ctx)).text();
    expect(pagina.pedirApi).toHaveBeenCalledWith("https://api-qa.bamardev.com/api/publico/pagina/bellavista");
    expect(html).toContain("<title>Salón Bella Vista · Peluquería</title>");
    expect(html).toContain('<meta property="og:url" content="https://link-qa.bamardev.com/bellavista" />');
    expect(html).toContain('<link rel="canonical" href="https://link-qa.bamardev.com/bellavista" />');
    expect(html).toContain(
      'content="https://api-qa.bamardev.com/api/publico/pagina/bellavista/imagen/PORTADA?v=9"',
    );

    const reserva = contexto("https://link-qa.bamardev.com/bellavista/reservar", { ua: WHATSAPP, api: () => json({}) });
    await responderLink(reserva.ctx);
    expect(reserva.pedirApi.mock.calls[0][0]).toBe(
      "https://api-qa.bamardev.com/api/publico/pagina/bellavista/og?de=reserva",
    );

    const promo = contexto("https://link-qa.bamardev.com/bellavista/promo/martes-2x1", { ua: WHATSAPP, api: () => json({}) });
    await responderLink(promo.ctx);
    expect(promo.pedirApi.mock.calls[0][0]).toBe("https://api-qa.bamardev.com/api/publico/promo/bellavista/martes-2x1");
  });

  it("un negocio que no existe: el mismo 404 sin indexar de la app", async () => {
    const { ctx } = contexto("https://link-qa.bamardev.com/no-existe", { ua: WHATSAPP, api: () => json({}, 404) });
    const r = await responderLink(ctx);
    expect(r.status).toBe(404);
    expect(await r.text()).toContain("<title>Página no disponible</title>");
    expect(r.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it("las direcciones viejas pasan a la corta, con su query", async () => {
    const r = await responderLink(contexto("https://link-qa.bamardev.com/r/bellavista/reservar?servicio=3").ctx);
    expect(r.status).toBe(301);
    expect(r.headers.get("location")).toBe("/bellavista/reservar?servicio=3");
    const p = await responderLink(contexto("https://link-qa.bamardev.com/p/bellavista").ctx);
    expect(p.headers.get("location")).toBe("/bellavista");
  });

  it("lo que no es de una página: 404 amable, sin la app y sin indexar", async () => {
    for (const ruta of ["/inventario/productos", "/bellavista/algo/mas", "/configuracion/negocio"]) {
      const { ctx, pedirApi, siguiente } = contexto(`https://link-qa.bamardev.com${ruta}`);
      const r = await responderLink(ctx);
      expect(r.status).toBe(404);
      const html = await r.text();
      expect(html).toContain("<title>Página no disponible</title>");
      expect(html).not.toContain("Inventario y Punto de Venta");
      // La SPA igual carga y dibuja su "no disponible".
      expect(html).toContain('<div id="root"></div>');
      expect(r.headers.get("x-robots-tag")).toBe("noindex, nofollow");
      expect(r.headers.get("etag")).toBeNull();
      expect(pedirApi).not.toHaveBeenCalled();
      expect(siguiente).not.toHaveBeenCalled();
    }
  });

  it("en PROD (link.bamardev.com) le pregunta al API de PROD", async () => {
    expect(baseApi(undefined, "link.bamardev.com")).toBe("https://api.bamardev.com/api");
    expect(baseApi(undefined, "link-qa.bamardev.com")).toBe("https://api-qa.bamardev.com/api");
    const { ctx, pedirApi } = contexto("https://link.bamardev.com/bellavista", { ua: WHATSAPP, api: () => json({}) });
    await responderLink(ctx);
    expect(pedirApi).toHaveBeenCalledWith("https://api.bamardev.com/api/publico/pagina/bellavista");
  });
});
