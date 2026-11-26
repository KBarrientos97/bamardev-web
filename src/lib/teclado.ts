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

/** La parte de la ventana que se ve con el teclado abierto, en px desde arriba de la ventana. */
export type AreaVisible = { arriba: number; alto: number };

/**
 * Lo que se ve de verdad con el teclado de la pantalla abierto (null si está
 * cerrado), para una hoja que tiene que ocupar justo eso.
 *
 * En Chrome de Android el teclado no achica la página: achica sólo la parte
 * visible (`visualViewport`) y, al enfocar un campo, la CORRE hacia abajo
 * (`offsetTop > 0`). Una hoja `fixed` con el borde de abajo encima del teclado
 * (`useAltoTeclado`) dejaba su cabecera arriba, fuera de la vista, y como lo de
 * adentro no deja pasar el arrastre (`overscroll-contain`), no había forma de
 * volver a subir sin cerrar el teclado (Kevin, 26-nov, la hoja «Semana 5»).
 *
 * null también sin `visualViewport` (la PC, las pruebas), con zoom (la parte
 * visible es la lupa, no el teclado) y con menos de 80 px tapados (la barra
 * del navegador que aparece y se va). Se mide a lo sumo una vez por cuadro y
 * sólo cambia el estado si cambió el número: el teclado avisa muchas veces
 * mientras sube.
 *
 * `useAltoTeclado` sigue como está: lo usan el `Modal` de todo el sistema y la
 * hoja de la mesa, que sólo necesitan el borde de abajo.
 */
export function useAreaVisible(activo = true): AreaVisible | null {
  const [area, setArea] = useState<AreaVisible | null>(null);
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!activo || !vv) return;
    let cuadro = 0;
    const medir = () => {
      cuadro = 0;
      const conTeclado = vv.scale <= 1.01 && window.innerHeight - vv.height > 80;
      const nueva = conTeclado ? { arriba: Math.round(vv.offsetTop), alto: Math.round(vv.height) } : null;
      setArea((a) => (a?.arriba === nueva?.arriba && a?.alto === nueva?.alto ? a : nueva));
    };
    const pedir = () => {
      if (!cuadro) cuadro = window.requestAnimationFrame(medir);
    };
    medir();
    vv.addEventListener("resize", pedir);
    vv.addEventListener("scroll", pedir);
    return () => {
      vv.removeEventListener("resize", pedir);
      vv.removeEventListener("scroll", pedir);
      if (cuadro) window.cancelAnimationFrame(cuadro);
    };
  }, [activo]);
  // Apagado, nada (lo medido antes de apagarlo ya no vale).
  return activo ? area : null;
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
