import { mezcla, type Paleta } from "./aspecto";
import {
  acentoNoche,
  familiaTexto,
  GRIS_PAGINA,
  NOCHE,
  oscuroLegible,
  SUPERFICIE_CLASICA,
  type Superficie,
} from "./estilos";
import type { ClaveEstilo, FormaBotones, Tipografia } from "./tipos";

/**
 * Los estilos de página (IDEAS/5, aprobados el 09-oct): un paquete armado por
 * diseño que decide cómo se arma la página (encabezado, fondo, tarjetas, letra
 * del texto, títulos de sección, catálogo y sucursales) y cómo se aplica el
 * color que eligió el dueño. El color, la forma de los botones y la letra del
 * nombre siguen siendo un ajuste fino encima.
 *
 * Acá están los "tokens" de cada estilo; las piezas de `VistaPagina` los leen
 * y el test de contraste los recorre (no copias): si un color cambia acá,
 * cambia en la página y en el test a la vez.
 */

export type { ClaveEstilo };

export interface EstiloPagina {
  clave: ClaveEstilo;
  nombre: string;
  /** La línea que lo explica en el popup. */
  linea: string;
  /** La letra del nombre y la forma de los botones con las que mejor va (decisión 3 del 09-oct). */
  letra: Tipografia;
  forma: FormaBotones;
  /** Las 3 que los popups de Letra, Forma y Color muestran primero. */
  letras: Tipografia[];
  formas: FormaBotones[];
  colores: string[];
  /** Cómo va el catálogo: la proporción de la foto y si la tarjeta tiene caja. */
  catalogo: {
    proporcion: string;
    proporcionEscritorio: string;
    sinCaja: boolean;
    /** La foto con el borde de arriba en arco (Boutique). */
    arco: boolean;
    /** Cuántas se ven a la vez en computadora (decisión 6: hasta 3). */
    porVistaEscritorio: number;
  };
  /** Las sucursales en tarjeta o como texto con separadores (Boutique). */
  sucursales: "tarjeta" | "texto";
  /** Sin portada se ve peor: el editor lo avisa. */
  pideFoto: boolean;
}

export const ESTILOS_PAGINA: EstiloPagina[] = [
  {
    clave: "CLASICO",
    nombre: "Clásico",
    linea: "La página de siempre, ordenada y clara.",
    letra: "MODERNA",
    forma: "REDONDEADO",
    letras: ["MODERNA", "MONTSERRAT", "ELEGANTE"],
    formas: ["REDONDEADO", "PILDORA", "RECTO"],
    colores: ["VERDE", "AZUL", "CIRUELA"],
    catalogo: { proporcion: "4 / 3", proporcionEscritorio: "1 / 1", sinCaja: false, arco: false, porVistaEscritorio: 3 },
    sucursales: "tarjeta",
    pideFoto: false,
  },
  {
    clave: "VITRINA",
    nombre: "Vitrina",
    linea: "La foto manda: tu portada a casi toda la pantalla.",
    letra: "MONTSERRAT",
    forma: "PILDORA",
    letras: ["MONTSERRAT", "ELEGANTE", "RALEWAY"],
    formas: ["PILDORA", "CONTORNO", "REDONDEADO"],
    colores: ["CARBON", "TEJA", "SALVIA"],
    catalogo: { proporcion: "4 / 5", proporcionEscritorio: "4 / 5", sinCaja: false, arco: false, porVistaEscritorio: 3 },
    sucursales: "tarjeta",
    pideFoto: true,
  },
  {
    clave: "VIVO",
    nombre: "Vivo",
    linea: "Todo el fondo de tu color, con tarjetas blancas encima.",
    letra: "POPPINS",
    forma: "RELIEVE",
    letras: ["POPPINS", "ARCHIVO_BLACK", "FREDOKA"],
    formas: ["RELIEVE", "PILDORA", "SOMBRA_DURA"],
    colores: ["ROJO", "NARANJA", "ESMERALDA"],
    catalogo: { proporcion: "4 / 3", proporcionEscritorio: "1 / 1", sinCaja: false, arco: false, porVistaEscritorio: 2 },
    sucursales: "tarjeta",
    pideFoto: false,
  },
  {
    clave: "NOCHE",
    nombre: "Noche",
    linea: "Oscuro y contundente, con tu color como acento.",
    letra: "BEBAS",
    forma: "RECTO",
    letras: ["BEBAS", "ANTON", "FUERTE"],
    formas: ["RECTO", "CONTORNO", "ESQUINA"],
    colores: ["TEJA", "OCRE", "ROJO"],
    catalogo: { proporcion: "1 / 1", proporcionEscritorio: "1 / 1", sinCaja: false, arco: false, porVistaEscritorio: 3 },
    sucursales: "tarjeta",
    pideFoto: false,
  },
  {
    clave: "BOUTIQUE",
    nombre: "Boutique",
    linea: "Crema, letra con serifa, líneas finas y mucho aire.",
    letra: "CORMORANT",
    forma: "SUBRAYADO",
    letras: ["CORMORANT", "ELEGANTE", "DM_SERIF"],
    formas: ["SUBRAYADO", "CONTORNO", "TINTE"],
    colores: ["CIRUELA", "SALVIA", "VINO"],
    catalogo: { proporcion: "4 / 5", proporcionEscritorio: "4 / 5", sinCaja: true, arco: true, porVistaEscritorio: 2 },
    sucursales: "texto",
    pideFoto: false,
  },
];

