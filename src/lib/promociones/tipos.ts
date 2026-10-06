/** Contrato de `/promociones`, `/ventas/cotizar` y `/publico/promo` (PLAN-CRM-Y-PROMOCIONES). */

export type TipoPromocion = "PORCENTAJE" | "MONTO" | "PRECIO_ESPECIAL" | "NXM";
export type DisparoPromocion = "AUTOMATICA" | "CODIGO";
export type AlcancePromocion = "LINEA" | "TICKET";
export type EstadoPromocion = "ACTIVA" | "PAUSADA" | "ARCHIVADA";
/** El que se muestra: PROGRAMADA, FINALIZADA y AGOTADA se derivan. */
export type EstadoVisible = EstadoPromocion | "PROGRAMADA" | "FINALIZADA" | "AGOTADA";

export interface Promocion {
  id: number;
  nombre: string;
  descripcion: string | null;
  tipo: TipoPromocion;
  disparo: DisparoPromocion;
  alcance: AlcancePromocion;
  valor: number | null;
  llevaN: number | null;
  pagaM: number | null;
  minimoCompra: number | null;
  topeDescuento: number | null;
  vigenciaDesde: string | null;
  vigenciaHasta: string | null;
  /** 1 = lunes … 7 = domingo; vacío = todos. */
  diasSemana: number[];
  horaDesde: string | null;
  horaHasta: string | null;
  usosMax: number | null;
  usosPorCliente: number | null;
  usos: number;
  descontado: number;
  acumulable: boolean;
  prioridad: number;
  publica: boolean;
  slug: string | null;
  estado: EstadoPromocion;
  estadoVisible: EstadoVisible;
  version: number;
  productoIds: number[];
  categoriaIds: number[];
  excluirProductoIds: number[];
  cupones: number;
  /** En lenguaje claro: "20 % de descuento", "Sólo los martes"… */
  condiciones: string[];
  urlPublica: string | null;
  creadoEn: string;
}

export type PromocionInput = Partial<
  Pick<
    Promocion,
    | "nombre"
    | "descripcion"
    | "tipo"
    | "disparo"
    | "alcance"
    | "valor"
    | "llevaN"
    | "pagaM"
    | "minimoCompra"
    | "topeDescuento"
    | "vigenciaDesde"
    | "vigenciaHasta"
    | "diasSemana"
    | "horaDesde"
    | "horaHasta"
    | "usosMax"
    | "usosPorCliente"
    | "acumulable"
    | "publica"
    | "productoIds"
    | "categoriaIds"
    | "excluirProductoIds"
  >
> & {
  /**
   * El código del cupón genérico, en la misma promoción "con código" (§12,
   * decisión 8): se crea junto con ella. Opcional.
   */
  codigo?: string;
};

/** `GET /promociones/cupones/disponible`: el aviso al instante del formulario. */
export interface DisponibilidadCupon {
  /** Como se guardaría (mayúsculas, sin espacios ni guiones). */
  codigo: string;
  disponible: boolean;
  motivo?: "FORMATO" | "EXISTE";
  mensaje?: string;
}

export interface Cupon {
  id: number;
  codigo: string;
  usos: number;
  usosMax: number | null;
  usosPorCliente: number | null;
  estado: "ACTIVO" | "AGOTADO" | "VENCIDO" | "ANULADO";
  venceEn: string | null;
  clienteId: number | null;
  cliente: string | null;
  origen: "MANUAL" | "LOTE";
  creadoEn: string;
}

export interface CuponesInput {
  codigo?: string;
  cantidad?: number;
  prefijo?: string;
  usosMax?: number;
  usosPorCliente?: number;
  venceEn?: string;
}

export interface ReportePromocion {
  promocionId: number;
  usos: number;
  descontado: number;
  ventasNetas: number;
  ticketMedio: number | null;
  clientesUnicos: number;
  nota: string;
}

export interface EnlaceCampana {
  url: string;
  /** Con `{nombre}` para reemplazar por cada cliente. */
  texto: string;
  enlace: { codigo: string; clicsTotal: number };
}

// ── Cotización ─────────────────────────────────────────────────────────────

export interface DescuentoEsperado {
  promocionId: number;
  monto: number;
}

export interface Aplicada {
  promocionId: number;
  version: number;
  nombre: string;
  origen: "PROMOCION" | "CUPON";
  codigo: string | null;
  alcance: AlcancePromocion;
  monto: number;
}

export interface Descartada {
  promocionId: number | null;
  nombre: string | null;
  codigo: string | null;
  motivo: string;
}

export interface LineaCotizada {
  indice: number;
  productoId: number;
  producto: string;
  cantidad: number;
  precio: number;
  subtotal: number;
  descuento: number;
  descuentoNombre: string | null;
  neto: number;
}

export interface Cotizacion {
  subtotal: number;
  descuentoTotal: number;
  total: number;
  aplicadas: Aplicada[];
  descartadas: Descartada[];
  /** Lo que se devuelve tal cual en POST /ventas. */
  descuentosEsperados: DescuentoEsperado[];
  almacenId?: number;
  lineas?: LineaCotizada[];
}

export interface CotizarInput {
  /**
   * `recursoId`: el profesional, para su precio propio (agenda, fase 2).
   * `usarPaquete`: la línea se paga con una sesión (fase 3): va a 0 y no
   * entra al motor.
   */
  detalles: { productoId: number; cantidad: number; recursoId?: number; usarPaquete?: boolean }[];
  almacenId?: number;
  cupones?: string[];
  clienteId?: number;
}

// ── Página pública de la promo ─────────────────────────────────────────────

export interface PromoPublica {
  negocio: {
    nombre: string;
    subdominio: string;
    paginaUrl: string | null;
    color: { clave: string; hex: string } | null;
    logoUrl: string | null;
    iniciales: string | null;
  };
  promo: {
    nombre: string;
    descripcion: string | null;
    beneficio: string;
    condiciones: string[];
    codigo: string | null;
    conCodigo: boolean;
    vigenciaHasta: string | null;
    programada: boolean;
    url: string;
  };
  whatsapp: string | null;
}
