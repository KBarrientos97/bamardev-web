import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ctxDe, type Plantilla } from "../../test/sesiones";
import { puedeVer } from "../permisos";
import {
  RAMAS,
  buscar,
  conBotonFlotante,
  enlaceWhatsapp,
  partesConNegrita,
  reporteDeDestino,
  respuestasVisibles,
  tieneAyuda,
  type ContextoAyuda,
} from "./ayuda";
import { RESPUESTAS } from "./respuestas";

/** Lo que ve alguien de esa plantilla en un restaurante con todo el plan. */
function ctx(plantilla: Plantilla, rubro = "RESTAURANTE", reportes: string[] = ["cierres", "resultado", "descuentos"]): ContextoAyuda {
  const c = ctxDe(plantilla, rubro);
  return { rubro, puede: (s) => puedeVer(c, s), reportesVisibles: new Set(reportes) };
}

const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe("el contenido de la Ayuda", () => {
  it("cada respuesta tiene id único, una rama que existe, título y pasos", () => {
    expect(new Set(ids(RESPUESTAS)).size).toBe(RESPUESTAS.length);
    const ramas = RAMAS.map((r) => r.id);
    for (const r of RESPUESTAS) {
      expect(ramas, r.id).toContain(r.rama);
      expect(r.titulo.trim(), r.id).not.toBe("");
      expect(r.cuerpo.length, r.id).toBeGreaterThan(0);
      expect(r.frases.length, r.id).toBeGreaterThan(0);
    }
  });

  it("los relacionados apuntan a respuestas que existen", () => {
    const todos = new Set(ids(RESPUESTAS));
    for (const r of RESPUESTAS) for (const rel of r.relacionados) expect(todos.has(rel), `${r.id} → ${rel}`).toBe(true);
  });

  it("«Llevame ahí» lleva a una ruta de AppNegocio", () => {
    // Si alguien renombra una pantalla, la Ayuda no puede quedar mandando a la nada.
    const fuente = readFileSync(join(process.cwd(), "src/AppNegocio.tsx"), "utf8");
    const rutas = [...fuente.matchAll(/path="([^"]+)"/g)].map((m) => m[1]);
    for (const r of RESPUESTAS) {
      if (!r.destino) continue;
      // `/reportes/*` cubre `/reportes` y `/reportes/cierres`.
      const ok = rutas.some(
        (ruta) =>
          ruta === r.destino ||
          (ruta.endsWith("/*") && (r.destino === ruta.slice(0, -2) || r.destino!.startsWith(ruta.slice(0, -1)))),
      );
      expect(ok, `${r.id}: ${r.destino}`).toBe(true);
    }
  });

  it("ningún paso se pasa de cinco ni deja negritas sin cerrar", () => {
    for (const r of RESPUESTAS) {
      for (const b of r.cuerpo) if (b.tipo === "pasos") expect(b.items.length, r.id).toBeLessThanOrEqual(5);
      const textos = r.cuerpo.flatMap((b) => (b.tipo === "texto" ? [b.texto] : b.items));
      for (const t of [...textos, ...(r.celular ?? []), r.importante ?? "", r.siNoAparece ?? ""]) {
        expect((t.match(/\*\*/g) ?? []).length % 2, `${r.id}: ${t}`).toBe(0);
      }
    }
  });
});

describe("qué se le ofrece a cada uno", () => {
  it("la feature se prende a mano: sin la lista no aparece", () => {
    expect(tieneAyuda(["pos", "ayuda"])).toBe(true);
    expect(tieneAyuda(["pos"])).toBe(false);
    expect(tieneAyuda(undefined)).toBe(false);
    expect(tieneAyuda([])).toBe(false);
  });

  it("el cajero ve vender y la caja, pero no crear usuarios", () => {
    const vis = ids(respuestasVisibles(RESPUESTAS, ctx("CAJERO")));
    expect(vis).toContain("vender-anular");
    expect(vis).toContain("caja-me-sobro");
    expect(vis).not.toContain("equipo-usuario");
  });

  it("el administrador ve su equipo", () => {
    expect(ids(respuestasVisibles(RESPUESTAS, ctx("ADMIN")))).toContain("equipo-usuario");
  });

  it("los atajos de Reportes sólo con el reporte a la vista", () => {
    expect(reporteDeDestino("/reportes/cierres")).toBe("cierres");
    expect(reporteDeDestino("/reportes")).toBeNull();
    const sinResultado = ids(respuestasVisibles(RESPUESTAS, ctx("ADMIN", "RESTAURANTE", ["cierres"])));
    expect(sinResultado).not.toContain("reportes-estoy-ganando");
    expect(sinResultado).toContain("caja-ver-cierres");
  });

  it("otro rubro no recibe las respuestas del restaurante", () => {
    const vis = respuestasVisibles(RESPUESTAS, ctx("ADMIN", "BARBERIA"));
    expect(vis.every((r) => r.rubros.length === 0 || r.rubros.includes("BARBERIA"))).toBe(true);
    expect(ids(vis)).not.toContain("vender-mesa-llevar");
  });
});

describe("el buscador", () => {
  const vis = respuestasVisibles(RESPUESTAS, ctx("ADMIN"));
  const primera = (t: string) => buscar(t, vis)[0]?.id;

  it("encuentra lo que la gente escribe, sin tildes ni palabras de relleno", () => {
    expect(primera("me sobró plata")).toBe("caja-me-sobro");
    expect(primera("como anulo una venta")).toBe("vender-anular");
    expect(primera("no me deja cerrar la caja")).toBe("caja-no-deja-cerrar");
    expect(primera("cuanto vendi hoy")).toBe("reportes-cuanto-vendi");
  });

  it("lo que no es de la Ayuda no devuelve cualquier cosa", () => {
    expect(buscar("receta de pizza napolitana", vis)).toEqual([]);
    expect(buscar("   ", vis)).toEqual([]);
  });
});

describe("piezas sueltas", () => {
  it("el botón flotante no va donde taparía Cobrar", () => {
    expect(conBotonFlotante("/pos")).toBe(false);
    expect(conBotonFlotante("/salon")).toBe(false);
    expect(conBotonFlotante("/billar/salon")).toBe(false);
    expect(conBotonFlotante("/reportes")).toBe(true);
    expect(conBotonFlotante("/posiciones")).toBe(true);
  });

  it("el WhatsApp sale con el contexto armado", () => {
    const url = enlaceWhatsapp({ negocio: "Pollos Don Omar", alias: "pollosdonomar", rol: "Cajero", donde: "Caja", busco: "me sobro" });
    expect(url.startsWith("https://wa.me/59167865462?text=")).toBe(true);
    const texto = decodeURIComponent(url.split("text=")[1]);
    expect(texto).toContain("Soy Cajero de Pollos Don Omar (pollosdonomar).");
    expect(texto).toContain("Estaba en: Caja.");
    expect(texto).toContain('Busqué: "me sobro".');
  });

  it("los rótulos en negrita se separan del texto", () => {
    expect(partesConNegrita("Tocá **Cobrar** y listo")).toEqual([
      { texto: "Tocá ", negrita: false },
      { texto: "Cobrar", negrita: true },
      { texto: " y listo", negrita: false },
    ]);
  });
});
