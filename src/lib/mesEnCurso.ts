import { esPositivo, TOLERANCIA } from "./dinero";

/**
 * "Mes en curso": cuánto falta vender para cubrir los gastos del mes que
 * corre. Port de `MesEnCurso.kt` (Android, ea9b8ac), con los mismos casos.
 *
 * Existe porque el estado de resultado a mitad de mes asusta: compara doce
 * días de ventas contra un mes entero de gastos fijos (el alquiler, la luz, la
 * cuota del banco), y la pérdida que muestra no es la del mes. Lo que sirve
 * mientras el mes corre es la meta.
 *
 *     Meta              = gastos del mes ÷ (utilidad bruta ÷ ventas)
 *     Falta vender      = meta − ventas
 *     Vendés por día    = ventas ÷ días transcurridos (hoy cuenta entero)
 *     Necesitás por día = falta ÷ días que quedan
 *     Proyección        = vendés por día × días del mes × margen − gastos del mes
 *
 * **No es el punto de equilibrio**: incluye al banco y a los impuestos y toma
 * todo gasto cargado como fijo. Por eso la fórmula se muestra en pantalla.
 *
 * Los redondeos van en contra del dueño: la meta, lo que falta y lo que
 * necesita por día, para arriba; lo vendido y lo que vende por día, para
 * abajo. Mejor una meta un peso más alta que una que se cumple y no alcanza.
 */
export interface MesEnCurso {
  diaActual: number;
  diasDelMes: number;
  diasRestantes: number;
  /** 0..1: qué parte del mes ya pasó. */
  avanceMes: number;
  /** utilidad bruta ÷ ventas. */
  margen: number;
  /** Cada venta cuesta más de lo que deja (o deja centavos): no hay meta posible. */
  sinMargen: boolean;
  meta: number | null;
  cubierto: boolean;
  faltaVender: number | null;
  /** ventas ÷ meta, sin recortar. */
  avanceMeta: number | null;
  /** Lo vendido va por delante del calendario. */
  vaBien: boolean;
  vendido: number;
  vendesPorDia: number;
  necesitasPorDia: number | null;
  proyeccion: number | null;
  gananciaALaFecha: number;
}

/** A la centena; a la decena si es chico (707,93 → 700; −1.234 → −1.200; 45,2 → 50). */
export function redondearEstimado(v: number): number {
  const paso = Math.abs(v) < 100 ? 10 : 100;
  return Math.round(v / paso) * paso;
}

/**
 * La tarjeta, o null si no tiene sentido: sin gastos cargados no hay meta que
 * cubrir, y sin ventas no hay margen con qué calcularla (dividir daría una
 * meta infinita que se leería como un dato).
 */
export function mesEnCurso(p: {
  diaActual: number;
  diasDelMes: number;
  ventas: number;
  utilidadBruta: number;
  gastosDelMes: number;
}): MesEnCurso | null {
  const { diaActual, diasDelMes, ventas, utilidadBruta, gastosDelMes } = p;
  if (!esPositivo(gastosDelMes) || !esPositivo(ventas)) return null;
  if (diaActual < 1 || diasDelMes < diaActual) return null;

  const margen = utilidadBruta / ventas;
  // En plata y con tolerancia: un margen de centavos es como no tener margen
  // (daría una meta de millones).
  const sinMargen = utilidadBruta <= TOLERANCIA;
  const metaCruda = sinMargen ? null : gastosDelMes / margen;
  const meta = metaCruda == null ? null : Math.ceil(metaCruda - TOLERANCIA);
  const cubierto = metaCruda != null && ventas >= metaCruda - TOLERANCIA;
  const faltaVender = metaCruda == null ? null : cubierto ? 0 : Math.ceil(Math.max(0, metaCruda - ventas) - TOLERANCIA);
  const avanceMeta = metaCruda == null ? null : ventas / metaCruda;
  const avanceMes = diaActual / diasDelMes;
  const diasRestantes = diasDelMes - diaActual;
  const porDiaCrudo = ventas / Math.max(diaActual, 1);

  return {
    diaActual,
    diasDelMes,
    diasRestantes,
    avanceMes,
    margen,
    sinMargen,
    meta,
    cubierto,
    faltaVender,
    avanceMeta,
    vaBien: avanceMeta != null && avanceMeta >= avanceMes,
    vendido: Math.floor(ventas + TOLERANCIA),
    vendesPorDia: Math.floor(porDiaCrudo + TOLERANCIA),
    // El último día ya no hay días por delante: "necesitás Bs X por día" en
    // cero días sería dividir por cero o decir algo imposible.
    necesitasPorDia:
      cubierto || diasRestantes <= 0 || faltaVender == null ? null : Math.ceil(faltaVender / diasRestantes - TOLERANCIA),
    proyeccion: sinMargen ? null : redondearEstimado(porDiaCrudo * diasDelMes * margen - gastosDelMes),
    gananciaALaFecha: Math.floor(utilidadBruta - gastosDelMes + TOLERANCIA),
  };
}
