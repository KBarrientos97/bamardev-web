import { api, qs, request } from "../../lib/api";
import { rangoParaApi } from "../../lib/rangoApi";
import type { RangoReporte } from "../../types";

/**
 * Lo que devuelve cada endpoint de reportes, con lo que significa cada número.
 * Sale de leer `reportes.service.ts` entero (oct-2026); lo que no es obvio va
 * comentado, porque varios endpoints miden cosas parecidas con distinta base:
 *
 * - **Bruto** (sin descontar promos): `top-productos`, `categorias`,
 *   `ventas-detalle`, los productos del billar.
 * - **Neto** (lo cobrado): `resumen`, `financiero`, `horas`, `metodos-pago`,
 *   `meseros`, `cierres`.
 * - Las ventas de los reportes **incluyen lo fiado** (toda venta nace
 *   aprobada) y dejan afuera las anuladas, el envío y la propina.
 *
 * Los campos marcados "nuevo" los agregó el backend con el rediseño: son
 * opcionales para que la pantalla siga andando contra un backend anterior.
 */

/** El período anterior que eligió la web, para que los deltas del backend comparen contra lo mismo que dice la pantalla. */
function anterior(r: RangoReporte | undefined): Record<string, string> {
  if (!r?.desde || !r.hasta) return {};
  const { desde, hasta } = rangoParaApi({ desde: r.desde, hasta: r.hasta });
  return desde && hasta ? { antDesde: desde, antHasta: hasta } : {};
}

export interface ValorDelta {
  valor: number;
  /** % (0..100, puede ser negativo); null si el anterior fue 0. */
  deltaPct: number | null;
}

export interface PuntoTendencia {
  /** "12 oct" (diaria) u "oct" (mensual, rangos de más de 45 días). */
  etiqueta: string;
  monto: number;
  /** Nuevo: "AAAA-MM-DD" o "AAAA-MM". */
  fecha?: string;
}

export interface ResumenApi {
  /** Σ ventas aprobadas, neto de promos (incluye fiado). */
  ventas: number;
  ventasDeltaPct: number | null;
  ventasPeriodoAnterior: number;
  finanzas: {
    ingresosBrutos: number;
    /** Promos y cupones (no hay descuento manual en el sistema). */
    descuentos: number;
    ingresosNetos: number;
    costoVenta: number;
    utilidadBruta: number;
    /** Margen BRUTO, 0..100. */
    margenPct: number;
    /** Variación % de la utilidad bruta (no puntos de margen). */
    deltaUtilidadPct: number | null;
  };
  tickets: ValorDelta;
  ticketPromedio: ValorDelta;
  unidades: ValorDelta;
  tendencia: PuntoTendencia[];
  /** Nuevo: la misma serie del período con que se compara. */
  tendenciaAnterior?: PuntoTendencia[];
  /** Nuevo: de dónde vino la venta (Bs). Las cinco primeras suman `ventas`. */
  composicion?: {
    salon: number;
    billar: number;
    delivery: number;
    recoger: number;
    mostrador: number;
    servicios: number;
    productos: number;
  };
}

export interface FinancieroApi {
  ventas: number;
  ventasDeltaPct: number | null;
  costoVentas: number;
  utilidadBruta: number;
  utilidadBrutaDeltaPct: number | null;
  margenBrutoPct: number | null;
  /** Lo vendido de artículos sin costo cargado: infla el margen. */
  ventasSinCosto: number;
  /** Mercadería perdida en el período (vencida, dañada, robada), al costo. */
  mermas: number;
  compras: { total: number; insumos: number; productos: number };
  comprasDeltaPct: number | null;
  numCompras: number;
  /** Lo comprado, por artículo. */
  desglose: { nombre: string; tipo: "INSUMO" | "PRODUCTO"; unidad: string; cantidad: number; total: number; costoUnitario: number }[];
}

export interface TopProductoApi {
  nombre: string;
  categoria: string;
  /** Bruto. */
  ingresos: number;
  utilidad: number;
  unidades: number;
  /** Entero 0..100. */
  margenPct: number;
}

export interface CategoriaApi {
  nombre: string;
  ingresos: number;
  utilidad: number;
  unidades: number;
  margenPct: number;
  /** 0..100 sobre la suma de ingresos brutos. */
  porcentaje: number;
}

export interface HorasApi {
  horaPico: string | null;
  /** Día de la semana ("Sáb"), no una fecha. */
  mejorDia: string | null;
  mejorDiaIndex: number | null;
  /** 24 posiciones (hora local), Bs. */
  porHora: number[];
  /** Lun..Dom, Bs SUMADOS en el período. */
  porDia: { etiqueta: string; monto: number }[];
}

