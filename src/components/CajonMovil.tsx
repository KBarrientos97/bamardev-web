import { useEffect, useRef, useState, type ReactNode } from "react";
import { completaGesto, CURVA_IOS, ejeDelGesto, useArrastre } from "../lib/gestos";

/** Lo que mide el cajón (`w-72`). */
const ANCHO = 288;
/** Desde cuántos px del borde izquierdo un deslizamiento abre el menú. */
const BORDE = 24;
const DURACION_MS = 260;

/**
 * El menú del celular como en una app de iOS: sigue al dedo. Se abre
 * deslizando desde el borde izquierdo y se cierra empujándolo hacia la
 * izquierda o tocando afuera, siempre con la misma curva.
 *
 * `desdeElBorde` lo apaga cuando ese borde ya es de otro: en Safari (no
 * instalada) deslizar desde la izquierda es "volver" y no se le puede ganar.
 */
export default function CajonMovil({
  abierto,
  onAbrir,
  onCerrar,
  desdeElBorde,
  children,
}: {
  abierto: boolean;
  onAbrir: () => void;
  onCerrar: () => void;
  desdeElBorde: boolean;
  children: ReactNode;
}) {
  // Dónde está el cajón mientras el dedo lo arrastra desde el borde: de
  // -ANCHO (cerrado) a 0 (abierto). `null` = nadie lo está abriendo.
  const [abriendo, setAbriendo] = useState<number | null>(null);
  const [cerrando, setCerrando] = useState(false);
  // Abierto con el botón entra con animación; con el dedo ya está en su lugar.
  const conDedo = useRef(false);
  // En una ref: si el Layout se redibuja a mitad del gesto (llega el cupo, la
  // licencia) el listener no se reemplaza y el dedo no pierde el cajón.
  const onAbrirRef = useRef(onAbrir);
  onAbrirRef.current = onAbrir;

  function cerrarAnimado() {
    setCerrando(true);
    setTimeout(() => {
      setCerrando(false);
      onCerrar();
    }, DURACION_MS);
  }

  // Empujarlo hacia la izquierda, con el cajón abierto.
  const { delta, handlers } = useArrastre("x", (dx, ms) => {
    if (completaGesto(-dx, ms, ANCHO, 0.3)) cerrarAnimado();
  });

  // Deslizar desde el borde, con el cajón cerrado. Va en el documento porque
  // el cajón todavía no existe: el dedo arranca sobre la pantalla de abajo.
  useEffect(() => {
    if (abierto || !desdeElBorde) return;
    if (window.matchMedia?.("(min-width: 1024px)")?.matches) return;
    let inicio: { x: number; y: number; t: number; eje: "x" | "y" | null } | null = null;
    let ultimo = 0;

    const alEmpezar = (e: globalThis.TouchEvent) => {
      const t = e.touches[0];
      // Con una hoja abierta encima el borde es de ella.
      if (e.touches.length !== 1 || t.clientX > BORDE || document.querySelector('[role="dialog"]')) return;
      inicio = { x: t.clientX, y: t.clientY, t: performance.now(), eje: null };
    };
    const alMover = (e: globalThis.TouchEvent) => {
      if (!inicio) return;
      const t = e.touches[0];
      const dx = t.clientX - inicio.x;
      if (inicio.eje === null) inicio.eje = ejeDelGesto(dx, t.clientY - inicio.y);
      if (inicio.eje === "y") {
        inicio = null;
        return;
      }
      if (inicio.eje !== "x") return;
      ultimo = dx;
      setAbriendo(Math.min(0, Math.max(-ANCHO, dx - ANCHO)));
    };
    const alSoltar = () => {
      if (!inicio || inicio.eje !== "x") {
        inicio = null;
        return;
      }
      const ms = performance.now() - inicio.t;
      inicio = null;
      if (completaGesto(ultimo, ms, ANCHO)) {
        conDedo.current = true;
        setAbriendo(null);
        onAbrirRef.current();
      } else {
        // Vuelve a esconderse con la misma curva antes de desmontarse.
        setAbriendo(-ANCHO);
        setTimeout(() => setAbriendo(null), DURACION_MS);
      }
    };

    document.addEventListener("touchstart", alEmpezar, { passive: true });
    document.addEventListener("touchmove", alMover, { passive: true });
    document.addEventListener("touchend", alSoltar);
    document.addEventListener("touchcancel", alSoltar);
    return () => {
      document.removeEventListener("touchstart", alEmpezar);
      document.removeEventListener("touchmove", alMover);
      document.removeEventListener("touchend", alSoltar);
      document.removeEventListener("touchcancel", alSoltar);
    };
  }, [abierto, desdeElBorde]);

  useEffect(() => {
    if (!abierto) conDedo.current = false;
  }, [abierto]);

  if (!abierto && abriendo === null) return null;

  const arrastrando = delta !== null || (abriendo !== null && !cerrando);
  // Dónde se dibuja: el dedo manda; si no, cerrando = afuera y abierto = 0.
  const x = cerrando
    ? -ANCHO
    : delta !== null
      ? Math.min(0, Math.max(-ANCHO, delta))
      : (abriendo ?? 0);
  const transicion = arrastrando ? "none" : `transform ${DURACION_MS}ms ${CURVA_IOS}, opacity ${DURACION_MS}ms`;
  const entra = abierto && !conDedo.current && abriendo === null;

  return (
    <div className="fixed inset-0 z-40 lg:hidden">
      <div
        className={`absolute inset-0 bg-slate-900/40 ${entra ? "animate-[velo-aparece_.26s_ease-out] motion-reduce:animate-none" : ""}`}
        style={{ opacity: 1 + x / ANCHO, transition: transicion }}
        onClick={cerrarAnimado}
      />
      <aside
        {...handlers}
        data-testid="cajon-movil"
        className={`absolute inset-y-0 left-0 flex w-72 touch-pan-y flex-col bg-barra pb-[env(safe-area-inset-bottom)] shadow-2xl ${
          entra ? "animate-[cajon-entra_.26s_cubic-bezier(0.32,0.72,0,1)] motion-reduce:animate-none" : ""
        }`}
        style={{ transform: `translateX(${x}px)`, transition: transicion }}
      >
        {children}
      </aside>
    </div>
  );
}
