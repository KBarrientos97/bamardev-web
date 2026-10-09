import { useLayoutEffect, useRef, useState } from "react";
import type { PaginaPublica } from "../../lib/pagina/tipos";
import VistaPagina from "./VistaPagina";

export type ModoPrevia = "movil" | "escritorio";

/** La computadora de la vista previa: la página a tamaño real, achicada. */
const ANCHO_PC = 1280;
const ALTO_PC = 800;

/**
 * Los marcos son el bloque contenedor de lo que la página pone con
 * `position: fixed` (el visor del catálogo): un `transform` en un ancestro
 * hace que `fixed` se mida contra él y no contra la ventana. Así el visor
 * tapa la pantalla del celular o de la computadora y no el editor. Tiene que
 * ser un elemento que NO scrollea; si no, el visor se iría con el scroll.
 */
const CONTIENE_FIJOS = { transform: "translateZ(0)" } as const;

/** Celular / Computadora: cómo se ve la página en cada pantalla. */
export function SelectorModo({ modo, onModo }: { modo: ModoPrevia; onModo: (m: ModoPrevia) => void }) {
  const opciones: { m: ModoPrevia; texto: string }[] = [
    { m: "movil", texto: "Celular" },
    { m: "escritorio", texto: "Computadora" },
  ];
  return (
    <div className="inline-flex rounded-xl border border-borde bg-white p-0.5" role="group" aria-label="Ver la página en">
      {opciones.map(({ m, texto }) => (
        <button
          key={m}
          type="button"
          aria-pressed={modo === m}
          onClick={() => onModo(m)}
          className={`min-h-9 rounded-[10px] px-3 text-[13px] font-semibold ${
            modo === m ? "bg-slate-800 text-white" : "text-texto-2 hover:bg-muted"
          }`}
        >
          {texto}
        </button>
      ))}
    </div>
  );
}

/** Mide el ancho del contenedor para achicar la computadora sin que se corte. */
function useAncho() {
  const ref = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => setAncho(el.clientWidth);
    medir();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, ancho] as const;
}

function MarcoComputadora({ pagina, direccion }: { pagina: PaginaPublica; direccion: string }) {
  const [ref, ancho] = useAncho();
  // Sin medida todavía (o en jsdom) se dibuja a la mitad: igual se ve entera.
  const escala = ancho > 0 ? Math.min(1, ancho / ANCHO_PC) : 0.5;
  return (
    <div ref={ref} className="w-full">
      <div className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-xl">
        <div className="flex h-8 items-center gap-1.5 border-b border-slate-200 bg-slate-100 px-3" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          <span className="ml-3 min-w-0 flex-1 truncate rounded-md bg-white px-2 py-0.5 text-[11px] text-texto-3">
            {direccion}
          </span>
        </div>
        <div style={{ height: ALTO_PC * escala, overflow: "hidden" }}>
          {/* El que escala (y contiene al visor) no scrollea; scrollea el de adentro. */}
          <div
            style={{
              width: ANCHO_PC,
              height: ALTO_PC,
              transform: `scale(${escala})`,
              transformOrigin: "top left",
              overflow: "hidden",
            }}
          >
            <div style={{ height: "100%", overflowY: "auto" }}>
              <VistaPagina pagina={pagina} urlReservar="#" urlPrivacidad="#" enMarco modo="escritorio" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * La vista previa de "Mi página": en el marco de un celular o en el de una
 * computadora. Es la misma página que ve el cliente (VistaPagina) con el
 * armado forzado, así el dueño ve los dos sin achicar la ventana.
 */
export default function VistaPrevia({
  pagina,
  modo,
  onModo,
  direccion,
  urlCompleta,
  colorEnlace,
}: {
  pagina: PaginaPublica;
  modo: ModoPrevia;
  onModo: (m: ModoPrevia) => void;
  /** La dirección que se ve en la barra del navegador. */
  direccion: string;
  /** "Ver la página completa" (sólo si está publicada). */
  urlCompleta: string | null;
  colorEnlace: string;
}) {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div className="flex w-full flex-wrap items-center justify-center gap-2">
        <span className="text-[13px] text-texto-3">
          {modo === "movil" ? "Así se ve en un celular" : "Así se ve en una computadora"}
        </span>
        <SelectorModo modo={modo} onModo={onModo} />
      </div>
      {modo === "movil" ? (
        <div
          className="h-[600px] w-[300px] overflow-hidden rounded-[36px] border-[10px] border-slate-800 bg-[#F6F7F9] shadow-xl"
          style={CONTIENE_FIJOS}
        >
          <div className="h-full overflow-y-auto">
            {/* Con el enlace de Privacidad del pie, como la página de verdad (B24). */}
            <VistaPagina pagina={pagina} urlReservar="#" urlPrivacidad="#" enMarco modo="movil" />
          </div>
        </div>
      ) : (
        <MarcoComputadora pagina={pagina} direccion={direccion} />
      )}
      {urlCompleta && (
        <a href={urlCompleta} target="_blank" rel="noopener" className="text-sm font-semibold" style={{ color: colorEnlace }}>
          Ver la página completa
        </a>
      )}
    </div>
  );
}
