import type { AvisoAgenda } from "./tiposAgenda";

/**
 * Avisos internos de la agenda (PLAN-AGENDA-BELLEZA §9.1): sin push ni
 * websockets, la campana consulta cada 45 s mientras la agenda está abierta.
 * Lo "visto" es del dispositivo: la recepción que mira la campana en la PC
 * del mostrador no tiene por qué darlos por vistos en el celular de la dueña.
 */

const CLAVE = "bamar.avisos.vistoHasta";

/** Hasta cuándo vio los avisos este usuario en este dispositivo (ISO), o null. */
export function leerVistoHasta(usuarioId: number | undefined): string | null {
  if (usuarioId == null) return null;
  try {
    return localStorage.getItem(`${CLAVE}.${usuarioId}`);
  } catch {
    return null;
  }
}

export function guardarVistoHasta(usuarioId: number | undefined, iso: string): void {
  if (usuarioId == null) return;
  try {
    localStorage.setItem(`${CLAVE}.${usuarioId}`, iso);
  } catch {
    /* sin storage, el contador vuelve a contar desde la ventana del backend */
  }
}

/** Los que llegaron después de la última vez que se abrió la campana. */
export function sinVer(avisos: AvisoAgenda[], vistoHasta: string | null): AvisoAgenda[] {
  if (!vistoHasta) return avisos;
  const corte = new Date(vistoHasta).getTime();
  return avisos.filter((a) => new Date(a.en).getTime() > corte);
}

/** "hace 5 min", "hace 2 h", "ayer". */
export function haceCuanto(iso: string, ahora: number = Date.now()): string {
  const min = Math.max(0, Math.floor((ahora - new Date(iso).getTime()) / 60_000));
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `hace ${h} h` : "ayer";
}
