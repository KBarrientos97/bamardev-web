import { useEffect, type ReactNode } from "react";
import { useConsultaMedia } from "../lib/agenda/useEsCelular";
import { Icon } from "./Icon";
import { Modal } from "./ui";

/**
 * El detalle de una fila (PLAN-ACADEMIAS §5, versión limpia): tocar la fila
 * abre un panel lateral de 380 px en escritorio, o una hoja inferior en el
 * celular, con el detalle y las acciones. La fila no dibuja todas sus
 * acciones: a lo sumo un enlace ("Cobrar").
 *
 * En escritorio el panel no tapa la lista con un velo: se puede tocar otra
 * fila y el panel cambia (como en el lienzo E3 v2). Escape lo cierra. Quien
 * lo usa le deja lugar a la derecha con `ESPACIO_PANEL` mientras está abierto.
 */
export default function PanelLateral({
  abierto,
  titulo,
  subtitulo,
  onClose,
  children,
  acciones,
}: {
  abierto: boolean;
  titulo: string;
  subtitulo?: string;
  onClose: () => void;
  children: ReactNode;
  /** Abajo, fijas: la acción principal primero y a lo ancho. */
  acciones?: ReactNode;
}) {
  const celular = useConsultaMedia("(max-width: 767px)");

  useEffect(() => {
    if (!abierto || celular) return;
    const alTecla = (e: KeyboardEvent) => {
      // Con un diálogo encima (un motivo, un PIN), Escape es de él.
      if (e.key === "Escape" && !document.querySelector('[role="dialog"][aria-modal="true"]')) onClose();
    };
    document.addEventListener("keydown", alTecla);
    return () => document.removeEventListener("keydown", alTecla);
  }, [abierto, celular, onClose]);

  if (!abierto) return null;

  if (celular) {
    return (
      <Modal
        abierto
        titulo={titulo}
        subtitulo={subtitulo}
        onClose={onClose}
        ancho="max-w-md"
        acciones={acciones ? <div className="flex w-full flex-col gap-2">{acciones}</div> : undefined}
      >
        {children}
      </Modal>
    );
  }

  return (
    <aside
      role="complementary"
      aria-label={titulo}
      className="fixed inset-y-0 right-0 z-30 flex w-[380px] flex-col border-l border-borde bg-white shadow-[-12px_0_32px_rgba(15,23,42,0.06)]"
    >
      <header className="flex items-start justify-between gap-3 border-b border-borde-soft px-6 pb-4 pt-6">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-texto">{titulo}</h2>
          {subtitulo && <p className="mt-0.5 text-[13px] text-texto-3">{subtitulo}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-borde bg-white text-texto-2 transition-colors hover:border-primary-200 hover:bg-muted"
        >
          <Icon name="close" size={18} />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
      {acciones && <div className="flex flex-col gap-2 border-t border-borde-soft bg-muted px-6 py-4">{acciones}</div>}
    </aside>
  );
}
