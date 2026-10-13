import { esPositivo } from "../../../lib/dinero";
import { esBillar } from "../../../lib/rubro";
import type { CategoriaApi } from "../api";
import { pct } from "../formato";
import type { ParteDona } from "../graficos";
import { PALETA } from "../trazos";

/**
 * Las cuentas de Categorías, aparte de la pantalla para poder probarlas.
 *
 * Mismos números que Top productos (bruto, antes de promos), agrupados por la
 * categoría de cada artículo.
 */

const SIN_CATEGORIA = "Sin categoría";
/** El último color de la paleta: el gris de "Otras". */
const GRIS = PALETA[PALETA.length - 1];

export interface FilaCategoria {
  nombre: string;
  /** El nombre para la pantalla (en un billar, "Sin categoría" aclara qué tiene adentro). */
  etiqueta: string;
  ingresos: number;
  utilidad: number;
  unidades: number;
  /** Fracción; null sin ingresos (un "0 %" se leería como un dato). */
  margen: number | null;
  /** La parte de la categoría en el total, 0..1. */
  fraccion: number;
  color: string;
}

export interface Categorias {
  filas: FilaCategoria[];
  total: number;
  partes: ParteDona[];
}

/**
 * En un billar, el tiempo de mesa es un servicio sin categoría y suele ser la
 * porción más grande de la dona: llamada "Sin categoría" a secas parecía un
 * error de carga, cuando es el corazón del negocio.
 */
export function etiquetaCategoria(nombre: string, rubro: string | undefined): string {
  return esBillar(rubro) && nombre === SIN_CATEGORIA ? "Sin categoría (incluye el tiempo de mesa)" : nombre;
}

/**
 * El color de cada categoría, en el orden de la paleta. Con más categorías que
 * colores, de la última en adelante van en gris, juntas en la porción
 * "Otras": repetir colores hacía que dos categorías distintas se vieran como
 * la misma en la dona.
 */
export function colorCategoria(i: number, cuantas: number): string {
  if (cuantas > PALETA.length && i >= PALETA.length - 1) return GRIS;
  return PALETA[i % PALETA.length];
}

export function armarCategorias(d: CategoriaApi[], rubro: string | undefined): Categorias {
  const ordenadas = [...d].sort((a, b) => b.ingresos - a.ingresos);
  const total = ordenadas.reduce((a, c) => a + Math.max(0, c.ingresos), 0);
  const filas = ordenadas.map(
    (c, i): FilaCategoria => ({
      nombre: c.nombre,
      etiqueta: etiquetaCategoria(c.nombre, rubro),
      ingresos: c.ingresos,
      utilidad: c.utilidad,
      unidades: c.unidades,
      margen: esPositivo(c.ingresos) ? c.utilidad / c.ingresos : null,
      fraccion: esPositivo(total) ? Math.max(0, c.ingresos) / total : 0,
      color: colorCategoria(i, ordenadas.length),
    }),
  );
  const parte = (f: FilaCategoria): ParteDona => ({ etiqueta: f.etiqueta, valor: f.ingresos, color: f.color });
  const conColor = PALETA.length - 1;
  const partes =
    filas.length > PALETA.length
      ? [
          ...filas.slice(0, conColor).map(parte),
          {
            etiqueta: `Otras (${filas.length - conColor})`,
            valor: filas.slice(conColor).reduce((a, f) => a + Math.max(0, f.ingresos), 0),
            color: GRIS,
          },
        ]
      : filas.map(parte);
  return { filas, total, partes };
}

/**
 * La parte de una categoría, entera: "58 %". Una que vendió algo pero no llega
 * al medio punto dice "<1 %" y no "0 %", que se leería como que no vendió nada.
 */
export function partePct(fraccion: number): string {
  return fraccion > 0 && fraccion < 0.005 ? "<1 %" : pct(fraccion);
}
