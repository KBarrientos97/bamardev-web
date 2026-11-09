import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  baseApi,
  cabecerasSeguridad,
  destinoDe,
  inyectarOg,
  responder,
  rutaApi,
  type Contexto,
} from "./og";
import { paginaDePrueba } from "./paginaDePrueba";

/** B06: la vista previa de `/p/<sub>` y `/r/<sub>` (Pages Function). */

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

function contexto(ruta: string, ua: string, api: (url: string) => Promise<Response>, env?: { API_URL?: string }) {
  const traerIndex = vi.fn(async () =>
    new Response(INDEX, { status: 200, headers: { "content-type": "text/html", etag: '"abc"' } }),
  );
  const pedirApi = vi.fn(api);
  const ctx: Contexto = {
    request: new Request(`https://app-qa.bamardev.com${ruta}`, { headers: { "user-agent": ua } }),
    env,
    traerIndex,
    pedirApi,
  };
  return { ctx, traerIndex, pedirApi };
}

const json = (cuerpo: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(cuerpo), { status, headers: { "content-type": "application/json" } }));

describe("qué rutas llevan vista previa", () => {
  it("la página, la promo y cualquier pantalla de la reserva", () => {
    expect(destinoDe("/p/bellavista")).toEqual({ de: "pagina", sub: "bellavista" });
    expect(destinoDe("/p/BellaVista/privacidad")).toEqual({ de: "pagina", sub: "bellavista" });
    expect(destinoDe("/p/bellavista/promo/martes-2x1")).toEqual({
      de: "promo",
      sub: "bellavista",
      slug: "martes-2x1",
    });
    expect(destinoDe("/r/bellavista")).toEqual({ de: "reserva", sub: "bellavista" });
    expect(destinoDe("/r/bellavista/reservar/centro")).toEqual({ de: "reserva", sub: "bellavista" });
    expect(destinoDe("/r/bellavista/c/TOKENSECRETO")).toEqual({ de: "reserva", sub: "bellavista" });
  });

  it("nada fuera de /p y /r, ni un subdominio raro", () => {
    expect(destinoDe("/pos")).toBeNull();
    expect(destinoDe("/p")).toBeNull();
    expect(destinoDe("/p/<script>")).toBeNull();
    expect(destinoDe("/r/%E0%A4%A")).toBeNull();
  });

  it("le pregunta al API correcto por la ruta correcta", () => {
    expect(rutaApi({ de: "pagina", sub: "bv" })).toBe("/publico/pagina/bv/og");
    expect(rutaApi({ de: "reserva", sub: "bv" })).toBe("/publico/pagina/bv/og?de=reserva");
    expect(rutaApi({ de: "promo", sub: "bv", slug: "x" })).toBe("/publico/promo/bv/x");
    expect(baseApi(undefined, "app.bamardev.com")).toBe("https://api.bamardev.com/api");
    expect(baseApi(undefined, "app-qa.bamardev.com")).toBe("https://api-qa.bamardev.com/api");
    expect(baseApi(undefined, "localhost")).toBe("https://api-qa.bamardev.com/api");
    expect(baseApi({ API_URL: "http://127.0.0.1:3000/api/" }, "app.bamardev.com")).toBe("http://127.0.0.1:3000/api");
  });
});

describe("inyectarOg", () => {
  it("cambia el título y suma las etiquetas, escapadas", () => {
    const html = inyectarOg(INDEX, {
      titulo: 'Salón "Bella" <Vista>',
      descripcion: "Cortes & color",
      imagen: "https://api-qa.bamardev.com/api/publico/pagina/bv/imagen/LOGO?v=1",
      url: "https://app-qa.bamardev.com/p/bv",
    });
    expect(html).toContain("<title>Salón &quot;Bella&quot; &lt;Vista&gt;</title>");
    expect(html).not.toContain("Inventario y Punto de Venta");
    expect(html).toContain('<meta property="og:title" content="Salón &quot;Bella&quot; &lt;Vista&gt;" />');
    expect(html).toContain('<meta property="og:description" content="Cortes &amp; color" />');
    expect(html).toContain('<meta property="og:image" content="https://api-qa.bamardev.com/api/publico/pagina/bv/imagen/LOGO?v=1" />');
    expect(html).toContain('<meta property="og:url" content="https://app-qa.bamardev.com/p/bv" />');
    // La SPA sigue entera.
    expect(html).toContain('<div id="root"></div>');
    expect(html.indexOf("og:title")).toBeLessThan(html.indexOf("</head>"));
  });
});

