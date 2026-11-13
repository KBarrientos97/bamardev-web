import type { EstadoSeguimiento, Seguimiento } from "./tipos";

/** Los estados terminales del seguimiento: dejan de refrescarse. */
export const ESTADOS_FINALES: EstadoSeguimiento[] = ["ENTREGADO", "RECHAZADO", "VENCIDO", "CANCELADO"];

export const esFinal = (e: EstadoSeguimiento) => ESTADOS_FINALES.includes(e);

/** Los pasos de la línea de tiempo, según el tipo de pedido (en RECOGER no hay «En camino»). */
export function pasosDe(tipo: Seguimiento["tipo"]): { estado: EstadoSeguimiento; titulo: string }[] {
  return tipo === "DELIVERY"
    ? [
        { estado: "RECIBIDO", titulo: "Recibido" },
        { estado: "ACEPTADO", titulo: "Aceptado" },
        { estado: "EN_CAMINO", titulo: "En camino" },
        { estado: "ENTREGADO", titulo: "Entregado" },
      ]
    : [
        { estado: "RECIBIDO", titulo: "Recibido" },
        { estado: "ACEPTADO", titulo: "Listo para retirar" },
        { estado: "ENTREGADO", titulo: "Entregado" },
      ];
}

/** Cuántos pasos lleva hecho (el índice del actual): para pintar la línea. */
export function pasoActual(s: Pick<Seguimiento, "tipo" | "estado">): number {
  const i = pasosDe(s.tipo).findIndex((p) => p.estado === s.estado);
  return i < 0 ? 0 : i;
}

/** Una frase para el estado, la primera que lee el cliente. */
export function fraseDe(s: Pick<Seguimiento, "tipo" | "estado">): string {
  switch (s.estado) {
    case "RECIBIDO":
      return "Recibimos tu pedido. Esperá un momento: el local lo está revisando.";
    case "ACEPTADO":
      return s.tipo === "DELIVERY" ? "¡Aceptado! Lo estamos preparando." : "¡Aceptado! Pasá a retirarlo cuando esté listo.";
    case "EN_CAMINO":
      return "Tu pedido va en camino.";
    case "ENTREGADO":
      return "Entregado. ¡Que lo disfrutes!";
    case "RECHAZADO":
      return "El local no pudo tomar tu pedido.";
    case "VENCIDO":
      return "El local no respondió a tiempo.";
    case "CANCELADO":
      return "Este pedido está cancelado.";
  }
}
