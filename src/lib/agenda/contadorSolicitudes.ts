import { useSyncExternalStore } from "react";
import { apiReservaOnline } from "./apiReservaOnline";

/**
 * Contador de solicitudes online del menú (PLAN-AGENDA-BELLEZA §9.1): sin
 * push ni websockets, se consulta cada minuto mientras la app está abierta.
 *
 * Un solo reloj para toda la app aunque el menú esté montado dos veces (la
 * barra de escritorio y el cajón del celular). La bandeja avisa con el evento
 * `solicitudes-cambiaron` al aprobar o rechazar, así el número baja en el acto.
 */

export const EVENTO_SOLICITUDES = "solicitudes-cambiaron";
const CADA_MS = 60_000;

let valor = 0;
let reloj: ReturnType<typeof setInterval> | null = null;
const oyentes = new Set<() => void>();

async function consultar() {
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
  try {
    const c = await apiReservaOnline.contador();
    valor = c.pendientes + c.nuevas;
  } catch {
    // Sin red o sin la feature: el menú sigue con lo último que supo.
    return;
  }
  for (const f of oyentes) f();
}

function suscribir(avisar: () => void) {
  oyentes.add(avisar);
  if (oyentes.size === 1) {
    void consultar();
    reloj = setInterval(() => void consultar(), CADA_MS);
    window.addEventListener(EVENTO_SOLICITUDES, consultar);
  }
  return () => {
    oyentes.delete(avisar);
    if (oyentes.size === 0) {
      if (reloj) clearInterval(reloj);
      reloj = null;
      window.removeEventListener(EVENTO_SOLICITUDES, consultar);
    }
  };
}

const sinSuscripcion = () => () => {};

/** Pendientes + nuevas sin mirar. 0 (y sin consultar) si la sección no se ve. */
export function useContadorSolicitudes(activo: boolean): number {
  return useSyncExternalStore(activo ? suscribir : sinSuscripcion, () => (activo ? valor : 0));
}