/** El estilo de esa clave; ausente o desconocido (un backend anterior) = Clásico. */
export function estiloPagina(clave?: string | null): EstiloPagina {
  return ESTILOS_PAGINA.find((e) => e.clave === clave) ?? ESTILOS_PAGINA[0];
}

/**
 * El estilo que se le sugiere a cada rubro (`TipoNegocio`; tabla de IDEAS/5
 * §4.5 adaptada a los 5 de la fase 1: Carta y Dulce todavía no existen).
 * Es un dato de diseño: un rubro que no está acá se queda con Clásico.
 */
export const ESTILO_POR_RUBRO: Record<string, ClaveEstilo> = {
  RESTAURANTE: "VIVO",
  FARMACIA: "CLASICO",
  MINIMARKET: "VIVO",
  FERRETERIA: "VIVO",
  REPUESTOS: "VIVO",
  PELUQUERIA: "BOUTIQUE",
  SPA: "BOUTIQUE",
  BARBERIA: "NOCHE",
  UNAS: "VIVO",
};

export function estiloRecomendado(rubro?: string | null): ClaveEstilo {
  return ESTILO_POR_RUBRO[(rubro ?? "").toUpperCase()] ?? "CLASICO";
}

// ── Colores de cada estilo ─────────────────────────────────────────────────

/** Una capa oscura sobre una foto: el texto blanco se mide contra la foto más clara posible (blanca). */
export interface CapaFoto {
  color: string;
  opacidad: number;
}

/** El fondo más claro que puede quedar detrás del texto: la capa sobre una foto blanca. */
export function fondoBajoCapa(capa: CapaFoto): string {
  return mezcla("#FFFFFF", capa.color, capa.opacidad);
}

export function rgbaCapa(capa: CapaFoto): string {
  const h = capa.color.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return `rgba(${r},${g},${b},${capa.opacidad})`;
}

export interface TonosPagina {
  /** Sobre qué se pintan los botones y el anuncio (`estiloBotones`, `coloresAnuncio`). */
  superficie: Superficie;
  /** El fondo de la página. */
  fondo: string;
  /** Texto directo sobre el fondo: principal, secundario y terciario (rubro, pie). */
  texto: string;
  texto2: string;
  texto3: string;
  /** Los títulos de sección ("Nuestro catálogo", "Dónde estamos"). */
  titulo: string;
  /** Las tarjetas del catálogo y de las sucursales. */
  tarjeta: string;
  borde: string | null;
  sombra: string | null;
  textoTarjeta: string;
  texto2Tarjeta: string;
  texto3Tarjeta: string;
  /** El precio del catálogo y los íconos de acento de las tarjetas. */
  precio: string;
  icono: string;
  /** Un ítem del catálogo sin foto: el fondo y la inicial. */
  sinFotoFondo: string;
  sinFotoTexto: string;
  /** Los puntitos del carrusel. */
  puntoOn: string;
  puntoOff: string;
  /** Las líneas finas (Boutique) y los separadores. */
  linea: string;
  /** Los íconos de las redes: su fondo (o null, sin círculo) y su trazo. */
  redFondo: string | null;
  redTrazo: string;
  /** El texto del encabezado (nombre, rubro, descripción) y su fondo real. */
  textoEncabezado: string;
  texto2Encabezado: string;
  /** El fondo sobre el que queda el texto del encabezado, para el contraste. */
  fondosEncabezado: string[];
  /** La capa oscura sobre la portada, si el texto va encima de la foto. */
  capa: CapaFoto | null;
  /** La letra del texto de la página. */
  familia: string;
  /** El color de la barra del navegador (`theme-color`). */
  barra: string;
}

