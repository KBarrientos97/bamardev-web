import { useSyncExternalStore } from "react";

/**
 * La hora para los cronómetros: un solo intervalo para toda la pantalla, que
 * late cada segundo mientras alguien la mire (§9: "el cronómetro corre local
 * cada 1 s"). Sin oyentes se apaga.
 */

let ahora = Date.now();
let reloj: ReturnType<typeof setInterval> | null = null;
const oyentes = new Set<() => void>();

function latir() {
  ahora = Date.now();
  for (const f of oyentes) f();
}

function suscribir(f: () => void) {
  oyentes.add(f);
  if (!reloj) {
    ahora = Date.now();
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
