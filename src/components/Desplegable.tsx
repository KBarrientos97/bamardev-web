import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useConsultaMedia } from "../lib/agenda/useEsCelular";
import { Icon } from "./Icon";
import { Modal } from "./ui";

export interface OpcionDesplegable<T> {
  id: T;
  etiqueta: string;
  /** Un dato chico debajo de la etiqueta ("cerró ayer 19:55"). */
  detalle?: string;
}

/** Lo que separa la lista del botón, y de los bordes de la pantalla. */
const SEPARACION = 6;
const MARGEN = 8;
/** El ancho de la lista cuando no copia el del botón. */
const ANCHO = 272;

/** Dónde se dibuja la lista: pegada al botón, abajo o arriba. */
interface Posicion {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
  lado: "abajo" | "arriba";
}

/**
 * Elegir una opción entre pocas, con la lista dibujada por la app y no por el
 * navegador. Reemplaza al `<select>` nativo donde la lista se ve: en el
 * celular el nativo abre el diálogo del sistema (oscuro, con botones de
 * radio, sin nada de la app: Kevin lo vio en Supervisión con la sucursal,
 * 13-nov, con captura), y en la compu, el menú gris del navegador.
 *
 * En la compu es una lista pegada al botón, en el `body` con posición fija
 * (como MenuMas: adentro de una tarjeta con `overflow-hidden` se cortaría);
 * abre hacia arriba si abajo no entra y se cierra con un clic afuera, Escape,
 * un scroll o un cambio de tamaño. En el celular es la hoja inferior de la
 * app (`Modal`), con renglones altos para el dedo. En las dos la elegida va
 * marcada con el tilde, y elegir la que ya está no avisa (como el nativo).
 *
 * El botón es lo que se pasa como `children`; el chevron lo pone acá y gira
 * mientras está abierto. El lector de pantalla lo nombra "Sucursal Principal":
 * la etiqueta y lo elegido, que es lo que un `<select>` con label decía.
 */
