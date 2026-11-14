/**
 * Tipos de la página del negocio y de los enlaces cortos, tal como los manda
 * el backend (`src/pagina/` y `src/enlaces/` del API).
 */

import type { Tramo } from "./horario";
import type { CursoPublico } from "../academia/tipos";

/** Un tramo del horario de una sucursal (la regla, en `horario.ts`). */
export type { Tramo };

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

/**
 * Los estilos de página (09-oct): el armado entero de la página (encabezado,
 * fondo, tarjetas, letras). Las claves de `pagina/muestras.ts` del backend;
 * cómo se pinta cada uno, en `estilosPagina.ts`.
 */
export type ClaveEstilo =
  | "CLASICO"
  | "VITRINA"
  | "VIVO"
  | "NOCHE"
  | "BOUTIQUE"
  | "POSTAL"
  | "CARTA"
  | "DULCE"
  | "MOSAICO";

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
  /** El horario en texto libre: con el estructurado, sólo aclaraciones ("feriados cerrado"). */
  horario: string | null;
  mapaUrl: string | null;
  /**
   * El horario por día, para "Abierto ahora · cierra 21:00". Opcional: un
   * backend anterior no lo manda; ausente = null (sin cartel).
   */
  horarioSemanal?: Tramo[] | null;
  /**
   * El WhatsApp propio de la sucursal (`https://wa.me/<n>`), o null si usa el
   * general. Opcional: un backend anterior no lo manda.
   */
  whatsappUrl?: string | null;
  /**
   * El pin del mapa (PLAN-PAGINA-WEB §3.1): si la sucursal tiene ubicación y
   * el dueño no ocultó el mapa. Ausente o null = sin pin.
   */
  ubicacion?: { lat: number; lng: number } | null;
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
  /**
   * Sólo en "Mis productos": la llave del ícono del artículo (la misma del
   * POS), que la web resuelve a su imagen. Sin foto subida, es lo que se ve.
   */
  icono?: string | null;
  /** Sólo en "Mis productos": la categoría del producto, si tiene. */
  categoria?: string | null;
  /**
   * Sólo en un servicio de agenda (un corte, un masaje; 09-nov): su id para
   * reservarlo (`?servicio=`) y cuánto dura. Un servicio no se pide por
   * cantidad. Un plato no es servicio de agenda aunque no controle stock.
   */
  servicioId?: number;
  duracionMin?: number;
  /**
   * Sólo en "Mis productos" con más de una sucursal publicada: el precio y si
   * se ofrece en cada una, en el orden de `CatalogoPublico.sucursales`.
   */
  enSucursal?: EnSucursal[];
}

/** Cómo sale un producto en una sucursal. */
export interface EnSucursal {
  precio: number | null;
  disponible: boolean;
}

export interface CatalogoPublico {
  titulo: string;
  items: ItemCatalogoPublico[];
  /**
   * "Mis productos" con más de una sucursal publicada: sus nombres, para que
   * el visitante elija de cuál ver los precios (la principal primero).
   */
  sucursales?: string[];
  /** Con `sucursales`: el WhatsApp de cada una (null = el general), en el mismo orden. */
  whatsapps?: (string | null)[];
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
  /**
   * El estilo de la página. Opcional: la web y el API se despliegan por
   * separado y un backend anterior no lo manda; ausente = Clásico.
   */
  estilo?: ClaveEstilo | string;
  /** Ruta relativa al API (`/publico/...`) o URL absoluta. */
  logoUrl: string | null;
  portadaUrl: string | null;
  anuncio: AnuncioPublico | null;
  reservar: boolean;
  /**
   * El asistente de la página (bamardev-chat): feature EXTRA
   * `asistente_pagina`, que no viene en ningún plan. Opcional porque un
   * backend anterior no la manda (= apagado).
   */
  asistente?: boolean;
  /** El rubro como clave (`PELUQUERIA`): elige los motivos de las gift cards. */
  rubroClave?: string;
  /** "Pedí por WhatsApp" (IDEAS/6 #1): el catálogo arma el pedido. */
  pedidos?: boolean;
  /**
   * Pedidos directo al sistema (13-nov): ya resuelto por el backend con las
   * cuatro condiciones del contrato (licencia y `delivery`, «Mis productos»,
   * el interruptor y WhatsApp apagado). Opcional: un backend anterior no lo manda.
   */
  pedidosSistema?: boolean;
  /** Gift cards que se piden desde la página (IDEAS/6 #6), o null. */
  regalos?: RegalosPublicos | null;
  /**
   * La sección Cursos de un instituto (P1): null si `mostrarCursos` está
   * apagado o falta la feature `preinscripcion_online`. Opcional: un backend
   * anterior no lo manda.
   */
  cursos?: CursoPublico[] | null;
  destacado: EnlacePublico | null;
  redes: EnlacePublico[];
  botones: EnlacePublico[];
  sucursales: SucursalPublica[];
  /**
   * null si no hay ítems visibles. Opcional en el tipo: la web y el API se
   * despliegan por separado y un backend anterior no lo manda.
   */
  catalogo?: CatalogoPublico | null;
  /**
   * El sitio del Profesional (PLAN-PAGINA-PRO M1): null = la página de
   * siempre, sin tocar nada. Opcional: un backend anterior no lo manda.
   */
  sitio?: SitioPublico | null;
  /** El destacado del día que se publica desde la caja (M4). Ausente o null = no hay. */
  destacadoDia?: DestacadoDia | null;
  pie: { atribucionUrl: string };
  og: { titulo: string; descripcion: string; imagen: string | null; url: string };
}

