import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../../../lib/api";
import { useAuth } from "../../../store/AuthContext";
import { apiBillar, type SupervisionApi } from "../api";
import { fijarDesfase } from "../reloj";
import { billar, usarNegocio } from "../store";

/** Cada cuánto se vuelve a mirar lo que hace la cajera (como el tablero). */
const CADA_MS = 5_000;

/**
 * Los datos de la pantalla de Supervisión, siempre al día mientras esté a la
 * vista: trae todo de `/billar/supervision` cada 5 segundos. Con la pestaña
 * escondida no pregunta, y al volver pregunta enseguida.
 *
 * Tiene su propia copia y no toca el estado del tablero: quien sólo
 * supervisa (el encargado sin `billar.operar`) no puede pedirlo, y lo que ve
 * el administrador acá no tiene por qué mover lo de una caja. Lo único
 * compartido es el local elegido (el dueño con varios locales) y la hora del
 * servidor.
 */
export function useSupervision() {
  const { negocio } = useAuth();
  // Antes de leer el local que recordaba este equipo (lo mismo que el tablero).
  usarNegocio(negocio?.alias);
  const [sucursal, setSucursal] = useState<number | null>(() => billar.sucursalElegida());
  const pedida = useRef(sucursal);
  const trayendo = useRef(false);
  const [datos, setDatos] = useState<SupervisionApi | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Cuándo llegó lo último, en la hora de este equipo (0: nunca). */
  const [llegoEn, setLlegoEn] = useState(0);

  const traer = useCallback(async (forzar = false) => {
    if (trayendo.current && !forzar) return;
    trayendo.current = true;
    const delLocal = pedida.current;
    const pedido = Date.now();
    try {
      const d = await apiBillar.supervision(delLocal);
      // Si mientras viajaba el dueño cambió de local, es lo de otro salón.
      if (delLocal !== pedida.current) return;
      fijarDesfase(d.ahora - (pedido + Date.now()) / 2);
      setDatos(d);
      setError(null);
      setLlegoEn(Date.now());
    } catch (err) {
      // El local recordado ya no sirve (lo borraron): se pide el que decide el backend.
      if (delLocal != null && delLocal === pedida.current && err instanceof ApiError && err.status === 400) {
        pedida.current = null;
        setSucursal(null);
        billar.elegirSucursal(null);
        trayendo.current = false;
        await traer(true);
        return;
      }
      setError(err instanceof Error && err.message ? err.message : "No se pudo traer lo que pasa en el billar");
    } finally {
      trayendo.current = false;
    }
  }, []);

  useEffect(() => {
    void traer();
    const reloj = setInterval(() => {
      if (!document.hidden) void traer();
    }, CADA_MS);
    const alVolver = () => {
      if (!document.hidden) void traer();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      clearInterval(reloj);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [traer]);

  /** El dueño con varios locales elige cuál mirar: vale para todo el billar de este equipo. */
  const elegirSucursal = useCallback(
    (id: number) => {
      if (id === pedida.current) return;
      pedida.current = id;
      setSucursal(id);
      setDatos(null);
      billar.elegirSucursal(id);
      void traer(true);
    },
    [traer],
  );

  return { datos, error, llegoEn, sucursal, elegirSucursal, recargar: () => traer(true) };
}
