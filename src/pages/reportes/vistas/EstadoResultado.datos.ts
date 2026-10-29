import { aCentavos, esCero, esPositivo } from "../../../lib/dinero";
import { fmtMoney, fmtNum } from "../../../lib/format";
import type { MesEnCurso } from "../../../lib/mesEnCurso";
import type { EstadoResultado, GastosDeCaja } from "../../../lib/resultado";
import { esBelleza, esBillar, esFarmacia } from "../../../lib/rubro";
import type { CodigoMotivoEfectivo, Gasto } from "../../../types";
import { motivoDeCodigo } from "../../pos/motivosMovimiento";
import type { EfectivoBillarApi } from "../api";
import { bsSubtotal, horas } from "../formato";

/**
 * Lo que cambia de un rubro a otro en el Estado de Resultado.
 *
 * La CUENTA es una sola para todos (`lib/resultado.ts`, la misma de la app): un
 * billar no gana distinto que un restaurante. Lo que cambia es con qué palabras
 * se cuenta y de dónde sale la plata: el restaurante vende platos, la farmacia
 * medicamentos, la peluquería servicios y productos, y el billar tiempo de mesa
 * y bebidas.
 *
 * Pedido de Kevin del 14-oct, con las capturas de la app: "no es un
 * restaurante, es un billar". La pantalla decía "Ganancia de lo vendido" y el
 * tiempo de mesa iba en letra chica debajo de Ventas, así que el dueño no veía
 * cuánto le dejaban las mesas, que es justo lo que viene a mirar.
 */

/**
 * Cómo se parte la primera línea de la cascada. "clases" es la academia (L5,
 * 28-oct): lo cobrado en cuotas y lo vendido en productos.
 */
export type Particion = "billar" | "servicios" | "clases";

export interface PerfilResultado {
  /** Null = la venta va en una sola línea (restaurante, farmacia, tiendas). */
  partir: Particion | null;
  /** "plato", "medicamento", "producto": el "cada X" del costo. */
  cosa: string;
  /** El plural, para "revisá el costo cargado en tus X más vendidos". */
  cosas: string;
  costoTitulo: string;
  costoDetalle: string;
  /** La utilidad bruta con su nombre simple. Abajo va el contable. */
  gananciaTitulo: string;
  /** Qué son los gastos del local, con ejemplos del rubro: el detalle que se abre al tocarlos. */
  queVaLocal: string;
  /** Qué es el costo de lo vendido. */
  queVaCosto: string;
}

const NO_SON_COMPRAS =
  "No son tus compras del período: comprar para tres meses no hunde el resultado de este mes, porque lo que no se vendió sigue en el stock.";

