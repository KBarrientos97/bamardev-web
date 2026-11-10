import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type TouchEvent,
} from "react";
import { Icon } from "../../components/Icon";
import { Modal } from "../../components/ui";
import { completaGesto, CURVA_IOS, useArrastre } from "../../lib/gestos";

/**
 * La hoja de la mesa: UNA sola, que se baja con el dedo, y adentro cambia de
 * vista (la mesa → la cuenta → volver) como una app.
 *
 * Hasta el 10-nov la mesa era una hoja sin gestos y "Ver la cuenta", "Pasar",
 * "Juntar" o "Quitar" abrían OTRA hoja encima, que sí se bajaba con el dedo:
 * dos velos, dos manijas y los botones de cada una alineados distinto (pedido
 * del dueño: "no pongamos un modal encima de otro").
 *
 * Gestos, los de iOS:
 *  - bajar la cabecera cierra la hoja entera (desde cualquier vista);
 *  - en una vista de adentro, deslizar la cabecera hacia la derecha vuelve,
 *    igual que la flecha.
 */

interface ContextoHoja {
  /** Cierra la hoja con su animación. */
  cerrar: () => void;
  /** Los handlers del gesto de bajar: van en la cabecera de cada vista. */
  bajar: ReturnType<typeof useArrastre>["handlers"];
}

const Contexto = createContext<ContextoHoja | null>(null);

export function Hoja({
  etiqueta,
  onCerrar,
  children,
}: {
  /** El nombre del diálogo para el lector de pantalla. */
  etiqueta: string;
  onCerrar: () => void;
  children: ReactNode;
}) {
  const [saliendo, setSaliendo] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  const cerrar = useCallback(() => {
    setSaliendo(true);
    setTimeout(onCerrar, 220);
  }, [onCerrar]);

  const { delta, handlers } = useArrastre("y", (dy, ms) => {
    if (completaGesto(dy, ms, panel.current?.offsetHeight ?? 500, 0.25))
      cerrar();
  });
  const bajada = delta === null || delta < 0 ? 0 : delta;

  // Escape cierra, como cualquier diálogo.
  useEffect(() => {
    const alTecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    document.addEventListener("keydown", alTecla);
    return () => document.removeEventListener("keydown", alTecla);
  }, [onCerrar]);

  return (
    <div
      className="fixed inset-0 z-50 flex animate-[velo-aparece_.2s_ease-out] items-end justify-center bg-slate-900/40 motion-reduce:animate-none sm:items-center sm:p-4"
      style={saliendo ? { opacity: 0, transition: "opacity 220ms" } : undefined}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) cerrar();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={etiqueta}
        className="flex h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl max-sm:animate-[hoja-sube_.32s_cubic-bezier(0.32,0.72,0,1)] motion-reduce:animate-none sm:h-auto sm:max-h-[92dvh] sm:rounded-2xl"
        style={
          saliendo
            ? {
                transform: "translateY(100%)",
                transition: `transform 220ms ${CURVA_IOS}`,
              }
            : bajada
              ? { transform: `translateY(${bajada}px)` }
              : delta === null
                ? { transition: `transform 220ms ${CURVA_IOS}` }
                : undefined
        }
      >
        <Contexto.Provider value={{ cerrar, bajar: handlers }}>
          {children}
        </Contexto.Provider>
      </div>
    </div>
  );
}

function useHoja(): ContextoHoja {
  const c = useContext(Contexto);
  if (!c) throw new Error("CabeceraHoja va adentro de una <Hoja>");
  return c;
}

/** Junta los handlers de dos gestos sobre el mismo elemento. */
function juntar(
  a: ReturnType<typeof useArrastre>["handlers"],
  b?: ReturnType<typeof useArrastre>["handlers"],
) {
  if (!b) return a;
  return {
    onTouchStart: (e: TouchEvent) => {
      a.onTouchStart(e);
      b.onTouchStart(e);
    },
    onTouchMove: (e: TouchEvent) => {
      a.onTouchMove(e);
      b.onTouchMove(e);
    },
    onTouchEnd: () => {
      a.onTouchEnd();
      b.onTouchEnd();
    },
    onTouchCancel: () => {
      a.onTouchCancel();
      b.onTouchCancel();
    },
  };
}

/**
 * La cabecera de una vista: la manija, el título y la cruz. Con `onAtras`
 * lleva la flecha y se puede deslizar a la derecha para volver.
 */
