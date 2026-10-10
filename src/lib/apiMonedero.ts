import type {
  CompraCreditosVista,
  CupoEstado,
  MovimientosCredito,
  PaquetesCreditos,
} from "../types";
import { qs, request } from "./api";

/**
 * Cliente del monedero del Plan Emprendedor (PLAN-EMPRENDEDOR-TECNICO §4.2).
 *
 * Va en su propio archivo, como los de la agenda, y pasa por el mismo
 * `request`: la sesión vencida, el 403 de licencia y el reporte de 5xx valen
 * igual. Que una compra con la licencia suspendida rebote con
 * `LICENCIA_SUSPENDIDA` y corte la sesión es justo lo que pide D24.
 *
 * El prefijo es `/monedero` y no `/creditos`: `/creditos` ya es el fiado (T6).
 * Para el usuario la palabra sigue siendo "créditos".
 */
export const apiMonedero = {
  /** El contador del día y el saldo. Lo mismo que `estado.cupo`, más liviano. */
  monedero: () => request<CupoEstado>("/monedero"),

  /** Los paquetes activos, por orden, y si este negocio puede comprar ahora. */
  paquetesCreditos: () => request<PaquetesCreditos>("/monedero/paquetes"),

  /**
   * Crea la compra y su QR. Viaja sólo el paquete: los créditos y el monto los
   * copia el backend del catálogo, igual que el precio de la licencia.
   */
  comprarCreditos: (paqueteId: number) =>
    request<CompraCreditosVista>("/monedero/compras", {
      method: "POST",
      body: JSON.stringify({ paqueteId }),
    }),

  /** El estado de una compra: se consulta cada 5 s mientras se espera el pago. */
  compraCreditos: (id: number) => request<CompraCreditosVista>(`/monedero/compras/${id}`),

  movimientosCredito: (p: { limite?: number; antesDe?: number } = {}) =>
    request<MovimientosCredito>(`/monedero/movimientos${qs(p)}`),
};
