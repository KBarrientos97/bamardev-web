import { aCentavos, cubre, esCero, esPositivo, TOLERANCIA } from "./dinero";
import type { Gasto, TipoCostoGasto } from "../types";

/**
 * Estado de resultado y punto de equilibrio del período.
 *
 * Port de `EstadoResultado.kt` y `PuntoEquilibrio.kt` (app). Los dos cruzan
 * el reporte financiero (ventas y costo de lo vendido) con los gastos
 * operativos del mismo período; el backend no los arma, así que la cuenta
 * vive acá, separada de la pantalla para poder probarla. Los tests son los
 * mismos casos que en la app.
 */

/** Las categorías que van DEBAJO de la utilidad operativa (invariante 3). */
export const GASTOS_FINANCIEROS = "GASTOS_FINANCIEROS";
export const IMPUESTOS = "IMPUESTOS";
const BAJO_LA_LINEA = new Set([GASTOS_FINANCIEROS, IMPUESTOS]);

/**
 * Si el gasto sube con las ventas o corre solo, cuando el backend no lo dice.
 *
 * Viene con cada gasto (`tipoCosto`); esto es sólo la red para uno que llegue
 * sin él. Mismo criterio que `CodigosGasto.tipoCostoBase` de la app: una
 * categoría propia arranca como FIJO, y las que se mueven con el volumen son
 * VARIABLE.
 */
export function tipoCostoBase(codigo: string): TipoCostoGasto {
  switch (codigo) {
    case "GAS": // más platos cocinados, más garrafas
    case "DESCARTABLES": // un envase por pedido para llevar
    case "COMISION_DELIVERY": // un porcentaje de lo que vende la app
    case "TRANSPORTE": // nafta del reparto
    case "LIMPIEZA": // se gasta con el volumen de cocina
      return "VARIABLE";
    default:
      return "FIJO";
  }
}

function tipoDe(g: Gasto): TipoCostoGasto {
  return g.tipoCosto ?? tipoCostoBase(g.categoria);
}

/** Suma por `monto`: lo gastado, no lo pagado (invariante 2). */
function sumar(gastos: Gasto[]): number {
  return aCentavos(gastos.reduce((acc, g) => acc + g.monto, 0));
}

/** Los campos del reporte financiero (`GET reportes/financiero`) que se usan acá. */
export interface FinancieroBase {
  ventas: number;
  costoVentas: number;
  utilidadBruta: number;
  utilidadBrutaDeltaPct?: number | null;
  /** Lo vendido de artículos sin costo cargado: infla el margen. */
  ventasSinCosto?: number | null;
  /**
   * Mercadería perdida en el período (vencida, dañada o robada), al costo del
   * lote: el "Perdido" del reporte de Mermas. Ausente con un backend anterior,
   * y entonces no resta nada, como antes.
   */
  mermas?: number | null;
  compras?: { total?: number; insumos?: number; productos?: number } | null;
  numCompras?: number | null;
}

/** Un renglón del desglose de gastos: una categoría con su total. */
export interface LineaGasto {
  codigo: string;
  nombre: string;
  monto: number;
  cantidad: number;
  /** Sobre las ventas. Null sin ventas. */
  sobreVentasPct: number | null;
  /** Sobre el total del grupo, recortado a 0..1: es el ancho de una barra. */
  sobreGastosPct: number;
}

/**
 * Agrupa por **código** y no por nombre: corregir "Luz" a "Electricidad"
 * partiría el rubro en dos renglones que suman lo mismo (invariante 5).
 */
function lineasDe(gastos: Gasto[], ventas: number, total: number): LineaGasto[] {
  const porCodigo = new Map<string, Gasto[]>();
  for (const g of gastos) {
    const lista = porCodigo.get(g.categoria) ?? [];
    lista.push(g);
    porCodigo.set(g.categoria, lista);
  }
  return [...porCodigo.entries()]
    .map(([codigo, delRubro]) => {
      const monto = sumar(delRubro);
      return {
        codigo,
        nombre: delRubro[0].categoriaNombre || codigo,
        monto,
        cantidad: delRubro.length,
        sobreVentasPct: esPositivo(ventas) ? monto / ventas : null,
        sobreGastosPct: esPositivo(total) ? Math.min(1, Math.max(0, monto / total)) : 0,
      };
    })
    .sort((a, b) => b.monto - a.monto);
}

