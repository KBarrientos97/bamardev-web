import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { usePwa } from "./pwa";
import { VERSION_APP, versionDelServidor } from "./version";

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
  const { versionNueva, atascada } = usePwa();
  const anterior = useRef(pathname);

  useEffect(() => {
    if (anterior.current === pathname) return;
    anterior.current = pathname;
    if (versionNueva) recarga.ahora();
    // Sin red no se limpia nada: se daría de baja el service worker y se
    // borraría lo guardado justo cuando no hay de dónde bajarlo otra vez, y
    // quien cobra sin internet se quedaría con la app inservible. En el
    // próximo cambio de pantalla con red, `atascada` sigue en pie y se hace.
    else if (atascada && navigator.onLine !== false) void recarga.limpiandoTodo();
  }, [pathname, versionNueva, atascada]);
}

/**
 * Las recargas, en un objeto para que los tests las puedan espiar (jsdom no
 * recarga). `limpiandoTodo` es la salida cuando el service worker no trae la
 * versión nueva (`atascada`): se lo da de baja y se borra lo guardado, así la
 * recarga baja todo del servidor y el SW nuevo se instala solo después.
 */
export const recarga = {
  ahora: () => window.location.reload(),
  limpiandoTodo: async () => {
    try {
      const registros = (await navigator.serviceWorker?.getRegistrations()) ?? [];
      await Promise.all(registros.map((r) => r.unregister()));
      const claves = (await globalThis.caches?.keys()) ?? [];
      await Promise.all(claves.map((c) => caches.delete(c)));
    } finally {
      window.location.reload();
    }
  },
};

/** Para montar en la raíz de la app, dentro del router. */
export function ActualizarAlNavegar() {
  useActualizarAlNavegar();
  return null;
}

/** La versión publicada por la que ya se recargó en esta pestaña. */
const CLAVE_RECARGA = "bamardev.pwa.recargoPor";

/**
 * Para las pantallas que no tienen nada que cortar ("Tu cuenta no tiene
 * secciones"): si el servidor publica otra versión, se recarga ya, limpiando
 * lo guardado, sin esperar a un cambio de pantalla que ahí nunca llega.
 *
 * Pasó el 31-oct: el acceso de despacho salió el 29 y un navegador que tenía
 * guardada la app del 27 no lo conocía, así que lo mandaba a "sin secciones"
 * aunque con la versión publicada entraba directo a Despacho. Una sola vez
 * por versión: si lo que baja no coincide con lo que el servidor anuncia,
 * no entra en un bucle de recargas.
 */
export function useRecargarSiQuedoVieja(
  servidor: () => Promise<string | null> = versionDelServidor,
  version: string = VERSION_APP,
) {
  useEffect(() => {
    // En desarrollo y en los tests no hay versión publicada con qué comparar.
    if (version === "dev") return;
    let vivo = true;
    void servidor().then((publicada) => {
      if (!vivo || !publicada || publicada === version || navigator.onLine === false) return;
      try {
        if (sessionStorage.getItem(CLAVE_RECARGA) === publicada) return;
        sessionStorage.setItem(CLAVE_RECARGA, publicada);
      } catch {
        // Sin almacenamiento no hay cómo frenar un bucle: mejor no recargar.
        return;
      }
      void recarga.limpiandoTodo();
    });
    return () => {
      vivo = false;
    };
  }, [servidor, version]);
}
