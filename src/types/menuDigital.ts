/**
 * El menú digital (feature `menu_digital`) y el diseño del recibo: calcados de
 * `bamardev-backend/src/menu-digital`.
 */

export const DISENOS_MENU = ["fotos", "lista", "destacado"] as const;
export type DisenoMenu = (typeof DISENOS_MENU)[number];

export const TEMAS_MENU = ["rojo", "amarillo", "brasa", "crema", "verde", "personalizado"] as const;
export type TemaMenu = (typeof TEMAS_MENU)[number];

export type TamanoMenu = "s" | "m" | "l";

/**
 * Los diseños que se mueven (Kevin, 8-nov). Van aparte de `diseno` por la app
 * Android: un diseño que no conoce lo lee como "fotos" y lo guarda así (ver
 * `pantallas-menu.ts` del backend).
 */
export const ANIMADOS_MENU = ["presentacion", "carrusel", "mosaico"] as const;
export type AnimadoMenu = (typeof ANIMADOS_MENU)[number];

export type LadoLogo = "izquierda" | "derecha";

export interface PantallaMenu {
  numero: number;
  nombre: string;
  diseno: DisenoMenu;
  tema: TemaMenu;
  colores: { fondo: string; acento: string; texto: string };
  titulo: string;
  subtitulo: string;
  cinta: string;
  /** Vacío = todas. */
  categorias: number[];
  ocultos: number[];
  columnas: number;
  tamano: TamanoMenu;
  rotarSeg: number;
  logo: boolean;
  fotos: boolean;
  descripciones: boolean;
  etiquetas: boolean;
  agotadosTachados: boolean;
  /**
   * Sin stock en Inventario cuenta como agotado (9-nov). Apagado sale normal;
   * lo marcado "Agotado hoy" sale agotado igual. Ausente (backend anterior) = sí.
   */
  agotadoPorStock?: boolean;
  // Del 8-nov. Opcionales a propósito: un backend anterior no los manda, y la
  // TV tiene que seguir andando con los de fábrica (`conAnimacion`).
  /** Null o ausente = el `diseno` de siempre, quieto. */
  animado?: AnimadoMenu | null;
  /** El logo en grande con el nombre al empezar cada vuelta. */
  intro?: boolean;
  /** El nombre de la presentación; vacío = el del negocio. */
  textoIntro?: string;
  /** Segundos de cada plato en grande (Presentación y Carrusel). */
  segPlato?: number;
  /** Las bebidas pasan por la cinta de abajo (Carrusel y Mosaico). */
  bebidasEnCinta?: boolean;
  ladoLogo?: LadoLogo;
  /** El orden de los platos en ESTA TV, dentro de su categoría. Vacío = por nombre. */
  orden?: number[];
}

export const ETIQUETAS_PLATO = ["MAS_VENDIDO", "NUEVO", "PROMO"] as const;
export type EtiquetaPlato = (typeof ETIQUETAS_PLATO)[number];

export const TEXTO_ETIQUETA: Record<EtiquetaPlato, string> = {
  MAS_VENDIDO: "Más vendido",
  NUEVO: "Nuevo",
  PROMO: "Promo",
};

/** Un plato tal como lo ve el editor: nombre y precio de Inventario, lo demás del menú. */
export interface PlatoMenu {
  id: number;
  nombre: string;
  precio: number;
  icono: string | null;
  categoriaId: number | null;
  categoria: string | null;
  /** Ruta de la foto (relativa al API), o null: sale el ícono. */
  foto: string | null;
  /**
   * La foto es sólo el plato, sin fondo: la TV la dibuja suelta, como el
   * ícono, y no enmarcada. Opcional: un backend anterior no lo manda y la
   * foto sale enmarcada como siempre.
   */
  fotoSinFondo?: boolean;
  descripcion: string | null;
  etiqueta: EtiquetaPlato | null;
  destacado: boolean;
  enMenu: boolean;
  /** Marcado agotado hoy a mano. */
  agotadoHoy: boolean;
  /** Lo que ve el cliente: agotado a mano o sin stock. */
  agotado: boolean;
  /**
   * false = el local que se está mirando no lo ofrece (PLAN-SUCURSAL-TOTAL §8.2);
   * el editor lo sigue listando para poder tocarlo. Ausente = backend anterior
   * (se ofrece en todos).
   */
  disponible?: boolean;
}

export interface EditorMenu {
  pantallas: PantallaMenu[];
  platos: PlatoMenu[];
  categorias: { id: number; nombre: string }[];
  /** Versión (huella) del logo, o null si no hay. */
  logo: string | null;
}

/** GET /publico/pantallas/:llave/menu/:numero */
export interface MenuPublicoApi {
  negocio: string;
  moneda?: string;
  ahora: number;
  logo: string | null;
  pantalla: PantallaMenu;
  categorias: { id: number; nombre: string }[];
  platos: Omit<PlatoMenu, "categoria" | "enMenu" | "agotadoHoy">[];
}

/** Chica, Normal o Grande: cuánto achica cada una está en `ESCALA_LETRA` (lib/menuDigital/letraRecibo). */
export type TamanoLetra = "s" | "m" | "l";

/** Lo de la mesa y lo que se lleva: en bloques EN MESA y PARA LLEVAR, o con M o LL en cada producto. */
export type ModeloConsumo = "separado" | "letras";

/** El diseño del recibo (`menu-digital/ajustes-recibo.ts` del backend). */
export interface AjustesRecibo {
  ancho: number;
  logo: boolean;
  tamanoLogo: "s" | "m" | "l";
  /**
   * La letra del recibo y la de la comanda, cada una por su lado: la caja
   * quiere ahorrar rollo y la cocina leer de lejos. "l" es como salía el
   * papel hasta el 5-nov.
   */
  tamanoLetra: TamanoLetra;
  tamanoLetraComanda: TamanoLetra;
  nombre: boolean;
  lema: string;
  direccion: string;
  telefono: string;
  nit: string;
  /** Lo elige cada negocio (Kevin, 8-nov). */
  modeloConsumo: ModeloConsumo;
  cajero: boolean;
  /** Cada renglón se apaga por su lado (Kevin, 8-nov): el dueño saca lo que no quiere que se vea. */
  subtotal: boolean;
  total: boolean;
  totalEnLetras: boolean;
  pagoYCambio: boolean;
  minutosEstimados: number;
  qr: { mostrar: boolean; titulo: string; texto: string; enlace: string };
  /** Apagado, el pie no lleva el mensaje; el texto queda guardado por si lo vuelve a prender. */
  mostrarMensaje: boolean;
  mensaje: string;
  /**
   * Qué sale solo al registrar la venta. Juntos: una impresión con el corte en
   * el medio. Separados: el recibo y después la comanda, cada uno con su
   * diálogo, para mandar cada papel a su impresora.
   */
  alCobrar: { recibo: boolean; comanda: boolean; juntos: boolean };
}

export const RECIBO_DE_FABRICA: AjustesRecibo = {
  ancho: 80,
  logo: true,
  tamanoLogo: "s",
  tamanoLetra: "m",
  tamanoLetraComanda: "m",
  nombre: true,
  lema: "",
  direccion: "",
  telefono: "",
  nit: "",
  modeloConsumo: "separado",
  cajero: true,
  subtotal: true,
  total: true,
  totalEnLetras: true,
  pagoYCambio: true,
  minutosEstimados: 0,
  qr: { mostrar: false, titulo: "Síguenos", texto: "", enlace: "" },
  mostrarMensaje: true,
  mensaje: "¡Gracias por su compra!",
  alCobrar: { recibo: false, comanda: false, juntos: true },
};
