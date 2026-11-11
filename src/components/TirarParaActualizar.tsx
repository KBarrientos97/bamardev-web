import { useEffect, useRef, useState, type ReactNode } from "react";
import { CURVA_IOS, ejeDelGesto } from "../lib/gestos";
import { Icon } from "./Icon";

/** Lo que hay que tirar para que, al soltar, actualice. */
export const DISTANCIA_PARA_ACTUALIZAR = 64;
/** El alto en el que queda el indicador mientras actualiza. */
const ALTO_ACTUALIZANDO = 48;

/**
 * Una lista con scroll que se actualiza tirando para abajo, como en una app.
 *
 * La app instalada no trae el "tirar para recargar" del navegador (y en
 * `index.css` el rebote de la página está apagado a propósito), así que el
 * mesero no tenía cómo pedir "mostrame lo último" sin esperar los 30 s del
 * salón (UX nativa, 10-nov).
 *
 * Sólo arranca con el scroll arriba de todo y el dedo bajando: un scroll
 * común no lo toca. Los listeners son nativos y no pasivos para poder frenar
 * el rebote mientras se tira.
 *
 * `cargando` mantiene la ruedita hasta que llega la respuesta (con un mínimo,
 * para que no parpadee).
 */
export default function TirarParaActualizar({
  onActualizar,
  cargando = false,
  className = "",
  children,
}: {
  onActualizar: () => void;
  cargando?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const indicador = useRef<HTMLDivElement>(null);
  const [actualizando, setActualizando] = useState(false);
  const desde = useRef(0);
  const alActualizar = useRef(onActualizar);
  alActualizar.current = onActualizar;
  const ocupado = useRef(false);
  ocupado.current = actualizando;

  // Termina cuando llegó la respuesta, y no antes de medio segundo.
  useEffect(() => {
    if (!actualizando || cargando) return;
    const resta = Math.max(0, 500 - (performance.now() - desde.current));
    const t = window.setTimeout(() => setActualizando(false), resta);
    return () => window.clearTimeout(t);
  }, [actualizando, cargando]);

  useEffect(() => {
    const c = caja.current;
    if (!c) return;
    let inicio: { x: number; y: number } | null = null;
    let tirando = false;
    let decidido = false;
    let distancia = 0;
    let cuadro = 0;

    const pintar = () => {
      cuadro = 0;
      const i = indicador.current;
      if (!i) return;
      i.style.height = `${distancia}px`;
      const flecha = i.firstElementChild as HTMLElement | null;
      if (flecha) {
        flecha.style.opacity = String(Math.min(1, distancia / DISTANCIA_PARA_ACTUALIZAR));
        flecha.style.transform = `rotate(${distancia >= DISTANCIA_PARA_ACTUALIZAR ? 180 : 0}deg)`;
      }
    };

    const alTocar = (e: TouchEvent) => {
      if (e.touches.length !== 1 || ocupado.current || c.scrollTop > 0) {
        inicio = null;
        return;
      }
      inicio = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      tirando = false;
      decidido = false;
      distancia = 0;
    };

    const alMover = (e: TouchEvent) => {
      if (!inicio) return;
      const dx = e.touches[0].clientX - inicio.x;
      const dy = e.touches[0].clientY - inicio.y;
      if (!decidido) {
        const eje = ejeDelGesto(dx, dy);
        if (eje === null) return;
        decidido = true;
        if (eje !== "y" || dy <= 0 || c.scrollTop > 0) {
          inicio = null;
          return;
        }
        tirando = true;
        if (indicador.current) indicador.current.style.transition = "none";
      }
      if (!tirando) return;
      if (e.cancelable) e.preventDefault();
      // Con resistencia: el dedo recorre el doble de lo que baja la lista.
      distancia = Math.max(0, Math.min(110, dy * 0.5));
      if (!cuadro) cuadro = requestAnimationFrame(pintar);
    };

    const alSoltar = () => {
      if (!inicio || !tirando) {
        inicio = null;
        return;
      }
      inicio = null;
      tirando = false;
      if (cuadro) cancelAnimationFrame(cuadro);
      cuadro = 0;
      const i = indicador.current;
      if (i) i.style.transition = `height 240ms ${CURVA_IOS}`;
      if (distancia >= DISTANCIA_PARA_ACTUALIZAR) {
        distancia = ALTO_ACTUALIZANDO;
        desde.current = performance.now();
        setActualizando(true);
        alActualizar.current();
      } else {
        distancia = 0;
      }
      pintar();
    };

    c.addEventListener("touchstart", alTocar, { passive: true });
    c.addEventListener("touchmove", alMover, { passive: false });
    c.addEventListener("touchend", alSoltar);
    c.addEventListener("touchcancel", alSoltar);
    return () => {
      c.removeEventListener("touchstart", alTocar);
      c.removeEventListener("touchmove", alMover);
      c.removeEventListener("touchend", alSoltar);
      c.removeEventListener("touchcancel", alSoltar);
      if (cuadro) cancelAnimationFrame(cuadro);
    };
  }, []);

  // Al terminar, el indicador se guarda.
  useEffect(() => {
    const i = indicador.current;
    if (!i || actualizando) return;
    i.style.transition = `height 240ms ${CURVA_IOS}`;
    i.style.height = "0px";
  }, [actualizando]);

  return (
    <div ref={caja} className={`overflow-y-auto overscroll-contain ${className}`}>
      <div
        ref={indicador}
        aria-hidden={!actualizando}
        className="flex items-center justify-center overflow-hidden text-texto-3"
        style={{ height: 0 }}
      >
        {actualizando ? (
          <span role="status" aria-label="Actualizando" className="h-6 w-6 animate-spin rounded-full border-[2.5px] border-borde border-t-primary-boton" />
        ) : (
          <span className="flex transition-transform duration-150">
            <Icon name="arrowDown" size={20} />
          </span>
        )}
      </div>
      {children}
    </div>
  );
}
