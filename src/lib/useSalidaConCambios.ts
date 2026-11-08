import { useEffect, useState, type MouseEvent as EventoMouse } from "react";
import { useNavigate } from "react-router-dom";

/** Adónde iba quien quiso salir con cambios sin guardar. */
export interface Salida {
  ir: () => void;
}

/**
 * Preguntar antes de salir con cambios sin guardar (L7 de las Notas, 28-oct;
 * desde el 08-nov también Pasar lista, que perdía lo marcado sin avisar):
 *
 *  · el navegador pregunta antes de cerrar o recargar (`beforeunload`);
 *  · `alClicEnEnlace`, puesto en `onClickCapture` de un contenedor, frena los
 *    enlaces internos de adentro (volver, la barra del docente) y pregunta;
 *  · `salirSi(ir)` hace lo mismo con lo que no es un enlace (cambiar de módulo,
 *    un ítem del menú "⋯").
 *
 * Con `salida` distinto de null se muestra `ModalSalida`. El menú lateral de la
 * app queda afuera del contenedor y no se intercepta: con BrowserRouter no hay
 * `useBlocker` (límite aceptado en L7).
 */
export function useSalidaConCambios(hayCambios: boolean) {
  const navigate = useNavigate();
  const [salida, setSalida] = useState<Salida | null>(null);

  useEffect(() => {
    if (!hayCambios) return;
    const avisar = (ev: BeforeUnloadEvent) => ev.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [hayCambios]);

  /** Con cambios sin guardar, pregunta antes de ir; sin cambios, va. */
  const salirSi = (ir: () => void) => (hayCambios ? setSalida({ ir }) : ir());

  const alClicEnEnlace = (e: EventoMouse) => {
    if (!hayCambios || e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    const a = (e.target as HTMLElement).closest("a[href]");
    const destino = a?.getAttribute("href");
    if (!a || !destino?.startsWith("/") || a.getAttribute("target") === "_blank") return;
    e.preventDefault();
    setSalida({ ir: () => navigate(destino) });
  };

  return {
    salida,
    salirSi,
    alClicEnEnlace,
    /** "Seguir…": se queda donde está. */
    quedarse: () => setSalida(null),
    /** "Salir sin guardar": va adonde iba y se pierde lo cambiado. */
    salirSinGuardar: () => {
      const ir = salida?.ir;
      setSalida(null);
      ir?.();
    },
    /** "Guardar y salir": va sólo si el guardado salió bien. */
    guardarYSalir: async (guardar: () => Promise<boolean>) => {
      const ir = salida?.ir;
      const ok = await guardar();
      setSalida(null);
      if (ok) ir?.();
    },
  };
}