// ── El sitio del Profesional (PLAN-PAGINA-PRO M1) ──────────────────────────
// Las formas de `pagina/sitio/sitio.ts` del backend.

export type PlantillaSitio = "GASTRONOMIA" | "BELLEZA" | "COMERCIO";

export type TipoBloque =
  | "PORTADA"
  | "DESTACADO"
  | "CATALOGO"
  | "QUIENES"
  | "GALERIA"
  | "UBICACION"
  | "PREGUNTAS"
  | "RESENAS"
  | "VIDEO";

/** Una foto del sitio ya resuelta a URL (relativa al API, como `logoUrl`). */
export interface FotoPublica {
  url: string;
  leyenda: string | null;
}

export interface DatoDestacado {
  valor: string;
  etiqueta: string;
}

export interface PreguntaFrecuente {
  pregunta: string;
  respuesta: string;
}

/** Un bloque como lo dibuja la página: sólo los prendidos y con contenido, en orden. */
export type BloquePublico =
  | { tipo: "PORTADA"; titulo: string | null; subtitulo: string | null; fotos: FotoPublica[] }
  | { tipo: "DESTACADO" }
  | { tipo: "CATALOGO"; titulo: string | null }
  | {
      tipo: "QUIENES";
      titulo: string | null;
      texto: string | null;
      desde: number | null;
      datos: DatoDestacado[];
      foto: FotoPublica | null;
    }
  | { tipo: "GALERIA"; titulo: string | null; fotos: FotoPublica[] }
  | { tipo: "UBICACION"; titulo: string | null }
  | { tipo: "PREGUNTAS"; titulo: string | null; items: PreguntaFrecuente[] }
  | { tipo: "RESENAS"; googleUrl: string }
  | { tipo: "VIDEO"; titulo: string | null; url: string };

export interface SitioPublico {
  plantilla: PlantillaSitio | string;
  bloques: BloquePublico[];
}

/** Lo que se publica desde la caja ("Almuerzo de hoy", "Turnos libres hoy"; M4). */
export interface DestacadoDia {
  tipo: string;
  etiqueta: string;
  items: { titulo: string; precio: number | null; fotoUrl: string | null }[];
  restante: number | null;
  texto: string | null;
  descuentoPct: number | null;
  turnos: { hora: string; profesional: string | null }[] | null;
  hasta: string;
  publicadoEn: string;
}

/** Una foto en el editor: `FOTO_<n>`. */
export interface FotoConLeyenda {
  foto: string;
  leyenda: string | null;
}

export interface DatosPorBloque {
  PORTADA: { titulo: string | null; subtitulo: string | null; fotos: string[] };
  DESTACADO: Record<string, never>;
  CATALOGO: { titulo: string | null };
  QUIENES: {
    titulo: string | null;
    texto: string | null;
    desde: number | null;
    datos: DatoDestacado[];
    foto: string | null;
  };
  GALERIA: { titulo: string | null; fotos: FotoConLeyenda[] };
  UBICACION: { titulo: string | null };
  PREGUNTAS: { titulo: string | null; items: PreguntaFrecuente[] };
  RESENAS: { googleUrl: string | null };
  VIDEO: { titulo: string | null; url: string | null };
}

