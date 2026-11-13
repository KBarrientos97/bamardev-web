import { request } from "../../lib/api";

/**
 * La ruta de Supervisión del local (`GET /supervision`, backend del 12-nov) y
 * la forma de lo que devuelve. Es la del restaurante y la de cualquier negocio
 * de mostrador que no sea farmacia ni billar (ésos tienen la suya).
 *
 * La fuente de estos tipos es el backend:
 * `bamardev-backend/src/supervision/tipos.ts` (lo del restaurante) y
 * `bamardev-backend/src/supervision/textos.ts` (caja, venta y efectivo, que
 * vienen de la farmacia). La web no importa del backend, así que si allá
 * cambia un nombre hay que tocarlo acá también: Android lee el mismo contrato.
 *
 * Las horas vienen en milisegundos (`number`) y la plata en número: la
 * pantalla las formatea. Ojo con los `porCobrar`: en el turno es una
 * CANTIDAD de pedidos y la plata es `porCobrarTotal`; en una venta o un
 * pedido es un sí/no.
 */

// ── Lo que devuelve el backend ──────────────────────────────────────────────

/** Lo cobrado en el turno, por medio: el QR no pasa por el cajón. */
export interface CobradoPorMedio {
  efectivo: { monto: number; cobros: number };
  qr: { monto: number; cobros: number };
  /** Lo que no es efectivo ni QR (una tarjeta…), por nombre. */
  otros: { nombre: string; monto: number; cobros: number }[];
  /** Ventas pagadas con más de un medio: cuentan en los dos. */
  mixtas: number;
}

/**
 * El último latido del equipo que trabaja una caja (§2.3): Android lo manda
 * cada minuto con Ventas a la vista y al terminar de subir lo pendiente, y
 * cada venta que llega también lo pisa. SIN_SENAL = más de 2 min sin contacto.
 *
 * Sin ningún latido (una caja de la web, un APK viejo) el backend no lo manda:
 * ausente no quiere decir "sin señal", quiere decir "no se sabe".
 */
export interface EquipoSupervision {
  ultimoContactoEn: number;
  /** Ventas hechas en el equipo que todavía no llegaron al servidor. */
  pendientes: number;
  /** La última venta de la caja que YA LLEGÓ al servidor ("última venta sincronizada"); null si no hubo. */
  ultimaVentaEn: number | null;
  /**
   * La última venta cobrada EN EL EQUIPO según su latido: puede estar sin
   * subir. Es la que dice hasta cuándo siguió vendiendo el cajero sin señal.
   */
  ultimaVentaEnEquipoEn: number | null;
  /** EN_LINEA = contacto hace 2 min o menos. La pantalla igual no afirma nada si llega otro valor. */
  estado: "EN_LINEA" | "SIN_SENAL";
}

/** Una caja de la semana: quién la abrió, cuándo, cuándo se cerró y lo vendido. */
export interface CajaSupervision {
  id: number;
  abierta: boolean;
  cajero: string;
  cajeroId: number | null;
  desde: number;
  hasta: number | null;
  inicial: number;
  /** Cerrada: lo que contó el cajero y la diferencia contra lo esperado. */
  contado?: number;
  diferencia?: number;
  /** Quién la cerró, si no fue quien la abrió (el encargado cierra la que quedó abierta). */
  cerroPor?: string;
  ventas: number;
  vendido: number;
  anuladas: number;
  anulado: number;
  equipo?: EquipoSupervision;
}

/**
 * Una persona que cobra (activa, con `caja.operar`, de la sucursal), tenga o
 * no caja abierta: el dueño pregunta "¿quién está?" y también "¿quién no vino?".
 */
export interface CajeroSupervision {
  id: number;
  nombre: string;
  /** El nombre del rol del negocio ("Cajero", "Encargado"…); null si no tiene. */
  rol: string | null;
  /** La caja que tiene abierta ahora; null si no tiene. */
  cajaId: number | null;
  abiertaDesde: number | null;
  ultimaActividadEn: number | null;
  /** Lo de su caja abierta (0 sin caja). */
  ventas: number;
  vendido: number;
  equipo?: EquipoSupervision;
}

export interface PagoSupervision {
  medio: string;
  monto: number;
}

export interface ItemSupervision {
  productoId: number;
  nombre: string;
  cantidad: number;
  precio: number;
  subtotal: number;
}