export function CabeceraHoja({
  titulo,
  subtitulo,
  onAtras,
  derecha,
}: {
  titulo: ReactNode;
  subtitulo?: ReactNode;
  onAtras?: () => void;
  /** Botones que van antes de la cruz (el "Más acciones" de la mesa). */
  derecha?: ReactNode;
}) {
  const { cerrar, bajar } = useHoja();
  const volver = useArrastre("x", (dx, ms) => {
    if (onAtras && completaGesto(dx, ms, 320, 0.3)) onAtras();
  });
  const handlers = juntar(bajar, onAtras ? volver.handlers : undefined);
  const corrida =
    onAtras && volver.delta && volver.delta > 0
      ? Math.min(volver.delta, 120)
      : 0;

  return (
    <div
      {...handlers}
      className="shrink-0 touch-none border-b border-borde-soft bg-white"
    >
      <div
        className="flex justify-center pb-1 pt-2 sm:hidden"
        aria-hidden="true"
      >
        <span className="h-1.5 w-10 rounded-full bg-slate-300" />
      </div>
      <div
        className="flex items-center gap-2 px-3 pb-3 sm:pt-3"
        style={
          corrida ? { transform: `translateX(${corrida * 0.4}px)` } : undefined
        }
      >
        {onAtras && (
          <button
            onClick={onAtras}
            aria-label="Volver"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-texto-2 hover:bg-muted"
          >
            <Icon name="arrowLeft" size={20} />
          </button>
        )}
        <div className={`min-w-0 flex-1 ${onAtras ? "" : "pl-1"}`}>
          <h2 className="truncate text-lg font-extrabold text-texto">
            {titulo}
          </h2>
          {subtitulo && (
            <p className="truncate text-xs text-texto-3">{subtitulo}</p>
          )}
        </div>
        {derecha}
        <button
          onClick={cerrar}
          aria-label="Cerrar"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-texto-3 hover:bg-muted"
        >
          <Icon name="close" size={19} />
        </button>
      </div>
    </div>
  );
}

/**
 * El pie de una vista: los botones parejos, de lado a lado. En la hoja de la
 * cuenta "Imprimir" y "Enviar" quedaban apretados a la derecha y a distinto
 * alto que los de la mesa.
 */
export function PieHoja({ children }: { children: ReactNode }) {
  return (
    <div className="grid shrink-0 auto-cols-fr grid-flow-col gap-2 border-t border-borde bg-white px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] [&>*]:w-full [&>*]:py-3">
      {children}
    </div>
  );
}

/**
 * Dónde se dibuja un diálogo del salón (la cuenta, pasar, juntar, quitar, la
 * reserva): en un Modal propio, o como una vista más de la hoja de la mesa.
 * El diálogo no sabe cuál: arma su título, su cuerpo y sus botones, y el
 * marco decide.
 */
export interface MarcoProps {
  titulo: string;
  subtitulo?: string;
  /** En la hoja de la mesa vuelve a la mesa; en un Modal, lo cierra. */
  onCerrar: () => void;
  acciones?: ReactNode;
  children: ReactNode;
}

export type Marco = (p: MarcoProps) => ReactNode;

/** El de siempre: un Modal propio (la pantalla de abrir mesa, Mi turno). */
export const MarcoModal: Marco = ({
  titulo,
  subtitulo,
  onCerrar,
  acciones,
  children,
}) => (
  <Modal
    abierto
    titulo={titulo}
    subtitulo={subtitulo}
    onClose={onCerrar}
    ancho="max-w-sm"
    acciones={acciones}
  >
    {children}
  </Modal>
);

/** Una vista de adentro de la hoja de la mesa, con flecha para volver. */
export const VistaEnHoja: Marco = ({
  titulo,
  subtitulo,
  onCerrar,
  acciones,
  children,
}) => (
  <div className="flex min-h-0 flex-1 animate-[vista-entra_.22s_cubic-bezier(0.32,0.72,0,1)] flex-col motion-reduce:animate-none">
    <CabeceraHoja titulo={titulo} subtitulo={subtitulo} onAtras={onCerrar} />
    <div className="min-h-0 flex-1 overflow-y-auto bg-white px-4 py-4">
      {children}
    </div>
    {acciones && <PieHoja>{acciones}</PieHoja>}
  </div>
);
