import type { AjustesTicketsTv, TableroTickets, TicketPedido } from "../types/tickets";
import { request } from "./api";

/**
 * Los pedidos con número del mostrador (feature `tickets_pedido`): el tablero
 * de despacho y de la caja, los cambios de estado, la numeración y la TV.
 *
 * Aparte de `api.ts` porque es una sección entera que sólo usan Despacho y
 * Tickets y pedidos: así esas pantallas no arrastran nada nuevo al resto.
 */

const qs = (sucursalId?: number | null) => (sucursalId != null ? `?sucursalId=${sucursalId}` : "");
const post = <T>(ruta: string, cuerpo: object = {}) =>
  request<T>(ruta, { method: "POST", body: JSON.stringify(cuerpo) });

export const apiTickets = {
  tablero: (sucursalId?: number | null) => request<TableroTickets>(`/tickets${qs(sucursalId)}`),
  listo: (id: number) => post<TicketPedido>(`/tickets/${id}/listo`),
  llamar: (id: number) => post<TicketPedido>(`/tickets/${id}/llamar`),
  entregar: (id: number) => post<TicketPedido>(`/tickets/${id}/entregado`),
  reabrir: (id: number) => post<TicketPedido>(`/tickets/${id}/reabrir`),
  /** El teclado de despacho: el número sin los ceros de adelante. */
  llamarNumero: (numero: number, sucursalId?: number | null) =>
    post<TicketPedido>("/tickets/llamar-numero", sucursalId != null ? { numero, sucursalId } : { numero }),
  reiniciar: (sucursalId?: number | null) =>
    post<{ sucursalId: number; siguiente: number }>("/tickets/reiniciar", sucursalId != null ? { sucursalId } : {}),
  ajustes: () => request<AjustesTicketsTv>("/tickets/ajustes"),
  guardarAjustes: (ajustes: Partial<AjustesTicketsTv>) =>
    request<AjustesTicketsTv>("/tickets/ajustes", { method: "PATCH", body: JSON.stringify({ ajustes }) }),
  /** La llave de las TVs del local; null si nunca se generó. */
  llave: () => request<{ llave: string | null }>("/pantallas/llave"),
  nuevaLlave: () => post<{ llave: string }>("/pantallas/llave"),
};
