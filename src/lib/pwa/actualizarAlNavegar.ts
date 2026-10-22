import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { usePwa } from "./pwa";

/**
 * La versión nueva de un deploy se aplica sola al pasar a otra pantalla
 * (dueño, 21-oct): quien cambia de pantalla ya está dejando la que tenía, así
 * que recargar ahí no le corta nada a la mitad, y el carrito del POS vive en
 * `sessionStorage` (sobrevive a la recarga). Así nadie tiene que tocar
 * "Actualizar": en el navegador ese aviso ni sale, y en la app instalada sólo
 * si pasa horas sin moverse de una pantalla (`AvisoVersionNueva`).
 *
 * Sólo cuenta el cambio de pantalla (`pathname`), no el de la búsqueda: un
 * filtro o `?creditos=comprar` no son irse de la pantalla.
 */
export function useActualizarAlNavegar() {
  const { pathname } = useLocation();
  const { versionNueva } = usePwa();
  const anterior = useRef(pathname);

  useEffect(() => {
    if (anterior.current === pathname) return;
    anterior.current = pathname;
    if (versionNueva) recarga.ahora();
  }, [pathname, versionNueva]);
}

/** La recarga, en un objeto para que los tests la puedan espiar (jsdom no recarga). */
export const recarga = { ahora: () => window.location.reload() };

/** Para montar en la raíz de la app, dentro del router. */
export function ActualizarAlNavegar() {
  useActualizarAlNavegar();
  return null;
}
