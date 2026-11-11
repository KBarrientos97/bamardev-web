/**
 * Una vibración cortita al tocar sumar o restar, como la respuesta de una app.
 *
 * Sólo la hacen los navegadores que la soportan (Chrome de Android); en el
 * iPhone no existe y no pasa nada. Con "reducir movimiento" no se vibra.
 */
export function vibrarToque(): void {
  try {
    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    navigator.vibrate(8);
  } catch {
    // Algunos navegadores tiran si la página no tuvo un toque todavía.
  }
}