export interface VentaSupervision {
  id: number;
  comprobante: string | null;
  hora: number;
  quien: string;
  cajaId: number;
  total: number;
  descuento: number;
  /** La venta se fió: no entró plata (o entró parte) a la caja. */
  fiada: boolean;
  /** LOCAL, DELIVERY o RECOGER. */
  tipoPedido: string;
  /** PENDIENTE, ENTREGADO o CANCELADO; null en la venta de mostrador. */
  estadoEntrega: string | null;
  clienteNombre: string | null;
  /**
   * Un pedido que se cobra al entregar y todavía no se entregó: no tiene
   * pagos y no cuenta en lo vendido. No es una venta rota.
   */
  porCobrar: boolean;
  pagos: PagoSupervision[];
  items: ItemSupervision[];
  anulada: { en: number; por: string; motivo: string | null } | null;
}

/** Un delivery o un recoger que salió y todavía no se entregó. */
export interface PedidoSupervision {
  id: number;
  comprobante: string | null;
  /** DELIVERY o RECOGER. */
  tipo: string;
  /** El estado de la entrega (PENDIENTE mientras sigue en camino). */
  estado: string;
  cliente: string | null;
  total: number;
  hora: number;
  quien: string;
  repartidor: string | null;
  /** Se cobra al entregarlo: el repartidor vuelve con esa plata. */
  porCobrar: boolean;
}

/** Efectivo que se movió a mano, sin una venta detrás. */
export interface EfectivoSupervision {
  id: number;
  cajaId: number;
  hora: number;
  quien: string;
  /** INGRESO o EGRESO. */
  tipo: string;
  monto: number;
  texto: string;
}

/**
 * El turno que se mira: una caja, de que se abre a que se cierra. `cajaId`
 * es la que se está mirando y `defectoId` la que corresponde ahora (si son
 * distintas, el dueño eligió un turno anterior). Sin caja en la semana los
 * dos van en null y los números son de la jornada de hoy.
 */
export interface TurnoSupervision {
  cajaId: number | null;
  defectoId: number | null;
  desde: number;
  hasta: number | null;
  ventas: number;
  vendido: number;
  anuladas: number;
  anulado: number;
  fiado: number;
  descuentos: number;
  porMedio: CobradoPorMedio;
  /** Los pedidos en camino, que no están en lo vendido. */
  pedidos: {
    /** Cuántos siguen en camino. */
    enCamino: number;
    /** De ésos, CUÁNTOS se cobran al entregar (una cantidad, no plata). */
    porCobrar: number;
    /** Cuánto suman los que se cobran al entregar: ésta es la plata. */
    porCobrarTotal: number;
  };
}

/** Un renglón de la actividad: quién hizo qué, cuándo y dónde. */
export interface Actividad {
  /** Único en la lista (prefijo por origen): la pantalla lo usa de clave. */
  id: string;
  hora: number;
  quien: string;
  texto: string;
  /** El comprobante de la venta; sin lugar = algo de la caja. */
  lugar?: string;
  autorizo?: string;
  motivo?: string;
  /** CAJA_ABIERTA, CAJA_CERRADA, VENTA, CREDITO, ANULACION, EFECTIVO o PEDIDO: la pantalla le pone ícono y color. */
  codigo: string;
  /** De qué es el renglón: la venta o la caja. */
  ref?: { sesion?: number; venta?: number; caja?: number };
  /**
   * Quedó afuera del tope de renglones y está sólo porque es de la caja o del
   * efectivo: antes de él, la lista no está completa.
   */
  fueraDelTope?: true;
}

export interface SupervisionRestaurante {
  /** La hora del servidor: "hace N s" se cuenta desde acá, no desde el reloj de la compu. */
  ahora: number;
  sucursal: { id: number; nombre: string };
  semana: { desde: number; hasta: number };
  hoy: { ventas: number; vendido: number };
  turno: TurnoSupervision;
  cajas: CajaSupervision[];
  cajeros: CajeroSupervision[];
  /** Las ventas del turno y las que se anularon en el turno (aunque sean de antes). */
  ventas: VentaSupervision[];
  /** Los delivery y recoger que siguen en camino. */
  pedidos: PedidoSupervision[];
  efectivo: EfectivoSupervision[];
  actividad: Actividad[];
}

// ── Las rutas ───────────────────────────────────────────────────────────────

export const apiSupervision = {
  /**
   * Lo que pasa en el local ahora (permiso `caja.ver_todas`). Sin
   * `sucursalId` el backend decide (la del usuario, o la principal); sin
   * `turno` se mira la caja que trabaja ahora.
   */
  ver: (sucursalId: number | null, turno: number | null) => {
    const q = [sucursalId != null && `sucursalId=${sucursalId}`, turno != null && `turno=${turno}`].filter(Boolean);
    return request<SupervisionRestaurante>(`/supervision${q.length ? `?${q.join("&")}` : ""}`);
  },
};
