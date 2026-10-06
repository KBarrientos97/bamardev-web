/**
 * Tema de color por rubro.
 *
 * **Éste es el archivo que se toca para cambiar un color.** Los componentes no
 * llevan colores propios: usan los tokens de Tailwind (`bg-primary`,
 * `text-primary-700`…) definidos en index.css, y acá se reescriben esas
 * variables CSS al entrar. Por eso cambiar un rubro es cambiar seis valores y
 * nada más, sin tocar las ~40 pantallas.
 *
 * Desde la fase 0 de belleza (oct-2026) el color es del NEGOCIO y no del
 * rubro: el login y `/licencia/estado` traen `negocio.tema.tokens`, la paleta
 * que el panel le eligió. La tabla `TEMAS` por rubro queda de respaldo para un
 * backend que todavía no manda el tema (o una sesión guardada antes), y el
 * verde, para todo lo demás.
 *
 * Restaurante y minimarket se quedan con el verde de siempre: es el color con
 * el que Omar y los clientes actuales ya conocen el producto, y cambiárselo
 * sería un rediseño que nadie pidió.
 */

/** Los seis tonos que define un tema. Mismo rol que en index.css. */
export interface Tema {
  /** Color principal: botones, enlaces, estados activos. */
  primary: string;
  /** Un paso más oscuro (hover de botón). */
  primary600: string;
  /** Dos pasos (activo/pressed). */
  primary700: string;
  /** Fondos muy suaves (chips, resaltados). */
  primary50: string;
  primary100: string;
  primary200: string;
  /**
   * Fondo del botón principal (texto blanco encima), y sus dos estados.
   *
   * Va aparte del `primary` de marca porque casi ningún color de marca da el
   * contraste que necesita el texto: blanco sobre el verde #10b981 son 2.54:1
   * cuando el mínimo legible es 4.5. Cada tema trae acá su tono más oscuro,
   * calculado para pasar 4.5 y conservar el tono. Repuestos ya cumplía (9.89)
   * y usa su propio color sin cambios.
   */
  boton: string;
  botonHover: string;
  botonActivo: string;
  /**
   * Fondo de la barra lateral, y el del ítem activo sobre ella.
   *
   * Más profundo que el color de marca porque el menú lleva dos niveles de
   * texto: el blanco del ítem activo y el atenuado de los demás. Sobre el
   * verde de marca ese segundo nivel daba 2.10:1; sobre estos tonos, 4.5+.
   * `barraTexto2` es ese gris teñido, calculado como blanco al 75 % sobre la
   * barra — va como color y no como opacidad para no depender del fondo.
   */
  barra: string;
  barraActivo: string;
  barraTexto2: string;
  /** Degradado de la barra superior y el login. */
  marca: [string, string];
  /**
   * Fondo de la pantalla, opcional. Hoy ninguna paleta lo trae: en belleza se
   * usa `primary50` (ver `aplicarTema`), y en los demás rubros el de siempre.
   */
  fondo?: string;
}

/** Verde esmeralda: el de siempre. Restaurante, minimarket y desconocidos. */
export const VERDE: Tema = {
  primary: '#10b981',
  primary600: '#059669',
  primary700: '#047857',
  primary50: '#ecfdf5',
  primary100: '#d1fae5',
  primary200: '#a7f3d0',
  boton: '#0C875E',
  botonHover: '#0A7350',
  botonActivo: '#096144',
  barra: '#09694A',
  barraActivo: '#277B60',
  barraTexto2: '#C2DAD2',
  marca: ['#10b981', '#059669'],
};

