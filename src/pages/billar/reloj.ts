import { useSyncExternalStore } from "react";

/**
 * La hora para los cronómetros: un solo intervalo para toda la pantalla, que
 * late cada segundo mientras alguien la mire (§9: "el cronómetro corre local
 * cada 1 s"). Sin oyentes se apaga.
 *
 * Es la hora del SERVIDOR, no la de la compu: el tablero trae la suya y acá
 * se guarda la diferencia. Con el reloj del equipo adelantado unos minutos,
 * la cuenta mostraba más de lo que el servidor cobra y el cierre se rechazaba
 * ("la cuenta cambió").
 */

let desfase = 0;

/** La diferencia entre el servidor y este equipo, en ms. Se ignoran los saltos chicos (la latencia de cada vuelta). */
export function fijarDesfase(ms: number) {
  if (Math.abs(ms - desfase) > 1_000) desfase = ms;
}

export function ahoraServidor(): number {
  return Date.now() + desfase;
}

let ahora = ahoraServidor();
let reloj: ReturnType<typeof setInterval> | null = null;
const oyentes = new Set<() => void>();

function latir() {
  ahora = ahoraServidor();
  for (const f of oyentes) f();
}

function suscribir(f: () => void) {
  oyentes.add(f);
  if (!reloj) {
    ahora = ahoraServidor();
    reloj = setInterval(latir, 1000);
  }
  return () => {
    oyentes.delete(f);
    if (oyentes.size === 0 && reloj) {
      clearInterval(reloj);
      reloj = null;
    }
  };
}

export function useAhora(): number {
  return useSyncExternalStore(suscribir, () => ahora);
}
