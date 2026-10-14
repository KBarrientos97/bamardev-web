import { aCentavos, esCero } from "../../../lib/dinero";
import { fmtNum } from "../../../lib/format";
import { esBillar, esFarmacia } from "../../../lib/rubro";
import type { FilaLentoApi, LentosApi } from "../api";
import { plural } from "../formato";

/**
 * Las cuentas de Productos lentos, aparte de la pantalla para poder probarlas.
 *
 * El backend manda dos listas: lo que no se vendió nada (`sinMovimiento`) y lo
 * que vendió de 1 a 5 unidades (`pocaRotacion`), con el stock de HOY y lo que
 * vale ese stock al costo (`valorParado`). Acá se juntan y se ordenan por la
 * plata parada, que es por donde el dueño empieza a mirar.
 */

export interface FilaLenta extends FilaLentoApi {
  /**
   * Tiene stock pero no costo cargado: no se sabe cuánta plata hay parada. Se
   * muestra "sin costo cargado" y no "Bs 0,00", que se leería como que ese
   * stock no vale nada.
   */
  sinCosto: boolean;
}

export interface Lentos {
  filas: FilaLenta[];
  /** Σ stock × costo de lo que sí tiene costo. */
  plataParada: number;
  /** Cuántos tienen stock sin costo cargado (no suman a la plata parada). */
  sinCosto: number;
}

export function armarLentos(d: LentosApi): Lentos {
  const filas = [...d.sinMovimiento, ...d.pocaRotacion]
    // Sin stock no hay plata parada, y puede que no se haya vendido justo
    // porque no había: listarlo como "lento" empujaría a dejar de reponer lo
    // que en realidad falta. El backend los manda igual (son todo el catálogo
    // sin ventas) y llenaban la lista de filas en Bs 0.
    .filter((f) => f.stock > 0)
    .map((f): FilaLenta => ({ ...f, sinCosto: esCero(f.valorParado) }))
    .sort(
      (a, b) =>
        b.valorParado - a.valorParado ||
        a.vendidas - b.vendidas ||
        b.stock - a.stock ||
        a.nombre.localeCompare(b.nombre, "es"),
    );
  return {
    filas,
    plataParada: aCentavos(filas.reduce((a, f) => a + f.valorParado, 0)),
    sinCosto: filas.filter((f) => f.sinCosto).length,
  };
}

/** "11 vendidos en el período · stock 18", o "Sin ventas en el período · stock 4". */
export function lineaLento(f: Pick<FilaLentoApi, "vendidas" | "stock">): string {
  const ventas = f.vendidas === 0 ? "Sin ventas en el período" : `${plural(f.vendidas, "vendido", "vendidos")} en el período`;
  return `${ventas} · stock ${fmtNum(f.stock)}`;
}

/** Qué hacer con ellos, en el idioma del rubro: a una farmacia no se le dice "armá un combo". */
export function consejoLentos(rubro: string | undefined): string {
  if (esBillar(rubro)) return "Probá ofrecerlos junto con el tiempo de mesa, bajarles el precio o dejar de reponerlos.";
  if (esFarmacia(rubro)) return "Revisá que no estén por vencer, ponelos a la vista o dejá de reponerlos.";
  return "Probá ofrecerlos en combo, bajarles el precio o dejar de reponerlos.";
}
