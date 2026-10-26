/**
 * Los motivos del "Movimiento de efectivo" de una caja (`DialogoMovimiento`).
 * Aparte del componente para que éste sólo exporte el componente.
 */

import type { CodigoMotivoEfectivo } from "../../types";

export interface MotivoMovimiento {
  etiqueta: string;
  tipo: "INGRESO" | "EGRESO";
  /**
   * Billar: el código del motivo (`CodigoMotivoEfectivo`), que viaja como
   * `origen` y le dice al cierre, a los reportes y al Estado de resultado qué es
   * la plata. Sólo lo manda Supervisión del billar; sin él, el movimiento es el
   * de siempre.
   */
  origen?: CodigoMotivoEfectivo;
  /** Montos para tocar en vez de escribir (la cena casi siempre es 10, 15, 20 o 30). */
  montosRapidos?: number[];
  /**
   * Billar (25-oct): qué más se escribe aparte del monto ("¿En qué?" de un
   * gasto). Sin él, la descripción es la etiqueta y no hay nada que escribir.
   */
  detalle?: { obligatorio: boolean; label: string; placeholder: string };
  /**
   * Billar (25-oct): qué hace con la ganancia del mes, dicho al elegirlo. Es lo
   * que el administrador tiene que saber para no cargar dos veces un gasto ni
   * restar plata que sigue siendo suya.
   */
  efecto?: string;
}

/**
 * Los movimientos de efectivo que de verdad pasan en un turno. El motivo decide
 * el sentido: nadie ingresa un "pago a proveedor".
 */
export const MOTIVOS: MotivoMovimiento[] = [
  { etiqueta: "Sencillo", tipo: "INGRESO" },
  { etiqueta: "Devolución", tipo: "EGRESO" },
  { etiqueta: "Pago a proveedor", tipo: "EGRESO" },
  { etiqueta: "Retiro", tipo: "EGRESO" },
];

/**
 * El motivo de la cena del personal. Es de Supervisión del billar: el
 * administrador la registra sobre la caja de la cajera (24-oct-2026).
 */
export const MOTIVO_CENA: MotivoMovimiento = {
  etiqueta: "Cena",
  tipo: "EGRESO",
  origen: "CENA",
  montosRapidos: [10, 15, 20, 30],
  efecto: "Resta de la ganancia del mes, en «Cenas del personal».",
};

/**
 * Los motivos de Supervisión del billar (25-oct). Cada uno con su código, que
 * es lo que el Estado de resultado lee para saber si la plata es un gasto del
 * local o efectivo que sólo cambió de lugar (`motivos-efectivo.ts` del backend,
 * con el porqué de cada uno):
 *
 *   - Cena y Gasto restan de la ganancia.
 *   - Pago a proveedor NO: es mercadería, y su costo ya resta en "Costo de lo
 *     vendido" cada vez que se vende. Restarlo también al pagarlo lo contaría
 *     dos veces.
 *   - Retiro y Otra salida NO: la plata sale del cajón pero no es un gasto.
 *   - Sencillo y Otra entrada NO suman: lo que se vende se cobra como venta.
 *
 * No hay "Devolución" ni "Otro" libre como en el cierre de caja: una venta se
 * devuelve anulándola en Ventas, y un "Otro" no diría si es un gasto. Acá cada
 * motivo lo dice.
 */
export const MOTIVOS_BILLAR: MotivoMovimiento[] = [
  MOTIVO_CENA,
  {
    etiqueta: "Gasto",
    tipo: "EGRESO",
    origen: "GASTO",
    detalle: { obligatorio: true, label: "¿En qué?", placeholder: "Ej. hielo, tiza, limpieza, un arreglo" },
    efecto: "Resta de la ganancia del mes, en «Gastos pagados de la caja». No lo cargues también en Gastos operativos: se restaría dos veces.",
  },
  {
    etiqueta: "Pago a proveedor",
    tipo: "EGRESO",
    origen: "PROVEEDOR",
    detalle: { obligatorio: false, label: "¿A quién? (opcional)", placeholder: "Ej. distribuidora de cerveza" },
    efecto:
      "No resta de la ganancia: es mercadería para vender, y lo que costó ya resta cada vez que se vende. Si pagaste algo que no se vende (hielo, gas, un arreglo), elegí Gasto.",
  },
  {
    etiqueta: "Retiro",
    tipo: "EGRESO",
    origen: "RETIRO",
    detalle: { obligatorio: false, label: "Detalle (opcional)", placeholder: "Ej. a la caja fuerte" },
    efecto: "No resta de la ganancia: la plata sale del cajón, pero sigue siendo tuya.",
  },
  {
    etiqueta: "Otra salida",
    tipo: "EGRESO",
    origen: "OTRA_SALIDA",
    detalle: { obligatorio: true, label: "¿Qué fue?", placeholder: "Ej. adelanto de sueldo" },
    efecto: "No resta de la ganancia. Si fue un gasto del local, elegí Gasto.",
  },
  {
    etiqueta: "Sencillo",
    tipo: "INGRESO",
    origen: "SENCILLO",
    detalle: { obligatorio: false, label: "Detalle (opcional)", placeholder: "Ej. monedas para el cambio" },
    efecto: "No suma a la ganancia: es plata para dar cambio, no una venta.",
  },
  {
    etiqueta: "Otra entrada",
    tipo: "INGRESO",
    origen: "OTRA_ENTRADA",
    detalle: { obligatorio: true, label: "¿Qué fue?", placeholder: "Ej. devuelven un retiro" },
    efecto: "No suma a la ganancia: lo que se vende se cobra como venta.",
  },
];

/** El motivo del billar de un código, para nombrarlo en una lista o un reporte. */
export function motivoDeCodigo(codigo: string | null | undefined): MotivoMovimiento | undefined {
  return codigo ? MOTIVOS_BILLAR.find((m) => m.origen === codigo) : undefined;
}

/**
 * Los códigos que restan de la ganancia (Estado de resultado). Tiene que ser lo
 * mismo que `esGasto` en `motivos-efectivo.ts` del backend.
 */
export const CODIGOS_GASTO: ReadonlySet<CodigoMotivoEfectivo> = new Set<CodigoMotivoEfectivo>(["CENA", "GASTO"]);
