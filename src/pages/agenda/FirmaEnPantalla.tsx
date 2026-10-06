import { useEffect, useRef, useState, type PointerEvent } from "react";
import { densidadDeFirma } from "../../lib/agenda/spa";

/**
 * Lienzo para firmar con el dedo, el lápiz o el mouse (consentimientos,
 * agenda fase 3). Devuelve la firma como PNG en `data:` URL, que es lo que el
 * backend valida por contenido y guarda con tope.
 *
 * El trazo se dibuja con el color del texto del tema (leído del CSS, no fijo)
 * sobre fondo transparente; el PNG queda chico (5-30 KB) porque casi todo el
 * lienzo está vacío.
 */
export default function FirmaEnPantalla({
  onCambio,
  alto = 180,
}: {
  /** El PNG de la firma, o null si está vacía. */
  onCambio: (firma: string | null) => void;
  alto?: number;
}) {
  const lienzo = useRef<HTMLCanvasElement | null>(null);
  const dibujando = useRef(false);
  // El estado tarda un render: el ref dice en el acto si ya hay trazo.
  const hayTrazo = useRef(false);
  const [vacia, setVacia] = useState(true);

  // El lienzo toma el ancho de su contenedor (celular o tablet de recepción)
  // y se dibuja a la densidad de la pantalla: en un celular (DPR 2-3) un
  // lienzo de 346 px reales para 346 px CSS salía pixelado (QA S2-16). Se
  // topa en 2× para que el PNG no pase el tope del backend (60 KB, 2000 px).
  useEffect(() => {
    const c = lienzo.current;
    if (!c) return;
    const ancho = Math.max(300, Math.round(c.parentElement?.clientWidth ?? 480));
    const densidad = densidadDeFirma();
    c.width = Math.round(Math.min(ancho, 900) * densidad);
    c.height = Math.round(alto * densidad);
  }, [alto]);

  const contexto = () => {
    const ctx = lienzo.current?.getContext("2d") ?? null;
    if (ctx) {
      const color = getComputedStyle(lienzo.current as HTMLCanvasElement).color || "currentColor";
      ctx.strokeStyle = color;
      // El trazo se ve del mismo grosor en CSS, sea cual sea la densidad.
      ctx.lineWidth = 2.5 * densidadDeFirma();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    }
    return ctx;
  };

  const punto = (e: PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const escalaX = e.currentTarget.width / (r.width || 1);
    const escalaY = e.currentTarget.height / (r.height || 1);
    return { x: (e.clientX - r.left) * escalaX, y: (e.clientY - r.top) * escalaY };
  };

  const empezar = (e: PointerEvent<HTMLCanvasElement>) => {
    const ctx = contexto();
    if (!ctx) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dibujando.current = true;
    const p = punto(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };

  const mover = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!dibujando.current) return;
    const ctx = contexto();
    if (!ctx) return;
    const p = punto(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    if (!hayTrazo.current) {
      hayTrazo.current = true;
      setVacia(false);
    }
  };

  const terminar = () => {
    if (!dibujando.current) return;
    dibujando.current = false;
    if (hayTrazo.current) onCambio(lienzo.current?.toDataURL("image/png") ?? null);
  };

  const borrar = () => {
    const c = lienzo.current;
    c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    hayTrazo.current = false;
    setVacia(true);
    onCambio(null);
  };

  return (
    <div className="space-y-1.5">
      <div className="relative rounded-xl border-2 border-dashed border-borde bg-white">
        <canvas
          ref={lienzo}
          aria-label="Firmá acá con el dedo"
          role="img"
          className="block w-full touch-none text-texto"
          style={{ height: alto }}
          onPointerDown={empezar}
          onPointerMove={mover}
          onPointerUp={terminar}
          onPointerLeave={terminar}
          onPointerCancel={terminar}
        />
        {vacia && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-texto-4">
            Firmá acá
          </span>
        )}
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={borrar}
          disabled={vacia}
          className="rounded-lg px-2 py-1 text-[13px] font-semibold text-texto-3 hover:bg-muted disabled:opacity-40"
        >
          Borrar firma
        </button>
      </div>
    </div>
  );
}
