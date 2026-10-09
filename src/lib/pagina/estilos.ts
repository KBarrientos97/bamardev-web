import type { CSSProperties } from "react";
import { mezcla, type Paleta } from "./aspecto";
import type { EstiloAnuncio, FormaBotones, Tipografia } from "./tipos";

/**
 * Lo que el dueño elige de su página más allá del color (08-oct): la forma de
 * los botones, la letra del nombre y cómo se ve el anuncio destacado.
 *
 * El backend sólo valida las claves (`pagina/muestras.ts`); cómo se pinta
 * cada una vive acá, y lo usan igual la página pública, la vista previa del
 * editor y las miniaturas de los selectores.
 */

/** Los grises de la página (no los de la app: la página no lee el tema). */
export const GRIS_PAGINA = {
  fondo: "#F6F7F9",
  borde: "#E5E7EB",
  texto: "#1F2937",
  texto2: "#374151",
  texto3: "#6B7280",
};

// ── Contraste (WCAG 2.x) ───────────────────────────────────────────────────

export const CONTRASTE_MINIMO = 4.5;
export const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

function canal(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminancia(hex: string): number {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => canal(parseInt(h.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** De 1 (igual) a 21 (negro sobre blanco). */
export function contraste(a: string, b: string): number {
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (oscuro + 0.05);
}

const TINTA = "#111827";

/** Blanco o casi negro: el que mejor se lea sobre ese fondo. */
export function textoQueContrasta(fondo: string): string {
  return contraste("#FFFFFF", fondo) >= contraste(TINTA, fondo) ? "#FFFFFF" : TINTA;
}

/**
 * El mismo tono, oscurecido hasta que se lea sobre `sobre`; si ni así, casi
 * negro. Con las muestras de la página sale el `oscuro` de la paleta.
 */
export function oscuroLegible(hex: string, sobre = "#FFFFFF"): string {
  for (const t of [0.35, 0.6, 0.75]) {
    const oscuro = mezcla(hex, "#000000", t);
    if (contraste(oscuro, sobre) >= CONTRASTE_MINIMO) return oscuro;
  }
  return TINTA;
}

/**
 * Lo mismo al revés, para los fondos oscuros (estilo Noche): el tono mezclado
 * con blanco de a poco hasta que se lea sobre `sobre`. Así el acento sigue
 * siendo "su" color y no un blanco cualquiera.
 */
export function claroLegible(hex: string, sobre: string): string {
  for (let t = 0; t <= 1.0001; t += 0.04) {
    const claro = mezcla(hex, "#FFFFFF", Math.min(1, t));
    if (contraste(claro, sobre) >= CONTRASTE_MINIMO) return claro;
  }
  return "#FFFFFF";
}

// ── Superficie ─────────────────────────────────────────────────────────────

/**
 * Sobre qué se pintan los botones y el anuncio (estilos de página, 09-oct).
 * Hasta el 09-oct todo iba sobre el gris claro de la página; con los estilos
 * hay página del color del negocio (Vivo) y página oscura (Noche), y un botón
 * blanco con letra gris, o un anuncio sin caja, se tienen que seguir leyendo.
 */
export interface Superficie {
  /** "clara": gris, blanco o marfil; "color": la muestra misma (Vivo); "oscura": Noche. */
  tipo: "clara" | "color" | "oscura";
  /** El fondo de la página: lo que queda detrás de un botón o un anuncio sin caja. */
  fondo: string;
  /** Las tarjetas de sucursal, donde van los botones chicos (o el fondo, si no hay tarjeta). */
  tarjeta: string;
}

/** La de siempre: el gris de la página con tarjetas blancas (estilo Clásico). */
export const SUPERFICIE_CLASICA: Superficie = { tipo: "clara", fondo: GRIS_PAGINA.fondo, tarjeta: "#ffffff" };

/** Los grises de la página oscura (Noche): fondo, tarjeta, borde y textos. */
export const NOCHE = {
  fondo: "#111113",
  tarjeta: "#1C1C1F",
  /** Los botones chicos de las tarjetas: el gris oscuro más claro de la página. */
  chip: "#26262A",
  borde: "#2A2A2E",
  bordeChip: "#3F3F46",
  texto: "#F4F4F5",
  texto2: "#E4E4E7",
  texto3: "#A1A1AA",
};

/**
 * El acento claro de la página oscura: calculado contra el gris oscuro más
 * claro que usa (el de los botones chicos), así se lee también sobre la
 * tarjeta y sobre el fondo, que son más oscuros.
 */
export function acentoNoche(c: Paleta): string {
  return claroLegible(c.acento, NOCHE.chip);
}

/** La letra automática sobre un fondo elegido: blanco si es oscuro; si es claro, su mismo tono oscurecido. */
function letraSobre(fondo: string): string {
  return textoQueContrasta(fondo) === "#FFFFFF" ? "#FFFFFF" : oscuroLegible(fondo, fondo);
}

// ── Forma de los botones ───────────────────────────────────────────────────

export interface Forma {
  clave: FormaBotones;
  nombre: string;
  detalle: string;
}

/**
 * Inspiradas en las páginas "link in bio" (Linktree, Beacons, Stan, Taplink):
 * relleno, contorno, sombra dura, relieve, degradado y cortes. Todas se dicen
 * con estilos en línea (la página no carga hojas de estilo propias).
 */
export const FORMAS: Forma[] = [
  { clave: "REDONDEADO", nombre: "Redondeados", detalle: "Esquinas suaves, la de siempre." },
  { clave: "PILDORA", nombre: "Píldora", detalle: "Bien redondos, como una cápsula." },
  { clave: "RECTO", nombre: "Rectos", detalle: "Esquinas casi en ángulo." },
  { clave: "CONTORNO", nombre: "Contorno", detalle: "Sólo el borde, del color de tu página." },
  { clave: "TINTE", nombre: "Relleno suave", detalle: "Fondo clarito del color de tu página." },
  { clave: "SOMBRA_DURA", nombre: "Sombra marcada", detalle: "Borde negro y sombra corrida, tipo cómic." },
  { clave: "RELIEVE", nombre: "En relieve", detalle: "Con un escalón abajo, como una tecla." },
  { clave: "DEGRADADO", nombre: "Degradado", detalle: "De tu color a uno más oscuro." },
  { clave: "HOJA", nombre: "Hoja", detalle: "Dos esquinas redondas y dos en punta." },
  { clave: "ESQUINA", nombre: "Esquina cortada", detalle: "Esquinas en diagonal, como una etiqueta." },
  { clave: "SUBRAYADO", nombre: "Minimalista", detalle: "Sin caja: una línea de color abajo." },
];

/** Las que el editor muestra a la vista; el resto, en "Más formas". */
export const FORMAS_A_LA_VISTA: FormaBotones[] = ["REDONDEADO", "PILDORA", "RECTO"];

export function nombreForma(clave: string): string {
  return FORMAS.find((f) => f.clave === clave)?.nombre ?? clave;
}

/** Un botón de la página: su estilo y, para el chequeo de contraste, sus colores. */
export interface PiezaBoton {
  /** Sólo lo que cambia con la forma; el tamaño y el armado los pone la vista. */
  estilo: CSSProperties;
  texto: string;
  icono: string;
  /** Sobre qué fondos queda la letra (un degradado tiene dos; uno transparente, los de la página). */
  fondos: string[];
}

export interface EstiloBotones {
  principal: PiezaBoton;
  secundario: PiezaBoton;
  /** Los chicos de las tarjetas de sucursal ("Cómo llegar", "Llamar"). */
  chico: PiezaBoton;
  /** El chico destacado ("Reservar"). */
  chicoDestacado: PiezaBoton;
  /** La flechita de los botones secundarios. */
  flecha: string;
}

function con(p: PiezaBoton, cambios: Partial<Omit<PiezaBoton, "estilo">> & { estilo?: CSSProperties }): PiezaBoton {
  return { ...p, ...cambios, estilo: { ...p.estilo, ...cambios.estilo } };
}

const SOMBRA_SUAVE = "0 6px 18px rgba(0,0,0,0.12)";

function cortes(n: number): string {
  return `polygon(${n}px 0, 100% 0, 100% calc(100% - ${n}px), calc(100% - ${n}px) 100%, 0 100%, 0 ${n}px)`;
}

/** El botón "lleno" de una página que ya es del color del negocio: sombra marcada, sin difuminar. */
const SOMBRA_MARCADA = "0 6px 0 rgba(0,0,0,0.22)";

/**
 * Los neutros de los botones según la superficie: la caja de los secundarios,
 * sus bordes y letras, el tinte y los chicos de las tarjetas. En la clara (y
 * en Vivo, donde los botones son blancos encima del color) son los de siempre.
 */
function neutros(sup: Superficie, c: Paleta) {
  const g = GRIS_PAGINA;
  if (sup.tipo === "oscura") {
    const claro = acentoNoche(c);
    return {
      caja: NOCHE.tarjeta,
      borde: NOCHE.borde,
      texto: NOCHE.texto,
      icono: claro,
      chico: NOCHE.chip,
      bordeChico: NOCHE.bordeChip,
      textoChico: NOCHE.texto,
      destacado: c.acento,
      textoDestacado: "#ffffff",
      flecha: "#71717A",
      // El tinte de la página oscura: el color apenas encendido sobre la tarjeta.
      tinte: mezcla(c.acento, NOCHE.tarjeta, 0.65),
      tintaTinte: NOCHE.texto,
      tenue: mezcla(c.acento, NOCHE.tarjeta, 0.82),
      contorno: claro,
      textoContorno: claro,
      cajaContorno: NOCHE.tarjeta,
      linea: NOCHE.texto,
      sombraDura: claro,
      escalon: "#000000",
      escalonChico: "#000000",
      escalonDestacado: c.oscuro,
      subrayado: claro,
      claro,
    };
  }
  return {
    caja: "#ffffff",
    borde: g.borde,
    texto: g.texto,
    icono: c.oscuro,
    chico: "#ffffff",
    bordeChico: g.borde,
    textoChico: g.texto2,
    destacado: c.tinte,
    textoDestacado: c.oscuro,
    flecha: "#9CA3AF",
    tinte: c.tinte,
    tintaTinte: c.oscuro,
    tenue: mezcla(c.acento, "#ffffff", 0.93),
    contorno: c.acento,
    textoContorno: c.oscuro,
    cajaContorno: "#ffffff",
    linea: TINTA,
    sombraDura: TINTA,
    // Sobre el color (Vivo) el escalón gris se ve sucio: va una sombra negra translúcida.
    escalon: sup.tipo === "color" ? "rgba(0,0,0,0.16)" : "#D1D5DB",
    escalonChico: "#D1D5DB",
    escalonDestacado: mezcla(c.acento, "#ffffff", 0.6),
    subrayado: c.acento,
    claro: c.oscuro,
  };
}

/**
 * Cómo se pintan los botones de la página con esa forma, ese color y sobre
 * esa superficie. Sin superficie es la de siempre (Clásico), y las tres
 * formas de siempre dan exactamente lo de antes (sólo cambia el radio). La
 * letra siempre queda en ≥ 4.5:1 sobre su fondo, con cualquiera de las 32
 * muestras y en cualquier estilo de página (lo prueba estilos.test.ts).
 *
 * Sobre la página del color del negocio (Vivo) el botón lleno se invierte:
 * blanco con letra oscura, porque un botón del mismo color que el fondo no se
 * ve. Sobre la oscura (Noche) las cajas pasan a gris oscuro y el acento de
 * las letras, a su versión clara.
 */
export function estiloBotones(forma: string, c: Paleta, sup: Superficie = SUPERFICIE_CLASICA): EstiloBotones {
  const n = neutros(sup, c);
  const invertido = sup.tipo === "color";
  const radio = forma === "PILDORA" ? "999px" : forma === "RECTO" ? "4px" : "14px";
  const radioChico = forma === "PILDORA" ? 999 : forma === "RECTO" ? 4 : 12;
  const llenoFondo = invertido ? "#ffffff" : c.acento;
  const llenoTexto = invertido ? c.oscuro : "#ffffff";
  const base: EstiloBotones = {
    principal: {
      estilo: {
        borderRadius: radio,
        background: llenoFondo,
        color: llenoTexto,
        boxShadow: invertido ? SOMBRA_MARCADA : SOMBRA_SUAVE,
      },
      texto: llenoTexto,
      icono: llenoTexto,
      fondos: [llenoFondo],
    },
    secundario: {
      estilo: { borderRadius: radio, background: n.caja, border: `1px solid ${n.borde}`, color: n.texto },
      texto: n.texto,
      icono: n.icono,
      fondos: [n.caja],
    },
    chico: {
      estilo: { borderRadius: radioChico, border: `1px solid ${n.bordeChico}`, background: n.chico, color: n.textoChico },
      texto: n.textoChico,
      icono: n.textoChico,
      fondos: [n.chico],
    },
    chicoDestacado: {
      estilo: { borderRadius: radioChico, border: "none", background: n.destacado, color: n.textoDestacado },
      texto: n.textoDestacado,
      icono: n.textoDestacado,
      fondos: [n.destacado],
    },
    flecha: n.flecha,
  };
  const { principal, secundario, chico, chicoDestacado } = base;
  // El chico destacado va sobre la tarjeta: ahí el color de la página sí se ve.
  const lleno: Partial<PiezaBoton> & { estilo: CSSProperties } = {
    estilo: { background: c.acento, color: "#ffffff", border: "none" },
    texto: "#ffffff",
    icono: "#ffffff",
    fondos: [c.acento],
  };

  switch (forma) {
    case "CONTORNO":
      return {
        ...base,
        principal: con(principal, {
          estilo: {
            background: n.cajaContorno,
            border: `2px solid ${n.contorno}`,
            color: n.textoContorno,
            boxShadow: "none",
          },
          texto: n.textoContorno,
          icono: n.textoContorno,
          fondos: [n.cajaContorno],
        }),
        secundario: con(secundario, { estilo: { border: `1.5px solid ${n.contorno}` } }),
        chico: con(chico, {
          estilo: { border: `1px solid ${n.contorno}`, color: n.textoContorno },
          texto: n.textoContorno,
        }),
        chicoDestacado: con(chicoDestacado, lleno),
      };
    case "TINTE":
      return {
        ...base,
        principal: con(principal, {
          estilo: { background: n.tinte, color: n.tintaTinte, boxShadow: "none" },
          texto: n.tintaTinte,
          icono: n.tintaTinte,
          fondos: [n.tinte],
        }),
        secundario: con(secundario, { estilo: { background: n.tenue, border: "none" }, fondos: [n.tenue] }),
        chico: con(chico, { estilo: { background: n.tenue, border: "none" }, fondos: [n.tenue] }),
        chicoDestacado: con(chicoDestacado, lleno),
      };
    case "SOMBRA_DURA":
      return {
        ...base,
        principal: con(principal, {
          estilo: { borderRadius: 10, border: `2px solid ${n.linea}`, boxShadow: `4px 4px 0 ${n.sombraDura}` },
        }),
        secundario: con(secundario, {
          estilo: { borderRadius: 10, border: `2px solid ${n.linea}`, boxShadow: `3px 3px 0 ${n.sombraDura}` },
        }),
        chico: con(chico, {
          estilo: { borderRadius: 8, border: `1.5px solid ${n.linea}`, boxShadow: `2px 2px 0 ${n.sombraDura}` },
        }),
        chicoDestacado: con(chicoDestacado, {
          estilo: { borderRadius: 8, border: `1.5px solid ${n.linea}`, boxShadow: `2px 2px 0 ${n.sombraDura}` },
        }),
        flecha: n.linea,
      };
    case "RELIEVE":
      return {
        ...base,
        principal: con(principal, { estilo: { boxShadow: `0 5px 0 ${c.oscuro}` } }),
        secundario: con(secundario, { estilo: { boxShadow: `0 4px 0 ${n.escalon}` } }),
        chico: con(chico, { estilo: { boxShadow: `0 3px 0 ${n.escalonChico}` } }),
        chicoDestacado: con(chicoDestacado, { estilo: { boxShadow: `0 3px 0 ${n.escalonDestacado}` } }),
      };
    case "DEGRADADO": {
      const degradado = `linear-gradient(135deg, ${c.acento}, ${c.oscuro})`;
      const oscura = sup.tipo === "oscura";
      // El "claro" de los secundarios: de blanco al tinte; en la oscura, de la tarjeta al tenue.
      const desde = oscura ? n.caja : "#ffffff";
      const hasta = oscura ? n.tenue : c.tinte;
      const suave = `linear-gradient(135deg, ${desde}, ${hasta})`;
      const borde = oscura ? `1px solid ${n.borde}` : `1px solid ${mezcla(c.acento, "#ffffff", 0.75)}`;
      return {
        ...base,
        principal: invertido
          ? con(principal, { estilo: { background: suave }, fondos: [desde, hasta] })
          : con(principal, { estilo: { background: degradado }, fondos: [c.acento, c.oscuro] }),
        secundario: con(secundario, { estilo: { background: suave, border: borde }, fondos: [desde, hasta] }),
        chico: con(chico, { estilo: { background: suave, border: borde }, fondos: [desde, hasta] }),
        chicoDestacado: con(chicoDestacado, {
          ...lleno,
          estilo: { ...lleno.estilo, background: degradado },
          fondos: [c.acento, c.oscuro],
        }),
      };
    }
    case "HOJA":
      return {
        ...base,
        principal: con(principal, { estilo: { borderRadius: "22px 4px 22px 4px" } }),
        secundario: con(secundario, { estilo: { borderRadius: "22px 4px 22px 4px" } }),
        chico: con(chico, { estilo: { borderRadius: "14px 3px 14px 3px" } }),
        chicoDestacado: con(chicoDestacado, { estilo: { borderRadius: "14px 3px 14px 3px" } }),
      };
    case "ESQUINA":
      // El recorte se come los bordes y las sombras de las esquinas: en vez
      // de borde, los secundarios van con el tinte para separarse del fondo.
      return {
        ...base,
        principal: con(principal, { estilo: { borderRadius: 0, clipPath: cortes(14), boxShadow: "none" } }),
        secundario: con(secundario, {
          estilo: { borderRadius: 0, clipPath: cortes(12), background: n.tinte, border: "none" },
          fondos: [n.tinte],
        }),
        chico: con(chico, {
          estilo: { borderRadius: 0, clipPath: cortes(7), background: n.tinte, border: "none" },
          fondos: [n.tinte],
        }),
        chicoDestacado: con(chicoDestacado, { ...lleno, estilo: { ...lleno.estilo, borderRadius: 0, clipPath: cortes(7) } }),
      };
    case "SUBRAYADO": {
      const sinCaja: CSSProperties = { borderRadius: 0, background: "transparent", border: "none" };
      // Sin caja la letra queda sobre la página: blanca sobre el color (Vivo);
      // en la clara, sobre el fondo o sobre la tarjeta blanca.
      const sobreColor = sup.tipo === "color";
      const letra = sobreColor ? "#ffffff" : n.texto;
      const fondosSecundario =
        sup.tipo === "clara" ? ["#ffffff", sup.fondo] : sobreColor ? [sup.fondo] : [sup.fondo, sup.tarjeta];
      const destacadoTexto = sup.tipo === "oscura" ? n.claro : chicoDestacado.texto;
      return {
        ...base,
        principal: con(principal, { estilo: { borderRadius: 0, boxShadow: "none" } }),
        secundario: con(secundario, {
          estilo: { ...sinCaja, borderBottom: `2px solid ${sobreColor ? "#ffffff" : n.subrayado}`, color: letra },
          texto: letra,
          icono: sobreColor ? "#ffffff" : secundario.icono,
          fondos: fondosSecundario,
        }),
        chico: con(chico, { estilo: { ...sinCaja, borderBottom: `1px solid ${n.bordeChico}` }, fondos: [sup.tarjeta] }),
        chicoDestacado: con(chicoDestacado, {
          estilo: { ...sinCaja, borderBottom: `2px solid ${n.subrayado}`, fontWeight: 700, color: destacadoTexto },
          texto: destacadoTexto,
          icono: destacadoTexto,
          fondos: [sup.tarjeta],
        }),
        flecha: sobreColor ? "#ffffff" : base.flecha,
      };
    }
    default:
      return base;
  }
}

// ── Letra del nombre ───────────────────────────────────────────────────────

export type GrupoLetra = "Modernas" | "Redondeadas" | "Elegantes" | "Fuertes" | "Manuscritas";

export interface Letra {
  clave: Tipografia;
  nombre: string;
  grupo: GrupoLetra;
  /** La familia con su respaldo, para `font-family`. */
  familia: string;
  /** El `family=` de Google Fonts (css2), con el peso que existe de verdad. */
  google: string;
  /** El grosor del título: el que se baja (pedir uno que no existe la "engorda" falsa). */
  peso: number;
  mayusculas?: boolean;
  /** Píxeles de más (o de menos) para que todas se vean del mismo porte. */
  ajuste?: number;
}

const SANS = "system-ui, sans-serif";
const SERIF = "Georgia, serif";
const DISPLAY = "Impact, sans-serif";
const MANO = "cursive";

/**
 * Las 30 letras, todas de Google Fonts. MODERNA, ELEGANTE y FUERTE son las de
 * siempre (Roboto, Playfair Display y Oswald) con su clave de siempre. Los
 * pesos se verificaron contra la API css2: si uno no existe, Google rechaza
 * el pedido entero.
 */
export const LETRAS: Letra[] = [
  { clave: "MODERNA", nombre: "Moderna", grupo: "Modernas", familia: `Roboto, ${SANS}`, google: "Roboto:wght@400;500;700", peso: 700 },
  { clave: "MONTSERRAT", nombre: "Montserrat", grupo: "Modernas", familia: `Montserrat, ${SANS}`, google: "Montserrat:wght@700", peso: 700 },
  { clave: "POPPINS", nombre: "Poppins", grupo: "Modernas", familia: `Poppins, ${SANS}`, google: "Poppins:wght@700", peso: 700 },
  { clave: "RALEWAY", nombre: "Raleway", grupo: "Modernas", familia: `Raleway, ${SANS}`, google: "Raleway:wght@700", peso: 700 },
  { clave: "JOSEFIN", nombre: "Josefin Sans", grupo: "Modernas", familia: `"Josefin Sans", ${SANS}`, google: "Josefin+Sans:wght@700", peso: 700, ajuste: 1 },

  { clave: "NUNITO", nombre: "Nunito", grupo: "Redondeadas", familia: `Nunito, ${SANS}`, google: "Nunito:wght@800", peso: 800 },
  { clave: "QUICKSAND", nombre: "Quicksand", grupo: "Redondeadas", familia: `Quicksand, ${SANS}`, google: "Quicksand:wght@700", peso: 700 },
  { clave: "COMFORTAA", nombre: "Comfortaa", grupo: "Redondeadas", familia: `Comfortaa, ${SANS}`, google: "Comfortaa:wght@700", peso: 700, ajuste: -1 },
  { clave: "VARELA", nombre: "Varela Round", grupo: "Redondeadas", familia: `"Varela Round", ${SANS}`, google: "Varela+Round", peso: 400 },
  { clave: "FREDOKA", nombre: "Fredoka", grupo: "Redondeadas", familia: `Fredoka, ${SANS}`, google: "Fredoka:wght@600", peso: 600, ajuste: 1 },

  { clave: "ELEGANTE", nombre: "Elegante", grupo: "Elegantes", familia: `"Playfair Display", ${SERIF}`, google: "Playfair+Display:wght@700", peso: 700 },
  { clave: "LORA", nombre: "Lora", grupo: "Elegantes", familia: `Lora, ${SERIF}`, google: "Lora:wght@700", peso: 700 },
  { clave: "MERRIWEATHER", nombre: "Merriweather", grupo: "Elegantes", familia: `Merriweather, ${SERIF}`, google: "Merriweather:wght@700", peso: 700, ajuste: -1 },
  { clave: "CORMORANT", nombre: "Cormorant", grupo: "Elegantes", familia: `"Cormorant Garamond", ${SERIF}`, google: "Cormorant+Garamond:wght@700", peso: 700, ajuste: 4 },
  { clave: "DM_SERIF", nombre: "DM Serif", grupo: "Elegantes", familia: `"DM Serif Display", ${SERIF}`, google: "DM+Serif+Display", peso: 400, ajuste: 1 },
  { clave: "CINZEL", nombre: "Cinzel", grupo: "Elegantes", familia: `Cinzel, ${SERIF}`, google: "Cinzel:wght@700", peso: 700, ajuste: -2 },

  { clave: "FUERTE", nombre: "Fuerte", grupo: "Fuertes", familia: `Oswald, ${DISPLAY}`, google: "Oswald:wght@600", peso: 600, mayusculas: true, ajuste: 2 },
  { clave: "BEBAS", nombre: "Bebas Neue", grupo: "Fuertes", familia: `"Bebas Neue", ${DISPLAY}`, google: "Bebas+Neue", peso: 400, ajuste: 6 },
  { clave: "ANTON", nombre: "Anton", grupo: "Fuertes", familia: `Anton, ${DISPLAY}`, google: "Anton", peso: 400, ajuste: 1 },
  { clave: "ARCHIVO_BLACK", nombre: "Archivo Black", grupo: "Fuertes", familia: `"Archivo Black", ${DISPLAY}`, google: "Archivo+Black", peso: 400, ajuste: -2 },
  { clave: "ABRIL", nombre: "Abril Fatface", grupo: "Fuertes", familia: `"Abril Fatface", ${SERIF}`, google: "Abril+Fatface", peso: 400 },
  { clave: "ALFA_SLAB", nombre: "Alfa Slab", grupo: "Fuertes", familia: `"Alfa Slab One", ${SERIF}`, google: "Alfa+Slab+One", peso: 400, ajuste: -2 },
  { clave: "RIGHTEOUS", nombre: "Righteous", grupo: "Fuertes", familia: `Righteous, ${DISPLAY}`, google: "Righteous", peso: 400 },

  { clave: "PACIFICO", nombre: "Pacifico", grupo: "Manuscritas", familia: `Pacifico, ${MANO}`, google: "Pacifico", peso: 400 },
  { clave: "LOBSTER", nombre: "Lobster", grupo: "Manuscritas", familia: `Lobster, ${MANO}`, google: "Lobster", peso: 400, ajuste: 2 },
  { clave: "DANCING", nombre: "Dancing Script", grupo: "Manuscritas", familia: `"Dancing Script", ${MANO}`, google: "Dancing+Script:wght@700", peso: 700, ajuste: 4 },
  { clave: "GREAT_VIBES", nombre: "Great Vibes", grupo: "Manuscritas", familia: `"Great Vibes", ${MANO}`, google: "Great+Vibes", peso: 400, ajuste: 8 },
  { clave: "CAVEAT", nombre: "Caveat", grupo: "Manuscritas", familia: `Caveat, ${MANO}`, google: "Caveat:wght@700", peso: 700, ajuste: 6 },
  { clave: "KAUSHAN", nombre: "Kaushan Script", grupo: "Manuscritas", familia: `"Kaushan Script", ${MANO}`, google: "Kaushan+Script", peso: 400, ajuste: 1 },
  { clave: "MARKER", nombre: "Marcador", grupo: "Manuscritas", familia: `"Permanent Marker", ${MANO}`, google: "Permanent+Marker", peso: 400 },
];

export const GRUPOS_LETRA: GrupoLetra[] = ["Modernas", "Redondeadas", "Elegantes", "Fuertes", "Manuscritas"];

/** Las que el editor muestra a la vista; el resto, en "Más letras". */
export const LETRAS_A_LA_VISTA: Tipografia[] = ["MODERNA", "ELEGANTE", "FUERTE"];

/** La letra de esa clave; una desconocida cae en la Moderna. */
export function letraTitulo(clave: string): Letra {
  return LETRAS.find((l) => l.clave === clave) ?? LETRAS[0];
}

/** El estilo del título (o de cualquier texto) escrito con esa letra. */
export function estiloLetra(l: Letra, tamano: number): CSSProperties {
  return {
    fontFamily: l.familia,
    fontWeight: l.peso,
    fontSize: tamano + (l.ajuste ?? 0),
    textTransform: l.mayusculas ? "uppercase" : undefined,
    letterSpacing: l.mayusculas ? "0.01em" : undefined,
  };
}

const CSS2 = "https://fonts.googleapis.com/css2?";

function urlFuentes(familias: string[]): string {
  return `${CSS2}${familias.map((f) => `family=${f}`).join("&")}&display=swap`;
}

function ponerHoja(id: string, href: string): void {
  if (typeof document === "undefined" || document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

/**
 * La letra del texto (no del nombre) de los estilos de página que no usan
 * Roboto. El resto (Clásico, Vitrina, Noche) sigue en Roboto.
 */
export const LETRA_TEXTO: Record<string, { familia: string; google: string }> = {
  VIVO: { familia: `Poppins, ${SANS}`, google: "Poppins:wght@400;600;700" },
  BOUTIQUE: { familia: `Lora, ${SERIF}`, google: "Lora:ital,wght@0,400;0,600;1,400" },
};

/** El `font-family` del texto de la página con ese estilo. */
export function familiaTexto(estilo?: string | null): string {
  return LETRA_TEXTO[estilo ?? ""]?.familia ?? "Roboto, system-ui, sans-serif";
}

/**
 * La letra del texto de la página (Roboto, o la del estilo) y, si se pasa, la
 * del nombre. Sólo esas: el cliente del negocio no baja las 30. La app no usa
 * estas letras, así que no van en `index.html`.
 */
export function cargarFuentesPagina(tipografia?: string, estilo?: string | null): void {
  const texto = LETRA_TEXTO[estilo ?? ""];
  if (texto) ponerHoja(`fuentes-pagina-texto-${estilo!.toLowerCase()}`, urlFuentes([texto.google]));
  else ponerHoja("fuentes-pagina", urlFuentes([LETRAS[0].google]));
  if (!tipografia) return;
  const l = letraTitulo(tipografia);
  if (l.clave === "MODERNA") return;
  ponerHoja(`fuentes-pagina-${l.clave.toLowerCase()}`, urlFuentes([l.google]));
}

/**
 * Las letras de las miniaturas del popup de estilos: el texto de cada estilo
 * y su letra recomendada. Sólo al abrir el popup, como "Más letras".
 */
export function cargarFuentesEstilos(letras: string[]): void {
  for (const [estilo, t] of Object.entries(LETRA_TEXTO)) {
    ponerHoja(`fuentes-pagina-texto-${estilo.toLowerCase()}`, urlFuentes([t.google]));
  }
  for (const clave of letras) cargarFuentesPagina(clave);
}

/**
 * Las 30 de una vez, en un solo pedido css2: sólo para el selector "Más
 * letras" del editor, que las muestra todas. El navegador baja cada archivo
 * recién cuando lo usa, y con `display=swap` el nombre se ve desde el vamos.
 */
export function cargarCatalogoLetras(): void {
  ponerHoja("fuentes-pagina-catalogo", urlFuentes(LETRAS.slice(1).map((l) => l.google)));
}

// ── Anuncio destacado ──────────────────────────────────────────────────────

export interface Estilo {
  clave: EstiloAnuncio;
  nombre: string;
}

export const ESTILOS_ANUNCIO: Estilo[] = [
  { clave: "SUAVE", nombre: "Franja suave" },
  { clave: "SOLIDO", nombre: "Franja llena" },
  { clave: "CONTORNO", nombre: "Contorno" },
  { clave: "PILDORA", nombre: "Píldora" },
  { clave: "CINTA", nombre: "Cinta" },
  { clave: "ICONO", nombre: "Ícono grande" },
  { clave: "MARQUESINA", nombre: "Marquesina" },
  { clave: "TARJETA", nombre: "Tarjeta" },
  { clave: "DEGRADADO", nombre: "Degradado" },
  { clave: "MINIMAL", nombre: "Minimalista" },
];

/** Si el color "del anuncio" es el fondo de la letra o sólo un acento (borde, barra, línea). */
export function colorEsFondo(estilo: string): boolean {
  return !["CONTORNO", "TARJETA", "MINIMAL"].includes(estilo);
}

export interface ColoresAnuncio {
  /** El color del anuncio: fondo, o borde/barra/línea según el estilo. */
  color: string;
  /** El segundo tono del degradado. */
  color2: string;
  texto: string;
  icono: string;
  /** El borde de la franja suave. */
  borde: string;
  /** La caja de los estilos que no se pintan con el color (contorno y tarjeta). */
  caja: string;
  /** Sobre qué queda la letra, para el contraste. */
  fondosTexto: string[];
  /** El peor contraste de la letra contra sus fondos. */
  contraste: number;
}

/**
 * El otro extremo del degradado: más oscuro si el color lleva letra blanca y
 * más claro si lleva letra oscura, así la letra se lee en toda la franja.
 */
function segundoTono(color: string): string {
  return textoQueContrasta(color) === "#FFFFFF" ? mezcla(color, "#000000", 0.35) : mezcla(color, "#FFFFFF", 0.55);
}

/** La franja ámbar de siempre: la que ven todas las páginas que no eligieron otra. */
const SUAVE = { fondo: "#FFFBEB", texto: "#78350F", icono: "#B45309", borde: "#FDE68A" };

/**
 * Resuelve los colores del anuncio. null = automático: en la franja suave, el
 * ámbar de siempre; en el resto, el color de la página con la letra que mejor
 * se lea. Si el dueño eligió la letra, se respeta aunque se lea mal (el editor
 * le avisa, no se lo prohíbe).
 *
 * La superficie cambia sólo lo automático: sobre la página del color del
 * negocio (Vivo) el anuncio va blanco con letra del color, porque uno del
 * mismo color que el fondo no se distingue; sobre la oscura (Noche), la franja
 * y las cajas pasan a gris oscuro con el acento claro.
 */
export function coloresAnuncio(
  estilo: string,
  colorFondo: string | null | undefined,
  colorTexto: string | null | undefined,
  c: Paleta,
  sup: Superficie = SUPERFICIE_CLASICA,
): ColoresAnuncio {
  const elegidoFondo = colorFondo && HEX_COLOR.test(colorFondo) ? colorFondo : null;
  const elegidoTexto = colorTexto && HEX_COLOR.test(colorTexto) ? colorTexto : null;
  const oscura = sup.tipo === "oscura";
  const sobreColor = sup.tipo === "color";
  const caja = oscura ? NOCHE.tarjeta : "#FFFFFF";
  let color: string;
  let color2: string | null = null;
  let texto: string;
  let icono: string;
  let borde: string;
  let fondosTexto: string[];

  if (estilo === "SUAVE" || !ESTILOS_ANUNCIO.some((e) => e.clave === estilo)) {
    if (elegidoFondo) {
      color = elegidoFondo;
      texto = elegidoTexto ?? letraSobre(elegidoFondo);
      icono = texto;
      borde = mezcla(elegidoFondo, "#000000", 0.12);
    } else if (oscura) {
      color = NOCHE.tarjeta;
      texto = elegidoTexto ?? NOCHE.texto;
      icono = elegidoTexto ?? acentoNoche(c);
      borde = NOCHE.borde;
    } else if (sobreColor) {
      color = "#FFFFFF";
      texto = elegidoTexto ?? c.oscuro;
      icono = texto;
      borde = "#FFFFFF";
    } else {
      color = SUAVE.fondo;
      texto = elegidoTexto ?? SUAVE.texto;
      icono = elegidoTexto ? texto : SUAVE.icono;
      borde = SUAVE.borde;
    }
    fondosTexto = [color];
  } else if (colorEsFondo(estilo)) {
    // Lleno: el color de la página con letra blanca; sobre Vivo, al revés.
    const invertir = sobreColor && !elegidoFondo;
    color = elegidoFondo ?? (invertir ? "#FFFFFF" : c.acento);
    texto = elegidoTexto ?? (invertir ? c.oscuro : elegidoFondo ? letraSobre(color) : "#FFFFFF");
    icono = texto;
    borde = color;
    if (invertir) color2 = c.tinte;
    fondosTexto = estilo === "DEGRADADO" ? [color, color2 ?? segundoTono(color)] : [color];
  } else {
    // El color es un acento y la letra va sobre la caja (o, en la
    // minimalista, que no tiene caja, sobre la página misma).
    const minimal = estilo === "MINIMAL";
    if (minimal && sobreColor) {
      // Sin caja sobre el color: la línea y la letra, blancas.
      color = elegidoFondo ?? "#FFFFFF";
      fondosTexto = [sup.fondo];
      texto = elegidoTexto ?? "#FFFFFF";
      icono = elegidoTexto ?? "#FFFFFF";
    } else if (oscura) {
      color = elegidoFondo ?? c.acento;
      fondosTexto = minimal ? [sup.fondo] : [caja];
      texto = elegidoTexto ?? (estilo === "TARJETA" ? NOCHE.texto : claroLegible(color, NOCHE.chip));
      icono = claroLegible(color, NOCHE.chip);
    } else {
      color = elegidoFondo ?? c.acento;
      fondosTexto = minimal ? ["#FFFFFF", sup.fondo] : ["#FFFFFF"];
      texto = elegidoTexto ?? (estilo === "TARJETA" ? GRIS_PAGINA.texto : oscuroLegible(color, sup.fondo));
      icono = color;
    }
    borde = color;
  }
  return {
    color,
    color2: color2 ?? segundoTono(color),
    texto,
    icono,
    borde,
    caja,
    fondosTexto,
    contraste: Math.min(...fondosTexto.map((f) => contraste(texto, f))),
  };
}