export const TEMAS: Record<string, Tema> = {
  FARMACIA: {
    primary: '#3196EB',
    primary600: '#1F7AC8',
    primary700: '#1660A3',
    primary50: '#EFF7FE',
    primary100: '#D8EBFC',
    primary200: '#B4D8F8',
    boton: '#2879BE',
    botonHover: '#2267A2',
    botonActivo: '#1D5789',
    barra: '#1F6096',
    barraActivo: '#3A73A3',
    barraTexto2: '#C7D7E5',
    marca: ['#3196EB', '#1F7AC8'],
  },
  FERRETERIA: {
    primary: '#EA580C',
    primary600: '#C2410C',
    primary700: '#9A3412',
    primary50: '#FFF7ED',
    primary100: '#FFEDD5',
    primary200: '#FED7AA',
    boton: '#CC4D0A',
    botonHover: '#AD4109',
    botonActivo: '#933707',
    barra: '#9D3B08',
    barraActivo: '#A95326',
    barraTexto2: '#E7CEC1',
    marca: ['#EA580C', '#C2410C'],
  },
  REPUESTOS: {
    primary: '#00447D',
    primary600: '#003663',
    primary700: '#002948',
    primary50: '#EDF4FA',
    primary100: '#D4E5F2',
    primary200: '#A9CAE4',
    // Ya daba 9.89:1 contra blanco: el botón usa el color de marca tal cual.
    boton: '#00447D',
    botonHover: '#003A6A',
    botonActivo: '#00315A',
    // El marino ya era el tono justo para la barra: va sin oscurecer.
    barra: '#00447D',
    barraActivo: '#1F5A8D',
    barraTexto2: '#BFD0DF',
    marca: ['#00447D', '#003663'],
  },
  RESTAURANTE: VERDE,
  MINIMARKET: VERDE,
  // Belleza (D25 de PLAN-AGENDA-BELLEZA). La fuente es la tabla `Paleta` del
  // backend y llegan en `negocio.tema`; éstas son copia fija de
  // PALETAS-BELLEZA.json para que un salón no quede en verde si el backend
  // todavía no manda el tema. Son las mismas claves que siembra la base.
  PELUQUERIA: {
    // CIRUELA
    primary: '#9B2C6B',
    primary600: '#84255B',
    primary700: '#6D1F4B',
    primary50: '#F9F2F6',
    primary100: '#F1E1EA',
    primary200: '#E3C4D6',
    boton: '#9B2C6B',
    botonHover: '#85265C',
    botonActivo: '#73214F',
    barra: '#84255B',
    barraActivo: '#933F6F',
    barraTexto2: '#E0C9D6',
    marca: ['#9B2C6B', '#84255B'],
  },
  BARBERIA: {
    // CARBON
    primary: '#4A4744',
    primary600: '#3F3C3A',
    primary700: '#343230',
    primary50: '#F4F4F4',
    primary100: '#E6E5E5',
    primary200: '#CCCBCB',
    boton: '#4A4744',
    botonHover: '#403D3A',
    botonActivo: '#373532',
    barra: '#3F3C3A',
    barraActivo: '#565352',
    barraTexto2: '#CFCECE',
    marca: ['#4A4744', '#3F3C3A'],
  },
  SPA: {
    // LAVANDA
    primary: '#7357B8',
    primary600: '#624A9C',
    primary700: '#513D81',
    primary50: '#F7F5FB',
    primary100: '#EBE7F5',
    primary200: '#D8D0EB',
    boton: '#7357B8',
    botonHover: '#634B9E',
    botonActivo: '#554088',
    barra: '#624A9C',
    barraActivo: '#7560A8',
    barraTexto2: '#D8D2E6',
    marca: ['#7357B8', '#624A9C'],
  },
  UNAS: {
    // FRAMBUESA
    primary: '#B5285A',
    primary600: '#9A224D',
    primary700: '#7F1C3F',
    primary50: '#FBF2F5',
    primary100: '#F5E1E8',
    primary200: '#EAC3D1',
    boton: '#B5285A',
    botonHover: '#9C224D',
    botonActivo: '#861E43',
    barra: '#9A224D',
    barraActivo: '#A63D62',
    barraTexto2: '#E6C8D3',
    marca: ['#B5285A', '#9A224D'],
  },
};

/** Los doce tonos sueltos de un tema; `marca` va aparte porque es un par. */
const CLAVES_TONO = [
  'primary',
  'primary600',
  'primary700',
  'primary50',
  'primary100',
  'primary200',
  'boton',
  'botonHover',
  'botonActivo',
  'barra',
  'barraActivo',
  'barraTexto2',
] as const;

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * ¿Estos tokens se pueden pintar tal cual?
 *
 * Vienen de la red, así que se revisan enteros antes de tocar una sola
 * variable: un valor mal formado no da error en CSS, deja la pantalla sin
 * color. Y es todo o nada a propósito: mezclar la mitad de una paleta con la
 * mitad del respaldo daría un botón de un color sobre una barra de otro.
 */
