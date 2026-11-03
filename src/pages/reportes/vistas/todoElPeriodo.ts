import { fmtNum } from "../../../lib/format";
import type { PaginaMeta } from "../../../types";

/**
 * "Exportar a Excel" de los reportes paginados del restaurante (Ventas General
 * y Detallado, Movimientos de caja): el PERÍODO entero, no la página que se ve
 * (REP-03, 28-oct).
 *
 * La pantalla trae de a 50 filas y la planilla salía con esas 50 ("Ventas pág.
 * 1 de 7"): al contador, que suma la columna, le llegaba un séptimo del mes.
 * La app ya bajaba todas las páginas antes de armar el archivo
 * (`VentasReporteViewModel.todasLasPaginas`); esto hace lo mismo y con sus
 * mismos números: de a 200 filas por pedido (lo más que da el backend por
 * tirada) y con un techo de 5.000, que se dice cuando se alcanza. El tope de
 * 92 días de los reportes ya acota el período: pasar las 5.000 es vender más
 * de 50 por día durante tres meses.
 */

/**
 * ¿El Excel de un reporte paginado baja el período entero? Sólo en el
 * restaurante, que es donde se pidió (la paridad con su app). La primera
 * versión lo dejaba para todos los rubros y le cambiaba sin aviso el Excel al
 * billar, a belleza, a farmacia y a academia, que nadie había pedido: ahí el
 * botón sigue bajando la página que se ve, y la hoja lo dice ("Ventas pág. 1
 * de 7"). Llevarlo a otro rubro es cambiar esta línea, con el OK de Kevin.
 */
export function exportaElPeriodo(rubro: string | null | undefined): boolean {
  return rubro === "RESTAURANTE";
}

/** Filas por pedido al exportar. El backend no da más de 200 por tirada. */
export const FILAS_POR_TIRADA = 200;

/** Techo de filas de la planilla, como la app: no colgar al navegador de un celular barato. */
export const TOPE_FILAS = 5000;

/** Lo que bajó la exportación: las filas y cuántas tiene el período según el backend. */
export interface TodoElPeriodo<T> {
  filas: T[];
  /** El `total` de la paginación: las filas del período completo. */
  total: number;
}

/** Una página de un reporte paginado, como la devuelve el backend. */
export type PedirPagina<T> = (page: number, limite: number) => Promise<{ items: T[]; pagina: PaginaMeta }>;

/**
 * Pide las páginas del período una tras otra, hasta la última o hasta el
 * techo. Una que falla corta todo (el error sube): una planilla de plata a la
 * que le falta una página en silencio miente peor que una que no se baja.
 *
 * Con `clave`, una fila que ya vino no se repite. Las listas van de lo más
 * nuevo a lo más viejo, así que una venta cobrada MIENTRAS se baja (exportar
 * "Hoy" con la caja abierta) corre todo un lugar y la primera fila de la
 * página siguiente es la última de la anterior: sin esto, salía dos veces y
 * sumaba doble en el Excel.
 */
export async function traerTodoElPeriodo<T>(
  pedir: PedirPagina<T>,
  clave?: (fila: T) => string | number,
): Promise<TodoElPeriodo<T>> {
  const filas: T[] = [];
  const vistas = new Set<string | number>();
  let total = 0;
  for (let page = 1; ; page++) {
    const r = await pedir(page, FILAS_POR_TIRADA);
    total = r.pagina.total;
    for (const f of r.items) {
      if (clave) {
        const k = clave(f);
        if (vistas.has(k)) continue;
        vistas.add(k);
      }
      filas.push(f);
    }
    // Una página vacía también corta: si el período se achicó mientras se
    // bajaba, el backend dice que hay más páginas que ya no existen.
    if (r.items.length === 0 || r.pagina.page >= r.pagina.totalPaginas || filas.length >= TOPE_FILAS) break;
  }
  return { filas: filas.slice(0, TOPE_FILAS), total };
}

/**
 * ¿La planilla quedó corta por el techo? Sólo el techo cuenta: si el total
 * creció porque se vendió algo mientras se bajaba, esa venta llegó después de
 * tocar el botón y no hay nada que avisar.
 */
export function recortado(t: TodoElPeriodo<unknown>): boolean {
  return t.filas.length >= TOPE_FILAS && t.total > t.filas.length;
}

/**
 * Lo que se dice en pantalla cuando la planilla vino recortada, o null si vino
 * entera. Como el aviso de la app: un archivo recortado sin decirlo se lee
 * como el total del período. Las listas vienen de lo más nuevo a lo más viejo,
 * así que lo que queda afuera es lo más viejo.
 */
export function avisoRecorte(t: TodoElPeriodo<unknown>): string | null {
  if (!recortado(t)) return null;
  return `El Excel trae las ${fmtNum(t.filas.length)} filas más nuevas de las ${fmtNum(t.total)} del período: acortá el período para bajar el resto.`;
}

/**
 * El nombre de la hoja del período: el de siempre si vino entero, y con
 * cuántas trae si no ("Ventas (5.000 de 7.312)"), para que la planilla lo diga
 * sola cuando llega al contador sin la pantalla al lado.
 */
export function nombreHojaPeriodo(base: string, t: TodoElPeriodo<unknown>): string {
  return recortado(t) ? `${base} (${fmtNum(t.filas.length)} de ${fmtNum(t.total)})` : base;
}
