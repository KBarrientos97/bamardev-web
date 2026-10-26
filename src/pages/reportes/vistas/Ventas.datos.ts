import type { NombreIcono } from "../../../components/Icon";
import { esPositivo } from "../../../lib/dinero";
import { fmtCantidad, fmtFechaHora, fmtMoney } from "../../../lib/format";
import type { HojaNueva } from "../../../lib/planilla";
import type {
  EstadoDocumento,
  EstadoMesVentas,
  PaginaMeta,
  ReporteVentasDetalle,
  ReporteVentasGeneral,
  ReporteVentasMensual,
} from "../../../types";
import { hoja } from "../contexto";
import { SIGLAS_MES } from "../formato";
import type { TonoR } from "../ui";

/**
 * Las cuentas de la pantalla de Ventas (General, Detallado y Mensual), aparte
 * de los componentes para poder probarlas.
 */

// ── Tipos que el backend ya manda y `types.ts` todavía no dice ──────────────

/**
 * Una venta del historial con lo que agregó el backend. Todo opcional: contra
 * un backend anterior la fila se dibuja igual, sin esos datos.
 */
export type VentaFila = ReporteVentasGeneral["items"][number] & {
  /** De dónde salió: "Mostrador", "Mesa M4", "Delivery", "Recoger". */
  origen?: string | null;
  /** Quién atendió la mesa (no quién cobró: ése es `vendedor`). Null en el mostrador. */
  mesero?: string | null;
  /** Salió de una mesa de billar, no de la venta rápida. */
  billar?: boolean;
  /**
   * Lo que entró por cada medio, sólo si la venta se pagó con dos o más
   * (backend del 26-oct; el efectivo ya viene como "Efectivo"). Con "Mixto"
   * solo, Miguel no sabía cuánto de esa venta tenía que buscar en el banco.
   */
  partes?: { medio: string; monto: number }[];
};

export type ReporteVentas = Omit<ReporteVentasGeneral, "items"> & { items: VentaFila[] };

/** Una línea del detallado, con su mesa si el backend la trae. */
export type LineaVenta = ReporteVentasDetalle["items"][number] & {
  /** "7", 7 o "Mesa 7". */
  mesa?: string | number | null;
};

export type ReporteDetalle = Omit<ReporteVentasDetalle, "items"> & { items: LineaVenta[] };

// ── General ─────────────────────────────────────────────────────────────────

export interface Aspecto {
  icono: NombreIcono;
  tono: TonoR;
}

/**
 * El ícono de la fila según cómo se pagó. Los colores son los de Métodos de
 * pago (el QR violeta, el efectivo verde) para que una venta se reconozca
 * igual en los dos reportes; lo que no se cobró es plata que te deben, en
 * ámbar.
 */
export function aspectoMetodo(metodoPago: string | null | undefined, estado: EstadoDocumento): Aspecto {
  const m = (metodoPago ?? "").trim().toLowerCase();
  const base: Aspecto = m.includes("qr")
    ? { icono: "qr", tono: "morado" }
    : m.includes("efectivo")
      ? { icono: "billetera", tono: "verde" }
      : m.includes("tarjeta")
        ? { icono: "tarjetas", tono: "azul" }
        : m.includes("transfer")
          ? { icono: "swap", tono: "azul" }
          : m === "mixto"
            ? { icono: "coins", tono: "azul" }
            : m.includes("sin cobrar")
              ? { icono: "clock", tono: "ambar" }
              : { icono: "dollar", tono: "gris" };
  // Una anulada no entró: en gris, sea cual sea el método. Con su color de
  // siempre se leía como un cobro más entre los otros.
  return estado === "ANULADO" ? { icono: base.icono, tono: "gris" } : base;
}

export function chipEstado(estado: EstadoDocumento): { texto: string; tono: "verde" | "rojo" | "ambar" } {
  if (estado === "ANULADO") return { texto: "Anulada", tono: "rojo" };
  // Un pedido contra entrega que todavía no se cobró: plata que te deben.
  if (estado === "PENDIENTE") return { texto: "Pendiente", tono: "ambar" };
  return { texto: "Completada", tono: "verde" };
}

