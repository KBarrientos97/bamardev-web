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
function oscuroLegible(hex: string, sobre = "#FFFFFF"): string {
  for (const t of [0.35, 0.6, 0.75]) {
    const oscuro = mezcla(hex, "#000000", t);
    if (contraste(oscuro, sobre) >= CONTRASTE_MINIMO) return oscuro;
  }
  return TINTA;
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

/**
 * Cómo se pintan los botones de la página con esa forma y ese color. Las tres
 * de siempre dan exactamente lo de antes (sólo cambia el radio). La letra
 * siempre queda en ≥ 4.5:1 sobre su fondo, con cualquiera de las 12 muestras
 * (lo prueba estilos.test.ts).
 */
export function estiloBotones(forma: string, c: Paleta): EstiloBotones {
  const g = GRIS_PAGINA;
  const radio = forma === "PILDORA" ? "999px" : forma === "RECTO" ? "4px" : "14px";
  const radioChico = forma === "PILDORA" ? 999 : forma === "RECTO" ? 4 : 12;
  const base: EstiloBotones = {
    principal: {
      estilo: { borderRadius: radio, background: c.acento, color: "#ffffff", boxShadow: SOMBRA_SUAVE },
      texto: "#ffffff",
      icono: "#ffffff",
      fondos: [c.acento],
    },
    secundario: {
      estilo: { borderRadius: radio, background: "#ffffff", border: `1px solid ${g.borde}`, color: g.texto },
      texto: g.texto,
      icono: c.oscuro,
      fondos: ["#ffffff"],
    },
    chico: {
      estilo: { borderRadius: radioChico, border: `1px solid ${g.borde}`, background: "#ffffff", color: g.texto2 },
      texto: g.texto2,
      icono: g.texto2,
      fondos: ["#ffffff"],
    },
    chicoDestacado: {
      estilo: { borderRadius: radioChico, border: "none", background: c.tinte, color: c.oscuro },
      texto: c.oscuro,
      icono: c.oscuro,
      fondos: [c.tinte],
    },
    flecha: "#9CA3AF",
  };
  const { principal, secundario, chico, chicoDestacado } = base;
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
          estilo: { background: "#ffffff", border: `2px solid ${c.acento}`, color: c.oscuro, boxShadow: "none" },
          texto: c.oscuro,
          icono: c.oscuro,
          fondos: ["#ffffff"],
        }),
        secundario: con(secundario, { estilo: { border: `1.5px solid ${c.acento}` } }),
        chico: con(chico, { estilo: { border: `1px solid ${c.acento}`, color: c.oscuro }, texto: c.oscuro }),
        chicoDestacado: con(chicoDestacado, lleno),
      };
    case "TINTE": {
      const tenue = mezcla(c.acento, "#ffffff", 0.93);
      return {
        ...base,
        principal: con(principal, {
          estilo: { background: c.tinte, color: c.oscuro, boxShadow: "none" },
          texto: c.oscuro,
          icono: c.oscuro,
          fondos: [c.tinte],
        }),
        secundario: con(secundario, { estilo: { background: tenue, border: "none" }, fondos: [tenue] }),
        chico: con(chico, { estilo: { background: tenue, border: "none" }, fondos: [tenue] }),
        chicoDestacado: con(chicoDestacado, lleno),
      };
    }
    case "SOMBRA_DURA":
      return {
        ...base,
        principal: con(principal, {
          estilo: { borderRadius: 10, border: `2px solid ${TINTA}`, boxShadow: `4px 4px 0 ${TINTA}` },
        }),
        secundario: con(secundario, {
          estilo: { borderRadius: 10, border: `2px solid ${TINTA}`, boxShadow: `3px 3px 0 ${TINTA}` },
        }),
        chico: con(chico, { estilo: { borderRadius: 8, border: `1.5px solid ${TINTA}`, boxShadow: `2px 2px 0 ${TINTA}` } }),
        chicoDestacado: con(chicoDestacado, {
          estilo: { borderRadius: 8, border: `1.5px solid ${TINTA}`, boxShadow: `2px 2px 0 ${TINTA}` },
        }),
        flecha: TINTA,
      };
    case "RELIEVE":
      return {
        ...base,
        principal: con(principal, { estilo: { boxShadow: `0 5px 0 ${c.oscuro}` } }),
        secundario: con(secundario, { estilo: { boxShadow: "0 4px 0 #D1D5DB" } }),
        chico: con(chico, { estilo: { boxShadow: "0 3px 0 #D1D5DB" } }),
        chicoDestacado: con(chicoDestacado, {
          estilo: { boxShadow: `0 3px 0 ${mezcla(c.acento, "#ffffff", 0.6)}` },
        }),
      };
    case "DEGRADADO": {
      const degradado = `linear-gradient(135deg, ${c.acento}, ${c.oscuro})`;
      const claro = `linear-gradient(135deg, #ffffff, ${c.tinte})`;
      const borde = `1px solid ${mezcla(c.acento, "#ffffff", 0.75)}`;
      return {
        ...base,
        principal: con(principal, { estilo: { background: degradado }, fondos: [c.acento, c.oscuro] }),
        secundario: con(secundario, { estilo: { background: claro, border: borde }, fondos: ["#ffffff", c.tinte] }),
        chico: con(chico, { estilo: { background: claro, border: borde }, fondos: ["#ffffff", c.tinte] }),
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
          estilo: { borderRadius: 0, clipPath: cortes(12), background: c.tinte, border: "none" },
          fondos: [c.tinte],
        }),
        chico: con(chico, {
          estilo: { borderRadius: 0, clipPath: cortes(7), background: c.tinte, border: "none" },
          fondos: [c.tinte],
        }),
        chicoDestacado: con(chicoDestacado, { ...lleno, estilo: { ...lleno.estilo, borderRadius: 0, clipPath: cortes(7) } }),
      };
    case "SUBRAYADO": {
      const sinCaja: CSSProperties = { borderRadius: 0, background: "transparent", border: "none" };
      return {
        ...base,
        principal: con(principal, { estilo: { borderRadius: 0, boxShadow: "none" } }),
        secundario: con(secundario, {
          estilo: { ...sinCaja, borderBottom: `2px solid ${c.acento}` },
          // Transparente: queda sobre el gris de la página o sobre la tarjeta blanca.
          fondos: ["#ffffff", g.fondo],
        }),
        chico: con(chico, { estilo: { ...sinCaja, borderBottom: `1px solid ${g.borde}` } }),
        chicoDestacado: con(chicoDestacado, {
          estilo: { ...sinCaja, borderBottom: `2px solid ${c.acento}`, fontWeight: 700 },
          fondos: ["#ffffff"],
        }),
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
 * Roboto (el texto de la página) y, si se pasa, la letra del nombre. Sólo la
 * elegida: el cliente del negocio no baja las 30. La app no usa estas letras,
 * así que no van en `index.html`.
 */
export function cargarFuentesPagina(tipografia?: string): void {
  ponerHoja("fuentes-pagina", urlFuentes([LETRAS[0].google]));
  if (!tipografia) return;
  const l = letraTitulo(tipografia);
  if (l.clave === "MODERNA") return;
  ponerHoja(`fuentes-pagina-${l.clave.toLowerCase()}`, urlFuentes([l.google]));
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
 */
export function coloresAnuncio(
  estilo: string,
  colorFondo: string | null | undefined,
  colorTexto: string | null | undefined,
  c: Paleta,
): ColoresAnuncio {
  const elegidoFondo = colorFondo && HEX_COLOR.test(colorFondo) ? colorFondo : null;
  const elegidoTexto = colorTexto && HEX_COLOR.test(colorTexto) ? colorTexto : null;
  let color: string;
  let texto: string;
  let icono: string;
  let borde: string;
  let fondosTexto: string[];

  if (estilo === "SUAVE" || !ESTILOS_ANUNCIO.some((e) => e.clave === estilo)) {
    color = elegidoFondo ?? SUAVE.fondo;
    texto = elegidoTexto ?? (elegidoFondo ? letraSobre(elegidoFondo) : SUAVE.texto);
    icono = elegidoFondo || elegidoTexto ? texto : SUAVE.icono;
    borde = elegidoFondo ? mezcla(elegidoFondo, "#000000", 0.12) : SUAVE.borde;
    fondosTexto = [color];
  } else if (colorEsFondo(estilo)) {
    color = elegidoFondo ?? c.acento;
    texto = elegidoTexto ?? (elegidoFondo ? letraSobre(color) : "#FFFFFF");
    icono = texto;
    borde = color;
    fondosTexto = estilo === "DEGRADADO" ? [color, segundoTono(color)] : [color];
  } else {
    // El color es un acento y la letra va sobre blanco (o sobre el gris de la
    // página en la minimalista, que no tiene caja).
    color = elegidoFondo ?? c.acento;
    fondosTexto = estilo === "MINIMAL" ? ["#FFFFFF", GRIS_PAGINA.fondo] : ["#FFFFFF"];
    texto =
      elegidoTexto ??
      (estilo === "TARJETA" ? GRIS_PAGINA.texto : oscuroLegible(color, GRIS_PAGINA.fondo));
    icono = color;
    borde = color;
  }
  return {
    color,
    color2: segundoTono(color),
    texto,
    icono,
    borde,
    fondosTexto,
    contraste: Math.min(...fondosTexto.map((f) => contraste(texto, f))),
  };
}