/** Vitrina: el texto va sobre la foto con una capa de al menos 60 % de negro detrás. */
const CAPA_VITRINA: CapaFoto = { color: "#000000", opacidad: 0.6 };
/** Noche: la portada "muy oscurecida" (IDEAS/5: 65 %; 70 % para que el rubro también se lea). */
const CAPA_NOCHE: CapaFoto = { color: "#0A0A0C", opacidad: 0.7 };

/** Noche sin portada: cuánto color tiene el brillo de la esquina, en su centro. */
export const BRILLO_NOCHE = 0.45;

/** Boutique: marfil, separadores y texto café casi negro. */
export const BOUTIQUE = {
  fondo: "#FAF7F2",
  linea: "#E7E1D8",
  texto: "#2B2522",
  texto2: "#5B5049",
  texto3: "#6E625A",
};

/**
 * Los colores de la página con ese estilo y ese color. `portada`: si hay
 * foto de portada (Vitrina sin foto cae al encabezado de color de Vivo).
 */
export function tonosPagina(clave: string | null | undefined, c: Paleta, portada = true): TonosPagina {
  const e = estiloPagina(clave).clave;
  const g = GRIS_PAGINA;
  const familia = familiaTexto(e);
  switch (e) {
    case "VITRINA":
      return {
        superficie: { tipo: "clara", fondo: "#ffffff", tarjeta: "#ffffff" },
        fondo: "#ffffff",
        texto: g.texto,
        texto2: g.texto2,
        texto3: g.texto3,
        titulo: g.texto,
        tarjeta: "#ffffff",
        borde: null,
        sombra: "0 6px 20px rgba(0,0,0,0.08)",
        textoTarjeta: g.texto,
        texto2Tarjeta: "#4B5563",
        texto3Tarjeta: g.texto3,
        precio: c.oscuro,
        icono: c.oscuro,
        sinFotoFondo: c.tinte,
        sinFotoTexto: c.oscuro,
        puntoOn: c.oscuro,
        puntoOff: "#B8BEC7",
        linea: g.borde,
        redFondo: null,
        redTrazo: c.oscuro,
        textoEncabezado: "#ffffff",
        texto2Encabezado: "#ffffff",
        // Con foto, la capa; sin foto, el degradado de color de Vivo.
        fondosEncabezado: portada ? [fondoBajoCapa(CAPA_VITRINA)] : [c.acento, c.oscuro],
        capa: portada ? CAPA_VITRINA : null,
        familia,
        barra: c.oscuro,
      };
    case "VIVO":
      return {
        // Las 32 muestras pasan 4.5:1 con blanco: todo lo que va directo
        // sobre el color es blanco.
        superficie: { tipo: "color", fondo: c.acento, tarjeta: "#ffffff" },
        fondo: c.acento,
        texto: "#ffffff",
        texto2: "#ffffff",
        texto3: "#ffffff",
        titulo: "#ffffff",
        tarjeta: "#ffffff",
        borde: null,
        sombra: "0 6px 0 rgba(0,0,0,0.14)",
        textoTarjeta: g.texto,
        texto2Tarjeta: "#4B5563",
        texto3Tarjeta: g.texto3,
        precio: c.oscuro,
        icono: c.oscuro,
        sinFotoFondo: c.tinte,
        sinFotoTexto: c.oscuro,
        puntoOn: "#ffffff",
        puntoOff: mezcla(c.acento, "#ffffff", 0.45),
        linea: "rgba(255,255,255,0.35)",
        redFondo: "rgba(255,255,255,0.2)",
        redTrazo: "#ffffff",
        textoEncabezado: "#ffffff",
        texto2Encabezado: "#ffffff",
        fondosEncabezado: [c.acento],
        capa: null,
        familia,
        barra: c.acento,
      };
    case "NOCHE": {
      const claro = acentoNoche(c);
      return {
        superficie: { tipo: "oscura", fondo: NOCHE.fondo, tarjeta: NOCHE.tarjeta },
        fondo: NOCHE.fondo,
        texto: NOCHE.texto,
        texto2: NOCHE.texto2,
        texto3: NOCHE.texto3,
        titulo: claro,
        tarjeta: NOCHE.tarjeta,
        borde: NOCHE.borde,
        sombra: null,
        textoTarjeta: NOCHE.texto,
        texto2Tarjeta: NOCHE.texto2,
        texto3Tarjeta: NOCHE.texto3,
        precio: claro,
        icono: claro,
        sinFotoFondo: mezcla(c.acento, NOCHE.tarjeta, 0.7),
        sinFotoTexto: NOCHE.texto,
        puntoOn: claro,
        puntoOff: "#3F3F46",
        linea: NOCHE.borde,
        redFondo: null,
        redTrazo: claro,
        textoEncabezado: "#ffffff",
        texto2Encabezado: NOCHE.texto2,
        // Sin foto: casi negro con un brillo del color (a lo sumo 45 %).
        fondosEncabezado: portada ? [fondoBajoCapa(CAPA_NOCHE)] : [NOCHE.fondo, mezcla(NOCHE.fondo, c.acento, BRILLO_NOCHE)],
        capa: portada ? CAPA_NOCHE : null,
        familia,
        barra: NOCHE.fondo,
      };
    }
    case "BOUTIQUE": {
      const acento = oscuroLegible(c.acento, BOUTIQUE.fondo);
      return {
        // Sin tarjetas: los botones chicos de las sucursales van sobre el marfil.
        superficie: { tipo: "clara", fondo: BOUTIQUE.fondo, tarjeta: BOUTIQUE.fondo },
        fondo: BOUTIQUE.fondo,
        texto: BOUTIQUE.texto,
        texto2: BOUTIQUE.texto2,
        texto3: BOUTIQUE.texto3,
        titulo: BOUTIQUE.texto,
        tarjeta: BOUTIQUE.fondo,
        borde: null,
        sombra: null,
        textoTarjeta: BOUTIQUE.texto,
        texto2Tarjeta: BOUTIQUE.texto2,
        texto3Tarjeta: BOUTIQUE.texto3,
        precio: acento,
        icono: acento,
        sinFotoFondo: c.tinte,
        sinFotoTexto: c.oscuro,
        puntoOn: BOUTIQUE.texto,
        puntoOff: "#D6CEC3",
        linea: BOUTIQUE.linea,
        redFondo: null,
        redTrazo: BOUTIQUE.texto,
        textoEncabezado: BOUTIQUE.texto,
        texto2Encabezado: BOUTIQUE.texto2,
        fondosEncabezado: [BOUTIQUE.fondo],
        capa: null,
        familia,
        barra: BOUTIQUE.fondo,
      };
    }
    default:
      // Clásico: los grises de siempre (GRIS_PAGINA), sin tocar un píxel.
      return {
        superficie: SUPERFICIE_CLASICA,
        fondo: g.fondo,
        texto: g.texto,
        texto2: g.texto2,
        texto3: g.texto3,
        titulo: g.texto3,
        tarjeta: "#ffffff",
        borde: g.borde,
        sombra: null,
        textoTarjeta: g.texto,
        texto2Tarjeta: "#4B5563",
        texto3Tarjeta: g.texto3,
        precio: c.oscuro,
        icono: c.oscuro,
        sinFotoFondo: c.tinte,
        sinFotoTexto: c.oscuro,
        puntoOn: c.oscuro,
        puntoOff: "#B8BEC7",
        linea: g.borde,
        redFondo: c.tinte,
        redTrazo: c.oscuro,
        textoEncabezado: g.texto,
        texto2Encabezado: g.texto2,
        // En el celular el nombre va sobre el gris; en la computadora, en la tarjeta blanca.
        fondosEncabezado: [g.fondo, "#ffffff"],
        capa: null,
        familia,
        barra: c.acento,
      };
  }
}

