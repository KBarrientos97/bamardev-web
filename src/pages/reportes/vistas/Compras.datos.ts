import { esPositivo } from "../../../lib/dinero";
import { fmtMoney, fmtNum } from "../../../lib/format";
import { tieneFeature } from "../../../lib/permisos";
import { esBelleza, esFarmacia } from "../../../lib/rubro";
import type { HojaNueva } from "../../../lib/planilla";
import type { EstadoMesCompras, Feature, OrigenCompra, ReporteComprasGeneral, ReporteComprasMensual } from "../../../types";
import type { FinancieroApi } from "../api";
import { hoja } from "../contexto";
import { plural, SIGLAS_MES } from "../formato";

/**
 * Las cuentas de Compras, aparte de la pantalla para poder probarlas.
 *
 * Una compra es un movimiento de inventario de ENTRADA aprobado: no hay tabla
 * de compras ni de proveedores, lo que entra al depósito ES el documento. El
 * financiero ya la trae sumada por artículo (`desglose`).
 */

export type ArticuloComprado = FinancieroApi["desglose"][number];

export interface FilaCompra extends ArticuloComprado {
  /** La barra: contra lo que más se compró. */
  fraccion: number;
}

export function armarComprasPorArticulo(desglose: ArticuloComprado[]): FilaCompra[] {
  const filas = [...desglose].sort((a, b) => b.total - a.total);
  const tope = filas.length ? Math.max(0, filas[0].total) : 0;
  return filas.map((f) => ({ ...f, fraccion: esPositivo(tope) ? Math.max(0, f.total) / tope : 0 }));
}

/**
 * ¿El negocio compra insumos? La misma regla que la ficha de Insumos del
 * catálogo: la feature del plan, y nunca en una farmacia (no transforma nada)
 * ni en belleza (el tinte no es una receta).
 */
export function usaInsumos(rubro: string | undefined, features: Feature[] | undefined): boolean {
  return tieneFeature(features, "insumos") && !esFarmacia(rubro) && !esBelleza(rubro);
}

const QUITAR_TILDE: Record<string, string> = { á: "a", é: "e", í: "i", ó: "o", ú: "u" };

/**
 * El plural de una palabra en castellano, lo justo para las unidades de
 * medida: "caja" → "cajas", "unidad" → "unidades", "galón" → "galones",
 * "blíster" → "blísteres", "pack" → "packs".
 */
function pluralDe(palabra: string): string {
  if (/[aeiouáéíóú]$/i.test(palabra)) return `${palabra}s`;
  if (/[sx]$/i.test(palabra)) return palabra;
  if (/z$/i.test(palabra)) return `${palabra.slice(0, -1)}ces`;
  if (/[lnrdj]$/i.test(palabra)) {
    // La tilde de la última sílaba se va con el plural: galón → galones.
    return `${palabra.replace(/([áéíóú])([ns])$/i, (_, v: string, c: string) => (QUITAR_TILDE[v.toLowerCase()] ?? v) + c)}es`;
  }
  return `${palabra}s`;
}

/**
 * "16 cajas", "1 caja", "2,50 kilogramos", "46 unidades".
 *
 * Las unidades de medida son nombres que carga el negocio ("Caja", "Kilogramo",
 * "Quintal") y vienen en singular y con mayúscula: "16 Caja" se leía como un
 * error. Una abreviatura ("kg", "QQ", "@") no se toca: "16 kgs" está mal.
 */
export function cantidadConUnidad(cantidad: number, unidad: string | null | undefined): string {
  const n = fmtNum(cantidad, Number.isInteger(cantidad) ? 0 : 2);
  const nombre = (unidad ?? "").trim();
  if (!nombre) return `${n} ${cantidad === 1 ? "unidad" : "unidades"}`;
  // Se mira la primera palabra: en "Bolsa de 1kg" se pluraliza "bolsa" y lo
  // demás queda como lo escribieron.
  const [primera, ...resto] = nombre.split(/\s+/);
  const esAbreviatura = primera.length <= 3 || /[^a-záéíóúüñ]/i.test(primera) || primera === primera.toUpperCase();
  if (esAbreviatura) return `${n} ${nombre}`;
  const cabeza = cantidad === 1 ? primera.toLowerCase() : pluralDe(primera.toLowerCase());
  return `${n} ${[cabeza, ...resto].join(" ")}`;
}

