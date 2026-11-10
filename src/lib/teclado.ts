import { useEffect, useState } from "react";

/**
 * Cuánto tapa el teclado del celular, en px (0 si está cerrado).
 *
 * En el iPhone el teclado no achica la pantalla: tapa lo de abajo, y en una
 * hoja que sube desde abajo eso era el campo que se estaba escribiendo y el
 * botón de guardar (UX nativa, 10-nov). `visualViewport` dice cuánto se ve de
 * verdad; lo que falta hasta el alto de la ventana es el teclado.
 *
 * Menos de 80 px no es un teclado (la barra del navegador que aparece y se
 * va): se ignora para que la hoja no salte.
 */
export function useAltoTeclado(activo = true): number {
  const [alto, setAlto] = useState(0);
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!activo || !vv) return;
    const medir = () => {
      const tapa = window.innerHeight - vv.height - vv.offsetTop;
      setAlto(tapa > 80 ? Math.round(tapa) : 0);
    };
    medir();
    vv.addEventListener("resize", medir);
    vv.addEventListener("scroll", medir);
    return () => {
      vv.removeEventListener("resize", medir);
      vv.removeEventListener("scroll", medir);
    };
  }, [activo]);
  return alto;
}

/**
 * Al enfocar un campo adentro de `contenedor`, lo deja a la vista cuando el
 * teclado termina de subir (tarda unos 250 ms en el iPhone).
 *
 * Sólo en pantallas táctiles: en la compu no sube ningún teclado, y centrar el
 * campo al hacer clic era un salto de la hoja sin motivo (lo usa el `Modal` de
 * todos los formularios del sistema).
 */
export function useCampoALaVista(contenedor: { current: HTMLElement | null }, activo = true) {
  useEffect(() => {
    const c = contenedor.current;
    if (!activo || !c) return;
    if (!window.matchMedia?.("(pointer: coarse)").matches) return;
    let espera = 0;
    const alEnfocar = (e: FocusEvent) => {
      const el = e.target;
      if (!(el instanceof HTMLElement) || !el.matches("input, textarea, select")) return;
      window.clearTimeout(espera);
      espera = window.setTimeout(() => el.scrollIntoView?.({ block: "center", behavior: "smooth" }), 300);
    };
    c.addEventListener("focusin", alEnfocar);
    return () => {
      c.removeEventListener("focusin", alEnfocar);
      window.clearTimeout(espera);
    };
  }, [contenedor, activo]);
}
