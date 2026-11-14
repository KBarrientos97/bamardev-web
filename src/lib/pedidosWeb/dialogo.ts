import type { KeyboardEvent as TeclaReact } from "react";

/**
 * Las teclas de un diálogo (`role="dialog"`) de la página pública (PW-24):
 * Escape lo cierra y Tab no se escapa hacia el contenido de atrás. Se pone en
 * el `onKeyDown` del propio diálogo; el foco inicial lo decide cada pantalla.
 */
const FOCALIZABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function teclasDeDialogo(e: TeclaReact<HTMLElement>, cerrar: () => void) {
  if (e.key === "Escape") {
    e.stopPropagation();
    cerrar();
    return;
  }
  if (e.key !== "Tab") return;
  const dentro = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(FOCALIZABLE));
  if (!dentro.length) return;
  const primero = dentro[0];
  const ultimo = dentro[dentro.length - 1];
  const activo = document.activeElement;
  if (e.shiftKey && (activo === primero || !e.currentTarget.contains(activo))) {
    e.preventDefault();
    ultimo.focus();
  } else if (!e.shiftKey && (activo === ultimo || !e.currentTarget.contains(activo))) {
    e.preventDefault();
    primero.focus();
  }
}
