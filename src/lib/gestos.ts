import { useRef, useState, type TouchEvent } from "react";

/**
 * Gestos con el dedo, como en una app de iOS (PLAN-IOS): instalada en el
 * iPhone, la web no trae ninguno —ni el "volver" del borde, que es de
 * Safari— y el menú o una hoja que no siguen el dedo se sienten de página web.
 *
 * Sin librerías: son dos gestos (el cajón del menú y bajar una hoja) y la
 * lógica entra en esta página.
 */

export type Eje = "x" | "y";

/** Lo que tiene que moverse el dedo antes de decidir si el gesto es nuestro. */
const UMBRAL_EJE = 8;

/**
 * ¿Hacia dónde va el gesto? `null` mientras el dedo casi no se movió. Se
 * decide una vez: si arrancó vertical es un scroll y el cajón no se mueve
 * aunque después se tuerza.
 */
export function ejeDelGesto(dx: number, dy: number): Eje | null {
  if (Math.abs(dx) < UMBRAL_EJE && Math.abs(dy) < UMBRAL_EJE) return null;
  return Math.abs(dx) > Math.abs(dy) ? "x" : "y";
}

/**
 * ¿Al soltar se completa el gesto (abrir, cerrar)? Como en iOS: o se llevó
 * lo bastante lejos, o se lo "tiró" rápido aunque haya sido corto.
 *
 * @param distancia en el sentido que completa (positiva = hacia allá)
 * @param ms lo que duró el arrastre
 * @param tamano lo que mide lo que se arrastra (el cajón, la hoja)
 */
export function completaGesto(distancia: number, ms: number, tamano: number, fraccion = 0.35): boolean {
  if (distancia <= 0) return false;
  const velocidad = distancia / Math.max(ms, 1); // px por ms
  return distancia > tamano * fraccion || (distancia > 24 && velocidad > 0.45);
}

/** La curva de las animaciones de iOS (hojas y cajones). */
export const CURVA_IOS = "cubic-bezier(0.32, 0.72, 0, 1)";

/**
 * Arrastre en un eje sobre un elemento. Devuelve cuánto se movió el dedo
 * (`null` si no hay arrastre) y los handlers para el elemento. Al soltar
 * llama a `alSoltar` con el desplazamiento y lo que duró.
 *
 * El elemento tiene que llevar `touch-action` del eje contrario (`pan-y` para
 * un arrastre horizontal): así el scroll de adentro sigue siendo del sistema.
 */
export function useArrastre(eje: Eje, alSoltar: (delta: number, ms: number) => void) {
  const inicio = useRef<{ x: number; y: number; t: number; eje: Eje | null } | null>(null);
  const ultimo = useRef<number | null>(null);
  const [delta, setDelta] = useState<number | null>(null);

  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length !== 1) {
      inicio.current = null;
      return;
    }
    const t = e.touches[0];
    inicio.current = { x: t.clientX, y: t.clientY, t: performance.now(), eje: null };
    ultimo.current = null;
  };

  const onTouchMove = (e: TouchEvent) => {
    const i = inicio.current;
    if (!i || e.touches.length !== 1) return;
    const t = e.touches[0];
    const dx = t.clientX - i.x;
    const dy = t.clientY - i.y;
    if (i.eje === null) {
      i.eje = ejeDelGesto(dx, dy);
      if (i.eje === null) return;
    }
    if (i.eje !== eje) return;
    ultimo.current = eje === "x" ? dx : dy;
    setDelta(ultimo.current);
  };

  const terminar = () => {
    const i = inicio.current;
    const d = ultimo.current;
    inicio.current = null;
    ultimo.current = null;
    if (i && i.eje === eje && d !== null) alSoltar(d, performance.now() - i.t);
    setDelta(null);
  };

  return {
    delta,
    handlers: { onTouchStart, onTouchMove, onTouchEnd: terminar, onTouchCancel: terminar },
  };
}