/** Un bloque del editor, con sus datos según el tipo. */
export type Bloque = {
  [T in TipoBloque]: { tipo: T; visible: boolean; datos: DatosPorBloque[T] };
}[TipoBloque];

/** El sitio como lo guarda el borrador (`PUT /pagina/borrador/sitio`). */
export interface Sitio {
  plantilla: PlantillaSitio;
  bloques: Bloque[];
}

export interface LimitesSitio {
  titulo: number;
  subtitulo: number;
  texto: number;
  leyenda: number;
  datoValor: number;
  datoEtiqueta: number;
  datos: number;
  fotosPortada: number;
  fotosGaleria: number;
  pregunta: number;
  respuesta: number;
  preguntas: number;
  fotos: number;
}

/** `GET /pagina` › `sitio`. */
export interface EstadoSitio {
  /** Sin la feature `sitio_web`, false: el editor no ofrece nada del sitio. */
  disponible: boolean;
  plantillaSugerida: PlantillaSitio;
  plantillas: PlantillaSitio[];
  tiposBloque: TipoBloque[];
  limites: LimitesSitio;
  /** El del borrador si lo hay; si no, el publicado. null = no eligió plantilla. */
  actual: Sitio | null;
  publicado: boolean;
  enBorrador: boolean;
  /** Todas las fotos subidas, usadas o no. */
  fotos: { foto: string; url: string | null }[];
  /** Las que usa el sitio publicado: no se pueden borrar. */
  fotosPublicadas: string[];
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
  /** El horario por día; opcional por lo mismo que en `SucursalPublica` (ausente = null). */
  horarioSemanal?: Tramo[] | null;
  /** El WhatsApp propio (sólo dígitos, con 591), o null = usa el general. */
  whatsapp?: string | null;
  /** Si recibe reservas online y con qué nombre en el enlace (para la vista previa). */
  publicaReservas?: boolean;
  slugReservas?: string | null;
  /** Dónde está: se marca en Mi página o en la ficha de la sucursal. */
  latitud?: number | null;
  longitud?: number | null;
}

/** La ficha única de una sucursal (Configuración › Sucursales, 02-nov). */
export interface FichaSucursal {
  id: number;
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  esPrincipal: boolean;
  latitud: number | null;
  longitud: number | null;
  horarioSemanal: Tramo[] | null;
}

export interface AjustesPagina {
  publicada: boolean;
  bloqueada: boolean;
  motivoBloqueo: string | null;
  /**
   * El nombre que muestra la página, aparte del nombre del negocio en el panel
   * (Derick, 04-nov). null = el del negocio. Un backend anterior no lo manda.
   */
  nombrePublico?: string | null;
  /**
   * Cómo se presenta el negocio en la página, en lugar del nombre del rubro
   * («Restaurante»). null = el del rubro. Un backend anterior no lo manda.
   */
  rubroPublico?: string | null;
  descripcion: string | null;
  colorClave: string;
  formaBotones: FormaBotones;
  tipografia: Tipografia;
  /** Opcional por lo mismo que `PaginaPublica.estilo`: ausente = Clásico. */
  estiloClave?: ClaveEstilo;
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
  /**
   * De dónde sale el catálogo: armado a mano o los productos del sistema
   * (13-oct). Uno u otro. Opcional: un backend anterior no lo manda (= MANUAL).
   */
  catalogoModo?: ModoCatalogo;
  /** "Pedí por WhatsApp" (IDEAS/6 #1). Opcional: un backend anterior no lo manda. */
  pedidosWhatsapp?: boolean;
  /** «Recibir pedidos en el sistema» (13-nov). Opcional por lo mismo. */
  pedidosSistema?: boolean;
  /** Gift cards desde la página (IDEAS/6 #6). Opcional por lo mismo. */
  regalos?: ConfigRegalos;
  /** La sección Cursos de un instituto (P1). Opcional por lo mismo. */
  mostrarCursos?: boolean;
  /** El mapa con las sucursales (PLAN-PAGINA-WEB §3.1). Opcional por lo mismo. */
  mostrarMapa?: boolean;
  /** Mostrar el horario de las sucursales (se carga en su ficha). Opcional por lo mismo. */
  mostrarHorario?: boolean;
  actualizadoEn: string;
}