export interface FilaLentoApi {
  nombre: string;
  categoria: string;
  /** Stock de HOY. */
  stock: number;
  /** Stock × costo del lote. */
  valorParado: number;
  /** Vendidas en el período. */
  vendidas: number;
}

export interface LentosApi {
  sinMovimiento: FilaLentoApi[];
  /** De 1 a 5 unidades en el período. */
  pocaRotacion: FilaLentoApi[];
}

export interface MetodoPagoApi {
  nombre: string;
  /** Lo aplicado a la venta. El fiado sin adelanto no tiene pago y no aparece. */
  monto: number;
  /** 0..100 sobre la suma de PAGOS. */
  porcentaje: number;
  /** Nuevo: cuántos cobros. */
  cantidad?: number;
}

export interface DescuentosApi {
  totalPerdido: number;
  /** Promos y cupones. */
  totalDescuentos: number;
  /** Ventas anuladas con FECHA DE VENTA en el período. */
  totalAnulado: number;
  /** % de tickets con descuento (no del monto). */
  pctConDescuento: number;
  descuentosPorCajero: { cajero: string; monto: number; cantidad: number }[];
  /** Por quien VENDIÓ, no por quien anuló. */
  anulacionesPorCajero: { cajero: string; monto: number; cantidad: number }[];
  /** Máx. 20, las más nuevas primero. `fecha` ya viene escrita ("12 oct · 21:30"). */
  ultimasAnulaciones: { fecha: string; idVenta: string; cajero: string; monto: number; autorizadoPor: string | null; motivo: string | null }[];
}

export interface MeserosApi {
  totales: {
    vendido: number;
    mesas: number;
    comensales: number;
    /** No está dentro de `vendido`. */
    propinas: number;
    ticketPromedio: number;
    porComensal: number;
    itemsAnulados: number;
    montoAnulado: number;
    meseros: number;
  };
  items: {
    meseroId: number | null;
    mesero: string;
    mesas: number;
    comensales: number;
    vendido: number;
    ticketPromedio: number;
    porComensal: number;
    propinas: number;
    itemsAnulados: number;
    montoAnulado: number;
    minutosPromedio: number;
  }[];
}

export interface CierreApi {
  id: number;
  /** "30 sep": el día del cierre. */
  fecha: string;
  fechaApertura: string;
  fechaCierre: string | null;
  /** Quien abrió la caja. */
  cajero: string;
  duracion: string;
  totalDia: number;
  apertura: number;
  efectivo: number;
  /** Todo lo que no es efectivo. */
  qr: number;
  esperado: number;
  /** Si nunca se contó, = esperado. */
  conteo: number;
}

export interface CierresApi {
  /** Quién cobró en el período. */
  performance: { cajero: string; ventas: number; total: number }[];
  historial: CierreApi[];
}

export interface SugerenciaApi {
  dias: number;
  cobertura: number;
  items: {
    productoId: number;
    nombre: string;
    categoria: string | null;
    unidad: string | null;
    stock: number;
    vencido: number;
    stockMinimo: number;
    vendidas: number;
    porDia: number;
    /** Días que alcanza lo útil; null si no se vendió. */
    alcanzaDias: number | null;
    encargos: number;
    sugerido: number;
    motivo: "AGOTADO" | "BAJO_MINIMO" | "SE_ACABA" | "ENCARGO";
    costo: number;
    subtotal: number;
  }[];
  resumen: { articulos: number; unidades: number; inversion: number; agotados: number };
}

export interface InsumosApi {
  ingresos: number;
  invertido: number;
  /** Ventas − compras de insumos: es flujo, NO ganancia. No se muestra. */
  ganancia: number;
  invertidoDeltaPct: number | null;
  numCompras: number;
  compras: { nombre: string; unidad: string; cantidad: number; total: number; costoUnitario: number }[];
}

export interface CreditosApi {
  resumen: {
    /** HOY, no del período. */
    totalPorCobrar: number;
    totalVencido: number;
    creditosAbiertos: number;
    clientesConSaldo: number;
    /** Del período. */
    fiadoEnPeriodo: number;
    cobradoEnPeriodo: number;
    abonosEnPeriodo: number;
  };
  antiguedad: {
    clave: "al_dia" | "atraso_1_30" | "atraso_31_60" | "atraso_60_mas";
    etiqueta: string;
    monto: number;
    cantidad: number;
    porcentaje: number;
  }[];
  deudores: {
    clienteId: number;
    cliente: string;
    telefono: string | null;
    saldoTotal: number;
    montoVencido: number;
    creditos: number;
    /** Atraso del crédito más atrasado (0 si ninguno venció). */
    diasAtrasoMax: number;
  }[];
  cobros: { id: number; fecha: string; codigo: string | null; cliente: string; monto: number; formaPago: string; usuario: string | null }[];
}

