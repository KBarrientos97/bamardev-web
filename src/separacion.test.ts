import { describe, expect, it } from "vitest";

/**
 * La página pública del negocio, la reserva y las promos no bajan la app (ver
 * App.tsx). Antes de separarlas, abrir `/p/<negocio>` costaba ≈ 1,5 MB de JS
 * (≈ 440 KB comprimidos): un import estático de más en la entrada alcanza
 * para volver a eso sin que nada falle ni se note en desarrollo. Esto lo
 * detecta leyendo el código: sigue los imports estáticos (los `lazy` e
 * `import()` cortan, que es justamente lo que separa) y revisa a dónde llegan.
 */

// Las fuentes como texto: se leen, no se ejecutan.
const fuentes = import.meta.glob<string>(["/src/**/*.{ts,tsx}", "!/src/**/*.test.{ts,tsx}"], {
  query: "?raw",
  import: "default",
  eager: true,
});

/**
 * Los imports que viajan con el módulo: `import … from`, `export … from` e
 * `import "x"`. Los de sólo tipos (`import type`) no existen en el build.
 */
function importsEstaticos(codigo: string): string[] {
  const sinComentarios = codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const salida: string[] = [];
  const conFrom = /\b(import|export)\s+(type\s+)?([\w\s{},*$]*?)\s*from\s*["']([^"']+)["']/g;
  for (const m of sinComentarios.matchAll(conFrom)) if (!m[2]) salida.push(m[4]);
  for (const m of sinComentarios.matchAll(/\bimport\s*["']([^"']+)["']/g)) salida.push(m[1]);
  return salida;
}

function resolver(desde: string, especificador: string): string {
  if (!especificador.startsWith(".")) return especificador; // un paquete
  const partes = desde.split("/").slice(0, -1);
  for (const p of especificador.split("/")) {
    if (p === "..") partes.pop();
    else if (p !== ".") partes.push(p);
  }
  const base = partes.join("/");
  const candidato = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`].find(
    (c) => c in fuentes,
  );
  return candidato ?? base;
}

/** Todo lo que se baja junto con `entrada`, sin contar lo diferido. */
function cierre(entrada: string): Set<string> {
  const vistos = new Set<string>();
  const pendientes = [entrada];
  while (pendientes.length) {
    const actual = pendientes.pop()!;
    if (vistos.has(actual)) continue;
    vistos.add(actual);
    const codigo = fuentes[actual];
    if (codigo === undefined) continue; // un paquete, un .css o un asset
    for (const e of importsEstaticos(codigo)) pendientes.push(resolver(actual, e));
  }
  return vistos;
}

/** Lo que es de la app (o pesa y sólo la app usa) y lo público no puede arrastrar. */
const DE_LA_APP = [
  "/src/AppNegocio.tsx",
  "/src/store/AuthContext.tsx",
  "/src/components/Layout.tsx",
  "/src/components/MenuLateral.tsx",
  "posthog-js",
  "qrcode",
  "html-to-image",
  "fflate",
];

/** Pantallas de la app: todo `pages/` salvo la página del negocio. */
const esPantallaDeLaApp = (m: string) => m.startsWith("/src/pages/") && !m.startsWith("/src/pages/pagina/");

describe("lo público no baja la app", () => {
  it("el lector de imports ve lo que tiene que ver (si no, el resto no prueba nada)", () => {
    const app = cierre("/src/AppNegocio.tsx");
    expect(app).toContain("/src/store/AuthContext.tsx");
    expect(app).toContain("/src/pages/pos/Pos.tsx");
    expect(app).toContain("/src/components/Layout.tsx");
    expect(importsEstaticos('import type { A } from "./a";\nimport { b, type C } from "./b";\nimport "./c.css";')).toEqual([
      "./b",
      "./c.css",
    ]);
  });

  it("la entrada (main.tsx → App.tsx) no importa la app ni posthog-js", () => {
    const entrada = cierre("/src/main.tsx");
    expect(entrada).toContain("/src/App.tsx");
    expect(entrada).toContain("/src/pages/pagina/RutasPagina.tsx");
    for (const m of DE_LA_APP) expect(entrada, m).not.toContain(m);
    expect([...entrada].filter(esPantallaDeLaApp)).toEqual([]);
    // La API de la app (con el cierre de sesión por 401) tampoco: la entrada
    // sólo decide a dónde ir.
    expect(entrada).not.toContain("/src/lib/api.ts");
  });

  it.each([
    "/src/pages/pagina/RutasPagina.tsx",
    "/src/pages/pagina/RutasLink.tsx",
    "/src/pages/pagina/PaginaPublica.tsx",
    "/src/pages/pagina/PrivacidadNegocio.tsx",
    "/src/pages/pagina/PromoPublica.tsx",
    "/src/publico/ReservaPublica.tsx",
  ])("%s no arrastra la app", (publica) => {
    const modulos = cierre(publica);
    for (const m of DE_LA_APP) expect(modulos, m).not.toContain(m);
    expect([...modulos].filter(esPantallaDeLaApp)).toEqual([]);
    // Ni el editor de la página, que vive al lado.
    expect(modulos).not.toContain("/src/pages/pagina/MiPagina.tsx");
  });
});
