import { useSyncExternalStore } from "react";
import { apiAcademia } from "./apiAcademia";

/**
 * El contador de preinscripciones del menú (E20 cuelga de Alumnos con su
 * número), igual que el de las solicitudes online de belleza: sin push, se
 * consulta cada minuto mientras la app está abierta, con un solo reloj aunque
 * el menú esté montado dos veces. La bandeja avisa con el evento al inscribir
 * o descartar, así el número baja en el acto.
 */

export const EVENTO_PREINSCRIPCIONES = "preinscripciones-cambiaron";
const CADA_MS = 60_000;

let valor = 0;
let reloj: ReturnType<typeof setInterval> | null = null;
const oyentes = new Set<() => void>();

async function consultar() {
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
  try {
    valor = (await apiAcademia.preinscripciones({ pageSize: 1 })).total;
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
    window.addEventListener(EVENTO_PREINSCRIPCIONES, consultar);
  }
  return () => {
    oyentes.delete(avisar);
    if (oyentes.size === 0) {
      if (reloj) clearInterval(reloj);
      reloj = null;
      window.removeEventListener(EVENTO_PREINSCRIPCIONES, consultar);
    }
  };
}

const sinSuscripcion = () => () => {};

/** Las preinscripciones por atender. 0 (y sin consultar) si la sección no se ve. */
export function useContadorPreinscripciones(activo: boolean): number {
  return useSyncExternalStore(activo ? suscribir : sinSuscripcion, () => (activo ? valor : 0));
}
