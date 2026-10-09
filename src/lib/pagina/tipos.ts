/**
 * Tipos de la página del negocio y de los enlaces cortos, tal como los manda
 * el backend (`src/pagina/` y `src/enlaces/` del API).
 */

/** Las claves de `pagina/muestras.ts` del backend; cómo se pintan, en `estilos.ts`. */
export type FormaBotones =
  | "REDONDEADO"
  | "PILDORA"
  | "RECTO"
  | "CONTORNO"
  | "TINTE"
  | "SOMBRA_DURA"
  | "RELIEVE"
  | "DEGRADADO"
  | "HOJA"
  | "ESQUINA"
  | "SUBRAYADO";

export type Tipografia =
  | "MODERNA"
  | "MONTSERRAT"
  | "POPPINS"
  | "RALEWAY"
  | "JOSEFIN"
  | "NUNITO"
  | "QUICKSAND"
  | "COMFORTAA"
  | "VARELA"
  | "FREDOKA"
  | "ELEGANTE"
  | "LORA"
  | "MERRIWEATHER"
  | "CORMORANT"
  | "DM_SERIF"
  | "CINZEL"
  | "FUERTE"
  | "BEBAS"
  | "ANTON"
  | "ARCHIVO_BLACK"
  | "ABRIL"
  | "ALFA_SLAB"
  | "RIGHTEOUS"
  | "PACIFICO"
  | "LOBSTER"
  | "DANCING"
  | "GREAT_VIBES"
  | "CAVEAT"
  | "KAUSHAN"
  | "MARKER";

export type EstiloAnuncio =
  | "SUAVE"
  | "SOLIDO"
  | "CONTORNO"
  | "PILDORA"
  | "CINTA"
  | "ICONO"
  | "MARQUESINA"
  | "TARJETA"
  | "DEGRADADO"
  | "MINIMAL";

export type TipoEnlace =
  | "WHATSAPP"
  | "FACEBOOK"
  | "INSTAGRAM"
  | "TIKTOK"
  | "MAPS"
  | "YOUTUBE"
  | "WEB"
  | "TELEFONO"
  | "CORREO"
  | "DELIVERY"
  | "TELEGRAM"
  | "X"
  | "THREADS"
  | "LINKEDIN"
  | "BOTON";

export type FormatoEnlace = "ICONO" | "BOTON";

export interface Muestra {
  clave: string;
  nombre: string;
  hex: string;
}

export interface EnlacePublico {
  id: number;
  tipo: TipoEnlace | string;
  etiqueta: string;
  url: string;
  icono: string | null;
}

export interface SucursalPublica {
  nombre: string;
  /**
   * El slug de la sucursal en la reserva online, o null si no recibe reservas
   * por internet (entonces su tarjeta no muestra "Reservar"). Sin el id del
   * almacén: la página no expone ids internos (B07/B23).
   */
  reservaSlug: string | null;
  direccion: string | null;
  telefono: string | null;
  horario: string | null;
  mapaUrl: string | null;
}

/**
 * La franja destacada. El estilo y los colores son opcionales en el tipo: un
 * backend anterior no los manda, y entonces se ve la franja de siempre.
 */
export interface AnuncioPublico {
  texto: string;
  url: string | null;
  estilo?: EstiloAnuncio | string;
  /** `#RRGGBB` o null = automático. */
  colorFondo?: string | null;
  colorTexto?: string | null;
}

/** Un ítem del catálogo tal como lo ve el cliente (sólo los visibles, en orden). */
export interface ItemCatalogoPublico {
  id: number;
  titulo: string;
  descripcion: string | null;
  /** En Bs; null = sin precio (no se muestra nada). */
  precio: number | null;
  /** "Desde Bs 80": el precio es el mínimo. */
  precioDesde: boolean;
  /** Ruta relativa al API o URL absoluta: pasa por `urlDeImagen`. */
  fotoUrl: string | null;
}

export interface CatalogoPublico {
  titulo: string;
  items: ItemCatalogoPublico[];
}

/** `GET /publico/pagina/:subdominio`. */
export interface PaginaPublica {
  subdominio: string;
  nombre: string;
  rubro: string;
  iniciales: string;
  descripcion: string | null;
  color: { clave: string; hex: string };
  formaBotones: FormaBotones | string;
  tipografia: Tipografia | string;
  /** Ruta relativa al API (`/publico/...`) o URL absoluta. */
  logoUrl: string | null;
  portadaUrl: string | null;
  anuncio: AnuncioPublico | null;
  reservar: boolean;
  destacado: EnlacePublico | null;
  redes: EnlacePublico[];
  botones: EnlacePublico[];
  sucursales: SucursalPublica[];
  /**
   * null si no hay ítems visibles. Opcional en el tipo: la web y el API se
   * despliegan por separado y un backend anterior no lo manda.
   */
  catalogo?: CatalogoPublico | null;
  pie: { atribucionUrl: string };
  og: { titulo: string; descripcion: string; imagen: string | null; url: string };
}

