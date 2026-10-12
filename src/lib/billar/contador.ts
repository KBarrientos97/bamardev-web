import { useSyncExternalStore } from "react";

/**
 * El número al lado de "Billar" en el menú: cuántas mesas están abiertas, y si
 * alguna está por vencer (BILLAR_MODULO_SPEC §2).
 *
 * Vive aparte del módulo para que el menú no tenga que bajarse las pantallas
 * del billar: el motor de avisos (que corre en el Layout, ver
 * pages/billar/DeFondo) publica acá lo que trae el tablero.
 */

export interface ContadorBillar {
  abiertas: number;
  /** Alguna mesa de tiempo fijo por vencer o con el tiempo cumplido. */
  alerta: boolean;
}

const CERO: ContadorBillar = { abiertas: 0, alerta: false };
let valor = CERO;
const oyentes = new Set<() => void>();

export function publicarContadorBillar(nuevo: ContadorBillar) {
  if (nuevo.abiertas === valor.abiertas && nuevo.alerta === valor.alerta) return;
  valor = nuevo;
  for (const f of oyentes) f();
}

function suscribir(f: () => void) {
  oyentes.add(f);
  return () => oyentes.delete(f);
}

const sinSuscripcion = () => () => {};

/** Cero (y sin escuchar) si la sección no está en el menú. */
export function useContadorBillar(activo: boolean): ContadorBillar {
  return useSyncExternalStore(activo ? suscribir : sinSuscripcion, () => (activo ? valor : CERO));
}