export function perfilResultado(rubro: string | undefined): PerfilResultado {
  // Academia (L5, 28-oct): el Estado de resultado es "el" reporte del
  // instituto. Lo que entra se parte en las clases (cuotas) y los productos
  // (poleras, kits), y los sueldos docentes van en su propia línea.
  if (rubro === "ACADEMIA") {
    return {
      partir: "clases",
      cosa: "producto",
      cosas: "productos",
      costoTitulo: "Costo de los productos",
      costoDetalle: "Lo que te costaron · las clases no tienen costo de mercadería",
      gananciaTitulo: "Ganancia de clases y productos",
      queVaLocal:
        "Lo que cuesta tener el instituto abierto: alquiler, luz, agua, internet, limpieza, el sueldo de la recepción y los materiales de las clases. Cuenta lo gastado aunque todavía no esté pagado. Los sueldos de los docentes no van acá: tienen su propia línea, con lo pagado de la planilla. Las poleras y los kits que vendés tampoco: entran por el costo de los productos.",
      queVaCosto: `Lo que te costaron las poleras, los kits y el material que vendiste, según el costo cargado en cada uno. Las cuotas no tienen costo de mercadería: lo que cobrás por las clases queda entero para pagar los gastos y los sueldos. ${NO_SON_COMPRAS}`,
    };
  }
  if (esBillar(rubro)) {
    return {
      partir: "billar",
      cosa: "producto",
      cosas: "productos",
      costoTitulo: "Costo de los productos",
      costoDetalle: "Lo que te costaron · el tiempo de mesa no tiene costo",
      gananciaTitulo: "Ganancia de mesas y productos",
      queVaLocal:
        "Lo que cuesta tener el billar abierto: alquiler, sueldos del personal, luz, agua, internet y el mantenimiento de las mesas (paños, tacos, bolas). Cuenta lo gastado aunque todavía no esté pagado. Las bebidas que comprás para vender no van acá: entran por el costo de los productos. La cena y lo que se paga de la caja desde Supervisión tampoco: tienen su propia línea, y cargarlos también acá los restaría dos veces.",
      queVaCosto: `Lo que te costaron las bebidas y productos que vendiste, según el costo cargado en cada uno. El tiempo de mesa no tiene costo de mercadería: lo que cobrás por las mesas queda entero para pagar los gastos. ${NO_SON_COMPRAS}`,
    };
  }
  if (esBelleza(rubro)) {
    return {
      partir: "servicios",
      cosa: "servicio",
      cosas: "servicios",
      costoTitulo: "Costo de lo vendido",
      costoDetalle: "Costo cargado en cada servicio y producto",
      gananciaTitulo: "Ganancia de servicios y productos",
      queVaLocal:
        "Lo que cuesta tener el local abierto: alquiler, sueldos o comisiones, luz, agua, internet, limpieza. Cuenta lo gastado aunque todavía no esté pagado. Los productos que vendés no van acá: entran por el costo de lo vendido.",
      queVaCosto: `Lo que costó lo que vendiste, según el costo cargado en cada servicio y producto. ${NO_SON_COMPRAS}`,
    };
  }
  if (esFarmacia(rubro)) {
    return {
      partir: null,
      cosa: "medicamento",
      cosas: "medicamentos",
      costoTitulo: "Costo de lo vendido",
      costoDetalle: "Costo cargado en cada medicamento",
      gananciaTitulo: "Ganancia de lo vendido",
      queVaLocal:
        "Lo que cuesta tener la farmacia abierta: alquiler, sueldos, luz, agua, internet, el sistema. Cuenta lo gastado aunque todavía no esté pagado. Los medicamentos no van acá: lo vendido entra por su costo y lo vencido por las mermas.",
      queVaCosto: `Lo que costó lo que vendiste: el costo del lote del que salió cada medicamento o, si no salió de un lote, el cargado en su ficha. ${NO_SON_COMPRAS}`,
    };
  }
  if (rubro === "RESTAURANTE") {
    return {
      partir: null,
      cosa: "plato",
      cosas: "platos",
      costoTitulo: "Costo de lo vendido",
      costoDetalle: "Costo cargado en cada plato",
      gananciaTitulo: "Ganancia de la comida",
      queVaLocal:
        "Lo que cuesta tener el restaurante abierto: alquiler, sueldos, luz, agua, gas, limpieza, descartables. Cuenta lo gastado aunque todavía no esté pagado. La mercadería no va acá: entra por el costo de cada plato vendido.",
      queVaCosto: `Lo que costó lo que vendiste, según el costo cargado en cada plato. ${NO_SON_COMPRAS}`,
    };
  }
  // Minimarket, ferretería, repuestos y un negocio sin rubro.
  return {
    partir: null,
    cosa: "producto",
    cosas: "productos",
    costoTitulo: "Costo de lo vendido",
    costoDetalle: "Costo cargado en cada producto",
    gananciaTitulo: "Ganancia de lo vendido",
    queVaLocal:
      "Lo que cuesta tener el local abierto: alquiler, sueldos, luz, agua, internet, limpieza. Cuenta lo gastado aunque todavía no esté pagado. La mercadería no va acá: entra por el costo de lo vendido.",
    queVaCosto: `Lo que costó lo que vendiste, según el costo cargado en cada producto. ${NO_SON_COMPRAS}`,
  };
}

/** Las dos partes de la venta: el tiempo de mesa (o los servicios) y los productos. */
export interface VentasPartidas {
  servicios: number;
  productos: number;
}