/** Un texto de la página y el fondo sobre el que queda, para el test de contraste. */
export interface ParTexto {
  que: string;
  texto: string;
  fondo: string;
}

/**
 * Todos los textos que pinta la página con esos tonos (salvo botones y
 * anuncio, que se prueban con `estiloBotones` y `coloresAnuncio`), cada uno
 * con su fondo real. El test exige ≥ 4.5:1 en todos.
 */
export function paresDeTexto(t: TonosPagina): ParTexto[] {
  const pares: ParTexto[] = [];
  const agregar = (que: string, texto: string, fondos: string[]) =>
    fondos.forEach((fondo) => pares.push({ que, texto, fondo }));
  agregar("nombre", t.textoEncabezado, t.fondosEncabezado);
  agregar("rubro y descripción", t.texto2Encabezado, t.fondosEncabezado);
  agregar("título de sección", t.titulo, [t.fondo]);
  agregar("texto sobre la página", t.texto, [t.fondo]);
  agregar("texto secundario sobre la página", t.texto2, [t.fondo]);
  agregar("pie y rubro", t.texto3, [t.fondo]);
  agregar("nombre del ítem y de la sucursal", t.textoTarjeta, [t.tarjeta]);
  agregar("dirección", t.texto2Tarjeta, [t.tarjeta]);
  agregar("descripción del ítem y horario", t.texto3Tarjeta, [t.tarjeta]);
  agregar("precio", t.precio, [t.tarjeta]);
  return pares;
}
