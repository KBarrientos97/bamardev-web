import type { InfoPedidos, MotivoSinPedidos } from "./tipos";

const MOTIVOS: Record<MotivoSinPedidos, string> = {
  SIN_DELIVERY: "Este negocio todavía no recibe pedidos desde la página.",
  CATALOGO_MANUAL: "Este negocio todavía no recibe pedidos desde la página.",
  APAGADO: "Por ahora no estamos recibiendo pedidos por acá.",
};

/** Por qué no se puede pedir ahora, o null si se puede. Se dice ANTES de que el cliente arme todo. */
export function avisoSinPedidos(info: InfoPedidos | null): string | null {
  if (!info) return null;
  if (!info.recibe) return MOTIVOS[info.motivo ?? "APAGADO"] ?? MOTIVOS.APAGADO;
  if (info.sucursales.length > 0 && info.sucursales.every((s) => !s.abierta)) {
    // «Cerrado» contradecía al «Abierto ahora» del horario cuando sólo falta la caja abierta (QA R1, N2).
    return "Ahora no estamos recibiendo pedidos por acá. Volvé en un rato.";
  }
  return null;
}
