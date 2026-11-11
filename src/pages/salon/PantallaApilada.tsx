import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from "react";
import { CURVA_IOS } from "../../lib/gestos";

/**
 * Una pantalla que se apila sobre el panel del mesero (abrir mesa, el pedido,
 * cobrar, las entregas), como la navegación de una app (UX nativa, 10-nov).
 *
 *  - Entra desde la derecha y sale hacia la derecha.
 *  - Se vuelve arrastrando desde el borde izquierdo, como en el iPhone: la
 *    app instalada no trae ese gesto (es de Safari). Mientras se arrastra se
 *    ve el salón detrás, porque el panel sigue vivo abajo.
 *  - Una pantalla con algo sin guardar (el pedido a medio cargar) registra una
 *    guardia con `useGuardiaDeSalida`: si dice que no, la pantalla vuelve a su
 *    lugar y la guardia pregunta lo que tenga que preguntar.
 *
 * Antes cada flujo reemplazaba al panel entero: el salón se desmontaba, y al
 * volver perdía el scroll y mostraba "Cargando" otra vez.
 */

/** Hasta dónde desde el borde cuenta como "volver" (como en iOS). */
const BORDE = 24;

type Guardia = () => boolean;

const Contexto = createContext<{ registrar: (g: Guardia | null) => void } | null>(null);

/**
 * Para la pantalla que no se puede dejar así nomás: `guardia` devuelve `true`
 * si se puede salir y `false` si no (y en ese caso pregunta ella).
 */
export function useGuardiaDeSalida(guardia: Guardia) {
  const ctx = useContext(Contexto);
  const ref = useRef(guardia);
  ref.current = guardia;
  useEffect(() => {
    if (!ctx) return;
    ctx.registrar(() => ref.current());
    return () => ctx.registrar(null);
  }, [ctx]);
}

export default function PantallaApilada({
  onVolver,
  children,
}: {
  /** Lo que pasa al terminar de salir (el panel saca el flujo). */
  onVolver: () => void;
  /** Recibe `salir`, para los botones de volver de la pantalla. */
  children: (salir: (despues?: () => void) => void) => ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const guardia = useRef<Guardia | null>(null);
  const saliendo = useRef(false);
  const alVolver = useRef(onVolver);
  alVolver.current = onVolver;

  /** Sale hacia la derecha y después hace `despues` (o vuelve al panel). */
  const salir = useCallback((despues?: () => void, desde = 0, velocidad = 0) => {
    const p = panel.current;
    if (saliendo.current) return;
    saliendo.current = true;
    const ancho = p?.offsetWidth || 390;
    const ms = Math.round(Math.min(300, Math.max(140, (ancho - desde) / Math.max(velocidad, 1.6))));
    if (p) {
      p.style.transition = `transform ${ms}ms ${CURVA_IOS}`;
      p.style.transform = `translateX(${ancho}px)`;
    }
    window.setTimeout(() => (despues ?? alVolver.current)(), ms);
  }, []);

  useEffect(() => {
    const p = panel.current;
    if (!p) return;
    let inicio: { x: number; y: number } | null = null;
    let arrastrando = false;
    let decidido = false;
    let actual = 0;
    let cuadro = 0;
    const muestras: { x: number; t: number }[] = [];

    const pintar = () => {
      cuadro = 0;
      p.style.transform = actual > 0 ? `translateX(${actual}px)` : "";
    };

    const alTocar = (e: TouchEvent) => {
      const t = e.touches[0];
      if (e.touches.length !== 1 || saliendo.current || t.clientX > BORDE) {
        inicio = null;
        return;
      }
      inicio = { x: t.clientX, y: t.clientY };
      arrastrando = false;
      decidido = false;
      actual = 0;
      muestras.length = 0;
    };

    const alMover = (e: TouchEvent) => {
      if (!inicio) return;
      const t = e.touches[0];
      const dx = t.clientX - inicio.x;
      const dy = t.clientY - inicio.y;
      if (!decidido) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        decidido = true;
        if (Math.abs(dy) > Math.abs(dx) || dx <= 0) {
          inicio = null;
          return;
        }
        arrastrando = true;
        p.style.transition = "none";
      }
      if (!arrastrando) return;
      if (e.cancelable) e.preventDefault();
      actual = Math.max(0, dx);
      muestras.push({ x: actual, t: performance.now() });
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
      const a = muestras[0];
      const b = muestras[muestras.length - 1];
      const ms = a && b ? b.t - a.t : 0;
      const velocidad = ms > 0 ? (b.x - a.x) / ms : 0;
      const ancho = p.offsetWidth || 390;
      const completa = velocidad > -0.1 && (actual > ancho * 0.35 || (actual > 30 && velocidad > 0.45));
      if (completa && (guardia.current?.() ?? true)) {
        salir(undefined, actual, velocidad);
      } else {
        p.style.transition = `transform 260ms ${CURVA_IOS}`;
        p.style.transform = "";
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
  }, [salir]);

  const registrar = useCallback((g: Guardia | null) => {
    guardia.current = g;
  }, []);

  return (
    <Contexto.Provider value={{ registrar }}>
      <div
        ref={panel}
        className="fixed inset-0 z-40 h-[100dvh] overflow-hidden bg-fondo shadow-[-12px_0_32px_rgba(15,23,42,0.18)] will-change-transform animate-[pantalla-entra_.3s_cubic-bezier(0.32,0.72,0,1)] motion-reduce:animate-none"
      >
        {children((despues) => salir(despues))}
      </div>
    </Contexto.Provider>
  );
}