export function Desplegable<T extends string | number>({
  etiqueta,
  titulo,
  valor,
  opciones,
  onElegir,
  ancho = "fijo",
  className = "",
  children,
}: {
  /** Para el lector de pantalla y el título de la hoja: "Sucursal", "Turno que estás viendo". */
  etiqueta: string;
  /** El título de la hoja del celular, si no es `etiqueta`. */
  titulo?: string;
  valor: T | null;
  opciones: OpcionDesplegable<T>[];
  onElegir: (id: T) => void;
  /** `"boton"`: la lista mide lo que el botón (un selector a lo ancho, como el del turno). */
  ancho?: "fijo" | "boton";
  /** Las clases del botón: la pastilla gris del encabezado, la tarjeta del turno. */
  className?: string;
  children: ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  const [pos, setPos] = useState<Posicion | null>(null);
  const celular = useConsultaMedia("(max-width: 767px)");
  const boton = useRef<HTMLButtonElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  const idEtiqueta = useId();
  const idBoton = useId();
  const desplegable = abierto && !celular;

  // Se mide antes de pintar: la lista sale primero invisible y acá se ubica con
  // su alto real (cambia con la cantidad de opciones). Pegada al borde
  // izquierdo del botón y nunca fuera de la pantalla: la pastilla de la
  // sucursal está a la izquierda del encabezado, y alineada a su derecha la
  // lista se saldría por la izquierda.
  useLayoutEffect(() => {
    if (!desplegable) return;
    const r = boton.current?.getBoundingClientRect();
    if (!r) return;
    const alto = lista.current?.offsetHeight ?? 0;
    const width = Math.min(ancho === "boton" ? Math.max(r.width, 160) : ANCHO, window.innerWidth - MARGEN * 2);
    const left = Math.max(MARGEN, Math.min(r.left, window.innerWidth - width - MARGEN));
    const abajo = window.innerHeight - r.bottom;
    const haciaArriba = abajo < alto + SEPARACION + MARGEN && r.top > abajo;
    setPos(
      haciaArriba
        ? { left, width, bottom: window.innerHeight - r.top + SEPARACION, lado: "arriba" }
        : { left, width, top: r.bottom + SEPARACION, lado: "abajo" },
    );
  }, [desplegable, ancho]);

  // Al abrir, el foco va a la elegida: con el teclado se recorre con Tab y se
  // elige con Enter. Es un elemento fijo: enfocarlo no mueve la página.
  useEffect(() => {
    if (!desplegable) return;
    const elegida = lista.current?.querySelector<HTMLElement>('[aria-selected="true"]') ?? lista.current?.querySelector<HTMLElement>("[role=option]");
    elegida?.focus();
  }, [desplegable]);

  // Un clic afuera, Escape, un scroll o un cambio de tamaño la cierran (la de
  // escritorio; la hoja se cierra sola). "Afuera" es fuera del botón Y de la
  // lista: la lista vive en el `body`, y sin mirarla el mousedown sobre una
  // opción la cerraba antes del clic y la opción no se elegía.
  useEffect(() => {
    if (!desplegable) return;
    const adentro = (n: EventTarget | null) => n instanceof Node && (!!boton.current?.contains(n) || !!lista.current?.contains(n));
    const afuera = (e: MouseEvent) => {
      if (!adentro(e.target)) setAbierto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setAbierto(false);
      boton.current?.focus();
    };
    const mover = (e: Event) => {
      if (!adentro(e.target)) setAbierto(false);
    };
    const cerrar = () => setAbierto(false);
    document.addEventListener("mousedown", afuera);
    document.addEventListener("keydown", tecla);
    // En captura: el scroll de la app es el del <main>, que no burbujea hasta window.
    window.addEventListener("scroll", mover, true);
    window.addEventListener("resize", cerrar);
    return () => {
      document.removeEventListener("mousedown", afuera);
      document.removeEventListener("keydown", tecla);
      window.removeEventListener("scroll", mover, true);
      window.removeEventListener("resize", cerrar);
    };
  }, [desplegable]);

  const elegir = (id: T) => {
    setAbierto(false);
    if (id !== valor) onElegir(id);
  };

  const filas = (enHoja: boolean) =>
    opciones.map((o) => {
      const activa = o.id === valor;
      return (
        <button
          key={String(o.id)}
          type="button"
          role="option"
          aria-selected={activa}
          onClick={() => elegir(o.id)}
          className={[
            "flex w-full items-center gap-3 text-left",
            enHoja ? "min-h-12 px-5 py-2.5 text-[15px]" : "rounded-lg px-3 py-2.5 text-sm",
            activa ? "bg-primary-50 font-bold text-primary-700" : "text-texto hover:bg-muted active:bg-muted",
          ].join(" ")}
        >
          <span className="min-w-0 flex-1">
            <span className="block leading-snug">{o.etiqueta}</span>
            {o.detalle && <span className={`block text-xs font-normal ${activa ? "text-primary-700/80" : "text-texto-3"}`}>{o.detalle}</span>}
          </span>
          {activa && (
            <span className="shrink-0 text-primary-700" aria-hidden>
              <Icon name="check" size={17} />
            </span>
          )}
        </button>
      );
    });

  return (
    <>
      <span id={idEtiqueta} className="sr-only">
        {etiqueta}
      </span>
      <button
        ref={boton}
        id={idBoton}
        type="button"
        aria-labelledby={`${idEtiqueta} ${idBoton}`}
        aria-haspopup={celular ? "dialog" : "listbox"}
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
        className={className}
      >
        {children}
        <span aria-hidden className={`shrink-0 text-slate-500 transition-transform ${abierto ? "rotate-180" : ""}`}>
          <Icon name="chevronDown" size={15} />
        </span>
      </button>

      {abierto && celular && (
        <Modal abierto titulo={titulo ?? etiqueta} onClose={() => setAbierto(false)} ancho="max-w-md">
          <div role="listbox" aria-label={etiqueta} className="-mx-5 -my-4 py-1.5">
            {filas(true)}
          </div>
        </Modal>
      )}

      {desplegable &&
        createPortal(
          <div
            ref={lista}
            role="listbox"
            aria-label={etiqueta}
            data-lado={pos?.lado}
            style={
              pos
                ? { position: "fixed", left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom }
                : // La primera pasada, para medirla: en su lugar pero sin verse.
                  { position: "fixed", top: 0, left: MARGEN, width: ANCHO, visibility: "hidden" }
            }
            className="z-[55] max-h-[min(24rem,calc(100dvh-16px))] overflow-y-auto rounded-xl border border-borde bg-white p-1.5 shadow-xl"
          >
            {filas(false)}
          </div>,
          document.body,
        )}
    </>
  );
}