export function esTemaValido(tokens: unknown): tokens is Tema {
  if (!tokens || typeof tokens !== 'object') return false;
  const t = tokens as Record<string, unknown>;
  for (const clave of CLAVES_TONO) {
    const v = t[clave];
    if (typeof v !== 'string' || !HEX.test(v)) return false;
  }
  const marca = t.marca;
  return (
    Array.isArray(marca) &&
    marca.length === 2 &&
    marca.every((c) => typeof c === 'string' && HEX.test(c))
  );
}

/**
 * De dónde sale el color: el negocio de la sesión (o sólo su rubro, como se
 * llamaba antes). Es estructural para no atar este archivo a `types.ts`.
 */
export type OrigenTema =
  | string
  | {
      tipoNegocio?: string | null;
      tema?: { tokens?: unknown } | null;
    }
  | null
  | undefined;

/**
 * El tema que corresponde, en orden: la paleta del negocio si vino y está
 * entera, la del rubro, y si no el verde. Ante la duda, el producto se ve
 * como siempre en vez de quedar sin color.
 */
export function resolverTema(origen: OrigenTema): Tema {
  if (typeof origen === 'string') return TEMAS[origen] || VERDE;
  const tokens = origen?.tema?.tokens;
  if (esTemaValido(tokens)) return tokens;
  const rubro = origen?.tipoNegocio;
  return (rubro && TEMAS[rubro]) || VERDE;
}

/** Los rubros de belleza; copia de `rubro.ts` para no atar este archivo a él. */
const BELLEZA = ['PELUQUERIA', 'BARBERIA', 'SPA', 'UNAS'];

/**
 * Aplica el tema del negocio reescribiendo las variables CSS en :root.
 *
 * Acepta el negocio de la sesión o sólo un rubro (ver `resolverTema`). Sin
 * nada, como antes del login, cae en el verde.
 */
export function aplicarTema(origen: OrigenTema): void {
  const tema = resolverTema(origen);
  const raiz = document.documentElement.style;
  const rubro = typeof origen === 'string' ? origen : origen?.tipoNegocio;
  /*
   * El fondo de la pantalla y el monograma de los artículos sin categoría
   * siguen la paleta sólo en belleza (QA B-24: un salón Ciruela tenía fondo
   * menta y círculos verdes). Restaurante y farmacia vuelven al valor de
   * index.css —el de siempre— quitando la variable, así se ven exactamente
   * como hoy y un cambio de sesión no les deja el color del negocio anterior.
   */
  if (rubro && BELLEZA.includes(rubro)) {
    raiz.setProperty('--color-fondo', tema.fondo && HEX.test(tema.fondo) ? tema.fondo : tema.primary50);
    raiz.setProperty('--monograma-bg', tema.primary100);
    raiz.setProperty('--monograma-fg', tema.primary700);
  } else {
    raiz.removeProperty('--color-fondo');
    raiz.removeProperty('--monograma-bg');
    raiz.removeProperty('--monograma-fg');
  }
  raiz.setProperty('--color-primary', tema.primary);
  raiz.setProperty('--color-primary-600', tema.primary600);
  raiz.setProperty('--color-primary-700', tema.primary700);
  raiz.setProperty('--color-primary-50', tema.primary50);
  raiz.setProperty('--color-primary-100', tema.primary100);
  raiz.setProperty('--color-primary-200', tema.primary200);
  raiz.setProperty('--color-primary-boton', tema.boton);
  raiz.setProperty('--color-primary-boton-hover', tema.botonHover);
  raiz.setProperty('--color-primary-boton-activo', tema.botonActivo);
  raiz.setProperty('--color-barra', tema.barra);
  raiz.setProperty('--color-barra-activo', tema.barraActivo);
  raiz.setProperty('--color-barra-texto-2', tema.barraTexto2);
  // El degradado no es un token de Tailwind sino una utilidad propia
  // (`bg-marca` en index.css), así que se pasa por sus dos extremos.
  raiz.setProperty('--marca-de', tema.marca[0]);
  raiz.setProperty('--marca-a', tema.marca[1]);
}