/**
 * De dónde salió la venta, como se dice en el rubro.
 *
 * En un billar no hay mostrador: lo que no sale de una mesa es la "Venta
 * rápida" (la gaseosa al paso), que es como la llama la pantalla del billar.
 * Una venta que sí salió de una mesa (`billar`) no se llama así aunque el
 * backend todavía no diga de cuál: ahí se la nombra como mesa de billar.
 */
export function textoOrigen(v: Pick<VentaFila, "origen" | "billar">, enBillar: boolean): string | null {
  const origen = v.origen?.trim() || null;
  if (!enBillar) return origen;
  if (v.billar) return origen && origen !== "Mostrador" ? origen : "Mesa de billar";
  return origen === "Mostrador" ? "Venta rápida" : origen;
}

/** "08/10/2026 12:18 a. m. · QR · Mesa 6": cuándo, cómo se pagó y de dónde salió. */
export function lineaVenta(v: VentaFila, enBillar: boolean): string {
  return [fmtFechaHora(v.fecha), metodoDeVenta(v, enBillar), textoOrigen(v, enBillar)].filter(Boolean).join(" · ");
}

/**
 * Cómo se pagó. En un billar, una venta pagada parte y parte dice cuánto fue
 * por cada medio (26-oct): "Mixto (Efectivo Bs 80,00 + QR Bs 80,00)". Sin las
 * partes (un backend anterior) o fuera del billar, el método como siempre.
 */
export function metodoDeVenta(v: Pick<VentaFila, "metodoPago" | "partes">, enBillar: boolean): string {
  if (!enBillar || !v.partes || v.partes.length < 2) return v.metodoPago;
  return `Mixto (${v.partes.map((p) => `${p.medio} ${fmtMoney(p.monto)}`).join(" + ")})`;
}

const SIN_CLIENTE = "Consumidor final";

/**
 * Quién vendió, y quién atendió si fue otro. En un resto bar toda venta del
 * salón la cobra la caja: con el vendedor solo, el historial decía que todo lo
 * vendieron las dos cajeras y el mesero no aparecía.
 */