// ── Estado de resultado ─────────────────────────────────────────────────────

/**
 * Billar (25-oct): lo que el administrador pagó de la caja de la cajera y SÍ es
 * un gasto del local (`CODIGOS_GASTO` en `motivosMovimiento.ts`). Sale de `GET
 * /billar/reportes/efectivo`: `porMotivo.CENA` y `porMotivo.GASTO`, sin lo
 * anulado. Lo demás que movió la caja no viene a propósito: un pago a
 * proveedor ya resta en el costo de lo vendido cada vez que se vende, y un
 * retiro o el sencillo no son ni gasto ni venta.
 */
export interface GastosDeCaja {
  /** Las cenas del personal. */
  cenas: number;
  /** Los gastos pagados de la caja: el hielo, la tiza, un arreglo. */
  gastos: number;
}

export interface EstadoResultado {
  ventas: number;
  costoVentas: number;
  ventasSinCosto: number;
  utilidadBruta: number;
  /** Mercadería perdida: resta debajo de la bruta. Cero si no hubo. */
  mermas: number;
  /**
   * Billar (24-oct): lo que salió de la caja en cenas del personal. Es un gasto
   * del local con su propia línea (no se mezcla con los sueldos ni con los
   * gastos cargados) y resta de la utilidad operativa. Cero si no hubo: la
   * pantalla no dibuja una línea en cero.
   */
  cenasPersonal: number;
  /**
   * Billar (25-oct): lo que el administrador pagó de la caja como gasto del
   * local, registrado en Supervisión con el motivo Gasto. Resta como las cenas
   * y en su propia línea, separado de los gastos cargados en Gastos operativos:
   * es la misma plata, y cargarla en los dos lados la restaría dos veces. Cero
   * si no hubo.
   */
  gastosCaja: number;
  gastosOperativos: number;
  lineas: LineaGasto[];
  utilidadOperativa: number;
  gastosFinancieros: number;
  utilidadAntesImpuestos: number;
  impuestos: number;
  utilidadNeta: number;
  comprasTotal: number;
  numCompras: number;
  deltaUtilidadBrutaPct: number | null;
  /** Márgenes sobre las ventas. **Null sin ventas**, no 0: un "0 %" se lee como dato. */
  margenBrutoPct: number | null;
  margenOperativoPct: number | null;
  margenNetoPct: number | null;
  gastosSobreVentasPct: number | null;
  mermasSobreVentasPct: number | null;
  sinCostoSobreVentasPct: number | null;
  vacio: boolean;
  /** Una pérdida de centavos no es pérdida. */
  enPerdida: boolean;
  /** Sin impuestos ni financieros la neta es la operativa y esos renglones sobran. */
  sinBajoLaLinea: boolean;
}

/**
 * La cascada del pizarrón:
 *
 *     Ventas − Costo de ventas          = Utilidad bruta
 *     − Mermas − Gastos operativos      = Utilidad operativa
 *     − Gastos financieros              = Utilidad antes de impuestos
 *     − Impuestos                       = Utilidad neta
 *
 * Las compras del período NO tocan la utilidad bruta: lo que se compró y no se
 * vendió sigue en el almacén. Impuestos y financieros van debajo de la
 * operativa, no entre los gastos operativos (invariante 3).
 *
 * Las mermas (lo vencido, dañado o robado que se dio de baja) van debajo de la
 * bruta y no dentro del costo de ventas: el margen bruto sigue diciendo cuánto
 * deja cada venta, y lo perdido se ve con su nombre. Antes no restaban en
 * ningún lado: una farmacia que tiraba Bs 2.000 de vencidos veía la misma
 * utilidad que si esa mercadería siguiera en el estante.
 *
 * Lo que el billar paga de la caja (`caja`: las cenas del personal desde el
 * 24-oct, los gastos pagados de la caja desde el 25-oct) resta igual que los
 * gastos del local, pero cada uno en su línea: sale de un movimiento de
 * efectivo, no de un gasto cargado, y no hay que cargarlo dos veces. Lo que la
 * caja movió sin ser un gasto (pagos a proveedores, retiros, el sencillo) no
 * llega acá. Sin `caja` (todos los demás rubros) la cuenta es exactamente la
 * de siempre.
 */
