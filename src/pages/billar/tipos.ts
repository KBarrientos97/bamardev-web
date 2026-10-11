/**
 * Los datos del módulo Billar (BILLAR_MODULO_SPEC §4).
 *
 * MAQUETA (oct-2026): todavía no hay backend. Las horas son milisegundos de
 * `Date.now()` y viven en memoria (ver `store.ts`). Cuando llegue el backend
 * la forma se mantiene: la hora la pone el servidor y la pantalla sólo la
 * muestra y calcula lo que falta para dibujar (§9).
 */

/** Un paquete de tiempo fijo: N horas por un precio cerrado. */
export interface Paquete {
  h: number;
  precio: number;
}

/** Descuento en el TIEMPO de mesa cuando juegan muchas horas (§4.1, §5.5). */
export interface Promo {
  id: string;
  nombre: string;
  /** Horas jugadas desde las que aplica. */
  desde: number;
  /** Porcentaje de descuento sobre el tiempo. Nunca toca los consumos. */
  pct: number;
  /** Pausada sin borrarla. */
  activa: boolean;
  /** ¿Aplica también al tiempo fijo? */
  fijo: boolean;
}

/** La tarifa de un tipo de mesa: Pool, Carambola… */
export interface TipoMesa {
  id: string;
  nombre: string;
  /** Bs por hora. */
  tarifa: number;
  /** Minutos por bloque de cobro. */
  fraccion: number;
  /** Minutos de gracia antes de cobrar el bloque siguiente. */
  tolerancia: number;
  /** Minutos mínimos cobrados en tiempo libre. */
  minimo: number;
  paquetes: Paquete[];
  promos: Promo[];
}

/** Lo que se guarda. `vence` y `cumplido` NO: se calculan (§3). */
export type EstadoMesa = "libre" | "abierta" | "reservada" | "fuera";

/** Lo que se ve: el guardado más los derivados del tiempo (§5.7). */
export type EstadoVisual =
  | "libre"
  | "juego"
  | "vence"
  | "cumplido"
  | "pausada"
  | "reservada"
  | "fuera";

export interface ItemConsumo {
  id: string;
  productoId: number;
  nombre: string;
  precio: number;
  cant: number;
  hora: number;
  anulado?: boolean;
}

export type MetodoPago = "Efectivo" | "QR" | "Mixto" | "Fiado";

export interface Pago {
  id: string;
  hora: number;
  metodo: MetodoPago;
  monto: number;
  /** Mixto: cuánto fue en efectivo y cuánto por QR. */
  partes?: { efectivo: number; qr: number };
  /** Efectivo: lo que entregó el cliente (para el vuelto del ticket). */
  recibido?: number;
  /** "Prepago 2 h", "Adelanto"… sale en el ticket. */
  nota?: string;
}

/** Tiempo fijo: lo contratado, con las extensiones sumadas. */
export interface Prepago {
  min: number;
  /** Bs del tiempo fijo, ya con la promo si aplica. */
  precio: number;
  /** Se cobró al abrir (o al extender). */
  pagado: boolean;
}

/** Tiempo arrastrado al cambiar a una mesa de otro tipo: se cobra a la tarifa vieja. */
export interface TiempoPrevio {
  secs: number;
  min: number;
  bs: number;
}

/** Desde que se abre hasta que se cierra. Al cerrar se convierte en una venta. */
export interface Sesion {
  id: string;
  start: number;
  pausedAt: number | null;
  /** Segundos acumulados en pausa. */
  pausedTotal: number;
  pauseMotivo?: string;
  cliente?: string;
  garantia?: string;
  nota?: string;
  prepago: Prepago | null;
  prev: TiempoPrevio | null;
  consumos: ItemConsumo[];
  pagos: Pago[];
  /**
   * La tarifa con que se abrió (la propia de la mesa ya aplicada). Si el
   * administrador cambia la tarifa con la mesa en juego, esta cuenta sigue
   * con la de antes: el cambio corre para las que se abran después.
   */
  tarifa?: TipoMesa;
}

export interface Mesa {
  /** El número que se ve: "MESA 5". Único por sucursal. */
  id: number;
  tipo: string;
  /** Apodo opcional ("Mesa VIP"): va debajo del número. */
  alias?: string;
  /** Pisa la tarifa del tipo. */
  tarifaPropia?: number;
  estado: EstadoMesa;
  libreDesde?: number;
  fueraMotivo?: string;
  reserva?: { hora: number; nombre: string };
  sesion?: Sesion;
  /**
   * Guardada sin usar: no sale en el tablero ni en la pantalla del salón,
   * pero sigue en Mesas de billar para volver a activarla.
   */
  inactiva?: boolean;
}

export interface ItemVenta {
  productoId: number;
  nombre: string;
  precio: number;
  cant: number;
}

/** Una venta del turno: de una mesa cerrada o una venta rápida (§4.5). */
export interface VentaBillar {
  codigo: string;
  hora: number;
  cajero: string;
  cliente?: string;
  origen: "mesa" | "rapida";
  mesaId?: number;
  tipoMesa?: string;
  tiempoMin: number;
  tiempoBs: number;
  promo?: { nombre: string; pct: number; descuento: number };
  items: ItemVenta[];
  consumosBs: number;
  total: number;
  pagos: Pago[];
  /** Del último cobro en efectivo, para el ticket. */
  recibido?: number;
  cambio?: number;
  anulada?: { hora: number; quien: string; motivo: string };
}

/** Un producto del inventario, visto desde el billar. */
export interface ProductoBillar {
  id: number;
  nombre: string;
  precio: number;
  categoria: string;
  stock: number;
}

/** Qué acciones piden el PIN del administrador (§4.4). */
export interface PinesBillar {
  anularConsumo: boolean;
  anularMesa: boolean;
  anularVenta: boolean;
  descuento: boolean;
}

export interface AjustesBillar {
  /** Minutos antes del fin del tiempo fijo en que se avisa. */
  avisos: number[];
  sonido: boolean;
  voz: boolean;
  /** Silencio global del tablero (la campana tachada). */
  silencio: boolean;
  pin: PinesBillar;
}

/** Una línea de la auditoría (§4.7): pausas, anulaciones, cambios de mesa. */
export interface RegistroAuditoria {
  id: string;
  hora: number;
  mesaId?: number;
  /** "Pausó 6 min", "Anuló 1× Cerveza Paceña 620 ml". */
  accion: string;
  quien: string;
  motivo?: string;
  /** Quién puso el PIN, si hizo falta. */
  autorizo?: string;
}

export interface Caja {
  abierta: boolean;
  desde: number;
  inicial: number;
}

export interface NegocioBillar {
  nombre: string;
  direccion: string;
  sucursal: string;
  nit: string;
  pieTicket: string;
}
