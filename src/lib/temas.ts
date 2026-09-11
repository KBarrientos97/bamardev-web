/**
 * Tema de color por rubro.
 *
 * **Éste es el archivo que se toca para cambiar un color.** Los componentes no
 * llevan colores propios: usan los tokens de Tailwind (`bg-primary`,
 * `text-primary-700`…) definidos en index.css, y acá se reescriben esas
 * variables CSS al entrar. Por eso cambiar un rubro es cambiar seis valores y
 * nada más, sin tocar las ~40 pantallas.
 *
 * El rubro llega en el login (`negocio.tipoNegocio`, el enum de la base).
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
  /** Degradado de la barra superior y el login. */
  marca: [string, string];
}

/** Verde esmeralda: el de siempre. Restaurante, minimarket y desconocidos. */
const VERDE: Tema = {
  primary: '#10b981',
  primary600: '#059669',
  primary700: '#047857',
  primary50: '#ecfdf5',
  primary100: '#d1fae5',
  primary200: '#a7f3d0',
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
    marca: ['#3196EB', '#1F7AC8'],
  },
  FERRETERIA: {
    primary: '#EA580C',
    primary600: '#C2410C',
    primary700: '#9A3412',
    primary50: '#FFF7ED',
    primary100: '#FFEDD5',
    primary200: '#FED7AA',
    marca: ['#EA580C', '#C2410C'],
  },
  REPUESTOS: {
    primary: '#00447D',
    primary600: '#003663',
    primary700: '#002948',
    primary50: '#EDF4FA',
    primary100: '#D4E5F2',
    primary200: '#A9CAE4',
    marca: ['#00447D', '#003663'],
  },
  RESTAURANTE: VERDE,
  MINIMARKET: VERDE,
};

/**
 * Aplica el tema del rubro reescribiendo las variables CSS en :root.
 *
 * Un rubro desconocido (o sin rubro, como antes del login) cae en el verde:
 * ante la duda, el producto se ve como siempre en vez de quedar sin color.
 */
export function aplicarTema(rubro: string | null | undefined): void {
  const tema = (rubro && TEMAS[rubro]) || VERDE;
  const raiz = document.documentElement.style;
  raiz.setProperty('--color-primary', tema.primary);
  raiz.setProperty('--color-primary-600', tema.primary600);
  raiz.setProperty('--color-primary-700', tema.primary700);
  raiz.setProperty('--color-primary-50', tema.primary50);
  raiz.setProperty('--color-primary-100', tema.primary100);
  raiz.setProperty('--color-primary-200', tema.primary200);
  // El degradado no es un token de Tailwind sino una utilidad propia
  // (`bg-marca` en index.css), así que se pasa por sus dos extremos.
  raiz.setProperty('--marca-de', tema.marca[0]);
  raiz.setProperty('--marca-a', tema.marca[1]);
}
