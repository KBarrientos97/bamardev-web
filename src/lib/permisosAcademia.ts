import { soloLoSuyo, tienePermiso } from "./permisos";

type Sesion = Parameters<typeof tienePermiso>[0];

/**
 * ¿Ve montos (cuotas, saldos, forma de pago) en las pantallas de la academia?
 * Es la MISMA regla que `veMontos` del backend (`academia/comun.ts`): el
 * docente (alcance PROPIO de `academia.ver`) no los ve, salvo que además
 * pueda inscribir o cobrar. La web usaba sólo lo primero y le escondía al
 * rol «propio + cobranza» montos que el backend sí le manda (auditoría
 * 26-oct, bug 18). Si cambia una, cambia la otra.
 */
export function veMontosAcademia(usuario: Sesion): boolean {
  return !soloLoSuyo(usuario, "academia.ver") || tienePermiso(usuario, "academia.inscribir") || tienePermiso(usuario, "academia.cobranza");
}
