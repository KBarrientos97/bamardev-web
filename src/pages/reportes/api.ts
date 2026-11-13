import { api, qs, request } from "../../lib/api";
import { rangoParaApi } from "../../lib/rangoApi";
import type { CodigoMotivoEfectivo, RangoReporte, ReporteCierreProductos } from "../../types";
import type { CobroApi } from "../billar/api";

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
  // Con el corte de la jornada, si lo hay: el período anterior de un billar
  // también son jornadas, o la comparación mediría otras horas.
  const { desde, hasta } = rangoParaApi({ desde: r.desde, hasta: r.hasta, corteMin: r.corteMin });
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
  /**
   * Σ ventas aprobadas, neto de promos (incluye fiado). Sin los pedidos que
   * todavía no se cobraron: ésos van en `porCobrar`.
   */
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
  /**
   * Pedidos del período (delivery, recoger) que se cobran al entregar y
   * todavía no se cobraron. NO suman en `ventas`: entran el día que se
   * cobran. Opcional: un backend anterior no lo manda.
   */
  porCobrar?: { cantidad: number; total: number };
}

export interface FinancieroApi {
  ventas: number;
  ventasDeltaPct: number | null;
  costoVentas: number;
  utilidadBruta: number;
  utilidadBrutaDeltaPct: number | null;
  margenBrutoPct: number | null;
  /**
   * Lo vendido de artículos sin costo cargado: infla el margen. Desde el 28-oct,
   * en un restaurante cuenta también los platos (los Elaborados, que el backend
   * guarda como SERVICIO): antes los dejaba afuera y el aviso decía "platos"
   * sin contar ninguno.
   */
  ventasSinCosto: number;
  /**
   * Nuevo (28-oct): QUÉ se vendió sin costo, de lo más vendido a lo menos y
   * como mucho 10, para que el aviso diga a cuál cargarle el costo. Opcional:
   * un backend anterior no lo manda y el aviso queda con el total solo.
   */
  productosSinCosto?: { id: number; nombre: string; ventas: number }[];
  /** Mercadería perdida en el período (vencida, dañada, robada), al costo. */
  mermas: number;
  /**
   * Nuevo (L5, 28-oct): cuánto de `ventas` es el cobro de cuotas de la
   * academia, neto. Va DENTRO de `ventas`; 0 en los demás rubros. Ausente con
   * un backend anterior: entonces la academia ve "Ventas" en una sola línea.
   */
  cobradoCuotas?: number;
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

/** Quien cobró ventas en el período: el filtro de cajero de Ventas y ganancia. */
export interface VendedorApi {
  id: number;
  nombre: string;
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

/**
 * Lo cobrado con UN medio en el período, venta por venta
 * (`GET /reportes/metodos-pago/cobros`, backend del 26-oct). Es para conciliar:
 * Miguel, el administrador del billar, compara cada QR contra su banco, y con
 * "QR · 3 cobros · Bs 120" no sabía cuáles eran ni de qué producto.
 */
export interface CobrosDelMedioApi {
  medio: string;
  /** Los mismos números de la fila del reporte. `mixtas`: ventas pagadas con este medio y otro. */
  totales: { monto: number; cobros: number; ventas: number; mixtas: number };
  /** Sólo en la primera tanda; las de "Ver más" lo traen en null. */
  productos: {
    /**
     * Lo de las ventas pagadas SÓLO con este medio: estos productos se pagaron
     * enteros con él. El tiempo de mesa viene marcado. Null si no hay ninguna.
     */
    solo: ReporteCierreProductos | null;
    /**
     * Lo de las ventas pagadas con este medio Y otro. No se puede decir qué
     * producto pagó cada medio (un pago no apunta a un renglón de la venta):
     * va aparte y nunca se reparte. Null si no hay ninguna.
     */
    mixtas: ReporteCierreProductos | null;
    /** De esas ventas mixtas, lo que entró por este medio. */
    mixtasMonto: number;
  } | null;
  /** La tanda, del más nuevo al más viejo. */
  cobros: CobroApi[];
  /**
   * `total`: los cobros del período; `quedan`: los que siguen después de esta
   * tanda; `siguiente`: la marca para pedirlos con "Ver más" (null si no hay
   * más). Por marca y no por número de página: un cobro que entra mientras se
   * mira no corre la lista ni repite el último que se vio.
   */
  tanda: { limite: number; total: number; quedan: number; siguiente: string | null };
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
  ultimasAnulaciones: {
    fecha: string;
    idVenta: string;
    cajero: string;
    monto: number;
    autorizadoPor: string | null;
    motivo: string | null;
    /** El local de la venta anulada (§9.3). */
    sucursal?: SucursalRef | null;
  }[];
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

/**
 * De qué sucursal es una fila (PLAN-SUCURSAL-TOTAL §9.3). `null` = dato viejo
 * sin local: se trata como "general". Opcional: un backend anterior no lo manda.
 */
export interface SucursalRef {
  id: number;
  nombre: string;
}

/**
 * Una fila del comparativo (`GET /reportes/por-sucursal`, §9.4). La fila
 * «General del negocio» (`general: true`, `sucursalId: null`) junta los gastos
 * que no son de ningún local; `total` sale de las ventas de todo el negocio
 * juntas, no de sumar las filas (puede apartarse ±Bs 0,01 por redondeo).
 */
export interface FilaPorSucursal {
  sucursalId: number | null;
  nombre: string;
  general: boolean;
  tipo: "SUCURSAL" | "DEPOSITO" | null;
  activa: boolean;
  esPrincipal: boolean;
  ventas: number;
  tickets: number;
  costoVentas: number;
  utilidadBruta: number;
  /** Null sin ventas: crecer desde cero no es un 0 %. */
  margenBrutoPct: number | null;
  ventasSinCosto: number;
  mermas: number;
  gastosOperativos: number;
  /** Impuestos y gastos financieros: debajo de la utilidad operativa, informativo. */
  bajoLaLinea: number;
  utilidadOperativa: number;
}

export interface PorSucursalApi {
  desde: string;
  hasta: string;
  /** "organizacion" ve todas; "sucursal" (un usuario atado) recibe sólo la suya. */
  alcance: "organizacion" | "sucursal";
  filas: FilaPorSucursal[];
  total: FilaPorSucursal;
}

export interface CierreApi {
  id: number;
  /** El local de la caja. Sólo se muestra si las filas son de 2+ locales. */
  sucursal?: SucursalRef | null;
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
  /**
   * Sólo viene (en false) cuando el negocio vende sin control de stock: ahí
   * todo lo vendido está en negativo, así que la lista va vacía a propósito y
   * la pantalla lo dice en vez de "Nada por reponer".
   */
  controlaStock?: false;
}

/** Lo vendido sin stock que lo respaldara, en el período (`/reportes/vendido-sin-stock`). */
export interface VendidoSinStockApi {
  /** Cómo está el interruptor HOY: lo de antes de prenderlo sigue listado. */
  controlaStock: boolean;
  resumen: { unidades: number; articulos: number; ventas: number; monto: number };
  /** Por artículo, lo que más salió sin stock primero. */
  items: {
    productoId: number;
    nombre: string;
    categoria: string;
    unidad: string | null;
    /** Lo que faltó, no la línea entera: 2 en stock y 5 vendidas = 3. */
    unidades: number;
    ventas: number;
    /** Lo cobrado por esas unidades (neto, en proporción a la línea). */
    monto: number;
    ultima: string;
  }[];
  /** Venta por venta, la más nueva primero (hasta 100). */
  ultimas: {
    lineaId: number;
    ventaId: number;
    comprobante: string | null;
    fecha: string;
    productoId: number;
    producto: string;
    unidad: string | null;
    unidades: number;
    /** Lo que llevó la línea entera. */
    cantidad: number;
    usuario: string | null;
  }[];
  /** Hay más líneas que las de `ultimas` (los totales sí son del período entero). */
  recortado: boolean;
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
    /** Los locales donde debe (§9.2). */
    sucursales?: SucursalRef[];
    /** Ese local si debe en uno solo; null si debe en varios. */
    sucursal?: SucursalRef | null;
  }[];
  cobros: {
    id: number;
    fecha: string;
    codigo: string | null;
    cliente: string;
    monto: number;
    formaPago: string;
    usuario: string | null;
    /** El local donde ENTRÓ el cobro (el de su caja). */
    sucursal?: SucursalRef | null;
  }[];
}

/**
 * El billar con "Todas" (§9.6): el reporte principal sigue siendo de UN local
 * (la principal), y `porSucursal` trae la fila de cada local con mesas.
 */
export interface FilaBillarSucursal {
  sucursal: SucursalRef;
  esPrincipal: boolean;
  mesas: number;
  sesiones: number;
  horas: number;
  horasDisponibles: number;
  /** 0..1. */
  ocupacion: number;
  tiempoBs: number;
  consumosBs: number;
  rapidas: { cantidad: number; bs: number };
  cuentas: { cantidad: number; bs: number };
}

export interface BillarPorSucursalApi {
  filas: FilaBillarSucursal[];
  /** Suma de todo; su `ocupacion` es ponderada (Σ horas / Σ horasDisponibles). */
  total: Omit<FilaBillarSucursal, "sucursal" | "esPrincipal">;
}

export interface BillarReporteApi {
  /** De qué local son TODOS los números del reporte (con "Todas": la principal). */
  sucursal?: SucursalRef;
  /** Sólo con "Todas" y 2+ locales con mesas; si no, null. */
  porSucursal?: BillarPorSucursalApi | null;
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
  /** Las cuentas abiertas cobradas (sin mesa ni tiempo). Backend del 21-oct. */
  cuentas?: { cantidad: number; bs: number };
  productos: { nombre: string; cant: number; bs: number }[];
  auditoria: {
    id: number;
    hora: number;
    mesaId?: number;
    /** De una cuenta abierta (sin mesa): su nombre. Backend del 21-oct. */
    cuenta?: string;
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

/**
 * Las cenas del personal del billar (`GET /billar/reportes/cenas`, backend del
 * 24-oct): lo que salió de la caja para la cena de la cajera. Una "noche" es una
 * caja, de que se abre a que se cierra, y cuenta en el día de la jornada en que
 * se abrió. Desde el 25-oct el Estado de resultado ya no lo lee: resta las
 * cenas de `efectivoBillar`, que cuenta igual pero consolida las sucursales.
 */
export interface CenasReporteApi {
  /** El filtro (§9.6); null = consolidado de todos los locales. */
  sucursal?: SucursalRef | null;
  /** Sólo con "Todas" y 2+ locales; si no, null. */
  porSucursal?: { sucursal: SucursalRef; total: number; nochesAbiertas: number; nochesConCena: number; promedio: number }[] | null;
  /** Los días del período, AAAA-MM-DD, y cuántos son. */
  desde: string;
  hasta: string;
  dias: number;
  /** Lo que costaron las cenas (sin las anuladas). */
  total: number;
  /** Días de jornada en que se abrió alguna caja, y de esos los que tuvieron cena. */
  nochesAbiertas: number;
  nochesConCena: number;
  /** Promedio por noche CON cena. */
  promedio: number;
  /** La noche más cara. */
  maxima: number;
  /** Una por caja, de la más nueva a la más vieja. */
  porNoche: { cajaId: number; dia: string; cajera: string; monto: number; registro: string; abierta: boolean }[];
  /** Una por día de jornada con caja, de la más vieja a la más nueva: el gráfico. */
  porDia: { dia: string; monto: number }[];
  /** Quién cobró cuánto en cenas, de más a menos. */
  porCajera: { nombre: string; monto: number; noches: number }[];
  /** El período de comparación; null si no se pidió. */
  anterior: { total: number; nochesAbiertas: number; nochesConCena: number; promedio: number } | null;
}

/**
 * Lo que movió la caja del billar en el período, por motivo (`GET
 * /billar/reportes/efectivo`, backend del 25-oct): lo que el administrador
 * registró desde Supervisión, sin lo anulado. Cuenta como las cenas: cada caja
 * en el día de la jornada en que se abrió, así el Estado de resultado y el
 * reporte de cenas dicen lo mismo. Sin sucursal es el consolidado de las que ve
 * quien pregunta, como el financiero (las cenas, en cambio, van por local).
 *
 * El Estado de resultado resta `porMotivo.CENA` y `porMotivo.GASTO`; el resto
 * es efectivo que cambió de lugar (`motivosMovimiento.ts`) y va como informativo.
 */
export interface EfectivoBillarApi {
  desde: string;
  hasta: string;
  porMotivo: Record<CodigoMotivoEfectivo, { monto: number; cantidad: number }>;
  /** Cada gasto pagado de la caja que quedó en pie, del más viejo al más nuevo: el detalle y el Excel. */
  gastos: { id: number; fecha: string; descripcion: string; monto: number; quien: string | null; cajera: string }[];
}

/**
 * El detalle de "Cobrado por clases" y de "Sueldos docentes" del Estado de
 * resultado de una academia (`GET /academia/reportes/clases`, L5 del 28-oct).
 * Mismo rango y misma sede que el financiero: `cobradoCuotas` da lo mismo que
 * el del financiero.
 */
export interface ClasesAcademiaApi {
  desde: string;
  hasta: string;
  sede: number | null;
  cobradoCuotas: number;
  cursos: {
    curso: { id: number; nombre: string };
    precioModulo: number | null;
    cobrado: number;
    /** Estudiantes distintos que pagaron algo del curso en el período. */
    pagaron: number;
    /** Lo cobrado en cuotas que no cubren ningún módulo. */
    sinModulo: number;
    modulos: {
      materia: { id: number; nombre: string; orden: number };
      precio: number | null;
      /** Una cuota de varios módulos (el pago completo) se reparte por partes iguales. */
      cobrado: number;
      pagaron: number;
      /** Inscritos en los grupos que dictan el módulo en el período. */
      alumnos: number;
      grupos: {
        id: number;
        nombre: string;
        sede: { id: number; nombre: string };
        dias: number[];
        horaInicio: string;
        horaFin: string;
        alumnos: number;
        desde: string;
        hasta: string;
      }[];
    }[];
  }[];
  sueldos: {
    /** Lo PAGADO de la planilla en el período (por la fecha del pago). */
    pagado: number;
    /** Los gastos SUELDOS de la planilla: con ellos se separan de los gastos del local. */
    gastoIds: number[];
    pagos: { gastoId: number; concepto: string; docente: string | null; fecha: string; monto: number; sede: { id: number; nombre: string } | null }[];
    /** Lo que falta pagar de los meses del período. Null para quien no ve la planilla. */
    pendiente: { meses: { mes: string; cerrada: number; enCurso: number }[]; cerrada: number; enCurso: number; total: number } | null;
  };
}

export const apiReportes = {
  /**
   * A qué hora termina la jornada del negocio (minutos). Un billar cierra a
   * las 2 a. m. y su "hoy" a la 1:30 es la noche que corre; cualquier otro
   * rubro responde 0. Lo decide el backend.
   */
  jornada: () => request<{ corteMin: number }>("/reportes/jornada"),
  resumen: (r: RangoReporte, ant?: RangoReporte) => api.reporte<ResumenApi>("resumen", r, anterior(ant)),
  financiero: (r: RangoReporte, ant?: RangoReporte) => api.reporte<FinancieroApi>("financiero", r, anterior(ant)),
  insumos: (r: RangoReporte, ant?: RangoReporte) => api.reporte<InsumosApi>("insumos", r, anterior(ant)),
  /** `usuarioId`: sólo lo que cobró ese cajero (Ventas y ganancia); sin él, todo. */
  topProductos: (r: RangoReporte, usuarioId?: number) =>
    api.reporte<TopProductoApi[]>("top-productos", r, usuarioId ? { usuarioId } : {}),
  /** Quiénes cobraron en el período (el desplegable de cajeros). */
  vendedores: (r: RangoReporte) => api.reporte<VendedorApi[]>("vendedores", r),
  categorias: (r: RangoReporte) => api.reporte<CategoriaApi[]>("categorias", r),
  horas: (r: RangoReporte) => api.reporte<HorasApi>("horas", r),
  lentos: (r: RangoReporte) => api.reporte<LentosApi>("productos-lentos", r),
  vendidoSinStock: (r: RangoReporte) => api.reporte<VendidoSinStockApi>("vendido-sin-stock", r),
  metodosPago: (r: RangoReporte) => api.reporte<MetodoPagoApi[]>("metodos-pago", r),
  /**
   * Lo cobrado con un medio (`medio`: el nombre tal como lo devuelve
   * `metodos-pago`), de a tandas: sin `antesDe` la primera; con la marca
   * `siguiente` de una tanda, la que le sigue.
   */
  cobrosDelMedio: (r: RangoReporte, medio: string, antesDe?: string, limite = 100) =>
    api.reporte<CobrosDelMedioApi>("metodos-pago/cobros", r, { medio, antesDe, limite }),
  descuentos: (r: RangoReporte) => api.reporte<DescuentosApi>("descuentos", r),
  meseros: (r: RangoReporte) => api.reporte<MeserosApi>("meseros", r),
  cierres: (r: RangoReporte) => api.reporte<CierresApi>("cierres", r),
  creditos: (r: RangoReporte) => api.reporte<CreditosApi>("creditos", r),
  /**
   * El comparativo de locales (§9.4). Es el corte por sucursal: NO manda
   * `sucursalId` aunque el rango lo traiga (el backend no lo acepta).
   */
  porSucursal: (r: RangoReporte) => api.reporte<PorSucursalApi>("por-sucursal", { ...r, sucursalId: undefined }),
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
  /** Las cenas del personal del billar: por días, como `billar`. Un negocio que no es billar no lo pide. */
  cenas: (r: RangoReporte, ant?: RangoReporte) =>
    request<CenasReporteApi>(
      `/billar/reportes/cenas${qs({
        desde: r.desde,
        hasta: r.hasta,
        sucursalId: r.sucursalId,
        ...(ant?.desde && ant.hasta ? { antDesde: ant.desde, antHasta: ant.hasta } : {}),
      })}`,
    ),
  /**
   * El efectivo del billar por motivo (cenas, gastos, pagos a proveedor…): por
   * días, como `cenas`. Lo piden el Estado de resultado y el Resumen de un
   * billar; los demás rubros no.
   */
  efectivoBillar: (r: RangoReporte) =>
    request<EfectivoBillarApi>(`/billar/reportes/efectivo${qs({ desde: r.desde, hasta: r.hasta, sucursalId: r.sucursalId })}`),
  /**
   * Academia: lo cobrado por curso y módulo, los sueldos docentes pagados y la
   * planilla pendiente. Por instantes, como el financiero (`rangoParaApi`);
   * la sede viaja como `sede`, el nombre de la academia.
   */
  clasesAcademia: (r: RangoReporte) => {
    const { desde, hasta } = rangoParaApi({ desde: r.desde, hasta: r.hasta });
    return request<ClasesAcademiaApi>(`/academia/reportes/clases${qs({ desde, hasta, sede: r.sucursalId })}`);
  },
  /** Academia: lo cobrado por clases menos los gastos (04-nov), con el mismo rango que el de clases. */
  resultadoAcademia: (r: RangoReporte) => {
    const { desde, hasta } = rangoParaApi({ desde: r.desde, hasta: r.hasta });
    return request<ResultadoAcademiaApi>(`/academia/reportes/resultado${qs({ desde, hasta, sede: r.sucursalId })}`);
  },
};

/**
 * «Resultado de la academia» (Derick, 04-nov): lo cobrado por clases menos los
 * gastos del período, por categoría (`GET /academia/reportes/resultado`).
 */
export interface ResultadoAcademiaApi {
  desde: string;
  hasta: string;
  sede: number | null;
  ingresos: number;
  gastos: number;
  categorias: { codigo: string; nombre: string; monto: number; cantidad: number }[];
  resultado: number;
}

/** Un número que viene en 0..100 → fracción. Null sigue null. */
export function fraccion(pct0a100: number | null | undefined): number | null {
  return pct0a100 == null || !Number.isFinite(pct0a100) ? null : pct0a100 / 100;
}
