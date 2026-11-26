import { esCelular } from "../compartirTicket";

/**
 * El foco en el teléfono y la tablet (nutrición, 26-nov-2026).
 *
 * En la PC, que un campo tome el foco solo es un atajo: se entra al
 * Seguimiento y ya se puede escribir el carnet. En el teléfono y la tablet el
 * mismo foco abre el teclado de la pantalla, que tapa la mitad de lo que se
 * venía a mirar («cada vez que ingreso se abre el teclado, es molestoso»).
 *
 * La regla, para todas las pantallas de nutrición:
 *  - Con teclado de verdad (PC), todo como siempre.
 *  - Con el dedo, el teclado aparece sólo cuando la persona toca un campo, pasa
 *    al siguiente con Enter / «Siguiente», o toca un botón cuyo único fin es
 *    empezar a escribir en un campo que recién aparece («Agregar una nota»,
 *    «+ Agregar», «Otra»). Nunca al entrar a una pantalla, al abrir una hoja o
 *    un diálogo, al tildar una opción, al volver de otro diálogo ni al marcar
 *    un error: ahí el campo sólo queda a la vista.
 */

/**
 * El teléfono o la tablet. `esCelular` no alcanza: la tablet Android (y el
 * iPad) no se dicen «mobile». Una pantalla sólo táctil, sin mouse, también
 * cuenta; una notebook con pantalla táctil, no (tiene mouse y teclado).
 */
export function conDedo(): boolean {
  if (esCelular()) return true;
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(hover: none) and (pointer: coarse)").matches;
}

/** ¿Un campo puede tomar el foco solo? Sólo donde hay teclado de verdad. Para `autoFocus={enfocaSolo()}`. */
export function enfocaSolo(): boolean {
  return !conDedo();
}

/**
 * El foco que la pantalla pone por su cuenta (al abrir una hoja en un campo
 * dado, al marcar un error): en la PC, `focus()`; con el dedo, el campo queda
 * a la vista y nada más (el teclado no sube).
 */
export function enfocarOMostrar(el: HTMLElement | null | undefined, { seleccionar = false }: { seleccionar?: boolean } = {}): void {
  if (!el) return;
  if (conDedo()) {
    el.scrollIntoView?.({ block: "center" });
    return;
  }
  el.focus();
  if (seleccionar && el instanceof HTMLInputElement) el.select();
}
