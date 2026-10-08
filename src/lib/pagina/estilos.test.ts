import { afterEach, describe, expect, it } from "vitest";
import { paleta } from "./aspecto";
import {
  cargarCatalogoLetras,
  cargarFuentesPagina,
  coloresAnuncio,
  contraste,
  CONTRASTE_MINIMO,
  ESTILOS_ANUNCIO,
  estiloBotones,
  estiloLetra,
  FORMAS,
  LETRAS,
  letraTitulo,
  textoQueContrasta,
} from "./estilos";

/** Las 12 muestras de la página (`pagina/muestras.ts` del backend). */
const MUESTRAS = [
  "#9B2C6B",
  "#B5285A",
  "#B23A2E",
  "#B4501A",
  "#8A5A0B",
  "#5B7320",
  "#0C7A55",
  "#0F7480",
  "#2565B0",
  "#4B4FB8",
  "#7357B8",
  "#4A4744",
];

describe("contraste", () => {
  it("negro sobre blanco es 21 y un color consigo mismo, 1", () => {
    expect(contraste("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
    expect(contraste("#9B2C6B", "#9B2C6B")).toBe(1);
    expect(textoQueContrasta("#FFFBEB")).toBe("#111827");
    expect(textoQueContrasta("#1D4ED8")).toBe("#FFFFFF");
  });
});

describe("forma de los botones", () => {
  it("hay al menos 9 formas, sin repetir, y las 3 de siempre primero", () => {
    expect(FORMAS.length).toBeGreaterThanOrEqual(9);
    expect(new Set(FORMAS.map((f) => f.clave)).size).toBe(FORMAS.length);
    expect(FORMAS.slice(0, 3).map((f) => f.clave)).toEqual(["REDONDEADO", "PILDORA", "RECTO"]);
  });

  it("las 3 de siempre se pintan igual que antes", () => {
    const c = paleta("#0C7A55");
    const b = estiloBotones("REDONDEADO", c);
    expect(b.principal.estilo).toEqual({
      borderRadius: "14px",
      background: "#0C7A55",
      color: "#ffffff",
      boxShadow: "0 6px 18px rgba(0,0,0,0.12)",
    });
    expect(b.secundario.estilo).toEqual({
      borderRadius: "14px",
      background: "#ffffff",
      border: "1px solid #E5E7EB",
      color: "#1F2937",
    });
    expect(b.chicoDestacado.estilo).toEqual({ borderRadius: 12, border: "none", background: c.tinte, color: c.oscuro });
    expect(estiloBotones("PILDORA", c).chico.estilo.borderRadius).toBe(999);
    expect(estiloBotones("RECTO", c).chico.estilo.borderRadius).toBe(4);
  });

  it("con cualquier forma y cualquier muestra la letra se lee (≥ 4.5:1)", () => {
    for (const hex of MUESTRAS) {
      const c = paleta(hex);
      for (const f of FORMAS) {
        const b = estiloBotones(f.clave, c);
        for (const [pieza, p] of Object.entries(b)) {
          if (typeof p === "string") continue;
          for (const fondo of p.fondos) {
            const r = contraste(p.texto, fondo);
            expect(r, `${f.clave} ${pieza} ${hex}: ${p.texto} sobre ${fondo}`).toBeGreaterThanOrEqual(CONTRASTE_MINIMO);
          }
        }
      }
    }
  });

  it("cada forma nueva cambia algo de verdad", () => {
    const c = paleta("#2565B0");
    const firmas = FORMAS.map((f) => JSON.stringify(estiloBotones(f.clave, c)));
    expect(new Set(firmas).size).toBe(FORMAS.length);
  });
});

describe("letra del nombre", () => {
  it("son 30, de 5 grupos, y las de siempre conservan su clave y su letra", () => {
    expect(LETRAS).toHaveLength(30);
    expect(new Set(LETRAS.map((l) => l.clave)).size).toBe(30);
    expect(new Set(LETRAS.map((l) => l.grupo)).size).toBe(5);
    expect(letraTitulo("MODERNA").familia).toMatch(/^Roboto/);
    expect(letraTitulo("ELEGANTE").familia).toMatch(/Playfair Display/);
    expect(letraTitulo("FUERTE").familia).toMatch(/^Oswald/);
    expect(letraTitulo("NO_EXISTE").clave).toBe("MODERNA");
  });

  it("la Fuerte sigue en mayúsculas y 2 px más grande; las demás no", () => {
    expect(estiloLetra(letraTitulo("FUERTE"), 26)).toMatchObject({ fontSize: 28, textTransform: "uppercase" });
    expect(estiloLetra(letraTitulo("MODERNA"), 26)).toMatchObject({ fontSize: 26, fontWeight: 700, textTransform: undefined });
  });

  it("cada letra pide a Google un peso válido y el título usa ese peso", () => {
    for (const l of LETRAS) {
      const pesos = /wght@([\d;]+)/.exec(l.google)?.[1].split(";").map(Number) ?? [400];
      expect(pesos, l.clave).toContain(l.peso);
    }
  });
});

describe("carga de las letras", () => {
  const hojas = () => Array.from(document.head.querySelectorAll<HTMLLinkElement>("link[rel=stylesheet]"), (l) => l.href);
  afterEach(() => document.head.querySelectorAll("link").forEach((l) => l.remove()));

  it("la página baja Roboto y sólo la letra elegida, una vez", () => {
    cargarFuentesPagina("PACIFICO");
    cargarFuentesPagina("PACIFICO");
    expect(hojas()).toHaveLength(2);
    expect(hojas()[0]).toContain("family=Roboto");
    expect(hojas()[1]).toContain("family=Pacifico");
    expect(hojas().join(" ")).not.toContain("Lobster");
    expect(hojas().every((h) => h.includes("display=swap"))).toBe(true);
  });

  it("la Moderna no pide nada más que Roboto", () => {
    cargarFuentesPagina("MODERNA");
    expect(hojas()).toHaveLength(1);
  });

  it("el catálogo del editor pide las 30 en un solo css2", () => {
    cargarCatalogoLetras();
    const [h] = hojas();
    expect(hojas()).toHaveLength(1);
    expect(h.match(/family=/g)).toHaveLength(29);
  });
});

describe("anuncio destacado", () => {
  const c = paleta("#0C7A55");

  it("10 estilos y SUAVE automático es la franja ámbar de siempre", () => {
    expect(ESTILOS_ANUNCIO).toHaveLength(10);
    expect(ESTILOS_ANUNCIO[0].clave).toBe("SUAVE");
    expect(coloresAnuncio("SUAVE", null, null, c)).toMatchObject({
      color: "#FFFBEB",
      texto: "#78350F",
      icono: "#B45309",
      borde: "#FDE68A",
    });
  });

  it("automático en todos los estilos y muestras: la letra se lee", () => {
    for (const hex of MUESTRAS) {
      for (const e of ESTILOS_ANUNCIO) {
        const k = coloresAnuncio(e.clave, null, null, paleta(hex));
        expect(k.contraste, `${e.clave} ${hex}`).toBeGreaterThanOrEqual(CONTRASTE_MINIMO);
      }
    }
  });

  it("con un fondo elegido y la letra en automático, también", () => {
    for (const fondo of ["#FDE047", "#FFFFFF", "#111827", "#FEF3C7", "#1D4ED8", "#F97316"]) {
      for (const e of ESTILOS_ANUNCIO) {
        expect(coloresAnuncio(e.clave, fondo, null, c).contraste, `${e.clave} ${fondo}`).toBeGreaterThanOrEqual(
          CONTRASTE_MINIMO,
        );
      }
    }
  });

  it("respeta la letra elegida aunque se lea mal (el editor avisa)", () => {
    const k = coloresAnuncio("SOLIDO", "#FDE047", "#FFFFFF", c);
    expect(k.texto).toBe("#FFFFFF");
    expect(k.contraste).toBeLessThan(CONTRASTE_MINIMO);
  });

  it("en contorno, tarjeta y minimalista la letra va sobre blanco, no sobre el color", () => {
    expect(coloresAnuncio("CONTORNO", "#FDE047", null, c).fondosTexto).toEqual(["#FFFFFF"]);
    expect(coloresAnuncio("TARJETA", null, null, c).texto).toBe("#1F2937");
    expect(coloresAnuncio("MINIMAL", null, null, c).fondosTexto).toContain("#F6F7F9");
  });

  it("un color que no es hex se ignora (automático)", () => {
    expect(coloresAnuncio("SOLIDO", "red", "javascript:x", c)).toMatchObject({ color: "#0C7A55", texto: "#FFFFFF" });
  });
});
