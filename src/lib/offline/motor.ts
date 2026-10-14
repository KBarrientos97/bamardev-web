import { useEffect } from "react";
import { api } from "../api";
import { useCupo } from "../../store/useCupo";
import type { Venta } from "../../types";
import { cargarCola, porSubir, sincronizar, type ResultadoSync } from "./cola";
import { ventaSinInternet } from "./modo";

/**
 * Cuándo se sube la cola (PLAN-IOS F3). Android tiene WorkManager y sube
 * aunque la app esté cerrada; en iPhone no hay sincronización en segundo
 * plano (Safari no tiene Background Sync), así que se sube con la app
 * abierta, en los mismos momentos que Android usa en primer plano:
 *
 *  - al abrir la app (`SyncTrigger.start`);
 *  - al volver la red, a los 0, 5, 15 y 40 s (`SyncTrigger`);
 *  - al volver a la app desde otra (el iPhone la congela en segundo plano);
 *  - cada 30 s mientras queden pendientes;
 *  - con el botón "Sincronizar".
 */

let alSubirVenta: ((v: Venta) => void) | undefined;

/** El botón "Sincronizar" y los disparadores pasan por acá. */
export function sincronizarAhora(): Promise<ResultadoSync> {
  return sincronizar((c) => api.crearVenta(c), alSubirVenta);
}

const REINTENTOS_AL_VOLVER_LA_RED = [0, 5_000, 15_000, 40_000];
const CADA_MS = 30_000;

/** Va en la cáscara de la app (Layout): un solo motor para todas las pantallas. */
export function useMotorOffline() {
  const { actualizarCupo } = useCupo();

  useEffect(() => {
    // El contador del cupo vuelve a ser el del servidor con cada venta subida.
    alSubirVenta = (v) => {
      if (v.consumo?.cupo) actualizarCupo(v.consumo.cupo);
    };
    return () => {
      alSubirVenta = undefined;
    };
  }, [actualizarCupo]);

  useEffect(() => {
    if (!ventaSinInternet()) return;
    let vivo = true;
    const temporizadores: ReturnType<typeof setTimeout>[] = [];
    const subir = () => {
      if (vivo) void sincronizarAhora().catch(() => {});
    };

    void cargarCola()
      .then(subir)
      .catch(() => {});

    const alVolverLaRed = () => {
      for (const ms of REINTENTOS_AL_VOLVER_LA_RED) {
        temporizadores.push(
          setTimeout(async () => {
            const cola = await cargarCola().catch(() => []);
            if (porSubir(cola).length > 0) subir();
          }, ms),
        );
      }
    };
    const alVolverALaApp = () => {
      if (document.visibilityState === "visible") subir();
    };
    const periodico = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      const cola = await cargarCola().catch(() => []);
      if (porSubir(cola).length > 0) subir();
    }, CADA_MS);

    window.addEventListener("online", alVolverLaRed);
    document.addEventListener("visibilitychange", alVolverALaApp);
    return () => {
      vivo = false;
      clearInterval(periodico);
      temporizadores.forEach(clearTimeout);
      window.removeEventListener("online", alVolverLaRed);
      document.removeEventListener("visibilitychange", alVolverALaApp);
    };
  }, []);
}
