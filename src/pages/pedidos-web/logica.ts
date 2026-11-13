import type { CodigoRechazo, PedidoWeb } from "../../lib/pedidosWeb/tipos";

/** Los atajos de «Rechazar» (CONTRATO-PEDIDOS-WEB §5), con lo que dice cada uno. */
export const MOTIVOS_RECHAZO: readonly (readonly [CodigoRechazo, string])[] = [
  ["AGOTADO", "Se acabó"],
  ["FUERA_DE_ZONA", "No llegamos a esa zona"],
  ["CERRADO", "Ya cerramos"],
  ["PEDIDO_FALSO", "Pedido falso"],
  ["OTRO", "Otro motivo"],
];

/** Lo que el cliente tiene que pagar, según lo que se sabe del pedido. */
export function totalDe(p: Pick<PedidoWeb, "subtotal" | "envioSugerido" | "tipo">): number {
  return Math.round((p.subtotal + (p.tipo === "DELIVERY" ? p.envioSugerido : 0)) * 100) / 100;
}

/** «hace 3 min», para saber cuánto lleva esperando (a los 10 minutos vence). */
export function haceCuanto(desde: string, ahora = Date.now()): string {
  const min = Math.max(0, Math.floor((ahora - new Date(desde).getTime()) / 60_000));
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  return `hace ${h} h`;
}

/** Cuántos minutos lleva sin respuesta: la tarjeta se pone ámbar y roja antes de que venza. */
export function minutosEsperando(desde: string, ahora = Date.now()): number {
  return Math.max(0, Math.floor((ahora - new Date(desde).getTime()) / 60_000));
}
