import { useEffect, useState } from "react";
import { usePwa } from "../../lib/pwa/pwa";

/**
 * Lo que necesita una página que se queda días abierta en un televisor sin
 * que nadie la toque.
 */

/**
 * Que la pantalla no se apague: una compu enchufada a la TV se suspende a
 * los 10 minutos sin mouse, y el salón queda mirando un protector de
 * pantalla. El navegador suelta el candado al esconder la pestaña; se pide de
 * nuevo al volver. Donde no existe (TVs viejas, Firefox), no hace nada.
 */
export function useMantenerEncendida() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let vivo = true;
    let candado: WakeLockSentinel | null = null;
    const pedir = () => {
      if (document.hidden) return;
      navigator.wakeLock
        .request("screen")
        .then((c) => {
          if (vivo) candado = c;
          else void c.release();
        })
        .catch(() => {
          // Sin permiso (batería baja, política del equipo): la TV anda igual.
        });
    };
    const alVolver = () => {
      if (!document.hidden) pedir();
    };
    pedir();
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      vivo = false;
      document.removeEventListener("visibilitychange", alVolver);
      void candado?.release().catch(() => undefined);
    };
  }, []);
}

/** Cada cuánto se pregunta si hay una versión nueva de la web. */
const BUSCAR_VERSION_MS = 60 * 60_000;

/**
 * Que la TV no se quede con la versión del día que se encendió. La app avisa
 * "hay una versión nueva" y espera a que el cajero recargue (no puede
 * reiniciarse a mitad de un cobro); acá no hay cobro ni nadie que toque, así
 * que recarga sola. Y como un televisor no navega ni cambia de pestaña, que
 * es cuando el navegador busca versiones, se le pregunta al service worker
 * cada hora.
 */
export function useAlDia() {
  const { versionNueva } = usePwa();
  useEffect(() => {
    if (versionNueva) window.location.reload();
  }, [versionNueva]);
  useEffect(() => {
    const sw = typeof navigator !== "undefined" ? navigator.serviceWorker : undefined;
    if (!sw) return;
    const id = setInterval(() => {
      sw.getRegistration()
        .then((r) => r?.update())
        .catch(() => {
          // Sin red no hay versión que buscar: se pregunta la hora que viene.
        });
    }, BUSCAR_VERSION_MS);
    return () => clearInterval(id);
  }, []);
}

/** ¿Se puede pedir pantalla completa, y ya está? El botón se esconde en las dos negativas. */
export function usePantallaCompleta(): { disponible: boolean; activa: boolean; pedir: () => void } {
  const disponible = typeof document !== "undefined" && !!document.fullscreenEnabled;
  const [activa, setActiva] = useState(() => typeof document !== "undefined" && !!document.fullscreenElement);
  useEffect(() => {
    const alCambiar = () => setActiva(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", alCambiar);
    return () => document.removeEventListener("fullscreenchange", alCambiar);
  }, []);
  const pedir = () => {
    void document.documentElement.requestFullscreen?.().catch(() => {
      // El navegador de algunas TVs la niega: queda como está.
    });
  };
  return { disponible, activa, pedir };
}
