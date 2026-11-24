import { useEffect, useRef } from "react";

/**
 * Los atajos de teclado de la evaluación de pacientes. La regla es la del
 * tablero del billar y el despacho: una letra sola («/») no se dispara
 * mientras se escribe en un campo, y nada se dispara por debajo de un diálogo
 * abierto (la tecla es de él). Los que llevan Alt o Ctrl valen también
 * escribiendo: no tapan ninguna letra.
 */

/** ¿El foco está en algo donde se escribe? */
export function escribiendo(objetivo: EventTarget | null): boolean {
  const el = objetivo as HTMLElement | null;
  if (!el || !el.tagName) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true;
  if (el.tagName !== "INPUT") return false;
  const tipo = (el as HTMLInputElement).type;
  return !["button", "checkbox", "radio", "submit", "reset"].includes(tipo);
}

/** ¿Hay un diálogo abierto encima de la pantalla? */
export function hayDialogoAbierto(): boolean {
  return typeof document !== "undefined" && document.querySelector('[role="dialog"][aria-modal="true"]') !== null;
}

/** Alt + la letra (por la tecla física: en un Mac, Option+N escribe «˜»). */
export const conAlt = (e: KeyboardEvent, letra: string) =>
  e.altKey && !e.ctrlKey && !e.metaKey && (e.code === `Key${letra.toUpperCase()}` || e.key.toLowerCase() === letra.toLowerCase());

/** Alt + un número de la fila de arriba (o del teclado numérico). */
export function altNumero(e: KeyboardEvent): number | null {
  if (!e.altKey || e.ctrlKey || e.metaKey) return null;
  const m = /^(?:Digit|Numpad)(\d)$/.exec(e.code) ?? /^(\d)$/.exec(e.key);
  return m ? Number(m[1]) : null;
}

/** Ctrl+Enter (o ⌘+Enter). */
export const ctrlEnter = (e: { key: string; ctrlKey: boolean; metaKey: boolean }) => e.key === "Enter" && (e.ctrlKey || e.metaKey);

/**
 * Escucha las teclas de la pantalla mientras está montada. El manejador se lee
 * de una ref: puede ser una función en línea sin volver a registrar nada.
 */
export function useTeclas(manejar: (e: KeyboardEvent) => void, activo = true) {
  const ref = useRef(manejar);
  ref.current = manejar;
  useEffect(() => {
    if (!activo) return;
    const alTecla = (e: KeyboardEvent) => ref.current(e);
    document.addEventListener("keydown", alTecla);
    return () => document.removeEventListener("keydown", alTecla);
  }, [activo]);
}

/**
 * «Enter pasa al siguiente» en un campo de una línea (§4.2): busca el próximo
 * campo habilitado dentro del contenedor, de escribir (una casilla no: del
 * peso de la semana iba a «No se aplicó» y en la tablet se cerraba el
 * teclado). Devuelve true si movió el foco.
 */
export function pasarAlSiguiente(contenedor: HTMLElement | null, desde: HTMLElement): boolean {
  if (!contenedor) return false;
  // Sólo se dibuja la etapa abierta: no hay campos escondidos que saltear.
  const campos = Array.from(
    contenedor.querySelectorAll<HTMLElement>(
      "input:not([disabled]):not([type=hidden]):not([type=button]):not([type=checkbox]):not([type=radio]), select:not([disabled]), textarea:not([disabled])",
    ),
  );
  const i = campos.indexOf(desde);
  const siguiente = i >= 0 ? campos[i + 1] : undefined;
  if (!siguiente) return false;
  siguiente.focus();
  return true;
}
