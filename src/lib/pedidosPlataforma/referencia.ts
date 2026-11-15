import { NOMBRE_PLATAFORMA, type Plataforma } from "./tipos";

/**
 * De dónde salió un movimiento de la bitácora de stock, cuando no es una venta
 * común (PLAN-PEDIDOS-PLATAFORMA §4 bis). El backend no agrega un motivo nuevo
 * al enum (un APK viejo que no lo conozca podría romperse al leer la
 * bitácora): el origen se distingue por `referenciaTipo = "PEDIDO_PLATAFORMA"`
 * y el motivo sigue siendo VENTA o ANULACION.
 *
 * Dice «Pedido Yango» o «Pedido PedidosYa» si el apunte trae la plataforma
 * (`referenciaPlataforma`); si no la trae, «Pedido de plataforma»: el apunte
 * sólo guarda el id del pedido, y inventar una de las dos sería peor que
 * decir lo que sí se sabe.
 */
export function etiquetaReferenciaStock(a: {
  referenciaTipo: string | null;
  referenciaPlataforma?: Plataforma | null;
}): string | null {
  if (a.referenciaTipo !== "PEDIDO_PLATAFORMA") return null;
  return a.referenciaPlataforma && NOMBRE_PLATAFORMA[a.referenciaPlataforma]
    ? `Pedido ${NOMBRE_PLATAFORMA[a.referenciaPlataforma]}`
    : "Pedido de plataforma";
}
