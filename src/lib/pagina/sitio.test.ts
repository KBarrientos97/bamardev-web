import { describe, expect, it } from "vitest";
import { paleta } from "./aspecto";
import { destacadoVigente, progresoSitio, sitioPublicoDe, tieneCorchetes, tonosSitio, videoDe } from "./sitio";
import type { Sitio } from "./tipos";

const SITIO: Sitio = {
  plantilla: "GASTRONOMIA",
  bloques: [
    { tipo: "PORTADA", visible: true, datos: { titulo: "Pollo a la leña", subtitulo: null, fotos: ["FOTO_1", "FOTO_9"] } },
    { tipo: "DESTACADO", visible: true, datos: {} },
    { tipo: "CATALOGO", visible: true, datos: { titulo: "La carta" } },
    { tipo: "QUIENES", visible: false, datos: { titulo: "Quiénes somos", texto: null, desde: null, datos: [], foto: null } },
    { tipo: "GALERIA", visible: true, datos: { titulo: "Galería", fotos: [] } },
    { tipo: "UBICACION", visible: true, datos: { titulo: "Dónde estamos" } },
    {
      tipo: "PREGUNTAS",
      visible: true,
      datos: { titulo: "Preguntas", items: [{ pregunta: "¿Hacen delivery?", respuesta: "Sí, [zonas a las que llegan]." }] },
    },
    { tipo: "RESENAS", visible: false, datos: { googleUrl: null } },
    { tipo: "VIDEO", visible: true, datos: { titulo: null, url: null } },
  ],
};

describe("sitioPublicoDe (como sitioPublico del backend)", () => {
  const urls: Record<string, string> = { FOTO_1: "/f1" };
  const s = sitioPublicoDe(SITIO, (f) => urls[f] ?? null)!;

  it("sólo lo prendido y con contenido, en orden", () => {
    expect(s.bloques.map((b) => b.tipo)).toEqual(["PORTADA", "DESTACADO", "CATALOGO", "UBICACION", "PREGUNTAS"]);
  });

  it("las fotos que no existen se saltean", () => {
    expect(s.bloques[0]).toEqual({ tipo: "PORTADA", titulo: "Pollo a la leña", subtitulo: null, fotos: [{ url: "/f1", leyenda: null }] });
  });

  it("sin sitio, null", () => {
    expect(sitioPublicoDe(null, () => null)).toBeNull();
  });
});

describe("progresoSitio", () => {
  it("cuenta lo que se llena acá y dice lo que falta, en el orden de la página", () => {
    const p = progresoSitio(SITIO);
    // Portada (completa), galería, preguntas y video: 1 de 4.
    expect(p.porcentaje).toBe(25);
    expect(p.faltan.map((f) => f.tipo)).toEqual(["GALERIA", "PREGUNTAS", "VIDEO"]);
    expect(p.faltan[1].texto).toContain("corchetes");
  });

  it("todo lleno = 100 %", () => {
    expect(progresoSitio({ plantilla: "COMERCIO", bloques: [SITIO.bloques[0], SITIO.bloques[2]] }).porcentaje).toBe(100);
  });
});

describe("tieneCorchetes", () => {
  it("marca lo sugerido sin completar", () => {
    expect(tieneCorchetes("Hasta [tiempo] antes")).toBe(true);
    expect(tieneCorchetes("Hasta 2 horas antes")).toBe(false);
    expect(tieneCorchetes(null)).toBe(false);
  });
});

describe("videoDe", () => {
  it("YouTube con miniatura y reproductor sin cookies", () => {
    for (const url of ["https://youtu.be/abcdefghijk", "https://www.youtube.com/watch?v=abcdefghijk", "https://youtube.com/shorts/abcdefghijk"]) {
      expect(videoDe(url)).toEqual({
        red: "YouTube",
        embebido: "https://www.youtube-nocookie.com/embed/abcdefghijk?autoplay=1&rel=0",
        miniatura: "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg",
      });
    }
  });

  it("TikTok y Facebook se abren afuera; lo demás no es un video", () => {
    expect(videoDe("https://www.tiktok.com/@x/video/1")).toEqual({ red: "TikTok", embebido: null, miniatura: null });
    expect(videoDe("https://fb.watch/abc")).toEqual({ red: "Facebook", embebido: null, miniatura: null });
    expect(videoDe("https://vimeo.com/1")).toBeNull();
    expect(videoDe("http://youtu.be/abcdefghijk")).toBeNull();
    expect(videoDe("no es una url")).toBeNull();
  });
});

describe("tonosSitio", () => {
  it("cada plantilla con su fondo, y la letra del texto de un estilo que ya existe", () => {
    const c = paleta("#C0262D");
    expect(tonosSitio("GASTRONOMIA", c).fondo).toBe("#FFFCF7");
    expect(tonosSitio("BELLEZA", c).superficie.tipo).toBe("oscura");
    expect(tonosSitio("COMERCIO", c).familia).toContain("Nunito");
    expect(tonosSitio("BELLEZA", c).familia).toContain("Montserrat");
  });
});

describe("destacadoVigente", () => {
  const d = { tipo: "ALMUERZO", etiqueta: "Almuerzo de hoy", items: [], restante: null, texto: null, descuentoPct: null, turnos: null, publicadoEn: "" };
  it("hasta su hora", () => {
    expect(destacadoVigente({ ...d, hasta: "2026-11-08T19:00:00Z" }, Date.parse("2026-11-08T18:00:00Z"))).toBe(true);
    expect(destacadoVigente({ ...d, hasta: "2026-11-08T19:00:00Z" }, Date.parse("2026-11-08T19:30:00Z"))).toBe(false);
    expect(destacadoVigente(null)).toBe(false);
    expect(destacadoVigente(undefined)).toBe(false);
  });
});
