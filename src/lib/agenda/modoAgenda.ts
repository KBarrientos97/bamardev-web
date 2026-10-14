import { useEffect } from "react";
import { useApi } from "../useApi";
import { apiAgenda } from "./apiAgenda";
import type { ModoAgenda, ReglasAgenda } from "./tiposAgenda";

/**
 * El modo de la agenda (IDEAS/7-AGENDA-SIMPLE, propuesta A). Decisión del
 * dueño del 12-oct: SIMPLE por defecto en todos los rubros; el negocio con
 * personal elige COMPLETO en Configuración de la agenda.
 *
 * En SIMPLE la cita nace confirmada y se cierra con "Cobrar" o "No vino": no
 * se muestran Confirmar → Llegó → Atender → Finalizar. Nada se pierde: es
 * sólo pantalla, y el modo completo vuelve con un toque.
 */

/** Sin el dato (backend anterior, reglas que no llegaron) es SIMPLE, como el defecto del backend. */
export function modoDe(reglas: Pick<ReglasAgenda, "modoAgenda"> | null | undefined): ModoAgenda {
  return reglas?.modoAgenda === "COMPLETO" ? "COMPLETO" : "SIMPLE";
}

/**
 * El último modo visto por sucursal, para que la agenda no arranque en un
 * modo y salte al otro cada vez que se entra (las reglas tardan lo que tarda
 * la red). Vive lo que vive la pestaña: la verdad sigue siendo el backend.
 */
const vistos = new Map<string, ModoAgenda>();
const clave = (sucursalId: number | null | undefined) => String(sucursalId ?? "negocio");

/** Al cambiar el modo en Configuración: lo recordado de cada sucursal ya no vale. */
export function olvidarModos() {
  vistos.clear();
}

/**
 * Las reglas de la agenda de una sucursal y su modo. Si no llegan, la agenda
 * funciona igual (granularidad de 15 y modo SIMPLE): no es motivo para no
 * dejar agendar.
 */
export function useReglasAgenda(sucursalId: number | null | undefined, listo = true) {
  const reglas = useApi<ReglasAgenda | null>(
    () =>
      listo
        ? // `Promise.resolve().then`: un mock o un fallo sincrónico también
          // cae en el catch en vez de romper la pantalla.
          Promise.resolve()
            .then(() => apiAgenda.reglas(sucursalId))
            .catch(() => null)
        : new Promise<ReglasAgenda | null>(() => {
            /* espera a saber la sucursal */
          }),
    [sucursalId, listo],
  );
  const cargado = !reglas.cargando;
  const modo: ModoAgenda = cargado ? modoDe(reglas.datos) : (vistos.get(clave(sucursalId)) ?? "SIMPLE");

  useEffect(() => {
    if (cargado) vistos.set(clave(sucursalId), modoDe(reglas.datos));
  }, [cargado, reglas.datos, sucursalId]);

  return {
    reglas: reglas.datos,
    modo,
    simple: modo === "SIMPLE",
    /** ¿Ya se sabe el modo (de la red o de lo recordado)? */
    sabido: cargado || vistos.has(clave(sucursalId)),
  };
}

// ── Vista de la agenda (calendario o lista), recordada por usuario ──────────

export type VistaAgenda = "calendario" | "lista";

const claveVista = (usuarioId: number | null | undefined) => `bamar.agenda.vista.${usuarioId ?? "anon"}`;

/**
 * La vista que eligió este usuario la última vez. En el navegador y nada más:
 * es una comodidad, no un dato. Sin almacenamiento (modo privado, vista
 * previa) arranca en calendario y listo.
 */
export function leerVista(usuarioId: number | null | undefined): VistaAgenda {
  try {
    const v = window.localStorage.getItem(claveVista(usuarioId));
    return v === "lista" ? "lista" : "calendario";
  } catch {
    return "calendario";
  }
}

export function guardarVista(usuarioId: number | null | undefined, vista: VistaAgenda) {
  try {
    window.localStorage.setItem(claveVista(usuarioId), vista);
  } catch {
    /* sin almacenamiento: se elige de nuevo la próxima vez */
  }
}