/** Lo que el dueño configura de las gift cards de su página. */
export interface ConfigRegalos {
  activo: boolean;
  /** Montos sugeridos en Bs. */
  montos: number[];
  montoLibre: boolean;
  /** Claves de diseño ofrecidas; vacío = todas. */
  disenos: string[];
  /** El que aparece elegido primero. */
  diseno: string | null;
  vigenciaDias: number | null;
  condiciones: string | null;
}

/** Lo que la página pública ofrece de gift cards (sin nada interno). */
export interface RegalosPublicos {
  montos: number[];
  montoLibre: boolean;
  montoMin: number;
  montoMax: number;
  disenos: string[];
  diseno: string;
  vigenciaDias: number | null;
  condiciones: string | null;
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

/** Los dos modos del catálogo de la página, excluyentes. */
export type ModoCatalogo = "MANUAL" | "PRODUCTOS";

/** Un producto del sistema como lo ofrece el selector (`GET /pagina/catalogo/productos`). */
export interface ProductoParaPagina {
  /** El id del producto: es lo que se manda al fijar. */
  id: number;
  nombre: string;
  /** El precio de lista; null si es 0 (no se muestra "Bs 0"). */
  precio: number | null;
  icono: string | null;
  categoria: string | null;
}

/** Un producto fijado en la página (`GET /pagina` y `PUT /pagina/catalogo/productos`). */
export interface ProductoFijado extends ProductoParaPagina {
  orden: number;
  /** false = fijado pero hoy no sale (inactivo o dado de baja); vuelve si lo reactivan. */
  vendible: boolean;
  /** Lo que la página muestra al tocarlo. Opcional: un backend anterior no lo manda. */
  descripcion?: string | null;
  /**
   * Las excepciones de cada sucursal (precio propio, null = el de lista; y si
   * se ofrece ahí). Con esto la vista previa arma lo mismo que la página.
   */
  porSucursal?: { almacenId: number; precio: number | null; disponible: boolean }[];
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
    /** El rubro como clave (`TipoNegocio`: RESTAURANTE, PELUQUERIA…). */
    rubro: string;
    /** El rubro como lo muestra la página ("Peluquería"). */
    rubroNombre?: string;
    iniciales: string;
  };
  pagina: AjustesPagina;
  /**
   * Si hay cambios sin publicar (PLAN-PAGINA-WEB §4.2). Lo demás de este
   * estado ya viene con el borrador encima. Opcional: un backend anterior
   * no lo manda.
   */
  borrador?: {
    hay: boolean;
    actualizadoEn: string | null;
    /** "Te la armamos" (M5): el borrador lo armó BamarDev y el dueño todavía no lo publicó. */
    armadoPorBamarDev?: boolean;
  };
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
  /** "Mis productos": los fijados, en orden. Opcionales por lo mismo que `catalogo`. */
  productosCatalogo?: ProductoFijado[];
  /** Cuántos productos a la venta tiene el negocio: con 0, el modo no se ofrece. */
  productosVendibles?: number;
  /** Cuántos productos se pueden fijar (60). */
  topeProductos?: number;
  /** El sitio del Profesional. Opcional: un backend anterior no lo manda (= no disponible). */
  sitio?: EstadoSitio;
}

export type CambiosPagina = Partial<
  Pick<
    AjustesPagina,
    | "publicada"
    | "nombrePublico"
    | "rubroPublico"
    | "descripcion"
    | "colorClave"
    | "formaBotones"
    | "tipografia"
    | "estiloClave"
    | "anuncioTexto"
    | "anuncioHasta"
    | "anuncioUrl"
    | "anuncioEstilo"
    | "anuncioColorFondo"
    | "anuncioColorTexto"
    | "enlaceDestacadoId"
    | "mostrarReservar"
    | "catalogoTitulo"
    | "catalogoModo"
    | "pedidosWhatsapp"
    | "pedidosSistema"
    | "mostrarCursos"
    | "mostrarMapa"
    | "mostrarHorario"
  >
> & {
  regalosActivo?: boolean;
  regalosMontos?: number[];
  regalosMontoLibre?: boolean;
  regalosDisenos?: string[];
  regalosDiseno?: string | null;
  regalosVigenciaDias?: number | null;
  regalosCondiciones?: string | null;
};

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
