/**
 * Pedidos de Yango y PedidosYa tomados desde el punto de venta
 * (PLAN-PEDIDOS-PLATAFORMA). El contrato JSON es el de §4.1 del plan y lo
 * respetan los tres repos: backend, web y Android.
 *
 * No son ventas: no entran a la caja, al arqueo, al historial ni a los
 * reportes de ventas. La app de delivery le cobra al cliente y le paga al
 * local después; acá sólo se registra lo que se tomó para cuadrar esa
 * liquidación. Sí descuentan stock (lo hace el backend).
 */

import type { AgregadoInput } from "../agregados/tipos";

/** Así viaja siempre, en el cuerpo y en las respuestas. */
export type Plataforma = "YANGO" | "PEDIDOS_YA";

export const PLATAFORMAS: readonly Plataforma[] = ["YANGO", "PEDIDOS_YA"];

/** El rótulo que lee el cajero. «PedidosYa» se escribe junto, como la marca. */
export const NOMBRE_PLATAFORMA: Record<Plataforma, string> = {
  YANGO: "Yango",
  PEDIDOS_YA: "PedidosYa",
};

/** La feature extra que el operador prende por negocio desde el panel. */
export const FEATURE_PLATAFORMA: Record<Plataforma, string> = {
  YANGO: "pedidos_yango",
  PEDIDOS_YA: "pedidos_pedidosya",
};

export interface DetallePedidoPlataforma {
  /** Con toppings (PLAN-AGREGADOS §7.3) cada renglón trae su id para que las hijas lo señalen. */
  id?: number;
  /** El renglón del vaso del que cuelga este topping; null en el vaso. */
  lineaPadreId?: number | null;
  /** El topping va dentro de lo incluido (Bs 0). */
  incluido?: boolean;
  productoId: number | null;
  /** Foto del nombre al registrar: el reporte no cambia si después lo renombran. */
  nombre: string;
  cantidad: number;
  precio: number;
  subtotal: number;
}

/** Lo que devuelven todas las rutas. */
export interface PedidoPlataforma {
  id: number;
  clienteRequestId: string;
  plataforma: Plataforma;
  /** El N° de pedido en la app de delivery, para cruzarlo a mano con su liquidación. */
  codigoExterno: string | null;
  /** Cuándo se tomó en el equipo, ISO con zona. */
  fecha: string;
  almacen: { id: number; nombre: string };
  usuario: { id: number; nombre: string } | null;
  /**
   * La caja abierta del POS al tomarlo (PLAN-PEDIDOS-PLATAFORMA §10.1). `null`
   * en los de antes de esa migración o si la caja no era de esa sucursal;
   * ausente si el backend es viejo. De ahí sale «Ventas del turno».
   */
  cajaId?: number | null;
  /**
   * Lo que cobra la app: la suma de los renglones (con toppings) menos el
   * descuento (CONTRATO-PRECIO-PLATAFORMA, 19-nov). En los de antes de ese
   * cambio es la suma de los renglones, como siempre.
   */
  total: number;
  /**
   * La suma de los renglones, antes del descuento. Ausente si el backend es
   * viejo: entonces es igual a `total` (ver `subtotalDelPedido`).
   */
  subtotal?: number;
  /** Lo que la app le descontó al cliente por cuenta del local. 0 o ausente = sin descuento. */
  descuento?: number;
  /** La nota del cajero («sin ají», un reclamo). null o ausente = sin nota. */
  observaciones?: string | null;
  /** Alguna línea dejó el stock en negativo: salió sin respaldo en el inventario. */
  sinStock: boolean;
  anuladoEn: string | null;
  motivoAnulacion: string | null;
  detalles: DetallePedidoPlataforma[];
}