/**
 * Parte las ventas del estado de resultado con la composición del resumen.
 *
 * Las dos partes salen de la MISMA venta pero de dos endpoints: el resumen suma
 * línea por línea y el financiero la venta entera. Si una promo de la venta
 * entera las separara por centavos, "Tiempo + Bebidas" no daría la línea de
 * Ventas que va justo debajo, y el dueño dudaría del reporte entero. Por eso el
 * tiempo se toma tal cual y los productos son lo que falta para las ventas.
 *
 * Null (la línea va entera) sin composición, o si una de las dos partes es cero:
 * "+ Tiempo de mesa Bs 98 = Ventas Bs 98" repite el número sin decir nada.
 */
export function partirVentas(
  ventas: number,
  composicion: { servicios?: number | null } | null | undefined,
): VentasPartidas | null {
  if (!composicion || composicion.servicios == null || !Number.isFinite(composicion.servicios)) return null;
  const servicios = aCentavos(Math.min(Math.max(composicion.servicios, 0), Math.max(ventas, 0)));
  const productos = aCentavos(ventas - servicios);
  if (!esPositivo(servicios) || !esPositivo(productos)) return null;
  return { servicios, productos };
}

/**
 * Academia: parte las ventas en lo cobrado por clases (`cobradoCuotas` del
 * financiero, que ya está DENTRO de las ventas) y lo vendido en productos. Las
 * dos salen del mismo pedido, así que suman exactamente las ventas.
 *
 * A diferencia del billar, va partida aunque una de las dos sea cero: el dueño
 * pidió ver siempre las dos líneas ("Cobrado por clases" y "Ventas de
 * productos"). Null sólo con un backend anterior, que no manda el dato:
 * entonces la línea va entera, como en cualquier rubro.
 */
export function partirClases(ventas: number, cobradoCuotas: number | null | undefined): VentasPartidas | null {
  if (cobradoCuotas == null || !Number.isFinite(cobradoCuotas)) return null;
  const servicios = aCentavos(Math.min(Math.max(cobradoCuotas, 0), Math.max(ventas, 0)));
  return { servicios, productos: aCentavos(ventas - servicios) };
}

/** Los gastos del local de una academia sin la planilla docente, y la planilla aparte. */
export interface SueldosSeparados {
  /** Los gastos cargados que no son pagos de la planilla. */
  gastosLocal: Gasto[];
  /** Lo pagado de la planilla en el período: la línea "Sueldos docentes". */
  sueldosDocentes: number;
}

/**
 * Separa los pagos de la planilla docente (los Gasto SUELDOS que crea pagarla,
 * `gastoIds` de `/academia/reportes/clases`) del resto de los gastos. No
 * cambia la cuenta: el total de gastos es el mismo, sólo se ve en dos líneas.
 * Un sueldo cargado a mano (la recepción) sigue en los gastos del local.
 */
export function separarSueldosDocentes(gastos: Gasto[], gastoIds: number[] | null | undefined): SueldosSeparados {
  const ids = new Set(gastoIds ?? []);
  if (ids.size === 0) return { gastosLocal: gastos, sueldosDocentes: 0 };
  const deLaPlanilla = gastos.filter((g) => ids.has(g.id));
  return {
    gastosLocal: gastos.filter((g) => !ids.has(g.id)),
    sueldosDocentes: aCentavos(deLaPlanilla.reduce((t, g) => t + g.monto, 0)),
  };
}

/**
 * Lo que dejó cada parte de un billar: las mesas enteras (el tiempo no tiene
 * costo de mercadería) y los productos, lo vendido menos lo que costaron.
 *
 * Sólo en el billar: su único servicio es el tiempo de mesa, que se crea con
 * costo cero, así que todo el costo de lo vendido es de los productos. En una
 * peluquería un servicio sí puede tener costo cargado y no se sabe cuánto del
 * total es de cada parte: ahí no se parte la ganancia.
 */
export function gananciaPorParte(partes: VentasPartidas, costoVentas: number) {
  const productos = aCentavos(partes.productos - costoVentas);
  return {
    mesas: partes.servicios,
    productos,
    /** Lo que deja cada Bs vendido en productos. Null sin ventas de productos. */
    margenProductos: esPositivo(partes.productos) ? productos / partes.productos : null,
  };
}

