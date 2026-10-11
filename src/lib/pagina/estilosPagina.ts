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
    /**
     * Carrusel (09-oct: "no debe verse como un e-commerce"); lista de menú con
     * el precio a la derecha (Carta) o bloques de la grilla (Mosaico).
     */
    presentacion: "carrusel" | "menu" | "bloques";
  };
  /** Las sucursales en tarjeta o como texto con separadores (Boutique). */
  sucursales: "tarjeta" | "texto";
  /** Sin portada se ve peor: el editor lo avisa. */
  pideFoto: boolean;
  /** Sin catálogo pierde lo principal (Carta): el editor lo avisa. */
  pideCatalogo: boolean;
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
    catalogo: { proporcion: "4 / 3", proporcionEscritorio: "1 / 1", sinCaja: false, arco: false, porVistaEscritorio: 3, presentacion: "carrusel" },
    sucursales: "tarjeta",
    pideFoto: false,
    pideCatalogo: false,
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
    catalogo: { proporcion: "4 / 5", proporcionEscritorio: "4 / 5", sinCaja: false, arco: false, porVistaEscritorio: 3, presentacion: "carrusel" },
    sucursales: "tarjeta",
    pideFoto: true,
    pideCatalogo: false,
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
    catalogo: { proporcion: "4 / 3", proporcionEscritorio: "1 / 1", sinCaja: false, arco: false, porVistaEscritorio: 2, presentacion: "carrusel" },
    sucursales: "tarjeta",
    pideFoto: false,
    pideCatalogo: false,
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
    catalogo: { proporcion: "1 / 1", proporcionEscritorio: "1 / 1", sinCaja: false, arco: false, porVistaEscritorio: 3, presentacion: "carrusel" },
    sucursales: "tarjeta",
    pideFoto: false,
    pideCatalogo: false,
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
    catalogo: { proporcion: "4 / 5", proporcionEscritorio: "4 / 5", sinCaja: true, arco: true, porVistaEscritorio: 2, presentacion: "carrusel" },
    sucursales: "texto",
    pideFoto: false,
    pideCatalogo: false,
  },
  // ── Fase 2 (IDEAS/5 §4.3, maqueta aprobada el 09-oct) ──
  {
    clave: "POSTAL",
    nombre: "Postal",
    linea: "Una tarjeta flotando sobre tu portada desenfocada.",
    letra: "QUICKSAND",
    forma: "TINTE",
    letras: ["QUICKSAND", "DANCING", "COMFORTAA"],
    formas: ["TINTE", "PILDORA", "REDONDEADO"],
    colores: ["ROSA", "CAFE", "LAVANDA"],
    // La tarjeta mide 560 px en computadora: de a dos se ven mejor que de a tres.
    catalogo: { proporcion: "4 / 3", proporcionEscritorio: "4 / 3", sinCaja: false, arco: false, porVistaEscritorio: 2, presentacion: "carrusel" },
    sucursales: "tarjeta",
    pideFoto: false,
    pideCatalogo: false,
  },
  {
    clave: "CARTA",
    nombre: "Carta",
    linea: "Tus productos con su precio, como un menú.",
    letra: "ALFA_SLAB",
    forma: "REDONDEADO",
    letras: ["ALFA_SLAB", "MONTSERRAT", "ABRIL"],
    formas: ["REDONDEADO", "RELIEVE", "RECTO"],
    colores: ["ROJO", "TEJA", "AMBAR"],
    catalogo: { proporcion: "1 / 1", proporcionEscritorio: "1 / 1", sinCaja: false, arco: false, porVistaEscritorio: 1, presentacion: "menu" },
    sucursales: "tarjeta",
    pideFoto: false,
    pideCatalogo: true,
  },
  {
    clave: "DULCE",
    nombre: "Dulce",
    linea: "Pastel, todo redondo y suave.",
    letra: "FREDOKA",
    forma: "PILDORA",
    letras: ["FREDOKA", "NUNITO", "PACIFICO"],
    formas: ["PILDORA", "TINTE", "REDONDEADO"],
    colores: ["FRAMBUESA", "ROSA", "LAVANDA"],
    catalogo: { proporcion: "4 / 3", proporcionEscritorio: "4 / 3", sinCaja: false, arco: false, porVistaEscritorio: 2, presentacion: "carrusel" },
    sucursales: "tarjeta",
    pideFoto: false,
    pideCatalogo: false,
  },
  {
    clave: "MOSAICO",
    nombre: "Mosaico",
    linea: "Bloques de distintos tamaños, como una grilla.",
    letra: "MONTSERRAT",
    forma: "REDONDEADO",
    letras: ["MONTSERRAT", "ARCHIVO_BLACK", "POPPINS"],
    formas: ["REDONDEADO", "RECTO", "SOMBRA_DURA"],
    colores: ["NEGRO", "MARINO", "VIOLETA"],
    catalogo: { proporcion: "1 / 1", proporcionEscritorio: "1 / 1", sinCaja: false, arco: false, porVistaEscritorio: 1, presentacion: "bloques" },
    sucursales: "tarjeta",
    pideFoto: false,
    pideCatalogo: false,
  },
];

