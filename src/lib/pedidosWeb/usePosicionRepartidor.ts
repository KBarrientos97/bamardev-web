import { useEffect, useRef, useState } from "react";
import { apiPedidosWeb } from "./apiPrivada";

/** Como máximo una posición cada 15 s por entrega (el backend tolera 1 cada 5 s: ahorra datos y batería). */
export const CADA_POSICION_MS = 15_000;

/**
 * El repartidor comparte dónde está con el cliente (pedidos web, 13-nov): con
 * un pedido web EN CAMINO (ya tocó «Ya salí del local») y la pantalla abierta,
 * se manda la posición con `watchPosition`. Se apaga solo cuando no queda
 * ninguna entrega en camino o la pantalla se cierra. Sólo se guarda la última
 * posición en el servidor: sin historial.
 *
 * @param ventaIds las entregas en camino (con `pedidoWeb.salioEn`).
 */
export function usePosicionRepartidor(ventaIds: number[]): { compartiendo: boolean; falla: string } {
  const [estado, setEstado] = useState({ compartiendo: false, falla: "" });
  const ultimoEnvio = useRef(0);
  const clave = [...ventaIds].sort((a, b) => a - b).join(",");

  useEffect(() => {
    if (!clave) {
      setEstado({ compartiendo: false, falla: "" });
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setEstado({ compartiendo: false, falla: "Este celular no da la ubicación: el cliente no va a ver la moto." });
      return;
    }
    const ids = clave.split(",").map(Number);
    ultimoEnvio.current = 0;
    setEstado({ compartiendo: true, falla: "" });
    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        const ahora = Date.now();
        if (ahora - ultimoEnvio.current < CADA_POSICION_MS) return;
        ultimoEnvio.current = ahora;
        setEstado({ compartiendo: true, falla: "" });
        for (const id of ids) {
          // Un envío que no llega no frena nada: el próximo (a los 15 s) lo reemplaza.
          apiPedidosWeb.posicion(id, pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy).catch(() => undefined);
        }
      },
      (e) =>
        setEstado({
          compartiendo: false,
          falla:
            e.code === 1
              ? "Activá el permiso de ubicación del navegador para que el cliente vea dónde vas."
              : "No pudimos leer tu ubicación. Revisá que el GPS esté prendido.",
        }),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [clave]);

  return estado;
}
