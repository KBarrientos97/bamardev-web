import type { SucursalPedido } from "./tipos";

/**
 * Las opciones de toppings (`productoId`) que una sucursal no puede servir hoy
 * (pausadas o sin stock): PLAN-AGREGADOS §8.3 las suma a lo agotado de ese local
 * y la hoja las muestra deshabilitadas. Un backend anterior no lo manda: ninguna.
 */
export function toppingsAgotados(sucursal: SucursalPedido | null | undefined): number[] {
  return sucursal?.agotadosAgregados ?? [];
}
