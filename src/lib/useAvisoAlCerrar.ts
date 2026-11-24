import { useEffect } from "react";

/**
 * Con cambios sin guardar, el navegador pregunta antes de cerrar la pestaña,
 * recargarla o irse a otra página (`beforeunload`). El texto lo pone el
 * navegador; no se puede cambiar.
 */
export function useAvisoAlCerrar(hayCambios: boolean) {
  useEffect(() => {
    if (!hayCambios) return;
    const avisar = (ev: BeforeUnloadEvent) => ev.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [hayCambios]);
}
