import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../../../components/Icon";
import { useAltoTeclado, useCampoALaVista } from "../../../lib/teclado";

/**
 * El marco de las hojas grandes del seguimiento («Semana N», «Iniciar
 * tratamiento»), según la maqueta A del 23-nov: en el teléfono y la tablet,
 * la pantalla entera (cabecera arriba, lo de adentro que se desplaza y el pie
 * fijo con «Cancelar» y «Guardar»); en la PC, un diálogo ancho centrado.
 *
 * Con el teclado de la pantalla abierto, el pie sube por encima de él y el
 * campo que se escribe queda a la vista (`useAltoTeclado`, como el `Modal`).
 * `Esc` cierra (quien la usa decide si pregunta); un clic afuera, no: es un
 * formulario. Va al `<body>`, como el `Modal`.
 */
export default function HojaGrande({
  titulo,
  cabecera,
  lado,
  franja,
  pie,
  children,
  onClose,
  ancha = true,
}: {
  /** El nombre del diálogo para el lector de pantalla («Semana 5»). */
  titulo: string;
  /** El título con lo que lleva debajo (izquierda de la cabecera). */
  cabecera: ReactNode;
  /** Lo de la derecha de la cabecera, antes de la ✕ (la fecha). */
  lado?: ReactNode;
  /** La franja de debajo de la cabecera («La semana pasada…»). */
  franja?: ReactNode;
  pie: ReactNode;
  children: ReactNode;
  onClose: () => void;
  /** En la PC, el diálogo de 1000 px (dos columnas); si no, uno de 720 px. */
  ancha?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const teclado = useAltoTeclado(true);
  useCampoALaVista(panel, true);

  useEffect(() => {
    const alTecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", alTecla);
    return () => document.removeEventListener("keydown", alTecla);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex lg:items-center lg:justify-center lg:p-6" style={teclado ? { bottom: teclado } : undefined}>
      <div aria-hidden="true" className="absolute inset-0 hidden bg-slate-900/45 animate-[velo-aparece_.2s_ease-out] motion-reduce:animate-none lg:block" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        // `overflow-clip` y no `hidden`: un `scrollIntoView` (el foco en un campo,
        // «Anotar pago») corría el marco entero y la cabecera quedaba cortada arriba.
        className={`relative flex h-full w-full flex-col overflow-clip bg-white text-texto max-lg:animate-[hoja-sube_.3s_cubic-bezier(0.32,0.72,0,1)] motion-reduce:animate-none lg:h-auto lg:max-h-[min(94dvh,920px)] lg:rounded-[20px] lg:shadow-[0_24px_60px_rgba(15,23,42,0.35)] ${
          ancha ? "lg:max-w-[1000px]" : "lg:max-w-[720px]"
        }`}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-borde px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:items-center sm:gap-4 sm:px-6 sm:py-[18px] lg:py-4">
          <div className="min-w-0 flex-1">{cabecera}</div>
          <div className="flex shrink-0 items-center gap-2">
            {lado}
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-borde-soft text-texto transition-colors hover:bg-slate-200 sm:h-12 sm:w-12 lg:h-11 lg:w-11 lg:rounded-xl"
            >
              <Icon name="close" size={21} />
            </button>
          </div>
        </header>
        {franja}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
        <footer className="shrink-0 border-t border-borde bg-white px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:pt-3.5 sm:pb-[max(0.875rem,env(safe-area-inset-bottom))]">
          {pie}
        </footer>
      </div>
    </div>,
    document.body,
  );
}