/** El estilo de esa clave; ausente o desconocido (un backend anterior) = Clásico. */
export function estiloPagina(clave?: string | null): EstiloPagina {
  return ESTILOS_PAGINA.find((e) => e.clave === clave) ?? ESTILOS_PAGINA[0];
}

/**
 * El estilo que se le sugiere a cada rubro (`TipoNegocio`; tabla de IDEAS/5
 * §4.5, con la fase 2). Es un dato de diseño: un rubro que no está acá se
 * queda con Clásico.
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
  UNAS: "DULCE",
};

/**
 * Los rubros que venden con precio: con ítems en el catálogo les va Carta;
 * sin ellos, Carta se queda sin lo principal y vale lo de la tabla.
 */
const CARTA_CON_CATALOGO = new Set(["RESTAURANTE", "FARMACIA"]);

/** El sugerido para el rubro; `conCatalogo`: si la página tiene ítems visibles en el catálogo. */
export function estiloRecomendado(rubro?: string | null, conCatalogo = false): ClaveEstilo {
  const r = (rubro ?? "").toUpperCase();
  if (conCatalogo && CARTA_CON_CATALOGO.has(r)) return "CARTA";
  return ESTILO_POR_RUBRO[r] ?? "CLASICO";
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
  /**
   * Los botones chicos de las sucursales, si su tarjeta no es de la misma
   * familia que la página (Mosaico: página clara y sucursal en bloque oscuro).
   */
  superficieTarjeta?: Superficie;
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
  /** Dónde queda el precio, si no es la tarjeta (la lista de Carta va sobre la página). */
  fondosPrecio?: string[];
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
  /** El cartel "Abierto ahora" / "Cerrado" de la sucursal, sobre su tarjeta. */
  estado: { abierto: ColoresEstado; cerrado: ColoresEstado };
  /** Los bloques de color de Mosaico. */
  bloques?: BloquesMosaico;
}

/** Un bloque de Mosaico: su fondo y su letra. */
export interface ColoresBloque {
  fondo: string;
  texto: string;
}

export interface BloquesMosaico {
  /** El botón grande, a lo ancho: del color del negocio. */
  principal: ColoresBloque;
  /** Las redes: cuadrados del tinte con el nombre de la red. */
  red: ColoresBloque;
  /** Los botones secundarios: cuadrados blancos. */
  boton: ColoresBloque;
  /** El ítem grande del catálogo: título y precio sobre la foto, con esta capa mínima detrás. */
  capaFoto: CapaFoto;
}

/** Un cartel de estado: la píldora, su letra y el punto de color. */
export interface ColoresEstado {
  fondo: string;
  texto: string;
  punto: string;
}

/**
 * El cartel sobre una tarjeta clara (blanca o marfil): verde si abre, gris
 * con el punto rojo si no. El rojo va sólo en el punto: "Cerrado" en rojo
 * entero parece un error, y la letra gris se lee mejor.
 */
const ESTADO_CLARO = {
  abierto: { fondo: "#DCFCE7", texto: "#166534", punto: "#16A34A" },
  cerrado: { fondo: "#F3F4F6", texto: "#374151", punto: "#DC2626" },
};

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

/** Boutique: el verde y el gris llevados al marfil, para que el cartel no grite. */
const ESTADO_BOUTIQUE = {
  abierto: { fondo: "#E9EFE2", texto: "#2F5A2B", punto: "#4D7C45" },
  cerrado: { fondo: "#F0EAE2", texto: BOUTIQUE.texto2, punto: "#B4483C" },
};

