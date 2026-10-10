import type { UnidadCupo } from "../types";

/**
 * La hoja de "Comprar créditos" se pide con un evento y la dibuja un solo
 * `HojaCupoHost`, montado en el Layout (y en Mi agenda, que vive fuera).
 *
 * Así cada pantalla que bloquea (el cobro, la nueva cita, la cola, el chip) no
 * tiene que cargar con la hoja ni dibujarla en cada una de sus ramas: el POS
 * sólo tiene una docena de `return` distintos. Es el mismo patrón que
 * `EVENTO_SOLICITUDES` de la agenda.
 */
export const EVENTO_HOJA_CUPO = "bamardev:hoja-cupo";

export interface PedidoHojaCupo {
  /** Qué se quería hacer: decide el título y el texto ("ventas" o "citas"). */
  unidad?: UnidadCupo;
  /** true = se abrió porque no quedaba lugar, no porque alguien tocó el chip. */
  agotado?: boolean;
}

export function abrirHojaCupo(pedido: PedidoHojaCupo = {}): void {
  window.dispatchEvent(new CustomEvent<PedidoHojaCupo>(EVENTO_HOJA_CUPO, { detail: pedido }));
}
