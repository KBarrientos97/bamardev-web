import { useEffect, useState } from "react";
import type { Ubicacion } from "../../lib/mapa";

/** El color del negocio para el pin del cliente (el mapa pinta con estilos en línea, no con clases). */
export function colorDelNegocio(): string {
  if (typeof document === "undefined") return "#047857";
  const v = getComputedStyle(document.documentElement).getPropertyValue("--color-primary-boton").trim();
  return v || "#047857";
}

/** En qué anda la posición propia: todavía sin pedir, mirándose, o el navegador dijo que no. */
export type EstadoPosicionPropia = "sin-pedir" | "activa" | "negada" | "sin-gps";

/**
 * Dónde está el repartidor, SÓLO para dibujarlo en su propio mapa: no se manda
 * a ningún lado (lo que ve el cliente es `usePosicionRepartidor`, y sólo
 * después de «Ya salí»). Se suelta al cerrar el mapa.
 *
 * Abrir un pedido no le salta con el cartel del permiso: si ya lo dio, se usa
 * solo; si no, el mapa ofrece «Verme en el mapa» y se pide recién al tocarlo
 * (un toque a propósito, como piden los navegadores). Negado, se dice cómo
 * activarlo.
 */
export function usePosicionPropia(): { posicion: Ubicacion | null; estado: EstadoPosicionPropia; pedir: () => void } {
  const [posicion, setPosicion] = useState<Ubicacion | null>(null);
  const [estado, setEstado] = useState<EstadoPosicionPropia>(() =>
    typeof navigator === "undefined" || !navigator.geolocation ? "sin-gps" : "sin-pedir",
  );
  const [pedida, setPedida] = useState(false);

  // ¿Ya dio el permiso antes? Entonces se usa sin preguntar nada.
  useEffect(() => {
    const permisos = typeof navigator !== "undefined" ? navigator.permissions : undefined;
    if (!permisos?.query) return;
    let vivo = true;
    permisos
      .query({ name: "geolocation" as PermissionName })
      .then((p) => {
        if (!vivo) return;
        if (p.state === "granted") setPedida(true);
        else if (p.state === "denied") setEstado("negada");
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    if (!pedida || typeof navigator === "undefined" || !navigator.geolocation) return;
    const watch = navigator.geolocation.watchPosition(
      (p) => {
        setPosicion({ lat: p.coords.latitude, lng: p.coords.longitude });
        setEstado("activa");
      },
      (e) => setEstado(e.code === 1 ? "negada" : "activa"),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [pedida]);

  return { posicion, estado, pedir: () => setPedida(true) };
}
