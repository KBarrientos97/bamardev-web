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
      json({
        titulo: "Salón Bella Vista",
        descripcion: "Peluquería · Reservas",
        imagen: "/publico/pagina/bellavista/imagen/PORTADA?v=9",
        url: "https://app-qa.bamardev.com/p/bellavista",
      }),
    );
    const r = await responder(ctx);
    expect(pedirApi).toHaveBeenCalledWith("https://api-qa.bamardev.com/api/publico/pagina/bellavista/og");
    const html = await r.text();
    expect(r.status).toBe(200);
    expect(html).toContain("<title>Salón Bella Vista</title>");
    // La imagen relativa del API sale absoluta: WhatsApp no la resuelve.
    expect(html).toContain(
      'content="https://api-qa.bamardev.com/api/publico/pagina/bellavista/imagen/PORTADA?v=9"',
    );
    expect(r.headers.get("etag")).toBeNull();
    expect(r.headers.get("x-frame-options")).toBe("DENY");
    expect(r.headers.get("vary")).toContain("User-Agent");
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

  it("si el API falla, no existe o tarda, la SPA sin tocar", async () => {
    for (const api of [
      () => json({ statusCode: 404 }, 404),
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