describe("responder", () => {
  it("a WhatsApp le da la página con su Open Graph", async () => {
    const { ctx, pedirApi } = contexto("/p/bellavista", WHATSAPP, () =>
      json(paginaDePrueba("https://app-qa.bamardev.com/p")),
    );
    const r = await responder(ctx);
    // La portada se pide entera: de ahí sale también el HTML para buscadores.
    expect(pedirApi).toHaveBeenCalledWith("https://api-qa.bamardev.com/api/publico/pagina/bellavista");
    const html = await r.text();
    expect(r.status).toBe(200);
    expect(html).toContain("<title>Salón Bella Vista · Peluquería</title>");
    expect(html).toContain('<meta property="og:title" content="Salón Bella Vista" />');
    // La imagen relativa del API sale absoluta: WhatsApp no la resuelve.
    expect(html).toContain(
      'content="https://api-qa.bamardev.com/api/publico/pagina/bellavista/imagen/PORTADA?v=9"',
    );
    expect(r.headers.get("etag")).toBeNull();
    expect(r.headers.get("x-frame-options")).toBe("DENY");
    expect(r.headers.get("vary")).toContain("User-Agent");
    // app-qa no se indexa nunca.
    expect(r.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(html).toContain('<meta name="robots" content="noindex, follow" />');
  });

  it("si la respuesta de la página no sirve para el HTML, igual va su Open Graph", async () => {
    const { ctx } = contexto("/p/bellavista", WHATSAPP, () =>
      json({ og: { titulo: "Salón Bella Vista", descripcion: "x", imagen: null, url: "https://app-qa.bamardev.com/p/bellavista" } }),
    );
    const html = await (await responder(ctx)).text();
    expect(html).toContain("<title>Salón Bella Vista</title>");
    expect(html).toContain('<div id="root"></div>');
  });

  it("los lectores de IA que antes no se reconocían reciben la página escrita", async () => {
    for (const ua of [
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-User/1.0; +Claude-User@anthropic.com)",
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot",
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user)",
      "Mozilla/5.0 (compatible; Google-InspectionTool/1.0;)",
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)",
    ]) {
      const { ctx } = contexto("/p/bellavista", ua, () => json(paginaDePrueba()));
      const html = await (await responder(ctx)).text();
      expect(html).toContain("<h1>Salón Bella Vista</h1>");
    }
  });

  it("en PROD la página completa se indexa; una casi vacía, no", async () => {
    const prod = (cuerpo: unknown) => {
      const ctx: Contexto = {
        request: new Request("https://app.bamardev.com/p/bellavista", { headers: { "user-agent": "Googlebot/2.1" } }),
        traerIndex: async () => new Response(INDEX, { status: 200, headers: { "content-type": "text/html" } }),
        pedirApi: () => json(cuerpo),
      };
      return responder(ctx);
    };
    const completa = await prod(paginaDePrueba("https://link.bamardev.com"));
    expect(completa.headers.get("x-robots-tag")).toBeNull();
    expect(await completa.text()).toContain('content="index, follow, max-image-preview:large"');
    const vacia = await prod(paginaDePrueba("https://link.bamardev.com", { sucursales: [], catalogo: null, descripcion: null }));
    expect(await vacia.text()).toContain('<meta name="robots" content="noindex, follow" />');
  });

  it("la reserva: su propio Open Graph y sigue sin indexarse", async () => {
    const { ctx, pedirApi } = contexto("/r/bellavista/reservar", "facebookexternalhit/1.1", () =>
      json({
        titulo: "Salón Bella Vista · Reservá tu turno",
        descripcion: "Elegí el servicio…",
        imagen: null,
        url: "https://app-qa.bamardev.com/r/bellavista/reservar",
      }),
    );
    const r = await responder(ctx);
    expect(pedirApi.mock.calls[0][0]).toContain("/publico/pagina/bellavista/og?de=reserva");
    const html = await r.text();
    expect(html).toContain("Reservá tu turno");
    expect(html).toContain('name="twitter:card" content="summary"');
    expect(r.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(r.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("una promo usa su JSON público", async () => {
    const { ctx } = contexto("/p/bellavista/promo/martes-2x1", WHATSAPP, () =>
      json({
        negocio: { nombre: "Bella Vista", logoUrl: "/publico/pagina/bellavista/imagen/LOGO?v=2" },
        promo: {
          nombre: "Martes 2x1",
          descripcion: null,
          beneficio: "2x1 en cortes",
          url: "https://app-qa.bamardev.com/p/bellavista/promo/martes-2x1",
        },
      }),
    );
    const html = await (await responder(ctx)).text();
    expect(html).toContain("<title>Martes 2x1 · Bella Vista</title>");
    expect(html).toContain('og:description" content="2x1 en cortes"');
  });

  it("a una persona le da la SPA sin tocar y sin esperar al API", async () => {
    const { ctx, pedirApi } = contexto("/p/bellavista", CHROME, () => json({}));
    const r = await responder(ctx);
    expect(pedirApi).not.toHaveBeenCalled();
    expect(await r.text()).toBe(INDEX);
    // Las cabeceras de _headers igual van (una Function no las recibe).
    expect(r.headers.get("x-frame-options")).toBe("DENY");
  });

  it("una página o promo que no existe: 404 sin el título de la app y sin indexar", async () => {
    for (const ruta of ["/p/no-existe", "/p/bellavista/promo/archivada"]) {
      const { ctx } = contexto(ruta, WHATSAPP, () => json({ statusCode: 404 }, 404));
      const r = await responder(ctx);
      expect(r.status).toBe(404);
      const html = await r.text();
      expect(html).toContain("<title>Página no disponible</title>");
      expect(html).not.toContain("Inventario y Punto de Venta");
      expect(html).toContain('<meta name="robots" content="noindex, nofollow" />');
      expect(html).toContain('<div id="root"></div>');
      expect(r.headers.get("x-robots-tag")).toBe("noindex, nofollow");
      expect(r.headers.get("etag")).toBeNull();
      expect(r.headers.get("x-frame-options")).toBe("DENY");
    }
  });

  it("la privacidad y la reserva no se dan por muertas con el 404 de la página", async () => {
    for (const ruta of ["/p/bellavista/privacidad", "/r/bellavista/reservar"]) {
      const { ctx } = contexto(ruta, WHATSAPP, () => json({ statusCode: 404 }, 404));
      const r = await responder(ctx);
      expect(r.status).toBe(200);
      expect(await r.text()).toBe(INDEX);
    }
  });

  it("si el API falla, tarda o responde raro, la SPA sin tocar", async () => {
    for (const api of [
      () => json({ statusCode: 500 }, 500),
      () => json({ statusCode: 429 }, 429),
      () => Promise.reject(new Error("timeout")),
      () => json({ algo: "raro" }),
    ]) {
      const { ctx } = contexto("/p/bellavista", WHATSAPP, api);
      const r = await responder(ctx);
      expect(r.status).toBe(200);
      expect(await r.text()).toBe(INDEX);
    }
  });
});

describe("cabeceras", () => {
  it("son las mismas que public/_headers", () => {
    const archivo = readFileSync(join(process.cwd(), "public", "_headers"), "utf8");
    // Cada bloque: una ruta y sus cabeceras indentadas.
    const bloques = new Map<string, Record<string, string>>();
    let actual: string | null = null;
    for (const linea of archivo.split(/\r?\n/)) {
      if (!linea.trim() || linea.trim().startsWith("#")) continue;
      if (!/^\s/.test(linea)) {
        actual = linea.trim();
        bloques.set(actual, {});
      } else if (actual) {
        const i = linea.indexOf(":");
        bloques.get(actual)![linea.slice(0, i).trim()] = linea.slice(i + 1).trim();
      }
    }
    expect(cabecerasSeguridad("/r/x/reservar")).toEqual(bloques.get("/r/*"));
    expect(cabecerasSeguridad("/p/x")).toEqual(bloques.get("/p/*"));
  });
});