export function quienVendio(v: VentaFila, conSucursal: boolean): string {
  const atendio = v.mesero && v.mesero !== v.vendedor ? v.mesero : null;
  return [
    atendio ? `Cobró ${v.vendedor} · atendió ${atendio}` : v.vendedor,
    v.cliente && v.cliente !== SIN_CLIENTE ? v.cliente : null,
    conSucursal ? v.sucursal : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * ¿Hay ventas de más de un local a la vista? Sólo entonces se nombra el local
 * en cada fila: en un negocio de una sucursal, o con el reporte ya filtrado
 * por una, repetirlo en cada venta es ruido.
 */
export function variasSucursales(items: { sucursal?: string | null }[]): boolean {
  return new Set(items.map((i) => i.sucursal).filter(Boolean)).size > 1;
}

// ── Detallado ───────────────────────────────────────────────────────────────

/** El renglón del tiempo jugado: lo arma el cierre de una mesa con el producto "Tiempo de mesa". */
export function esTiempoDeMesa(producto: string, enBillar: boolean): boolean {
  return enBillar && /^tiempo de mesa/i.test(producto.trim());
}

/** "Mesa 7" desde lo que mande el backend ("7", 7 o "Mesa 7"). Null sin mesa. */
export function textoMesa(mesa: string | number | null | undefined): string | null {
  if (mesa == null) return null;
  const t = String(mesa).trim();
  if (!t) return null;
  return /^mesa\b/i.test(t) ? t : `Mesa ${t}`;
}

/** El título de la línea: el producto y, si la trae, la mesa ("Tiempo de mesa · Mesa 7"). */
export function tituloLinea(l: Pick<LineaVenta, "producto" | "mesa">): string {
  const mesa = textoMesa(l.mesa);
  return mesa ? `${l.producto} · ${mesa}` : l.producto;
}

/** "×2", "×1,5": la cantidad del cuadradito. Lo vendido por peso trae decimales. */
export function cantidadCorta(n: number): string {
  return `×${fmtCantidad(n)}`;
}

// ── Mensual ─────────────────────────────────────────────────────────────────

export interface FilaMes {
  mes: number;
  sigla: string;
  nombre: string;
  ventas: number;
  total: number;
  estado: EstadoMesVentas;
  /** Contra el mejor mes del año, para la barrita. 0 en un mes futuro o sin ventas. */
  fraccion: number;
  mejor: boolean;
}

/**
 * Los doce meses listos para la lista. Un mes FUTURO no se mide contra nada:
 * todavía no pasó, no es que no se vendió.
 */
export function filasMensual(d: Pick<ReporteVentasMensual, "meses">): FilaMes[] {
  const conVentas = d.meses.filter((m) => m.estado === "CON_VENTAS");
  const max = Math.max(0, ...conVentas.map((m) => m.total));
  const mejor = esPositivo(max) ? conVentas.find((m) => m.total === max)?.mes : undefined;
  return d.meses.map((m) => ({
    mes: m.mes,
    sigla: SIGLAS_MES[m.mes - 1] ?? m.nombre.slice(0, 3).toUpperCase(),
    nombre: m.nombre,
    ventas: m.ventas,
    total: m.total,
    estado: m.estado,
    fraccion: m.estado === "CON_VENTAS" && esPositivo(max) ? Math.max(0, m.total / max) : 0,
    mejor: m.mes === mejor,
  }));
}

/** Los años del selector, el más nuevo primero, y siempre con el que se está viendo. */
export function aniosDelSelector(d: Pick<ReporteVentasMensual, "anio" | "anios">): number[] {
  return [...new Set([...d.anios, d.anio])].sort((a, b) => b - a);
}

// ── Excel ───────────────────────────────────────────────────────────────────

/**
 * El nombre de la hoja de una lista paginada. Se baja la página que se ve (un
 * año de ventas no se pide entero para una planilla), y la hoja lo dice: si
 * no, una página de 50 se leía como el período completo.
 */
export function nombreHojaPagina(base: string, p: Pick<PaginaMeta, "page" | "totalPaginas">): string {
  return p.totalPaginas > 1 ? `${base} pág. ${p.page} de ${p.totalPaginas}` : base;
}

export function hojaVentas(items: VentaFila[], pagina: PaginaMeta, enBillar: boolean): HojaNueva {
  return hoja<VentaFila>(
    nombreHojaPagina("Ventas", pagina),
    [
      ["Comprobante", (v) => v.comprobante],
      ["Fecha", (v) => fmtFechaHora(v.fecha)],
      ["Estado", (v) => chipEstado(v.estado).texto],
      ["Método de pago", (v) => metodoDeVenta(v, enBillar)],
      ["Origen", (v) => textoOrigen(v, enBillar)],
      ["Vendedor", (v) => v.vendedor],
      ["Atendió", (v) => v.mesero ?? null],
      ["Cliente", (v) => v.cliente],
      ["Sucursal", (v) => v.sucursal ?? null],
      ["Artículos", (v) => v.articulos],
      ["Total (Bs)", (v) => v.total],
    ],
    items,
  );
}

export function hojaDetalle(items: LineaVenta[], pagina: PaginaMeta): HojaNueva {
  return hoja<LineaVenta>(
    nombreHojaPagina("Detallado", pagina),
    [
      ["Producto", (l) => l.producto],
      ["Código", (l) => l.codigo],
      ["Mesa", (l) => textoMesa(l.mesa)],
      ["Comprobante", (l) => l.comprobante],
      ["Fecha", (l) => fmtFechaHora(l.fecha)],
      ["Vendedor", (l) => l.vendedor],
      ["Sucursal", (l) => l.sucursal ?? null],
      ["Cantidad", (l) => l.cantidad],
      ["Precio (Bs)", (l) => l.precio],
      ["Subtotal bruto (Bs)", (l) => l.subtotal],
    ],
    items,
  );
}

export function hojaMensual(d: Pick<ReporteVentasMensual, "anio" | "meses">): HojaNueva {
  return hoja<ReporteVentasMensual["meses"][number]>(
    `Ventas ${d.anio}`,
    [
      ["Mes", (m) => m.nombre],
      ["Ventas", (m) => (m.estado === "FUTURO" ? null : m.ventas)],
      ["Total (Bs)", (m) => (m.estado === "FUTURO" ? null : m.total)],
      ["Estado", (m) => (m.estado === "FUTURO" ? "Todavía no llegó" : m.estado === "CON_VENTAS" ? "Con ventas" : "Sin ventas")],
    ],
    d.meses,
  );
}
