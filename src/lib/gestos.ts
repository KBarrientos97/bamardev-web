import { useCallback, useEffect, useRef, useState, type TouchEvent } from "react";

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

/**
 * Bajar una hoja con el dedo, como en iOS, sin trabas.
 *
 * El primer arrastre (`useArrastre` + estado de React) se sentía trabado un
 * instante (dueño, 10-nov): la hoja esperaba 8 px quieta y después saltaba
 * esos 8 px, React se volvía a dibujar en cada movimiento del dedo, y al
 * soltar tardaba siempre 220 ms aunque se la hubiera tirado rápido. Acá:
 *  - se mueve directo el `transform` del panel, en un `requestAnimationFrame`,
 *    sin pasar por React;
 *  - el desplazamiento arranca desde donde se decidió el gesto, sin salto;
 *  - el velo se aclara a medida que baja;
 *  - al soltar, lo que falta lo recorre a la velocidad que traía el dedo;
 *  - se baja desde cualquier lado de la hoja, también desde el contenido
 *    cuando su scroll ya está arriba de todo (como las hojas del sistema).
 *    Por eso los listeners son nativos y no pasivos: hay que poder frenar el
 *    rebote del scroll de adentro mientras se arrastra la hoja.
 *
 * Un arrastre horizontal no lo toca: lo maneja quien lo quiera (volver).
 */
export function useHojaArrastrable(opciones: {
  panel: { current: HTMLElement | null };
  velo: { current: HTMLElement | null };
  alCerrar: () => void;
  /** `false` en un formulario: cede un poco y vuelve, no se cierra. */
  puedeCerrar?: boolean;
  /**
   * Si la hoja está en pantalla. El `Modal` se desmonta cerrado: los
   * listeners se ponen cuando abre, sobre el panel que recién existe.
   */
  activo?: boolean;
}) {
  const { panel, velo } = opciones;
  const alCerrar = useRef(opciones.alCerrar);
  alCerrar.current = opciones.alCerrar;
  const puedeCerrar = useRef(opciones.puedeCerrar ?? true);
  puedeCerrar.current = opciones.puedeCerrar ?? true;
  const cerrando = useRef(false);
  const activo = opciones.activo ?? true;

  const animarCierre = useCallback(
    (desde: number, velocidad: number) => {
      const p = panel.current;
      if (!p || cerrando.current) return;
      cerrando.current = true;
      const alto = p.offsetHeight || 600;
      // Lo que falta, a la velocidad del dedo (con un mínimo para que un
      // cierre lento no se arrastre), entre 120 y 300 ms.
      const ms = Math.round(Math.min(300, Math.max(120, (alto - desde) / Math.max(velocidad, 1.6))));
      p.style.transition = `transform ${ms}ms ${CURVA_IOS}`;
      p.style.transform = `translateY(${alto}px)`;
      if (velo.current) {
        velo.current.style.transition = `opacity ${ms}ms linear`;
        velo.current.style.opacity = "0";
      }
      setTimeout(() => alCerrar.current(), ms);
    },
    [panel, velo],
  );

  useEffect(() => {
    const p = panel.current;
    if (!activo || !p) return;
    cerrando.current = false;
    let inicio: { x: number; y: number } | null = null;
    let eje: Eje | null = null;
    let base = 0;
    let actual = 0;
    let arrastrando = false;
    let scroll: HTMLElement | null = null;
    let cuadro = 0;
    const muestras: { y: number; t: number }[] = [];

    const pintar = () => {
      cuadro = 0;
      p.style.transform = actual ? `translateY(${actual}px)` : "";
      if (velo.current) {
        const alto = p.offsetHeight || 600;
        velo.current.style.opacity = String(Math.max(0.2, 1 - Math.max(0, actual) / alto));
      }
    };

    const scrollDe = (desde: EventTarget | null): HTMLElement | null => {
      let el = desde instanceof HTMLElement ? desde : null;
      while (el && el !== p) {
        const oy = getComputedStyle(el).overflowY;
        if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight) return el;
        el = el.parentElement;
      }
      return null;
    };

    const alTocar = (e: globalThis.TouchEvent) => {
      if (e.touches.length !== 1 || cerrando.current) return;
      const t = e.touches[0];
      inicio = { x: t.clientX, y: t.clientY };
      eje = null;
      arrastrando = false;
      scroll = scrollDe(e.target);
      muestras.length = 0;
    };

    const alMover = (e: globalThis.TouchEvent) => {
      if (!inicio || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - inicio.x;
      const dy = t.clientY - inicio.y;
      if (eje === null) {
        eje = ejeDelGesto(dx, dy);
        if (eje === null) return;
        // Es de la hoja si va para abajo y no hay scroll de adentro que
        // todavía pueda subir. Si no, es un scroll común: no se toca.
        if (eje !== "y" || dy <= 0 || (scroll && scroll.scrollTop > 0)) {
          inicio = null;
          return;
        }
        arrastrando = true;
        base = dy;
        p.style.transition = "none";
        if (velo.current) velo.current.style.transition = "none";
      }
      if (!arrastrando) return;
      if (e.cancelable) e.preventDefault();
      let y = dy - base;
      // Para arriba se resiste; un formulario cede poco y vuelve.
      if (y < 0) y = y * 0.15;
      else if (!puedeCerrar.current) y = Math.min(60, y * 0.3);
      actual = y;
      muestras.push({ y, t: performance.now() });
      if (muestras.length > 6) muestras.shift();
      if (!cuadro) cuadro = requestAnimationFrame(pintar);
    };

    const alSoltar = () => {
      if (!inicio || !arrastrando) {
        inicio = null;
        return;
      }
      inicio = null;
      arrastrando = false;
      if (cuadro) cancelAnimationFrame(cuadro);
      cuadro = 0;
      const primera = muestras[0];
      const ultima = muestras[muestras.length - 1];
      const ms = primera && ultima ? ultima.t - primera.t : 0;
      const velocidad = ms > 0 ? (ultima.y - primera.y) / ms : 0; // px/ms, + = para abajo
      const alto = p.offsetHeight || 600;
      const cierra =
        puedeCerrar.current &&
        velocidad > -0.1 &&
        (actual > alto * 0.25 || (actual > 24 && velocidad > 0.45));
      if (cierra) {
        animarCierre(actual, velocidad);
      } else {
        p.style.transition = `transform 260ms ${CURVA_IOS}`;
        p.style.transform = "";
        if (velo.current) {
          velo.current.style.transition = "opacity 260ms linear";
          velo.current.style.opacity = "";
        }
      }
      actual = 0;
    };

    p.addEventListener("touchstart", alTocar, { passive: true });
    p.addEventListener("touchmove", alMover, { passive: false });
    p.addEventListener("touchend", alSoltar);
    p.addEventListener("touchcancel", alSoltar);
    return () => {
      p.removeEventListener("touchstart", alTocar);
      p.removeEventListener("touchmove", alMover);
      p.removeEventListener("touchend", alSoltar);
      p.removeEventListener("touchcancel", alSoltar);
      if (cuadro) cancelAnimationFrame(cuadro);
    };
  }, [panel, velo, animarCierre, activo]);

  /** Cerrar con la misma animación (la cruz, el velo, Escape). */
  const cerrar = useCallback(() => animarCierre(0, 0), [animarCierre]);
  return { cerrar };
}