/** Noche: la píldora oscura con la letra clara (el verde y el rojo, aclarados). */
const ESTADO_NOCHE = {
  abierto: { fondo: "#12301F", texto: "#86EFAC", punto: "#22C55E" },
  cerrado: { fondo: NOCHE.chip, texto: NOCHE.texto2, punto: "#F87171" },
};

/** Postal: la tarjeta blanca y, adentro, las tarjetas apenas grises con su borde. */
export const POSTAL = {
  tarjeta: "#F8FAFB",
  borde: "#EEF0F2",
  /** Cuánto se oscurece la portada desenfocada (IDEAS/5: 30 %). */
  oscurecer: 0.28,
};

/** Postal: el cartel va sobre la tarjeta gris clarito; el verde y el gris de siempre. */
const ESTADO_POSTAL = ESTADO_CLARO;

/** Carta: papel crema, líneas punteadas entre los platos. */
export const CARTA = {
  fondo: "#FFFCF7",
  borde: "#ECE7E1",
  linea: "#DDD5CB",
};

/** Carta: el cartel del encabezado va sobre la crema y el de las sucursales, en blanco. */
const ESTADO_CARTA = ESTADO_CLARO;

/** Dulce: el cartel sobre la tarjeta blanca; el verde y el gris no chocan con el pastel. */
const ESTADO_DULCE = ESTADO_CLARO;

/** Mosaico: el gris cálido de la grilla y su texto tenue (el gris de siempre no llega a 4.5:1 ahí). */
export const MOSAICO = {
  fondo: "#F1F1EE",
  texto3: "#5B616B",
};

/** Mosaico: el título y el precio del ítem grande van sobre la foto con al menos 60 % de negro. */
const CAPA_MOSAICO: CapaFoto = { color: "#000000", opacidad: 0.6 };