/** "42 h jugadas en 4 mesas", del reporte del billar. Null si no hubo juego. */
export function horasJugadas(reporte: { horas?: number | null; porMesa?: { horas: number }[] } | null | undefined): string | null {
  if (!reporte || !(Number(reporte.horas) > 0)) return null;
  const mesas = (reporte.porMesa ?? []).filter((m) => m.horas > 0).length;
  const enMesas = mesas > 0 ? ` en ${mesas} ${mesas === 1 ? "mesa" : "mesas"}` : "";
  return `${horas(Number(reporte.horas))} jugadas${enMesas}`;
}

function unirConY(partes: string[]): string {
  if (partes.length <= 1) return partes[0] ?? "";
  return `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
}

/**
 * De dónde salió la ganancia, en una frase: la primera mitad de la explicación.
 */
function deDondeSale(er: EstadoResultado, perfil: PerfilResultado, partes: VentasPartidas | null): string {
  if (!esPositivo(er.ventas)) return "No hubo ventas en este período.";
  if (perfil.partir === "billar" && partes) {
    const g = gananciaPorParte(partes, er.costoVentas);
    return g.productos >= 0
      ? `Las mesas dejaron ${fmtMoney(g.mesas)} y los productos ${fmtMoney(g.productos)}.`
      : `Las mesas dejaron ${fmtMoney(g.mesas)}, pero los productos costaron ${fmtMoney(-g.productos)} más de lo que se cobraron.`;
  }
  // Academia: las cuotas no tienen costo, todo el costo es de los productos
  // (la misma cuenta que el billar). Sin productos vendidos, sólo las clases.
  if (perfil.partir === "clases" && partes) {
    const g = gananciaPorParte(partes, er.costoVentas);
    if (!esPositivo(partes.productos) && esCero(er.costoVentas)) return `Las clases dejaron ${fmtMoney(g.mesas)}.`;
    return g.productos >= 0
      ? `Las clases dejaron ${fmtMoney(g.mesas)} y los productos ${fmtMoney(g.productos)}.`
      : `Las clases dejaron ${fmtMoney(g.mesas)}, pero los productos costaron ${fmtMoney(-g.productos)} más de lo que se cobraron.`;
  }
  if (!esPositivo(er.utilidadBruta)) {
    return `Lo vendido no alcanzó ni para su costo: quedó en ${bsSubtotal(er.utilidadBruta)}.`;
  }
  const quien =
    perfil.cosa === "plato"
      ? "La comida dejó"
      : perfil.partir === "servicios" && partes
        ? "Los servicios y productos dejaron"
        : "Lo vendido dejó";
  return `${quien} ${fmtMoney(er.utilidadBruta)} después de su costo.`;
}

/**
 * El resultado contado en palabras, debajo del número grande: de dónde salió
 * la ganancia, qué se la llevó y qué quedó. Es la cascada de arriba en dos
 * frases, para el dueño que no lee cuentas ("si realmente está ganando o
 * perdiendo el local", pidió Kevin):
 *
 *   "Las mesas dejaron Bs 4.200,00 y los productos Bs 900,00. Restando los
 *    gastos del local (Bs 3.500,00), te quedan Bs 1.600,00: es tu ganancia
 *    líquida."
 *
 * Con los mismos números de la cascada y con centavos: redondeados, "4.200 +
 * 900 − 3.500" podía no dar el número que dice al lado.
 */
export function explicarResultado(
  er: EstadoResultado,
  perfil: PerfilResultado,
  partes: VentasPartidas | null,
  /**
   * Academia: lo pagado de la planilla docente, que ya está dentro de los
   * gastos operativos y se nombra aparte. 0 (todos los demás rubros): el
   * texto es exactamente el de siempre.
   */
  sueldosDocentes = 0,
): string | null {
  if (er.vacio) return null;
  const origen = deDondeSale(er, perfil, partes);
  const sueldos = aCentavos(Math.max(0, Math.min(sueldosDocentes, er.gastosOperativos)));
  const local = aCentavos(er.gastosOperativos - sueldos);
  const restas = (
    [
      [er.mermas, "las mermas"],
      [local, "los gastos del local"],
      [sueldos, "los sueldos docentes"],
      [er.cenasPersonal, "las cenas del personal"],
      [er.gastosCaja, "los gastos pagados de la caja"],
      [er.gastosFinancieros, "el banco"],
      [er.impuestos, "los impuestos"],
    ] as [number, string][]
  )
    .filter(([monto]) => esPositivo(monto))
    .map(([monto, nombre]) => `${nombre} (${fmtMoney(monto)})`);

  if (restas.length === 0) {
    // Sin un solo gasto cargado el resultado es la ganancia bruta: decirlo,
    // para que no se lea como lo que de verdad quedó.
    return `${origen} Todavía no cargaste gastos en este período: sin el alquiler, los sueldos y los servicios, este resultado está de más.`;
  }
  const lista = unirConY(restas);
  // Sin los gastos del local lo que queda no es la ganancia líquida, aunque
  // algo haya restado. El aviso miraba si había ALGUNA resta: en un billar con
  // cenas y nada cargado (25-oct) decía "es tu ganancia líquida" sobre un
  // número al que le faltaban el alquiler y los sueldos.
  const faltanGastos = esCero(local)
    ? " Todavía no cargaste los gastos del local (alquiler, sueldos, servicios): cuando los cargués, este resultado va a bajar."
    : "";
  if (esCero(er.utilidadNeta)) return `${origen} Restando ${lista}, quedás justo en cero.${faltanGastos}`;
  if (er.utilidadNeta > 0) {
    return faltanGastos
      ? `${origen} Restando ${lista}, te quedan ${fmtMoney(er.utilidadNeta)}.${faltanGastos}`
      : `${origen} Restando ${lista}, te quedan ${fmtMoney(er.utilidadNeta)}: es tu ganancia líquida.`;
  }
  return `${origen} Restando ${lista}, quedás ${fmtMoney(-er.utilidadNeta)} en contra.${faltanGastos}`;
}

// ── Lo que el billar paga de la caja (25-oct) ───────────────────────────────

/**
 * Lo que resta de la ganancia del efectivo del billar: las cenas y los gastos
 * pagados de la caja (`CODIGOS_GASTO` en `motivosMovimiento.ts`). Sin el
 * reporte (cualquier otro rubro), undefined: la cuenta es la de siempre. El
 * Estado de resultado y el Resumen lo arman igual, para dar el mismo número.
 */
export function gastosDeCaja(efectivo: Pick<EfectivoBillarApi, "porMotivo"> | null | undefined): GastosDeCaja | undefined {
  if (!efectivo) return undefined;
  return { cenas: efectivo.porMotivo?.CENA?.monto ?? 0, gastos: efectivo.porMotivo?.GASTO?.monto ?? 0 };
}

/**
 * Qué se pagó de la caja, sin repetir y de lo que más costó a lo que menos: el
 * detalle de la línea ("Hielo, tiza y un arreglo"). Cinco noches de hielo son
 * un "Hielo", no cinco.
 */
export function conceptosDeCaja(gastos: { descripcion: string; monto: number }[]): string[] {
  const porNombre = new Map<string, { nombre: string; monto: number }>();
  for (const g of gastos) {
    const nombre = g.descripcion.trim();
    if (!nombre) continue;
    const clave = nombre.toLocaleLowerCase("es");
    const ya = porNombre.get(clave);
    porNombre.set(clave, { nombre: ya?.nombre ?? nombre, monto: (ya?.monto ?? 0) + g.monto });
  }
  return [...porNombre.values()].sort((a, b) => b.monto - a.monto).map((c) => c.nombre);
}

/** Un renglón de "Lo que movió la caja sin cambiar tu ganancia". */
export interface MovimientoSinEfecto {
  codigo: CodigoMotivoEfectivo;
  titulo: string;
  /** Por qué no cambia la ganancia, en pocas palabras. */
  porQue: string;
  /** Con signo: lo que salió de la caja va en negativo. */
  monto: number;
}

/**
 * Los motivos que NO son gasto, en el orden de Supervisión. Tiene que cubrir
 * todo lo que no está en `CODIGOS_GASTO` (lo controla un test): un motivo
 * nuevo que no esté en ninguna de las dos listas no se vería en ningún lado.
 */
export const MOTIVOS_SIN_EFECTO: { codigo: CodigoMotivoEfectivo; titulo: string; porQue: string }[] = [
  { codigo: "PROVEEDOR", titulo: "Pagos a proveedores", porQue: "Es mercadería: lo que costó resta cuando se vende, en el costo de los productos." },
  { codigo: "RETIRO", titulo: "Retiros", porQue: "Sale del cajón, pero sigue siendo tu plata." },
  { codigo: "OTRA_SALIDA", titulo: "Otras salidas", porQue: "No son gastos del local (un adelanto de sueldo, por ejemplo)." },
  { codigo: "SENCILLO", titulo: "Sencillo", porQue: "Plata para dar cambio, no una venta." },
  { codigo: "OTRA_ENTRADA", titulo: "Otras entradas", porQue: "No son ventas: lo que se vende se cobra como venta." },
];

/**
 * Lo que la caja del billar movió sin cambiar la ganancia, para la tarjeta
 * informativa del Estado de resultado: cada motivo sólo si hubo. Va aparte de
 * la cuenta y lo dice, porque las dos salidas obvias están mal: restar un pago
 * a proveedor contaría dos veces la mercadería (su costo ya entra con cada
 * venta), y no mostrarlo en ningún lado hace que Bs 800 que salieron del
 * cajón parezcan un olvido del reporte.
 */
export function movimientosSinEfecto(porMotivo: Partial<EfectivoBillarApi["porMotivo"]> | null | undefined): MovimientoSinEfecto[] {
  if (!porMotivo) return [];
  return MOTIVOS_SIN_EFECTO.flatMap(({ codigo, titulo, porQue }) => {
    const monto = porMotivo[codigo]?.monto ?? 0;
    if (!esPositivo(monto)) return [];
    // El sentido es el del motivo: nadie ingresa un "pago a proveedor".
    const sale = motivoDeCodigo(codigo)?.tipo === "EGRESO";
    return [{ codigo, titulo, porQue, monto: sale ? -monto : monto }];
  });
}

/**
 * La fórmula de la meta del mes, dicha con lo que de verdad suma. Decía
 * "gastos cargados del mes" y el número traía también las mermas y las cenas
 * (las de hasta hoy, como si fueran las del mes): el dueño buscaba en Gastos un
 * total que no estaba. Con sólo gastos cargados dice lo de siempre.
 *
 * La plata con centavos (Kevin, 25-oct): redondeada cada parte por su lado,
 * 100,50 + 200,50 se leía "Bs 101 y Bs 201" bajo un total de "Bs 301".
 */
export function notaMeta(p: {
  /** Los gastos cargados del mes: los del local, el banco y los impuestos. */
  cargados: number;
  mermas: number;
  /** Las cenas del personal hasta hoy: la meta las lleva al mes entero. */
  cenas: number;
  /** Lo pagado de la caja en el mes: cuenta una vez, tal cual. */
  gastosCaja: number;
  mes: Pick<MesEnCurso, "margen" | "gastosMeta" | "diariosDelMes" | "diaActual">;
}): string {
  const margen = `${fmtNum(p.mes.margen * 100, 1)} %`;
  const dias = p.mes.diaActual === 1 ? "1 día" : `${p.mes.diaActual} días`;
  const partes = [
    esPositivo(p.cargados) ? `los gastos cargados (${fmtMoney(p.cargados)})` : null,
    esPositivo(p.mermas) ? `las mermas (${fmtMoney(p.mermas)})` : null,
    esPositivo(p.gastosCaja) ? `los gastos pagados de la caja (${fmtMoney(p.gastosCaja)})` : null,
    esPositivo(p.cenas)
      ? `las cenas del personal del mes entero, al ritmo de hasta hoy (${fmtMoney(p.mes.diariosDelMes)}: van ${fmtMoney(p.cenas)} en ${dias})`
      : null,
  ].filter((x): x is string => x != null);
  const soloCargados = partes.length === 1 && esPositivo(p.cargados);
  const formula = `Meta = ${soloCargados ? "gastos cargados del mes" : "gastos del mes"} (${fmtMoney(p.mes.gastosMeta)}) ÷ lo que te deja cada venta (${margen}).`;
  return soloCargados || partes.length === 0 ? formula : `${formula} Son ${unirConY(partes)}.`;
}
