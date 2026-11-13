/**
 * Tipos de comisiones y liquidación (fase 2) y de los reportes de agenda,
 * calcados de los endpoints de `src/comisiones` y `src/agenda-reportes` del
 * backend. Archivo propio, como el resto de la agenda: así esta rama no pisa
 * los tipos de las demás.
 */

export type Periodo = "SEMANA" | "QUINCENA" | "MES" | "OTRO";

/** Una fila de `GET /comisiones/resumen`. */
export interface ProduccionProfesional {
  recursoId: number;
  nombre: string;
  color: string;
  activo: boolean;
  produccion: number;
  produccionServicios: number;
  produccionProductos: number;
  servicios: number;
  comision: number;
  /**
   * Lo que todavía no entró en ninguna liquidación, ya con el descuento de
   * las comisiones pagadas de ventas que se anularon después.
   */
  porLiquidar: number;
  /** Negativo o 0: comisiones ya pagadas de ventas anuladas (QA N2-11). */
  ajustesPendientes?: number;
  adelantosPendientes: number;
}

export interface ResumenComisiones {
  desde: string;
  hasta: string;
  sucursalId: number | null;
  profesionales: ProduccionProfesional[];
  totales: { produccion: number; comision: number; porLiquidar: number };
}

/** Una línea de venta con su comisión. */
export interface LineaComision {
  ventaDetalleId: number;
  ventaId: number;
  comprobante: string | null;
  fecha: string;
  productoId: number;
  descripcion: string;
  esServicio: boolean;
  cantidad: number;
  /** Lo cobrado (bruto − descuento): la base de la comisión (QA N2-02). */
  subtotal: number;
  /** El bruto y su descuento, para explicar el importe (backend nuevo). */
  bruto?: number;
  descuento?: number;
  comisionPct: number | null;
  comision: number;
  /** false = se cobró sin % y se calcula con el vigente. */
  congelada: boolean;
  liquidacionId: number | null;
  /** El local de la venta (PLAN-SUCURSAL-TOTAL §8.1); null en datos viejos. */
  almacenId?: number | null;
}

export interface DetalleComisiones {
  recurso: { id: number; nombre: string };
  desde: string;
  hasta: string;
  lineas: LineaComision[];
  anuladas: LineaComision[];
  produccion: number;
  comision: number;
}

export interface AdelantoPendiente {
  id: number;
  fecha: string;
  monto: number;
  nota: string | null;
}

/** `GET /comisiones/liquidaciones/previa`. */
export interface PreviaLiquidacion {
  recurso: { id: number; nombre: string };
  desde: string;
  hasta: string;
  produccion: number;
  comision: number;
  /** Negativo o 0: comisiones ya pagadas de ventas anuladas después. */
  ajustes: number;
  adelantos: number;
  /** Negativo o 0: lo que quedó debiendo de la anterior. */
  saldoAnterior: number;
  neto: number;
  lineas: LineaComision[];
  lineasAjuste: LineaComision[];
  adelantosPendientes: AdelantoPendiente[];
  atrasadas: number;
  /** Cobros sin liquidar de días anteriores que no entran en este período. */
  sinLiquidarAntes?: number;
  /**
   * Cómo cae la liquidación en cada local (§8.1). Vacío con una sola sucursal
   * activa o con un backend viejo: no hay nada que desglosar.
   */
  porSucursal?: FilaComisionSucursal[];
  /**
   * true = al cerrar con «registrar el pago como gasto» se carga un gasto de
   * sueldos por cada fila de `porSucursal`; false = uno solo, general.
   */
  gastoPorSucursal?: boolean;
}

/**
 * Una fila del desglose por sucursal de una liquidación. `almacenId` y
 * `sucursal` son null en la fila de lo que no es de ningún local. En la previa,
 * `neto` es lo que se cargará como gasto a ese local (null si se cargará un
 * solo gasto general); en el detalle, lo que realmente se cargó (null si no
 * hubo gasto).
 */
export interface FilaComisionSucursal {
  almacenId: number | null;
  sucursal: string | null;
  produccion: number;
  comision: number;
  /** Negativo o 0: comisiones pagadas de ventas anuladas de ese local. */
  ajustes: number;
  neto: number | null;
}

