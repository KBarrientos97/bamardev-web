import { esCero, esPositivo } from "../../../lib/dinero";
import { esBillar } from "../../../lib/rubro";
import type { TopProductoApi } from "../api";
import { pct, plural } from "../formato";

/**
 * Las cuentas de Top productos, aparte de la pantalla para poder probarlas.
 *
 * El backend manda TODO lo vendido en el período (no un top N), bruto —antes
 * de promos— y ordenado por ingresos. Acá se arman los dos rankings: "más
 * vendidos" (por ingresos, el orden que ya trae) y "más rentables" (por la
 * ganancia de cada artículo).
 */

export type OrdenTop = "vendidos" | "rentables";

export interface FilaTop {
  nombre: string;
  categoria: string;
  /** Bruto, antes de promos. */
  ingresos: number;
  utilidad: number;
  unidades: number;
  /**
   * Margen como fracción (0,38 = 38 %). Null cuando no es un dato: sin
   * ingresos no hay sobre qué calcularlo, y sin costo cargado daría un 100 %
   * que se lee como el mejor producto de la carta.
   */
  margen: number | null;
  /** Se vendió sin costo cargado: su "ganancia" es el precio entero. */
  sinCosto: boolean;
}

export interface Top {
  /**
   * El tiempo de mesa del billar, aparte del ranking. Es un servicio sin
   * costo: entra entero como ganancia y en "más rentables" quedaba primero,
   * lejos, achicando la barra de todos los productos a una rayita.
   */
  tiempoMesa: FilaTop | null;
  /** El ranking, en el orden pedido, sin el tiempo de mesa. */
  filas: FilaTop[];
}

function normalizar(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

/**
 * ¿Es el "Tiempo de mesa" del billar? El reporte no trae el id del producto,
 * así que se reconoce por el nombre con el que lo crea el backend
 * (`billar-config.service.ts`), y sólo en un billar: en otro rubro, un
 * producto que se llame así es uno más del ranking.
 */
export function esTiempoDeMesa(nombre: string, rubro: string | undefined): boolean {
  return esBillar(rubro) && normalizar(nombre) === "tiempo de mesa";
}

export function filaTop(p: TopProductoApi): FilaTop {
  const sinCosto = esPositivo(p.ingresos) && esCero(p.ingresos - p.utilidad);
  return {
    nombre: p.nombre,
    categoria: p.categoria,
    ingresos: p.ingresos,
    utilidad: p.utilidad,
    unidades: p.unidades,
    margen: esPositivo(p.ingresos) && !sinCosto ? p.utilidad / p.ingresos : null,
    sinCosto,
  };
}

export function armarTop(datos: TopProductoApi[], orden: OrdenTop, rubro: string | undefined): Top {
  let tiempoMesa: FilaTop | null = null;
  const filas: FilaTop[] = [];
  for (const p of datos) {
    if (!tiempoMesa && esTiempoDeMesa(p.nombre, rubro)) tiempoMesa = filaTop(p);
    else filas.push(filaTop(p));
  }
  // `sort` es estable: a igual monto queda el orden en que vino del backend.
  filas.sort(
    orden === "vendidos"
      ? (a, b) => b.ingresos - a.ingresos
      : (a, b) => b.utilidad - a.utilidad || b.ingresos - a.ingresos,
  );
  return { tiempoMesa, filas };
}

/** Lo que mide el ranking: los ingresos en "más vendidos", la ganancia en "más rentables". */
export function valorTop(f: FilaTop, orden: OrdenTop): number {
  return orden === "vendidos" ? f.ingresos : f.utilidad;
}

/** La barra de una fila, contra el primero del ranking. Una pérdida no tiene barra. */
export function fraccionTop(f: FilaTop, primero: FilaTop | undefined, orden: OrdenTop): number {
  const tope = primero ? valorTop(primero, orden) : 0;
  if (!esPositivo(tope)) return 0;
  return Math.max(0, valorTop(f, orden)) / tope;
}

/** "Cervezas · 164 uds · margen 38 %". */
export function lineaTop(f: FilaTop): string {
  const margen = f.sinCosto ? "sin costo cargado" : `margen ${pct(f.margen)}`;
  return `${f.categoria} · ${plural(f.unidades, "ud", "uds")} · ${margen}`;
}

/**
 * La línea del tiempo de mesa. Cada mesa cerrada entra a la venta como UN
 * renglón de "Tiempo de mesa" (`billar.service.ts`, `cantidad: 1`), así que
 * sus "unidades" son mesas cobradas, no horas: "57 uds" no se entendía.
 */
export function lineaTiempoMesa(f: FilaTop): string {
  const costo = f.sinCosto ? "no tiene costo" : `margen ${pct(f.margen)}`;
  return `${plural(f.unidades, "mesa cobrada", "mesas cobradas")} · ${costo}`;
}

/** Cuántos artículos del ranking se vendieron sin costo cargado. */
export function cuantosSinCosto(top: Top): number {
  return top.filas.filter((f) => f.sinCosto).length;
}

export interface FilaExportTop {
  puesto: number | null;
  nombre: string;
  categoria: string;
  unidades: number;
  ingresos: number;
  utilidad: number;
  /** 0..100 con un decimal; vacío si no es un dato. */
  margenPct: number | null;
  nota: string | null;
}

/** Las filas de la planilla, en el orden del ranking, con el tiempo de mesa arriba y sin puesto. */
export function filasExportTop(top: Top): FilaExportTop[] {
  const fila = (f: FilaTop, puesto: number | null, nota: string | null): FilaExportTop => ({
    puesto,
    nombre: f.nombre,
    categoria: f.categoria,
    unidades: f.unidades,
    ingresos: f.ingresos,
    utilidad: f.utilidad,
    margenPct: f.margen == null ? null : Math.round(f.margen * 1000) / 10,
    nota,
  });
  const filas = top.filas.map((f, i) => fila(f, i + 1, f.sinCosto ? "Sin costo cargado" : null));
  if (top.tiempoMesa) filas.unshift(fila(top.tiempoMesa, null, "Tiempo de mesa: va aparte del ranking"));
  return filas;
}
