import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../../../lib/api";
import { useAuth } from "../../../store/AuthContext";
import { apiSupervisionFarmacia, type SupervisionFarmacia } from "./api";

/** Cada cuánto se vuelve a mirar lo que hace la auxiliar (como el billar). */
const CADA_MS = 5_000;
/** Cada cuánto late el "actualizado hace N s" y lo que depende de la hora. */
const LATIDO_MS = 1_000;
const CLAVE_SUCURSAL = "farmacia.supervision.sucursal";

/** La sucursal que el dueño eligió mirar en este equipo (por negocio: un dueño con dos negocios no mezcla). */
function sucursalRecordada(alias: string | undefined): number | null {
  if (!alias) return null;
  try {
    const v = localStorage.getItem(`${CLAVE_SUCURSAL}:${alias}`);
    return v ? Number(v) || null : null;
  } catch {
    return null;
  }
}

function recordarSucursal(alias: string | undefined, id: number | null) {
  if (!alias) return;
  try {
    if (id == null) localStorage.removeItem(`${CLAVE_SUCURSAL}:${alias}`);
    else localStorage.setItem(`${CLAVE_SUCURSAL}:${alias}`, String(id));
  } catch {
    // Sin almacenamiento (navegación privada): se elige cada vez, nada más.
  }
}

/**
 * Los datos de la pantalla de Supervisión de la farmacia, siempre al día
 * mientras esté a la vista: trae todo de `/farmacia/supervision` cada 5
 * segundos. Con la pestaña escondida no pregunta, y al volver pregunta
 * enseguida.
 *
 * Es la copia adaptada del hook del billar (`billar/supervision/useSupervision`)
 * sin su tablero: acá no hay mesas ni caja propia que compartir, y la sucursal
 * elegida se recuerda aparte para no pisar la del billar del mismo dueño.
 *
 * El turno que se mira (la caja, de que abre a que cierra) lo decide el
 * servidor: la que trabaja ahora. `turno` sólo es una caja elegida a mano
 * para ver un turno anterior; `null` sigue al de ahora (cuando abren otra
 * caja, la pantalla pasa sola a la nueva).
 */
export function useSupervision() {
  const { negocio } = useAuth();
  const alias = negocio?.alias;
  const [sucursal, setSucursal] = useState<number | null>(() => sucursalRecordada(alias));
  const pedida = useRef(sucursal);
  const [turno, setTurno] = useState<number | null>(null);
  const turnoPedido = useRef<number | null>(null);
  const trayendo = useRef(false);
  /**
   * El número del último pedido: sólo vale la respuesta del más nuevo. Un
   * `recargar()` no espera al sondeo que ya iba en camino, y si ése llegaba
   * después pisaba lo nuevo con lo de antes (la lección del billar, 23-oct).
   */
  const ultimo = useRef(0);
  /**
   * La diferencia entre el reloj del servidor y el de este equipo. "Hace N s"
   * y "lleva 2 h" se cuentan con la hora del servidor: con la compu
   * adelantada unos minutos, una caja recién abierta decía que llevaba
   * "menos de 1 min" negativo y el aviso de olvidada saltaba antes.
   */
  const desfase = useRef(0);
  const [datos, setDatos] = useState<SupervisionFarmacia | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Cuándo llegó lo último, en la hora del servidor (0: nunca). */
  const [llegoEn, setLlegoEn] = useState(0);
  /** La hora del servidor, latiendo cada segundo mientras la pantalla esté a la vista. */
  const [ahora, setAhora] = useState(() => Date.now());

  const traer = useCallback(async (forzar = false) => {
    if (trayendo.current && !forzar) return;
    trayendo.current = true;
    const numero = ++ultimo.current;
    const delLocal = pedida.current;
    const delTurno = turnoPedido.current;
    const pedido = Date.now();
    try {
      const d = await apiSupervisionFarmacia.ver(delLocal, delTurno);
      // Si mientras viajaba el dueño cambió de local o de turno, es lo de otro;
      // si salió otro pedido después, lo de éste ya es viejo.
      if (delLocal !== pedida.current || delTurno !== turnoPedido.current || numero !== ultimo.current) return;
      // La caja elegida ya no está (el servidor mostró otra): se vuelve al turno de ahora.
      if (delTurno != null && d.turno.cajaId !== delTurno) {
        turnoPedido.current = null;
        setTurno(null);
      }
      // Se ignoran los saltos chicos: la latencia de cada vuelta no es desfase.
      const nuevo = d.ahora - (pedido + Date.now()) / 2;
      if (Math.abs(nuevo - desfase.current) > 1_000) desfase.current = nuevo;
      const hora = Date.now() + desfase.current;
      setDatos(d);
      setError(null);
      setLlegoEn(hora);
      setAhora(hora);
    } catch (err) {
      // El error de un pedido que ya no es el último tampoco se muestra.
      if (numero !== ultimo.current) return;
      // El local recordado ya no sirve (lo borraron): se pide el que decide el backend.
      if (delLocal != null && delLocal === pedida.current && err instanceof ApiError && err.status === 400) {
        pedida.current = null;
        setSucursal(null);
        recordarSucursal(alias, null);
        trayendo.current = false;
        await traer(true);
        return;
      }
      setError(err instanceof Error && err.message ? err.message : "No se pudo traer lo que pasa en la farmacia");
    } finally {
      trayendo.current = false;
    }
  }, [alias]);

  useEffect(() => {
    void traer();
    const sondeo = setInterval(() => {
      if (!document.hidden) void traer();
    }, CADA_MS);
    const latido = setInterval(() => {
      if (!document.hidden) setAhora(Date.now() + desfase.current);
    }, LATIDO_MS);
    const alVolver = () => {
      if (!document.hidden) void traer();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      clearInterval(sondeo);
      clearInterval(latido);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [traer]);

  /** El dueño con varios locales elige cuál mirar; se recuerda en este equipo. */
  const elegirSucursal = useCallback(
    (id: number) => {
      if (id === pedida.current) return;
      pedida.current = id;
      setSucursal(id);
      recordarSucursal(alias, id);
      // Las cajas de un local no son las de otro: se vuelve al turno de ahora
      // y lo del local anterior se vacía en el acto (si no, por un momento se
      // veían sus ventas bajo el nombre del nuevo).
      turnoPedido.current = null;
      setTurno(null);
      setDatos(null);
      void traer(true);
    },
    [alias, traer],
  );

  /** Mirar el turno de una caja (`null`: el de ahora, que sigue solo a la caja que abra). */
  const elegirTurno = useCallback(
    (id: number | null) => {
      if (id === turnoPedido.current) return;
      turnoPedido.current = id;
      setTurno(id);
      void traer(true);
    },
    [traer],
  );

  return { datos, error, llegoEn, ahora, sucursal, elegirSucursal, turno, elegirTurno, recargar: () => traer(true) };
}
