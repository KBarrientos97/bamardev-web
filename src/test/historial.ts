import { act } from "@testing-library/react";
import { vi } from "vitest";
import { instalarGuardiaDelAtras } from "../lib/useAtrasConCambios";

/**
 * El historial del navegador para probar `useAtrasConCambios` en jsdom: la
 * entrada donde está el formulario con su `idx` (como la deja react-router),
 * `history.go` espiado (no viaja: el `popstate` se manda a mano, como llega en
 * el navegador) y un oyente en `window` que hace de router.
 *
 * Como en la app: la guardia se instala primero (main.tsx) y el router
 * después. El router va CON captura a propósito: jsdom pone primero los de
 * captura en el destino y Chrome no (corren en el orden en que se
 * registraron); así, acá también manda el orden y la prueba no pasa por suerte.
 */
export function historialDePrueba(idx = 5) {
  instalarGuardiaDelAtras();
  window.history.replaceState({ idx }, "");
  const go = vi.spyOn(window.history, "go").mockImplementation(() => {});
  const router = vi.fn();
  window.addEventListener("popstate", router, true);
  return {
    go,
    router,
    /** Llega el `popstate` de un viaje a la entrada `a` (null = una entrada sin `idx`). */
    viajar: (a: number | null) =>
      act(() => {
        window.dispatchEvent(new PopStateEvent("popstate", { state: a == null ? null : { idx: a } }));
      }),
    limpiar: () => {
      window.removeEventListener("popstate", router, true);
      go.mockRestore();
      window.history.replaceState(null, "");
    },
  };
}

/** ¿El navegador preguntaría antes de cerrar o recargar la pestaña? */
export function avisaAlCerrar(): boolean {
  const ev = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(ev);
  return ev.defaultPrevented;
}