export interface BillarReporteApi {
  desde: number;
  hasta: number;
  jornadas: number;
  tiempoBs: number;
  consumosBs: number;
  horas: number;
  /** 0..1. */
  ocupacion: number;
  porMesa: {
    /** El NÚMERO de la mesa. */
    mesaId: number;
    horas: number;
    /** Participación en las horas (0..1), NO es ocupación. */
    pct: number;
    tipo?: string;
    sesiones?: number;
    tiempoBs?: number;
    consumosBs?: number;
    total?: number;
    ocupacion?: number;
    bsPorHoraAbierta?: number;
  }[];
  porHora: { hora: number; ocupacion: number }[];
  fijos: { vendidos: number; monto: number; conExcedente: number; excedenteBs: number };
  rapidas: { cantidad: number; bs: number };
  productos: { nombre: string; cant: number; bs: number }[];
  auditoria: {
    id: number;
    hora: number;
    mesaId?: number;
    /** El texto ya armado ("Pausó 12 min", "Anuló la mesa · devolver Bs 20"). */
    accion: string;
    /** El código crudo (ANULAR_MESA, REANUDAR…): para agrupar sin leer el texto. Nuevo. */
    codigo?: string;
    quien: string;
    motivo?: string;
    autorizo?: string;
  }[];
  // Nuevos (rediseño):
  sesiones?: number;
  minutosPromedio?: number;
  porTipo?: { tipo: string; mesas: number; horas: number; tiempoBs: number; consumosBs: number; total: number; bsPorHoraAbierta: number }[];
  /** dia: 0 = lunes … 6 = domingo. */
  calor?: { dia: number; hora: number; ocupacion: number }[];
  paquetes?: { minutos: number; cantidad: number; monto: number }[];
  promos?: { nombre: string; pct: number; tipo: string; usos: number; descuentoBs: number; minutosPromedio: number }[];
  minutosPromedioSinPromo?: number;
  libres?: number;
  /** Las mesas activas que nadie jugó en el período: van al final de la tabla, no desaparecen. */
  mesasParadas?: BillarReporteApi["porMesa"];
  anterior?: {
    ocupacion: number;
    horas: number;
    tiempoBs: number;
    consumosBs: number;
    rapidasBs: number;
    sesiones: number;
    porHora: { hora: number; ocupacion: number }[];
    porMesa: { mesaId: number; total: number; horas: number }[];
  } | null;
}

export const apiReportes = {
  resumen: (r: RangoReporte, ant?: RangoReporte) => api.reporte<ResumenApi>("resumen", r, anterior(ant)),
  financiero: (r: RangoReporte, ant?: RangoReporte) => api.reporte<FinancieroApi>("financiero", r, anterior(ant)),
  insumos: (r: RangoReporte, ant?: RangoReporte) => api.reporte<InsumosApi>("insumos", r, anterior(ant)),
  topProductos: (r: RangoReporte) => api.reporte<TopProductoApi[]>("top-productos", r),
  categorias: (r: RangoReporte) => api.reporte<CategoriaApi[]>("categorias", r),
  horas: (r: RangoReporte) => api.reporte<HorasApi>("horas", r),
  lentos: (r: RangoReporte) => api.reporte<LentosApi>("productos-lentos", r),
  metodosPago: (r: RangoReporte) => api.reporte<MetodoPagoApi[]>("metodos-pago", r),
  descuentos: (r: RangoReporte) => api.reporte<DescuentosApi>("descuentos", r),
  meseros: (r: RangoReporte) => api.reporte<MeserosApi>("meseros", r),
  cierres: (r: RangoReporte) => api.reporte<CierresApi>("cierres", r),
  creditos: (r: RangoReporte) => api.reporte<CreditosApi>("creditos", r),
  /** Foto de hoy: no lleva fechas. `dias` de historia (7..180) y `cobertura` a cubrir (1..90). */
  sugerencia: (p: { dias: number; cobertura: number; sucursalId?: number }) =>
    request<SugerenciaApi>(`/reportes/sugerencia-compra${qs(p)}`),
  /**
   * El del billar va por días (`AAAA-MM-DD`) y no por instantes. Sin
   * sucursal NO es el consolidado: es la principal.
   */
  billar: (r: RangoReporte, ant?: RangoReporte) =>
    request<BillarReporteApi>(
      `/billar/reportes${qs({
        desde: r.desde,
        hasta: r.hasta,
        sucursalId: r.sucursalId,
        ...(ant?.desde && ant.hasta ? { antDesde: ant.desde, antHasta: ant.hasta } : {}),
      })}`,
    ),
};

/** Un número que viene en 0..100 → fracción. Null sigue null. */
export function fraccion(pct0a100: number | null | undefined): number | null {
  return pct0a100 == null || !Number.isFinite(pct0a100) ? null : pct0a100 / 100;
}