export interface EnlaceEditor {
  id: number;
  tipo: TipoEnlace;
  formato: FormatoEnlace;
  etiqueta: string;
  valor: string;
  url: string;
  icono: string | null;
  orden: number;
  visible: boolean;
  clics: number;
}

export interface SucursalEditor {
  id: number;
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  esPrincipal: boolean;
  publicarEnPagina: boolean;
  horarioTexto: string | null;
  mapsUrl: string | null;
  /** Si recibe reservas online y con qué nombre en el enlace (para la vista previa). */
  publicaReservas?: boolean;
  slugReservas?: string | null;
}

export interface AjustesPagina {
  publicada: boolean;
  bloqueada: boolean;
  motivoBloqueo: string | null;
  descripcion: string | null;
  colorClave: string;
  formaBotones: FormaBotones;
  tipografia: Tipografia;
  anuncioTexto: string | null;
  anuncioHasta: string | null;
  anuncioUrl: string | null;
  /** Opcionales por lo mismo que en `AnuncioPublico`: sin ellos, SUAVE y automático. */
  anuncioEstilo?: EstiloAnuncio;
  anuncioColorFondo?: string | null;
  anuncioColorTexto?: string | null;
  enlaceDestacadoId: number | null;
  mostrarReservar: boolean;
  /** El título de la sección del catálogo; null = "Catálogo". Opcional como `catalogo`. */
  catalogoTitulo?: string | null;
  actualizadoEn: string;
}

/** Un ítem del catálogo en el editor (`GET /pagina`, ya ordenado). */
export interface ItemCatalogoEditor {
  id: number;
  titulo: string;
  descripcion: string | null;
  precio: number | null;
  precioDesde: boolean;
  visible: boolean;
  orden: number;
  /** Ruta relativa al API: pasa por `urlDeImagen`. */
  fotoUrl: string | null;
}

/** Alta (`POST /pagina/catalogo`) y, parcial, edición (`PATCH /pagina/catalogo/:id`). */
export interface ItemCatalogoInput {
  titulo: string;
  descripcion?: string | null;
  precio?: number | null;
  precioDesde?: boolean;
  visible?: boolean;
}

/** `GET /pagina`: todo lo que necesita el editor "Mi página". */
export interface EstadoEditor {
  subdominio: string | null;
  urlPublica: string | null;
  negocio: {
    nombre: string;
    rubro: string;
    /** El rubro como lo muestra la página ("Peluquería"). */
    rubroNombre?: string;
    iniciales: string;
  };
  pagina: AjustesPagina;
  imagenes: { logo: string | null; portada: string | null };
  enlaces: EnlaceEditor[];
  sucursales: SucursalEditor[];
  reservaOnline: boolean;
  enlacesCortos: boolean;
  muestras: Muestra[];
  /** Opcionales por lo mismo que `PaginaPublica.catalogo`. */
  catalogo?: ItemCatalogoEditor[];
  /** Cuántos ítems admite el catálogo (60). */
  topeCatalogo?: number;
}

export type CambiosPagina = Partial<
  Pick<
    AjustesPagina,
    | "publicada"
    | "descripcion"
    | "colorClave"
    | "formaBotones"
    | "tipografia"
    | "anuncioTexto"
    | "anuncioHasta"
    | "anuncioUrl"
    | "anuncioEstilo"
    | "anuncioColorFondo"
    | "anuncioColorTexto"
    | "enlaceDestacadoId"
    | "mostrarReservar"
    | "catalogoTitulo"
  >
>;

export interface EnlaceInput {
  tipo: TipoEnlace;
  formato?: FormatoEnlace;
  etiqueta?: string;
  valor: string;
  mensaje?: string;
  icono?: string;
  visible?: boolean;
}

export interface EnlaceCortoSistema {
  url: string;
  codigo: string;
  destino: string;
  clicsTotal: number;
}

// ── Enlaces cortos ("Mis enlaces") ─────────────────────────────────────────

export type DestinoTipo = "PAGINA" | "RESERVA" | "URL";
export type EstadoEnlaceCorto = "ACTIVO" | "PAUSADO" | "VENCIDO" | "DESACTIVADO";

export interface EnlaceCorto {
  id: number;
  codigo: string;
  url: string;
  destinoTipo: DestinoTipo;
  destino: string | null;
  titulo: string;
  canal: string | null;
  origen: string;
  estado: EstadoEnlaceCorto;
  activo: boolean;
  desactivadoPor: string | null;
  motivoDesactivacion: string | null;
  expiraEn: string | null;
  clicsTotal: number;
  clics7Dias: number;
  ultimoClicEn: string | null;
  creadoEn: string;
}

export interface EnlaceCortoInput {
  destinoTipo: DestinoTipo;
  destino?: string;
  titulo: string;
  canal?: string;
  expiraEn?: string;
}

export interface EstadisticasEnlace {
  enlace: EnlaceCorto;
  porDia: { fecha: string; clics: number }[];
  porOrigen: { origen: string; clics: number }[];
  cambios: { destinoAnterior: string; destinoNuevo: string; creadoEn: string }[];
}