/** Mosaico: la sucursal es un bloque oscuro; el cartel, el de Noche. */
const ESTADO_MOSAICO = ESTADO_NOCHE;

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
        estado: ESTADO_CLARO,
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
        estado: ESTADO_CLARO,
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
        estado: ESTADO_NOCHE,
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
        estado: ESTADO_BOUTIQUE,
      };
    }
    case "POSTAL":
      // Todo va adentro de la tarjeta blanca: el fondo desenfocado no lleva texto.
      return {
        superficie: { tipo: "clara", fondo: "#ffffff", tarjeta: POSTAL.tarjeta },
        fondo: "#ffffff",
        texto: g.texto,
        texto2: g.texto2,
        texto3: g.texto3,
        titulo: g.texto,
        tarjeta: POSTAL.tarjeta,
        borde: POSTAL.borde,
        sombra: null,
        textoTarjeta: g.texto,
        texto2Tarjeta: "#4B5563",
        texto3Tarjeta: g.texto3,
        precio: c.oscuro,
        icono: c.oscuro,
        sinFotoFondo: c.tinte,
        sinFotoTexto: c.oscuro,
        puntoOn: c.oscuro,
        puntoOff: "#C7CCD3",
        linea: POSTAL.borde,
        redFondo: c.tinte,
        redTrazo: c.oscuro,
        textoEncabezado: g.texto,
        texto2Encabezado: "#4B5563",
        fondosEncabezado: ["#ffffff"],
        capa: null,
        familia,
        barra: c.oscuro,
        estado: ESTADO_POSTAL,
      };
    case "CARTA": {
      const precio = oscuroLegible(c.acento, CARTA.fondo);
      return {
        superficie: { tipo: "clara", fondo: CARTA.fondo, tarjeta: "#ffffff" },
        fondo: CARTA.fondo,
        texto: g.texto,
        texto2: "#4B5563",
        texto3: g.texto3,
        titulo: g.texto,
        tarjeta: "#ffffff",
        borde: CARTA.borde,
        sombra: null,
        textoTarjeta: g.texto,
        texto2Tarjeta: "#4B5563",
        texto3Tarjeta: g.texto3,
        precio,
        // La lista de platos va directo sobre la crema; las tarjetas, en blanco.
        fondosPrecio: [CARTA.fondo, "#ffffff"],
        icono: c.oscuro,
        sinFotoFondo: c.tinte,
        sinFotoTexto: c.oscuro,
        puntoOn: c.oscuro,
        puntoOff: "#B8BEC7",
        linea: CARTA.linea,
        redFondo: null,
        redTrazo: c.oscuro,
        textoEncabezado: g.texto,
        texto2Encabezado: "#4B5563",
        fondosEncabezado: [CARTA.fondo],
        capa: null,
        familia,
        barra: c.acento,
        estado: ESTADO_CARTA,
      };
    }
    case "DULCE": {
      // Lo que va directo sobre el pastel, en el oscuro del color (pasa en las 32).
      const acento = oscuroLegible(c.acento, c.tinte);
      return {
        superficie: { tipo: "clara", fondo: c.tinte, tarjeta: "#ffffff" },
        fondo: c.tinte,
        texto: g.texto,
        texto2: "#4B5563",
        texto3: acento,
        titulo: acento,
        tarjeta: "#ffffff",
        borde: null,
        // La sombra del color y no gris: sobre el pastel una gris se ve sucia.
        sombra: `0 10px 24px ${rgbaCapa({ color: c.acento, opacidad: 0.18 })}`,
        textoTarjeta: g.texto,
        texto2Tarjeta: "#4B5563",
        texto3Tarjeta: g.texto3,
        precio: c.oscuro,
        icono: c.oscuro,
        sinFotoFondo: c.tinte,
        sinFotoTexto: c.oscuro,
        puntoOn: c.acento,
        puntoOff: mezcla(c.acento, "#ffffff", 0.65),
        linea: mezcla(c.acento, "#ffffff", 0.75),
        redFondo: "#ffffff",
        redTrazo: c.oscuro,
        textoEncabezado: g.texto,
        texto2Encabezado: "#4B5563",
        fondosEncabezado: [c.tinte],
        capa: null,
        familia,
        barra: c.acento,
        estado: ESTADO_DULCE,
      };
    }
    case "MOSAICO": {
      const sobreTinte = oscuroLegible(c.acento, c.tinte);
      return {
        superficie: { tipo: "clara", fondo: MOSAICO.fondo, tarjeta: "#ffffff" },
        // La sucursal es un bloque oscuro: sus botones chicos, como en Noche.
        superficieTarjeta: { tipo: "oscura", fondo: NOCHE.tarjeta, tarjeta: NOCHE.tarjeta },
        fondo: MOSAICO.fondo,
        texto: g.texto,
        texto2: "#4B5563",
        texto3: MOSAICO.texto3,
        titulo: g.texto,
        tarjeta: NOCHE.tarjeta,
        borde: null,
        sombra: null,
        textoTarjeta: NOCHE.texto,
        texto2Tarjeta: NOCHE.texto2,
        texto3Tarjeta: NOCHE.texto3,
        // El precio de los ítems chicos va en una etiqueta blanca sobre la foto.
        precio: g.texto,
        fondosPrecio: ["#ffffff"],
        icono: acentoNoche(c),
        sinFotoFondo: c.tinte,
        sinFotoTexto: c.oscuro,
        puntoOn: c.oscuro,
        puntoOff: "#B8BEC7",
        linea: NOCHE.borde,
        redFondo: c.tinte,
        redTrazo: sobreTinte,
        textoEncabezado: g.texto,
        texto2Encabezado: g.texto3,
        // El nombre va en el bloque blanco de arriba.
        fondosEncabezado: ["#ffffff"],
        capa: null,
        familia,
        barra: MOSAICO.fondo,
        estado: ESTADO_MOSAICO,
        bloques: {
          // Las 32 muestras pasan 4.5:1 con blanco (como en Vivo).
          principal: { fondo: c.acento, texto: "#ffffff" },
          red: { fondo: c.tinte, texto: sobreTinte },
          boton: { fondo: "#ffffff", texto: g.texto },
          capaFoto: CAPA_MOSAICO,
        },
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
        estado: ESTADO_CLARO,
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
  agregar("precio", t.precio, t.fondosPrecio ?? [t.tarjeta]);
  agregar("cartel abierto", t.estado.abierto.texto, [t.estado.abierto.fondo]);
  agregar("cartel cerrado", t.estado.cerrado.texto, [t.estado.cerrado.fondo]);
  if (t.bloques) {
    agregar("bloque del botón grande", t.bloques.principal.texto, [t.bloques.principal.fondo]);
    agregar("bloque de una red", t.bloques.red.texto, [t.bloques.red.fondo]);
    agregar("bloque de un botón", t.bloques.boton.texto, [t.bloques.boton.fondo]);
    agregar("título y precio sobre la foto", "#ffffff", [fondoBajoCapa(t.bloques.capaFoto)]);
  }
  return pares;
}