/** De qué son las líneas de un documento de compra. */
export function etiquetaOrigen(o: OrigenCompra): string {
  if (o === "INSUMO") return "Insumos";
  if (o === "PRODUCTO") return "Productos";
  if (o === "MIXTO") return "Insumos y productos";
  return "Sin líneas";
}

/**
 * La línea de arriba de los documentos: "12 compras aprobadas · Bs 3.481,85 ·
 * 1 anulada". Lo anulado y lo pendiente se cuentan aparte porque no suman: el
 * total es sólo de lo que entró al depósito.
 */
export function resumenDocumentos(t: ReporteComprasGeneral["totales"]): string {
  const partes = [`${plural(t.compras, "compra aprobada", "compras aprobadas")} · ${fmtMoney(t.invertido)}`];
  if (t.pendientes > 0) partes.push(plural(t.pendientes, "pendiente", "pendientes"));
  if (t.anuladas > 0) partes.push(plural(t.anuladas, "anulada", "anuladas"));
  return partes.join(" · ");
}

/** La parte de lo comprado que es de cada tipo. Null sin compras: "0 %" de nada no es un dato. */
export function parteDe(monto: number, total: number): number | null {
  return esPositivo(total) ? monto / total : null;
}

// ── Mensual ─────────────────────────────────────────────────────────────────

export interface FilaMesCompra {
  mes: number;
  sigla: string;
  nombre: string;
  compras: number;
  total: number;
  estado: EstadoMesCompras;
  /** Contra el mes de mayor gasto, para la barrita. 0 en un mes futuro o sin compras. */
  fraccion: number;
  mayor: boolean;
}

/**
 * Los doce meses de compras, como los tenía Finanzas. Un mes FUTURO no se
 * mide contra nada: todavía no pasó, no es que no se compró.
 */
export function filasComprasMensual(d: Pick<ReporteComprasMensual, "meses">): FilaMesCompra[] {
  const conCompras = d.meses.filter((m) => m.estado === "CON_COMPRAS");
  const max = Math.max(0, ...conCompras.map((m) => m.total));
  const mayor = esPositivo(max) ? conCompras.find((m) => m.total === max)?.mes : undefined;
  return d.meses.map((m) => ({
    mes: m.mes,
    sigla: SIGLAS_MES[m.mes - 1] ?? m.nombre.slice(0, 3).toUpperCase(),
    nombre: m.nombre,
    compras: m.compras,
    total: m.total,
    estado: m.estado,
    fraccion: m.estado === "CON_COMPRAS" && esPositivo(max) ? Math.max(0, m.total / max) : 0,
    mayor: m.mes === mayor,
  }));
}

/** Los años del selector, el más nuevo primero, y siempre con el que se está viendo. */
export function aniosComprasMensual(d: Pick<ReporteComprasMensual, "anio" | "anios">): number[] {
  return [...new Set([...d.anios, d.anio])].sort((a, b) => b - a);
}

export function hojaComprasMensual(d: Pick<ReporteComprasMensual, "anio" | "meses">): HojaNueva {
  return hoja<ReporteComprasMensual["meses"][number]>(
    `Compras ${d.anio}`,
    [
      ["Mes", (m) => m.nombre],
      ["Compras", (m) => (m.estado === "FUTURO" ? null : m.compras)],
      ["Total (Bs)", (m) => (m.estado === "FUTURO" ? null : m.total)],
      ["Estado", (m) => (m.estado === "FUTURO" ? "Todavía no llegó" : m.estado === "CON_COMPRAS" ? "Con compras" : "Sin compras")],
    ],
    d.meses,
  );
}
