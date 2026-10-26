import { aCentavos, esPositivo, TOLERANCIA } from "./dinero";

/**
 * "Mes en curso": cuánto falta vender para cubrir los gastos del mes que
 * corre. Port de `MesEnCurso.kt` (Android, ea9b8ac), con los mismos casos.
 *
 * Existe porque el estado de resultado a mitad de mes asusta: compara doce
 * días de ventas contra un mes entero de gastos fijos (el alquiler, la luz, la
 * cuota del banco), y la pérdida que muestra no es la del mes. Lo que sirve
 * mientras el mes corre es la meta.
 *
 *     Meta              = (gastos del mes + de la caja + diarios del mes) ÷ (utilidad bruta ÷ ventas)
 *     Falta vender      = meta − ventas
 *     Vendés por día    = ventas ÷ días transcurridos (hoy cuenta entero)
 *     Necesitás por día = falta ÷ días que quedan
 *     Proyección        = vendés por día × días del mes × margen − gastos de la meta
 *     Diarios del mes   = diarios hasta hoy ÷ días transcurridos × días del mes
 *
 * Los "diarios" son las cenas del personal del billar (25-oct), que salen de
 * la caja noche a noche. Van aparte de los gastos del mes porque no se cargan
 * una vez: se repiten cada noche. Antes entraban como si lo de hasta hoy fuera
 * lo del mes entero —el día 10, 200 de cenas en vez de unas 620—, la meta
 * quedaba corta y la proyección inflada.
 *
 * Lo "de la caja" (los gastos pagados de la caja: hielo, un arreglo) cuenta
 * una vez, como lo cargado: no se sabe si se repite, y llevarlo al mes entero
 * convertía un arreglo de Bs 900 del día 3 en Bs 9.300 de meta.
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
  /** Lo vendido menos su costo, los gastos del mes, los de la caja y los diarios de hasta hoy (los reales, no proyectados). */
  gananciaALaFecha: number;
  /** Los diarios llevados al mes entero, al ritmo de hasta hoy. Cero sin diarios. */
  diariosDelMes: number;
  /** Lo que la meta tiene que cubrir: los gastos del mes, los de la caja y los diarios del mes. */
  gastosMeta: number;
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
  /** Lo que se carga una vez para el mes: los gastos cargados y las mermas. */
  gastosDelMes: number;
  /**
   * Billar: las cenas del personal HASTA HOY. Para la meta y la proyección se
   * llevan al mes entero; la ganancia a la fecha resta lo real.
   */
  gastosDiarios?: number;
  /** Billar: lo pagado de la caja como gasto en el mes. Cuenta una vez, tal cual. */
  gastosDeCaja?: number;
}): MesEnCurso | null {
  const { diaActual, diasDelMes, ventas, utilidadBruta, gastosDelMes } = p;
  const gastosDiarios = Math.max(0, p.gastosDiarios ?? 0);
  const deCaja = Math.max(0, p.gastosDeCaja ?? 0);
  // Las cenas y lo de la caja solos no habilitan la tarjeta: con eso y nada
  // cargado decía "Ya cubriste los gastos de octubre" en un billar que no
  // había cargado ni el alquiler ni los sueldos.
  if (!esPositivo(gastosDelMes) || !esPositivo(ventas)) return null;
  if (diaActual < 1 || diasDelMes < diaActual) return null;

  // Hoy cuenta entero, igual que en "vendés por día": las cenas de las noches
  // que faltan también van a salir de la caja.
  const diariosDelMes = aCentavos((gastosDiarios / diaActual) * diasDelMes);
  const gastosMeta = aCentavos(gastosDelMes + deCaja + diariosDelMes);
  const margen = utilidadBruta / ventas;
  // En plata y con tolerancia: un margen de centavos es como no tener margen
  // (daría una meta de millones).
  const sinMargen = utilidadBruta <= TOLERANCIA;
  const metaCruda = sinMargen ? null : gastosMeta / margen;
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
    proyeccion: sinMargen ? null : redondearEstimado(porDiaCrudo * diasDelMes * margen - gastosMeta),
    gananciaALaFecha: Math.floor(utilidadBruta - gastosDelMes - deCaja - gastosDiarios + TOLERANCIA),
    diariosDelMes,
    gastosMeta,
  };
}
