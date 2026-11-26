import { useEffect, useRef, useState } from "react";

/**
 * El ancho de un contenedor, medido con `ResizeObserver` (no el de la
 * ventana). Sin `ResizeObserver` o midiendo 0 (jsdom), vale `porDefecto`.
 */
export function useAnchoDe(porDefecto = 1046) {
  const ref = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(porDefecto);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.clientWidth) setAncho(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((e) => {
      const w = e[0]?.contentRect.width;
      if (w) setAncho(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, ancho] as const;
}