export interface Liquidacion {
  id: number;
  recursoId: number;
  recurso: string;
  periodo: Periodo;
  desde: string;
  hasta: string;
  produccion: number;
  comision: number;
  ajustes: number;
  adelantos: number;
  saldoAnterior: number;
  neto: number;
  nota: string | null;
  gastoId: number | null;
  /** Todos los gastos que generó el cierre (uno por sucursal); `gastoId` es el primero. */
  gastoIds?: number[];
  cerradaEn: string;
  cerradaPor: string | null;
}

export interface LiquidacionDetalle extends Liquidacion {
  lineas: (Omit<LineaComision, "cantidad" | "congelada" | "liquidacionId"> & {
    tipo: "COMISION" | "AJUSTE";
  })[];
  adelantosDescontados: AdelantoPendiente[];
  /**
   * El desglose por local. Vacío en una liquidación anterior a la etapa o con
   * un solo local: no se inventa un reparto que no se guardó.
   */
  porSucursal?: FilaComisionSucursal[];
  /** Los gastos de sueldos que generó el cierre, uno por local. */
  gastos?: { id: number; almacenId: number | null; sucursal: string | null; monto: number }[];
}

export interface LiquidarInput {
  recursoId: number;
  desde: string;
  hasta: string;
  periodo: Periodo;
  nota?: string | null;
  registrarGasto?: boolean;
  metodoPago?: "EFECTIVO" | "TRANSFERENCIA" | "QR" | "TARJETA";
}

export interface Adelanto {
  id: number;
  recursoId: number;
  recurso: string;
  fecha: string;
  monto: number;
  nota: string | null;
  liquidacionId: number | null;
  anulado: boolean;
  registradoPor: string | null;
  creadoEn: string;
}

export interface AdelantoInput {
  recursoId: number;
  fecha?: string;
  monto: number;
  nota?: string | null;
}

/** `GET /comisiones/config`: los % de cada profesional. */
export interface ConfigComision {
  recursoId: number;
  nombre: string;
  activo: boolean;
  comisionPct: number | null;
  comisionProductoPct: number | null;
  servicios: { servicioId: number; servicio: string; comisionPct: number | null }[];
}

export interface ConfigComisionInput {
  comisionPct?: number | null;
  comisionProductoPct?: number | null;
  servicios?: { servicioId: number; comisionPct: number | null }[];
}

export interface EventoComision {
  id: number;
  accion: "CONFIGURAR" | "ADELANTO" | "ANULAR_ADELANTO" | "LIQUIDAR";
  recursoId: number | null;
  recurso: string | null;
  detalle: Record<string, unknown> | null;
  usuario: string | null;
  en: string;
}

// ── Reportes de agenda ──────────────────────────────────────────────────────

export interface ReporteAgenda {
  desde: string;
  hasta: string;
  sucursalId: number | null;
  produccion: {
    recursoId: number;
    nombre: string;
    color: string;
    produccion: number;
    produccionServicios: number;
    produccionProductos: number;
    servicios: number;
    clientes: number;
    ticketMedio: number | null;
  }[];
  serviciosTop: {
    servicioId: number;
    servicio: string;
    pedidos: number;
    cobrados: number;
    ingresos: number;
  }[];
  asistencia: {
    total: number;
    completadas: number;
    noShows: number;
    canceladas: number;
    abandonadas: number;
    pendientes: number;
    tasaNoShow: number | null;
    tasaCancelacion: number | null;
    porOrigen: { origen: "INTERNA" | "ONLINE" | "WALKIN"; total: number; noShows: number }[];
  };
  ticketMedio: { ventas: number; total: number; ticketMedio: number | null };
  ocupacion: {
    minutosDisponibles: number;
    minutosReservados: number;
    pct: number | null;
    recursos: {
      recursoId: number;
      nombre: string;
      color: string;
      minutosDisponibles: number;
      minutosReservados: number;
      pct: number | null;
      dias: { fecha: string; disponibles: number; reservados: number; pct: number | null }[];
    }[];
  };
  retencion: {
    dias: number;
    clientes: number;
    volvieron: number;
    pct: number | null;
    nuevos: number;
    recurrentes: number;
    ventanaAbierta: number;
  };
}
