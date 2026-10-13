import { useEffect, useState } from "react";

/**
 * ¿Cumple la pantalla esta media query? Sin `matchMedia` (jsdom, navegadores
 * muy viejos) se toma que no.
 */
export function useConsultaMedia(consulta: string): boolean {
  const [es, setEs] = useState(
    () => typeof window !== "undefined" && !!window.matchMedia?.(consulta).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia?.(consulta);
    if (!mq) return;
    setEs(mq.matches);
    const alCambiar = () => setEs(mq.matches);
    mq.addEventListener?.("change", alCambiar);
    return () => mq.removeEventListener?.("change", alCambiar);
  }, [consulta]);
  return es;
}

/**
 * ¿Pantalla de celular? La agenda cambia de forma (no sólo de tamaño): en el
 * celular la grilla muestra un profesional por vez (§5.3). Sin `matchMedia`
 * (jsdom, navegadores muy viejos) se toma escritorio.
 */
export function useEsCelular(): boolean {
  return useConsultaMedia("(max-width: 1023px)");
}

/**
 * El ancho en px de un elemento, al día cuando cambia (ventana, menú lateral
 * que se colapsa). Devuelve un ref de función: el elemento puede aparecer
 * después (cuando terminan de cargar los datos). 0 mientras no se sabe o sin
 * `ResizeObserver` (jsdom): quien lo usa tiene que tomar 0 como "sin dato",
 * no como "no entra nada".
 */
export function useAncho(): [(el: HTMLElement | null) => void, number] {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [ancho, setAncho] = useState(0);
  useEffect(() => {
    if (!el || typeof ResizeObserver === "undefined") return;
    setAncho(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([e]) => setAncho(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, ancho];
}
