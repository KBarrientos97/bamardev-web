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
  /** Lo que todavía no entró en ninguna liquidación. */
  porLiquidar: number;
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
  subtotal: number;
  comisionPct: number | null;
  comision: number;
  /** false = se cobró sin % y se calcula con el vigente. */
  congelada: boolean;
  liquidacionId: number | null;
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
  cerradaEn: string;
  cerradaPor: string | null;
}

export interface LiquidacionDetalle extends Liquidacion {
  lineas: (Omit<LineaComision, "cantidad" | "congelada" | "liquidacionId"> & {
    tipo: "COMISION" | "AJUSTE";
  })[];
  adelantosDescontados: AdelantoPendiente[];
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
