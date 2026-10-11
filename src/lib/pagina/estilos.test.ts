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
import { ESTILOS_PAGINA, estiloRecomendado, paresDeTexto, tonosPagina } from "./estilosPagina";

/** Las 32 muestras de la página (`pagina/muestras.ts` del backend). */
const MUESTRAS = [
  // Las 12 del 06-oct.
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
  // Las 20 del 08-oct.
  "#8C1D3A",
  "#C0262D",
  "#BE185D",
  "#A21CAF",
  "#92400E",
  "#7A6400",
  "#7C5A45",
  "#6B3F25",
  "#76684F",
  "#4D6B53",
  "#2F6B3A",
  "#047857",
  "#0F766E",
  "#0369A1",
  "#1E3A8A",
  "#6D28D9",
  "#5B2A86",
  "#3F5A6B",
  "#475569",
  "#18181B",
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

describe("estilos de página: todo se lee en cualquier combinación", () => {
  // Estilo × 32 muestras × 11 formas × 10 anuncios, con y sin portada: los
  // tokens de verdad (`tonosPagina`), los mismos que lee VistaPagina.
  it("los textos, los botones y el anuncio automático pasan 4.5:1 sobre su fondo real", () => {
    const fallas: string[] = [];
    for (const estilo of ESTILOS_PAGINA) {
      for (const hex of MUESTRAS) {
        const c = paleta(hex);
        for (const portada of [true, false]) {
          const t = tonosPagina(estilo.clave, c, portada);
          for (const par of paresDeTexto(t)) {
            if (contraste(par.texto, par.fondo) < CONTRASTE_MINIMO) {
              fallas.push(`${estilo.clave} ${hex} ${par.que}: ${par.texto} sobre ${par.fondo}`);
            }
          }
          if (!portada) continue;
          // La de la página y, si la tarjeta de la sucursal es de otra familia (Mosaico), la suya.
          for (const sup of [t.superficie, t.superficieTarjeta]) {
            if (!sup) continue;
            for (const f of FORMAS) {
              const b = estiloBotones(f.clave, c, sup);
              for (const [pieza, p] of Object.entries(b)) {
                if (typeof p === "string") continue;
                for (const fondo of p.fondos) {
                  if (contraste(p.texto, fondo) < CONTRASTE_MINIMO) {
                    fallas.push(`${estilo.clave} ${sup.tipo} ${f.clave} ${pieza} ${hex}: ${p.texto} sobre ${fondo}`);
                  }
                }
              }
            }
          }
          for (const e of ESTILOS_ANUNCIO) {
            const k = coloresAnuncio(e.clave, null, null, c, t.superficie);
            if (k.contraste < CONTRASTE_MINIMO) fallas.push(`${estilo.clave} anuncio ${e.clave} ${hex}: ${k.contraste.toFixed(2)}`);
          }
        }
      }
    }
    expect(fallas).toEqual([]);
  });

  it("fase 2: cada texto se mide contra su fondo real (la tarjeta de Postal, el tinte de Dulce, la crema de Carta, los bloques de Mosaico)", () => {
    const c = paleta("#B23A2E");
    const fondos = (clave: string, portada = true) => paresDeTexto(tonosPagina(clave, c, portada)).map((p) => p.fondo);
    expect(fondos("POSTAL")).toContain("#ffffff");
    expect(fondos("POSTAL", false)).toContain("#ffffff");
    expect(fondos("DULCE")).toContain(c.tinte);
    expect(fondos("CARTA")).toContain("#FFFCF7");
    // El precio de la lista de Carta va sobre la crema, no en una tarjeta.
    expect(paresDeTexto(tonosPagina("CARTA", c)).filter((p) => p.que === "precio").map((p) => p.fondo)).toEqual(["#FFFCF7", "#ffffff"]);
    const mosaico = paresDeTexto(tonosPagina("MOSAICO", c));
    expect(mosaico.map((p) => p.que)).toEqual(
      expect.arrayContaining(["bloque del botón grande", "bloque de una red", "bloque de un botón", "título y precio sobre la foto"]),
    );
    expect(mosaico.find((p) => p.que === "bloque del botón grande")).toMatchObject({ texto: "#ffffff", fondo: c.acento });
    // La sucursal de Mosaico es un bloque oscuro: sus botones chicos, con la superficie oscura.
    expect(tonosPagina("MOSAICO", c).superficieTarjeta?.tipo).toBe("oscura");
  });

  it("con un fondo de anuncio elegido y la letra automática, también en cada estilo", () => {
    const c = paleta("#0C7A55");
    for (const estilo of ESTILOS_PAGINA) {
      const t = tonosPagina(estilo.clave, c);
      for (const fondo of ["#FDE047", "#FFFFFF", "#111827", "#FEF3C7", "#1D4ED8", "#F97316"]) {
        for (const e of ESTILOS_ANUNCIO) {
          expect(coloresAnuncio(e.clave, fondo, null, c, t.superficie).contraste, `${estilo.clave} ${e.clave} ${fondo}`).toBeGreaterThanOrEqual(
            CONTRASTE_MINIMO,
          );
        }
      }
    }
  });

  it("el Clásico pinta los botones y el anuncio exactamente como antes", () => {
    for (const hex of MUESTRAS) {
      const c = paleta(hex);
      const t = tonosPagina("CLASICO", c);
      for (const f of FORMAS) expect(estiloBotones(f.clave, c, t.superficie)).toEqual(estiloBotones(f.clave, c));
      for (const e of ESTILOS_ANUNCIO) expect(coloresAnuncio(e.clave, null, null, c, t.superficie)).toEqual(coloresAnuncio(e.clave, null, null, c));
    }
    // Sin estilo (un backend anterior) es Clásico.
    expect(tonosPagina(undefined, paleta("#0C7A55"))).toEqual(tonosPagina("CLASICO", paleta("#0C7A55")));
  });

  it("sobre el color (Vivo) el botón lleno se invierte y sobre Noche las cajas son oscuras", () => {
    const c = paleta("#C0262D");
    const vivo = estiloBotones("REDONDEADO", c, tonosPagina("VIVO", c).superficie);
    expect(vivo.principal.estilo).toMatchObject({ background: "#ffffff", color: c.oscuro });
    const noche = estiloBotones("REDONDEADO", c, tonosPagina("NOCHE", c).superficie);
    expect(noche.secundario.estilo).toMatchObject({ background: "#1C1C1F", color: "#F4F4F5" });
    expect(noche.principal.estilo).toMatchObject({ background: "#C0262D", color: "#ffffff" });
    // El anuncio automático de Vivo va blanco con letra del color.
    expect(coloresAnuncio("SUAVE", null, null, c, tonosPagina("VIVO", c).superficie)).toMatchObject({ color: "#FFFFFF", texto: c.oscuro });
  });

  it("las fuentes: Vivo baja Poppins en vez de Roboto; los demás, Roboto", () => {
    document.head.querySelectorAll("link").forEach((l) => l.remove());
    cargarFuentesPagina("POPPINS", "VIVO");
    const hojas = Array.from(document.head.querySelectorAll<HTMLLinkElement>("link[rel=stylesheet]"), (l) => l.href);
    expect(hojas.join(" ")).toContain("family=Poppins:wght@400;600;700");
    expect(hojas.join(" ")).not.toContain("Roboto");
    expect(hojas.every((h) => h.includes("display=swap"))).toBe(true);
    document.head.querySelectorAll("link").forEach((l) => l.remove());
  });
});

describe("letra del texto de la fase 2", () => {
  afterEach(() => document.head.querySelectorAll("link").forEach((l) => l.remove()));
  const hojas = () => Array.from(document.head.querySelectorAll<HTMLLinkElement>("link[rel=stylesheet]"), (l) => l.href).join(" ");

  it("cada estilo baja sólo su letra (y no Roboto): Postal Quicksand, Carta y Mosaico Montserrat, Dulce Nunito", () => {
    for (const [estilo, familia] of [
      ["POSTAL", "Quicksand:wght@500;700"],
      ["CARTA", "Montserrat:wght@400;500;700"],
      ["DULCE", "Nunito:wght@400;600;700"],
      ["MOSAICO", "Montserrat:wght@500;700;800"],
    ]) {
      document.head.querySelectorAll("link").forEach((l) => l.remove());
      cargarFuentesPagina(undefined, estilo);
      expect(hojas(), estilo).toContain(`family=${familia}`);
      expect(hojas(), estilo).not.toContain("Roboto");
    }
  });

  it("las letras recomendadas de la fase 2 están en el catálogo de 30", () => {
    for (const clave of ["POSTAL", "CARTA", "DULCE", "MOSAICO"]) {
      const e = ESTILOS_PAGINA.find((x) => x.clave === clave)!;
      expect(LETRAS.some((l) => l.clave === e.letra), clave).toBe(true);
    }
    expect(ESTILOS_PAGINA.find((x) => x.clave === "POSTAL")!).toMatchObject({ letra: "QUICKSAND", forma: "TINTE" });
    expect(ESTILOS_PAGINA.find((x) => x.clave === "CARTA")!).toMatchObject({ letra: "ALFA_SLAB" });
    expect(ESTILOS_PAGINA.find((x) => x.clave === "DULCE")!).toMatchObject({ letra: "FREDOKA", forma: "PILDORA" });
    expect(ESTILOS_PAGINA.find((x) => x.clave === "MOSAICO")!).toMatchObject({ letra: "MONTSERRAT" });
  });
});

describe("sugerencia por rubro", () => {
  it("cada rubro con su estilo; uno que no está en la tabla, Clásico", () => {
    expect(estiloRecomendado("RESTAURANTE")).toBe("VIVO");
    // Fase 2 (09-oct): uñas pasa de Vivo a Dulce.
    expect(estiloRecomendado("UNAS")).toBe("DULCE");
    expect(estiloRecomendado("FARMACIA")).toBe("CLASICO");
    expect(estiloRecomendado("PELUQUERIA")).toBe("BOUTIQUE");
    expect(estiloRecomendado("SPA")).toBe("BOUTIQUE");
    expect(estiloRecomendado("BARBERIA")).toBe("NOCHE");
    expect(estiloRecomendado("VETERINARIA")).toBe("CLASICO");
    expect(estiloRecomendado(undefined)).toBe("CLASICO");
  });

  it("con ítems en el catálogo, al restaurante y a la farmacia les va Carta; al resto no le cambia", () => {
    expect(estiloRecomendado("RESTAURANTE", true)).toBe("CARTA");
    expect(estiloRecomendado("FARMACIA", true)).toBe("CARTA");
    expect(estiloRecomendado("RESTAURANTE", false)).toBe("VIVO");
    expect(estiloRecomendado("FARMACIA", false)).toBe("CLASICO");
    expect(estiloRecomendado("UNAS", true)).toBe("DULCE");
    expect(estiloRecomendado("PELUQUERIA", true)).toBe("BOUTIQUE");
    expect(estiloRecomendado("VETERINARIA", true)).toBe("CLASICO");
  });

  it("los 9 estilos con sus 3 recomendados de cada cosa, válidos", () => {
    expect(ESTILOS_PAGINA.map((e) => e.nombre)).toEqual([
      "Clásico",
      "Vitrina",
      "Vivo",
      "Noche",
      "Boutique",
      "Postal",
      "Carta",
      "Dulce",
      "Mosaico",
    ]);
    for (const e of ESTILOS_PAGINA) {
      expect(e.letras[0]).toBe(e.letra);
      expect(e.formas[0]).toBe(e.forma);
      expect(e.letras.every((l) => LETRAS.some((x) => x.clave === l))).toBe(true);
      expect(e.formas.every((f) => FORMAS.some((x) => x.clave === f))).toBe(true);
      expect(e.colores).toHaveLength(3);
    }
  });
});
