import { useEffect, useState } from "react";
import { esAndroid, esIOS, navegadorIOS, type NavegadorIOS } from "./entorno";
import { marcarOfrecida, usePwa, yaSeOfrecio, type EstadoPwa } from "./pwa";

/**
 * Qué guía de instalar le toca a este equipo (la dibuja
 * components/InstalarApp.tsx) y cuándo ofrecerla sola.
 */

export interface Equipo {
  userAgent: string;
  maxTouchPoints: number;
}

export const equipoActual = (): Equipo => ({
  userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
  maxTouchPoints: typeof navigator !== "undefined" ? navigator.maxTouchPoints ?? 0 : 0,
});

/** Qué guía mostrar en este equipo. */
export type Guia =
  | { tipo: "instalada" }
  | { tipo: "boton" }
  | { tipo: "ios"; navegador: NavegadorIOS }
  | { tipo: "android" }
  | { tipo: "ninguna" };

export function guiaPara(estado: Pick<EstadoPwa, "instalada" | "instalable">, equipo: Equipo): Guia {
  if (estado.instalada) return { tipo: "instalada" };
  if (estado.instalable) return { tipo: "boton" };
  if (esIOS(equipo.userAgent, equipo.maxTouchPoints)) {
    return { tipo: "ios", navegador: navegadorIOS(equipo.userAgent) };
  }
  // Chrome todavía no avisó (o es otro navegador): se instala desde su menú.
  if (esAndroid(equipo.userAgent)) return { tipo: "android" };
  // En la computadora se usa desde el navegador y no hace falta ofrecer nada.
  return { tipo: "ninguna" };
}

/** ¿Va la opción en el menú? Sólo si hay algo que hacer en este equipo. */
export function useInstalarDisponible(): boolean {
  const estado = usePwa();
  const guia = guiaPara(estado, equipoActual());
  return guia.tipo !== "instalada" && guia.tipo !== "ninguna";
}

/**
 * La guía se abre sola una vez por equipo, en el celular o la tablet, un rato
 * después de entrar. Devuelve si hay que mostrarla ahora.
 */
export function useOfrecerInstalarUnaVez(): [boolean, () => void] {
  const estado = usePwa();
  const guia = guiaPara(estado, equipoActual());
  const [abierta, setAbierta] = useState(false);
  const corresponde = (guia.tipo === "ios" || guia.tipo === "android" || guia.tipo === "boton") && !yaSeOfrecio();
  const esMovil = (() => {
    const { userAgent, maxTouchPoints } = equipoActual();
    return esIOS(userAgent, maxTouchPoints) || esAndroid(userAgent);
  })();

  useEffect(() => {
    if (!corresponde || !esMovil) return;
    // Que primero se vea la pantalla a la que entró: la guía llega después.
    const t = setTimeout(() => {
      marcarOfrecida();
      setAbierta(true);
    }, 2500);
    return () => clearTimeout(t);
  }, [corresponde, esMovil]);

  return [abierta, () => setAbierta(false)];
}
