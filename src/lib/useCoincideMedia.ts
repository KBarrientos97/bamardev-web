import { useCallback, useSyncExternalStore } from "react";

/**
 * ¿La ventana cumple esta media query? Se recalcula al achicar o agrandar la
 * ventana, así una página pública pasa de dos columnas a una sin recargar.
 *
 * Sin `matchMedia` (jsdom, navegadores muy viejos) responde `false`: las
 * páginas públicas son mobile-first y lo seguro es el armado de celular.
 */
export function useCoincideMedia(consulta: string): boolean {
  const suscribir = useCallback(
    (avisar: () => void) => {
      const mq = typeof window !== "undefined" ? window.matchMedia?.(consulta) : undefined;
      if (!mq) return () => {};
      mq.addEventListener?.("change", avisar);
      return () => mq.removeEventListener?.("change", avisar);
    },
    [consulta],
  );
  return useSyncExternalStore(
    suscribir,
    () => typeof window !== "undefined" && !!window.matchMedia?.(consulta)?.matches,
    () => false,
  );
}
