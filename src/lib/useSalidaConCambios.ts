import { useEffect, useState, type MouseEvent as EventoMouse } from "react";
import { useNavigate } from "react-router-dom";
import { useAtrasConCambios } from "./useAtrasConCambios";
import { useAvisoAlCerrar } from "./useAvisoAlCerrar";

/** Adónde iba quien quiso salir con cambios sin guardar. */
export interface Salida {
  ir: () => void;
}

/**
 * El enlace interno que se tocó con un clic común (botón izquierdo, sin
 * teclas, a una dirección de la app que no abre otra pestaña), o null.
 */
function enlaceDelClic(e: MouseEvent | EventoMouse): { a: Element; destino: string } | null {
  if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return null;
  const a = e.target instanceof Element ? e.target.closest("a[href]") : null;
  const destino = a?.getAttribute("href");
  if (!a || !destino?.startsWith("/") || a.getAttribute("target") === "_blank") return null;
  return { a, destino };
}

/**
 * Preguntar antes de salir con cambios sin guardar (L7 de las Notas, 28-oct;
 * desde el 08-nov también Pasar lista, que perdía lo marcado sin avisar):
 *
 *  · el navegador pregunta antes de cerrar o recargar (`useAvisoAlCerrar`);
 *  · `alClicEnEnlace`, puesto en `onClickCapture` de un contenedor, frena los
 *    enlaces internos de adentro (volver, la barra del docente) y pregunta;
 *  · `salirSi(ir)` hace lo mismo con lo que no es un enlace (cambiar de módulo,
 *    un ítem del menú "⋯").
 *
 * Con `salida` distinto de null se muestra `ModalSalida`.
 *
 * Sin opciones, el menú lateral y el botón atrás del navegador no preguntan
 * (con BrowserRouter no hay `useBlocker`; límite aceptado en L7 para las Notas
 * y Pasar lista). Con `todaLaApp` (la evaluación de nutrición, 23-nov) también
 * preguntan:
 *
 *  · un clic en CUALQUIER enlace interno de la app (el menú lateral, el cajón
 *    del celular) se frena en el documento, en fase de captura, antes de que
 *    lo vea el `<Link>`; el clic sigue su camino (el cajón se cierra igual);
 *  · el atrás y el adelante del navegador, con `useAtrasConCambios`.
 *
 * Lo que la pantalla navega por su cuenta con `navigate()` no se frena: eso lo
 * decide ella (con `salirSi` si hace falta).
 */
export function useSalidaConCambios(hayCambios: boolean, opciones: { todaLaApp?: boolean } = {}) {
  const navigate = useNavigate();
  const [salida, setSalida] = useState<Salida | null>(null);
  const todaLaApp = opciones.todaLaApp === true;

  useAvisoAlCerrar(hayCambios);
  useAtrasConCambios(todaLaApp && hayCambios, (irIgual) => setSalida({ ir: irIgual }));

  useEffect(() => {
    if (!todaLaApp || !hayCambios) return;
    const alClic = (e: MouseEvent) => {
      const enlace = enlaceDelClic(e);
      if (!enlace || enlace.a.hasAttribute("download")) return;
      e.preventDefault();
      const { destino } = enlace;
      setSalida({ ir: () => navigate(destino) });
    };
    document.addEventListener("click", alClic, true);
    return () => document.removeEventListener("click", alClic, true);
  }, [todaLaApp, hayCambios, navigate]);

  /** Con cambios sin guardar, pregunta antes de ir; sin cambios, va. */
  const salirSi = (ir: () => void) => (hayCambios ? setSalida({ ir }) : ir());

  const alClicEnEnlace = (e: EventoMouse) => {
    if (!hayCambios) return;
    const enlace = enlaceDelClic(e);
    if (!enlace) return;
    e.preventDefault();
    setSalida({ ir: () => navigate(enlace.destino) });
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
