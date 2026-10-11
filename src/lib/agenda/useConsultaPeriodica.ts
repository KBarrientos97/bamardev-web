import { useCallback, useEffect, useRef, useState } from "react";

/** Cada cuánto se vuelve a pedir la agenda con la pantalla abierta (§9.1: 30-60 s). */
export const REFRESCO_AGENDA_MS = 45_000;

interface Estado<T> {
  datos: T | null;
  cargando: boolean;
  error: string;
}

/**
 * Como `useApi`, pero se vuelve a consultar sola mientras la pantalla está
 * abierta: no hay websockets (PLAN-AGENDA-BELLEZA §9.1), y una recepción que
 * mira la agenda tiene que ver la cita que agendó la otra PC sin tocar F5.
 *
 * Diferencias con `useApi`, a propósito:
 *  - El refresco es silencioso: no vuelve a "Cargando…" ni borra lo que hay.
 *    Un parpadeo cada 45 s haría perder el lugar a quien está leyendo.
 *  - Si un refresco falla se quedan los datos de antes con el error al lado:
 *    con el wifi del local cortado es mejor ver lo último que una pantalla vacía.
 *  - `pausado` lo frena mientras alguien arrastra una cita o tiene un
 *    formulario abierto: un refresco en el medio movería el piso.
 *  - Con la pestaña oculta no consulta; al volver, consulta en el acto.
 */
export function useConsultaPeriodica<T>(
  fn: () => Promise<T>,
  deps: unknown[],
  opc: { cadaMs?: number; pausado?: boolean } = {},
) {
  const { cadaMs = REFRESCO_AGENDA_MS, pausado = false } = opc;
  const [estado, setEstado] = useState<Estado<T>>({ datos: null, cargando: true, error: "" });
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const peticion = useRef(0);
  const pausadoRef = useRef(pausado);
  pausadoRef.current = pausado;

  const consultar = useCallback((silencioso: boolean) => {
    const mia = ++peticion.current;
    if (!silencioso) setEstado((e) => ({ ...e, cargando: true, error: "" }));
    return fnRef
      .current()
      .then((datos) => {
        if (mia === peticion.current) setEstado({ datos, cargando: false, error: "" });
      })
      .catch((err: unknown) => {
        if (mia !== peticion.current) return;
        const mensaje = err instanceof Error ? err.message : "No se pudo cargar";
        setEstado((e) => ({ datos: silencioso ? e.datos : null, cargando: false, error: mensaje }));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    const vigente = peticion;
    consultar(false);
    const tick = () => {
      if (pausadoRef.current) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      consultar(true);
    };
    const id = setInterval(tick, cadaMs);
    const alVolver = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", alVolver);
      // Invalida la respuesta en vuelo: no se pinta sobre una pantalla que ya
      // pidió otra cosa (o que se cerró).
      vigente.current++;
    };
  }, [consultar, cadaMs]);

  /** Reemplaza los datos en el acto (lo que devolvió una acción). */
  const setDatos = useCallback((cambiar: (previo: T | null) => T | null) => {
    setEstado((e) => ({ ...e, datos: cambiar(e.datos) }));
  }, []);

  return {
    ...estado,
    /** Vuelve a pedir sin pasar por "Cargando…" (después de una acción). */
    refrescar: useCallback(() => consultar(true), [consultar]),
    /** Vuelve a pedir desde cero (el "Reintentar" de un error). */
    recargar: useCallback(() => consultar(false), [consultar]),
    setDatos,
  };
}