/** `POST /pedidos-plataforma`. El precio lo pone el servidor, salvo en la cola. */
export interface PedidoPlataformaInput {
  clienteRequestId: string;
  plataforma: Plataforma;
  codigoExterno?: string;
  almacenId?: number;
  /**
   * La caja abierta del POS, como en una venta (§10.1): el historial del turno
   * lo muestra ahí. El backend la acepta sólo si es del negocio y de la misma
   * sucursal; si no, la guarda en null sin rechazar el pedido. La cola también
   * la manda, con la que estaba abierta al tomarlo.
   */
  cajaId?: number;
  /** Cuándo se tomó en el equipo (sólo lo manda la cola sin señal). */
  fechaCliente?: string;
  /** Viene de la cola: el servidor respeta el precio del equipo. */
  encolado?: boolean;
  /** Bs del pedido entero, >= 0 y no mayor que la suma de los renglones. Ausente = 0. */
  descuento?: number;
  /** Hasta 200 letras; vacío no se manda. */
  observaciones?: string;
  detalles: DetallePedidoPlataformaInput[];
}

export interface DetallePedidoPlataformaInput {
  productoId: number;
  cantidad: number;
  /**
   * El precio del local que vio el cajero: sólo lo manda la cola (sin señal el
   * servidor no lo puede poner). No cambia con el precio de la app.
   */
  precio?: number;
  /**
   * El precio de UNA unidad en la app de delivery, el que escribió el cajero
   * en el diálogo para este pedido (sin los toppings, que se cotizan como
   * siempre). Va sólo si lo escribió: ausente, vale el del local. Un backend
   * viejo lo ignora y usa el del local.
   */
  precioApp?: number;
  agregados?: AgregadoInput[];
}

export interface PeriodoLiquidacion {
  /** 0 = el actual, -1 = el anterior… hasta -60. */
  indice: number;
  desde: string;
  /** Exclusivo. */
  hasta: string;
  /** yyyy-MM-dd: el día que la app paga este período. */
  pagaEl: string;
  enCurso: boolean;
  /** Ya armada por el backend: «lun 16 al jue 19 de nov». */
  etiqueta: string;
}

export interface ReportePedidosPlataforma {
  plataforma: Plataforma;
  periodo: PeriodoLiquidacion;
  cantidad: number;
  /** Lo que pagan las apps: la suma de los `total` (netos) de los pedidos vivos. */
  total: number;
  /** La suma de los renglones de los pedidos vivos, antes de descuentos. Ausente si el backend es viejo. */
  subtotal?: number;
  /** Lo que las apps descontaron en los pedidos vivos. Ausente si el backend es viejo (= 0). */
  descuentos?: number;
  anulados: { cantidad: number; total: number };
  porDia: { fecha: string; cantidad: number; total: number }[];
  porProducto: { productoId: number | null; nombre: string; cantidad: number; total: number }[];
  porSucursal: { almacenId: number; nombre: string; cantidad: number; total: number }[];
  /** Con los anulados, marcados: no suman en nada de lo de arriba. */
  pedidos: PedidoPlataforma[];
}

/** `POST /pedidos-plataforma/:id/anular`: la misma autorización con PIN que una venta. */
export interface AnularPedidoPlataformaInput {
  motivo: string;
  autorizadorUsername?: string;
  autorizadorPin?: string;
}

/** El período más viejo que el backend acepta. */
export const PERIODO_MAS_VIEJO = -60;

// ── Lo nuevo del pedido, leído sin romper con un backend viejo (19-nov) ──────
//
// Un backend de antes del precio de la app no manda `descuento`, `subtotal`
// ni `observaciones`: el pedido se lee como siempre (sin descuento, el
// subtotal es el total, sin nota). Todas las pantallas leen por acá.

const centavos = (n: number) => Math.round(n * 100) / 100;

/** El descuento del pedido; 0 si no hubo o si el backend no lo manda. */
export function descuentoDelPedido(p: Pick<PedidoPlataforma, "descuento">): number {
  const d = Number(p.descuento ?? 0);
  return Number.isFinite(d) && d > 0 ? centavos(d) : 0;
}

/** La suma de los renglones: la que manda el backend o, si es viejo, total + descuento. */
export function subtotalDelPedido(p: Pick<PedidoPlataforma, "subtotal" | "total" | "descuento">): number {
  const s = Number(p.subtotal);
  return p.subtotal != null && Number.isFinite(s) ? centavos(s) : centavos(p.total + descuentoDelPedido(p));
}

/** La nota del cajero, sin espacios de más; null si no hay. */
export function observacionesDelPedido(p: Pick<PedidoPlataforma, "observaciones">): string | null {
  return p.observaciones?.trim() || null;
}
