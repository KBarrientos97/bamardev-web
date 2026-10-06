import { useEffect, useState } from "react";

/**
 * ¿Pantalla de celular? La agenda cambia de forma (no sólo de tamaño): en el
 * celular la grilla muestra un profesional por vez (§5.3). Sin `matchMedia`
 * (jsdom, navegadores muy viejos) se toma escritorio.
 */
export function useEsCelular(): boolean {
  const consulta = "(max-width: 1023px)";
  const [es, setEs] = useState(
    () => typeof window !== "undefined" && !!window.matchMedia?.(consulta).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia?.(consulta);
    if (!mq) return;
    const alCambiar = () => setEs(mq.matches);
    mq.addEventListener?.("change", alCambiar);
    return () => mq.removeEventListener?.("change", alCambiar);
  }, []);
  return es;
}