export function estadoResultado(fin: FinancieroBase, gastos: Gasto[], caja?: GastosDeCaja): EstadoResultado {
  const bajo = gastos.filter((g) => BAJO_LA_LINEA.has(g.categoria));
  const operativos = gastos.filter((g) => !BAJO_LA_LINEA.has(g.categoria));

  const impuestos = sumar(bajo.filter((g) => g.categoria === IMPUESTOS));
  const financieros = sumar(bajo.filter((g) => g.categoria === GASTOS_FINANCIEROS));
  const gastosOperativos = sumar(operativos);

  const ventas = fin.ventas ?? 0;
  const utilidadBruta = fin.utilidadBruta ?? 0;
  const mermas = aCentavos(fin.mermas ?? 0);
  // Nunca por debajo de cero: lo anulado ya viene descontado del backend, y un
  // monto negativo restado le sumaría a la ganancia plata que no entró.
  const cenasPersonal = aCentavos(Math.max(0, caja?.cenas ?? 0));
  const gastosCaja = aCentavos(Math.max(0, caja?.gastos ?? 0));
  const utilidadOperativa = aCentavos(utilidadBruta - mermas - gastosOperativos - cenasPersonal - gastosCaja);
  const antesDeImpuestos = aCentavos(utilidadOperativa - financieros);
  const utilidadNeta = aCentavos(antesDeImpuestos - impuestos);
  const ventasSinCosto = fin.ventasSinCosto ?? 0;
  const comprasTotal = fin.compras?.total ?? 0;

  const margen = (monto: number) => (esPositivo(ventas) ? monto / ventas : null);

  return {
    ventas,
    costoVentas: fin.costoVentas ?? 0,
    ventasSinCosto,
    utilidadBruta,
    mermas,
    cenasPersonal,
    gastosCaja,
    gastosOperativos,
    lineas: lineasDe(operativos, ventas, gastosOperativos),
    utilidadOperativa,
    gastosFinancieros: financieros,
    utilidadAntesImpuestos: antesDeImpuestos,
    impuestos,
    utilidadNeta,
    comprasTotal,
    numCompras: fin.numCompras ?? 0,
    deltaUtilidadBrutaPct: fin.utilidadBrutaDeltaPct ?? null,
    margenBrutoPct: margen(utilidadBruta),
    margenOperativoPct: margen(utilidadOperativa),
    margenNetoPct: margen(utilidadNeta),
    gastosSobreVentasPct: margen(gastosOperativos),
    mermasSobreVentasPct: margen(mermas),
    sinCostoSobreVentasPct: margen(ventasSinCosto),
    vacio:
      esCero(ventas) &&
      esCero(fin.costoVentas ?? 0) &&
      esCero(mermas) &&
      esCero(cenasPersonal) &&
      esCero(gastosCaja) &&
      esCero(comprasTotal) &&
      esCero(gastosOperativos) &&
      esCero(financieros) &&
      esCero(impuestos),
    enPerdida: utilidadNeta < -TOLERANCIA,
    sinBajoLaLinea: esCero(financieros) && esCero(impuestos),
  };
}

// ── Punto de equilibrio ─────────────────────────────────────────────────────

/**
 * Días del rango `yyyy-MM-dd`, contando los dos extremos. 0 si no se puede
 * saber, y entonces la meta diaria no se muestra.
 */
export function diasDelRango(desde?: string, hasta?: string): number {
  if (!desde || !hasta) return 0;
  const [a1, m1, d1] = desde.slice(0, 10).split("-").map(Number);
  const [a2, m2, d2] = hasta.slice(0, 10).split("-").map(Number);
  if (![a1, m1, d1, a2, m2, d2].every(Number.isFinite)) return 0;
  // En UTC para que un cambio de horario no corra un día.
  const ms = Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1);
  return Math.max(0, Math.round(ms / 86_400_000) + 1);
}

