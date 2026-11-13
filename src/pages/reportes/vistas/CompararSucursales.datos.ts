import { esCero, esPositivo } from "../../../lib/dinero";
import type { HojaNueva } from "../../../lib/planilla";
import type { FilaPorSucursal, PorSucursalApi } from "../api";
import { hoja } from "../contexto";

/**
 * Las cuentas de «Comparar sucursales» (`GET /reportes/por-sucursal`,
 * PLAN-SUCURSAL-TOTAL §9.4), aparte de la pantalla para poder probarlas.
 */

/** Lo que se compara son locales: una sola fila (o ninguna) no tiene con quién. */
export function hayQueComparar(d: Pick<PorSucursalApi, "filas">): boolean {
  return d.filas.filter((f) => !f.general).length >= 2;
}

/** Las filas de los locales (sin «General del negocio»), de la que más vendió a la que menos: el backend ya las manda así. */
export function filasDeLocales(d: Pick<PorSucursalApi, "filas">): FilaPorSucursal[] {
  return d.filas.filter((f) => !f.general);
}

/** La fila de gastos sin local, si hubo. */
export function filaGeneral(d: Pick<PorSucursalApi, "filas">): FilaPorSucursal | null {
  return d.filas.find((f) => f.general) ?? null;
}

/**
 * Qué columnas opcionales llegaron con algo: las mermas y el banco/impuestos
 * sólo se dibujan si alguna fila los tiene (una columna de ceros es ruido).
 */
export function columnasConDatos(d: Pick<PorSucursalApi, "filas" | "total">): { mermas: boolean; bajoLaLinea: boolean } {
  const todas = [...d.filas, d.total];
  return {
    mermas: todas.some((f) => esPositivo(f.mermas)),
    bajoLaLinea: todas.some((f) => esPositivo(f.bajoLaLinea)),
  };
}

/** El local que más vendió, para el KPI. Null si nadie vendió (no hay «mejor»). */
export function localQueMasVendio(d: Pick<PorSucursalApi, "filas">): FilaPorSucursal | null {
  const mejor = [...filasDeLocales(d)].sort((a, b) => b.ventas - a.ventas)[0];
  return mejor && esPositivo(mejor.ventas) ? mejor : null;
}

/**
 * Un local dado de baja o un depósito aparecen sólo porque tuvieron movimiento
 * en el período (para que el total cuadre): se les pone la aclaración.
 */
export function aclaracionDeFila(f: FilaPorSucursal): string | null {
  if (f.general) return "Gastos que no se cargaron a ningún local";
  if (f.tipo === "DEPOSITO") return "Depósito";
  if (!f.activa) return "Dada de baja";
  return null;
}

/** El Excel: una fila por local, la general (si hubo) y el total. */
export function hojaComparativo(d: PorSucursalApi, rotulo = "Sucursal"): HojaNueva {
  const cols = columnasConDatos(d);
  const filas = [...d.filas, d.total];
  return hoja<FilaPorSucursal>(
    "Por sucursal",
    [
      [rotulo, (f) => f.nombre],
      ["Ventas (Bs)", (f) => f.ventas],
      ["Tickets", (f) => f.tickets],
      ["Costo de lo vendido (Bs)", (f) => f.costoVentas],
      ["Utilidad bruta (Bs)", (f) => f.utilidadBruta],
      ["Margen bruto (%)", (f) => f.margenBrutoPct],
      ...(cols.mermas ? [["Mermas (Bs)", (f: FilaPorSucursal) => f.mermas] as [string, (f: FilaPorSucursal) => number]] : []),
      ["Gastos (Bs)", (f) => f.gastosOperativos],
      ["Utilidad operativa (Bs)", (f) => f.utilidadOperativa],
      ...(cols.bajoLaLinea
        ? [["Banco e impuestos (Bs)", (f: FilaPorSucursal) => f.bajoLaLinea] as [string, (f: FilaPorSucursal) => number]]
        : []),
    ],
    filas,
  );
}

/** Un cero sin ventas no es una pérdida: el color lo decide esto. */
export function tonoUtilidad(n: number): "negativo" | "positivo" | "neutro" {
  if (esCero(n)) return "neutro";
  return n < 0 ? "negativo" : "positivo";
}
