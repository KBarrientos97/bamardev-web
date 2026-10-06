/**
 * Tipos de la página del negocio y de los enlaces cortos, tal como los manda
 * el backend (`src/pagina/` y `src/enlaces/` del API).
 */

export type FormaBotones = "REDONDEADO" | "PILDORA" | "RECTO";
export type Tipografia = "MODERNA" | "ELEGANTE" | "FUERTE";

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
  anuncio: { texto: string; url: string | null } | null;
  reservar: boolean;
  destacado: EnlacePublico | null;
  redes: EnlacePublico[];
  botones: EnlacePublico[];
  sucursales: SucursalPublica[];
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
  enlaceDestacadoId: number | null;
  mostrarReservar: boolean;
  actualizadoEn: string;
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
    | "enlaceDestacadoId"
    | "mostrarReservar"
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