export interface PuntoEquilibrio {
  ventas: number;
  costoVentas: number;
  gastosVariables: number;
  gastosFijos: number;
  ventasSinCosto: number;
  lineasFijas: LineaGasto[];
  lineasVariables: LineaGasto[];
  dias: number;
  utilidadBruta: number;
  costosVariables: number;
  /** Lo que deja cada venta, en plata, para cubrir los fijos. */
  margenContribucion: number;
  /** Null sin ventas. No se recorta: negativo es información. */
  margenContribucionPct: number | null;
  /** **Null cuando no existe**: sin ventas, o con margen cero o negativo. */
  puntoEquilibrio: number | null;
  cubierto: boolean;
  margenSeguridadPct: number | null;
  faltaVender: number | null;
  ventaDiariaNecesaria: number | null;
  sinCostoSobreVentasPct: number | null;
  /** Hay ventas sin costear: la meta se ve más fácil de lo que es. */
  metaOptimista: boolean;
  vacio: boolean;
  /** Sin fijos la meta es 0 y es correcta, pero un "Bs 0" solo se lee como error. */
  sinFijos: boolean;
  /** Cada venta pierde plata: no hay volumen que alcance. */
  margenNegativo: boolean;
  /**
   * El margen se hundió por los gastos VARIABLES y no por el costo: la venta
   * sí deja plata y es el variable el que se la lleva. Piden consejos
   * opuestos, por eso se distinguen.
   */
  margenNegativoPorVariables: boolean;
}

/**
 * Cuánto hay que vender para no perder.
 *
 *     Margen de contribución = Ventas − Costo de ventas − Gastos VARIABLES
 *     Punto de equilibrio    = Gastos FIJOS ÷ (Margen de contribución ÷ Ventas)
 *
 * Lo que decide el lado es si el gasto acompaña a las ventas (`tipoCosto`),
 * no si es mensual: la comisión de delivery llega todos los meses y es
 * variable. Impuestos y financieros quedan afuera: el número responde "cuánto
 * vender para cubrir la operación".
 *
 * `dias` baja la meta a "cuánto por día"; con 0 esa línea no se muestra.
 */
export function puntoEquilibrio(
  fin: FinancieroBase,
  gastos: Gasto[],
  dias = 0,
): PuntoEquilibrio {
  const operativos = gastos.filter((g) => !BAJO_LA_LINEA.has(g.categoria));
  const fijos = operativos.filter((g) => tipoDe(g) === "FIJO");
  const variables = operativos.filter((g) => tipoDe(g) !== "FIJO");

  const ventas = fin.ventas ?? 0;
  const costoVentas = fin.costoVentas ?? 0;
  const gastosFijos = sumar(fijos);
  const gastosVariables = sumar(variables);
  const ventasSinCosto = fin.ventasSinCosto ?? 0;
  const diasValidos = Math.max(0, dias);

  const utilidadBruta = aCentavos(ventas - costoVentas);
  const costosVariables = aCentavos(costoVentas + gastosVariables);
  const margenContribucion = aCentavos(ventas - costosVariables);
  const margenContribucionPct = esPositivo(ventas) ? margenContribucion / ventas : null;

  // El corte va por el margen en PLATA y no por el porcentaje: con `pct > 0`
  // pelado, un margen de medio centavo —ruido de redondeo— da una meta de
  // millones. `esPositivo` aplica la tolerancia y lo deja afuera.
  const pe =
    esPositivo(margenContribucion) && margenContribucionPct != null
      ? aCentavos(gastosFijos / margenContribucionPct)
      : null;

  const vacio =
    esCero(ventas) && esCero(costoVentas) && esCero(gastosFijos) && esCero(gastosVariables);
  const margenNegativo = !vacio && esPositivo(ventas) && !esPositivo(margenContribucion);

  return {
    ventas,
    costoVentas,
    gastosVariables,
    gastosFijos,
    ventasSinCosto,
    lineasFijas: lineasDe(fijos, ventas, gastosFijos),
    lineasVariables: lineasDe(variables, ventas, gastosVariables),
    dias: diasValidos,
    utilidadBruta,
    costosVariables,
    margenContribucion,
    margenContribucionPct,
    puntoEquilibrio: pe,
    cubierto: pe != null && cubre(ventas, pe),
    margenSeguridadPct: pe != null && esPositivo(ventas) ? (ventas - pe) / ventas : null,
    faltaVender: pe != null ? aCentavos(Math.max(0, pe - ventas)) : null,
    ventaDiariaNecesaria: pe != null && diasValidos > 0 ? aCentavos(pe / diasValidos) : null,
    sinCostoSobreVentasPct: esPositivo(ventas) ? ventasSinCosto / ventas : null,
    metaOptimista: esPositivo(ventasSinCosto),
    vacio,
    sinFijos: esCero(gastosFijos),
    margenNegativo,
    margenNegativoPorVariables: margenNegativo && esPositivo(utilidadBruta),
  };
}
