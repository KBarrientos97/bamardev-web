import { request } from "../../../lib/api";

/**
 * La ruta de Supervisión de la farmacia (`GET /farmacia/supervision`, backend
 * del 11-nov) y la forma exacta de lo que devuelve. Los tipos son copia de
 * `src/farmacia/supervision-farmacia.ts` del backend: la web no importa del
 * backend, así que si allá cambia algo hay que tocarlo acá también.
 *
 * Las horas vienen en milisegundos (`number`) y la plata en número: la
 * pantalla las formatea.
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

/** Una caja de la semana: quién la abrió, cuándo, cuándo se cerró y lo vendido. */
export interface CajaSupervision {
  id: number;
  abierta: boolean;
  cajero: string;
  cajeroId: number | null;
  desde: number;
  hasta: number | null;
  inicial: number;
  /** Cerrada: lo que contó la auxiliar y la diferencia contra lo esperado. */
  contado?: number;
  diferencia?: number;
  /** Quién la cerró, si no fue quien la abrió (el administrador cierra la que quedó abierta). */
  cerroPor?: string;
  ventas: number;
  vendido: number;
  anuladas: number;
  anulado: number;
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
  controlado: boolean;
  condicionVenta: string;
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
  tipoPedido: string;
  pagos: PagoSupervision[];
  items: ItemSupervision[];
  /** Lleva al menos un controlado con receta asentada en el libro. */
  conReceta: boolean;
  anulada: { en: number; por: string; motivo: string | null } | null;
}

/** Un controlado despachado con receta: el renglón del libro. */
export interface ControladoSupervision {
  id: number;
  ventaId: number;
  hora: number;
  quien: string;
  producto: string;
  cantidad: number;
  paciente: string;
  documento: string | null;
  medico: string;
  matricula: string;
  receta: string | null;
  anulada: boolean;
}

export interface EncargoSupervision {
  id: number;
  hora: number;
  quien: string;
  descripcion: string;
  cantidad: number;
  /** ANOTADO, PEDIDO, LLEGO, ENTREGADO o CANCELADO (ver `ESTADO_ENCARGO`). */
  estado: string;
  cliente: string | null;
  telefono: string | null;
  llegoEn: number | null;
  entregadoEn: number | null;
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

/** Un movimiento de inventario aprobado (o anulado) a mano en el turno. */
export interface InventarioSupervision {
  id: number;
  hora: number;
  quien: string;
  /** ENTRADA, SALIDA, AJUSTE o TRANSFERENCIA. */
  tipo: string;
  /** APROBADO o ANULADO. */
  estado: string;
  comprobante: string | null;
  descripcion: string | null;
  almacen: string;
  almacenDestino: string | null;
  items: number;
  unidades: number;
  productos: string[];
}

/**
 * El turno que se mira: una caja, de que se abre a que se cierra. `cajaId`
 * es la que se está mirando y `defectoId` la que corresponde ahora (si son
 * distintas, el administrador eligió un turno anterior). Sin caja en la
 * semana los dos van en null y los números son de la jornada de hoy.
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
  controlados: number;
  porMedio: CobradoPorMedio;
  encargos: { anotados: number; entregados: number };
}

/** Un renglón de la actividad: quién hizo qué, cuándo y dónde. */
export interface Actividad {
  /** Único en la lista (prefijo por origen): la pantalla lo usa de clave. */
  id: string;
  hora: number;
  quien: string;
  texto: string;
  /** El comprobante de la venta; sin lugar = algo de la caja o del inventario. */
  lugar?: string;
  autorizo?: string;
  motivo?: string;
  /** CAJA_ABIERTA, VENTA, CREDITO, ANULACION, CONTROLADO, ENCARGO, EFECTIVO, INVENTARIO_…: la pantalla le pone ícono y color. */
  codigo: string;
  /** De qué es el renglón: la venta o la caja. Sin ref (un encargo, el inventario) no abre nada. */
  ref?: { sesion?: number; venta?: number; caja?: number };
  /**
   * Quedó afuera del tope de renglones y está sólo porque es de la caja o del
   * efectivo: antes de él, la lista no está completa.
   */
  fueraDelTope?: true;
}

export interface SupervisionFarmacia {
  /** La hora del servidor: "hace N s" se cuenta desde acá, no desde el reloj de la compu. */
  ahora: number;
  sucursal: { id: number; nombre: string };
  semana: { desde: number; hasta: number };
  hoy: { ventas: number; vendido: number };
  turno: TurnoSupervision;
  cajas: CajaSupervision[];
  /** Las ventas del turno y las que se anularon en el turno (aunque sean de antes). */
  ventas: VentaSupervision[];
  controlados: ControladoSupervision[];
  /** Lo que se anotó, llegó o entregó en el turno, más lo que sigue abierto. */
  encargos: EncargoSupervision[];
  efectivo: EfectivoSupervision[];
  inventario: InventarioSupervision[];
  actividad: Actividad[];
}

// ── Las rutas ───────────────────────────────────────────────────────────────

export const apiSupervisionFarmacia = {
  /**
   * Lo que pasa en la farmacia ahora (permiso `caja.ver_todas`). Sin
   * `sucursalId` el backend decide (la del usuario, o la principal); sin
   * `turno` se mira la caja que trabaja ahora.
   */
  ver: (sucursalId: number | null, turno: number | null) => {
    const q = [sucursalId != null && `sucursalId=${sucursalId}`, turno != null && `turno=${turno}`].filter(Boolean);
    return request<SupervisionFarmacia>(`/farmacia/supervision${q.length ? `?${q.join("&")}` : ""}`);
  },
};
