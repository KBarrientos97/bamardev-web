import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../../../components/Icon";
import { useAreaVisible, useCampoALaVista } from "../../../lib/teclado";

/** Con el teclado abierto, menos de esto de alto visible: la hoja se compacta. */
const ALTO_COMPACTO = 560;

/**
 * El marco de las hojas grandes del seguimiento («Semana N», «Iniciar
 * tratamiento»), según la maqueta A del 23-nov: en el teléfono y la tablet,
 * la pantalla entera (cabecera arriba, lo de adentro que se desplaza y el pie
 * fijo con «Cancelar» y «Guardar»); en la PC, un diálogo ancho centrado.
 *
 * Con el teclado de la pantalla abierto, la hoja ocupa EXACTAMENTE la parte
 * que se ve (`useAreaVisible`), esté donde esté: la cabecera arriba, el pie
 * justo encima del teclado y lo del medio se desplaza entero. Antes el borde
 * de abajo seguía al teclado pero el de arriba se quedaba en 0, y en Android
 * (que corre la parte visible hacia abajo al enfocar) la cabecera quedaba
 * cortada y no se podía volver a subir (Kevin, 26-nov). Si además queda poco
 * alto (un teléfono: ≈380 px), la hoja se compacta: sin la franja, cabecera y
 * pie con menos relleno, botones de 44 px. Lo de adentro se entera por
 * `data-teclado="compacto"` en el panel (`group/hoja`):
 * `group-data-[teclado=compacto]/hoja:hidden` en el renglón secundario de la
 * cabecera, por ejemplo. Al cerrar el teclado, todo vuelve a como era.
 *
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
  /** La franja de debajo de la cabecera («La semana pasada…»); con el teclado abierto y poco alto, no va. */
  franja?: ReactNode;
  pie: ReactNode;
  children: ReactNode;
  onClose: () => void;
  /** En la PC, el diálogo de 1000 px (dos columnas); si no, uno de 720 px. */
  ancha?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const area = useAreaVisible(true);
  const compacta = !!area && area.alto < ALTO_COMPACTO;
  useCampoALaVista(panel, true);

  useEffect(() => {
    const alTecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", alTecla);
    return () => document.removeEventListener("keydown", alTecla);
  }, [onClose]);

  // La hoja cambió de alto (el teclado terminó de subir): el campo que se escribe
  // vuelve al centro. El de `useCampoALaVista` (300 ms después del foco) pudo
  // correr antes de que la hoja se achicara. Sólo con el ALTO: si la parte
  // visible nada más se corre, la hoja va con ella y el campo queda donde estaba;
  // centrarlo ahí puede correr otra vez la parte visible, y eso volvería a
  // llamar a este efecto (un vaivén hasta el tope).
  const alto = area?.alto;
  useEffect(() => {
    if (alto == null) return;
    const el = document.activeElement;
    if (!(el instanceof HTMLElement) || !panel.current?.contains(el) || !el.matches("input, textarea, select")) return;
    el.scrollIntoView?.({ block: "center" });
  }, [alto]);

  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex lg:items-center lg:justify-center ${area ? "lg:p-3" : "lg:p-6"}`}
      style={area ? { top: area.arriba, height: area.alto, bottom: "auto" } : undefined}
    >
      <div aria-hidden="true" className="absolute inset-0 hidden bg-slate-900/45 animate-[velo-aparece_.2s_ease-out] motion-reduce:animate-none lg:block" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        data-teclado={compacta ? "compacto" : area ? "abierto" : undefined}
        // `overflow-clip` y no `hidden`: un `scrollIntoView` (el foco en un campo,
        // «Anotar pago») corría el marco entero y la cabecera quedaba cortada arriba.
        // Con el teclado, el diálogo de la tablet apaisada entra en lo que se ve.
        className={`group/hoja relative flex h-full w-full flex-col overflow-clip bg-white text-texto max-lg:animate-[hoja-sube_.3s_cubic-bezier(0.32,0.72,0,1)] motion-reduce:animate-none lg:h-auto lg:rounded-[20px] lg:shadow-[0_24px_60px_rgba(15,23,42,0.35)] ${
          area ? "lg:max-h-full" : "lg:max-h-[min(94dvh,920px)]"
        } ${ancha ? "lg:max-w-[1000px]" : "lg:max-w-[720px]"}`}
      >
        <header
          className={`flex shrink-0 items-start justify-between gap-3 border-b border-borde px-4 sm:items-center sm:gap-4 sm:px-6 ${
            compacta ? "py-2 sm:py-2" : "pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:py-[18px] lg:py-4"
          }`}
        >
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
        {!compacta && franja}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
        <footer
          className={`shrink-0 border-t border-borde bg-white px-4 sm:px-6 ${
            compacta ? "py-2 sm:py-2" : "pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pt-3.5 sm:pb-[max(0.875rem,env(safe-area-inset-bottom))]"
          }`}
        >
          {pie}
        </footer>
      </div>
    </div>,
    document.body,
  );
}
