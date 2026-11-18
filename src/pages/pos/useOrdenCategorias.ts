import { useCallback, useRef } from "react";
import { useAviso } from "../../components/ui";
import { api } from "../../lib/api";
import { configPosDe, configuraElNegocio, normalizarConfigPos, normalizarMiConfigPos } from "../../lib/configPos";
import { useAuth } from "../../store/AuthContext";

/** Lo que se dice si el servidor no guardó el orden (CONTRATO-pos-por-cajero §3.3). */
export const NO_SE_GUARDO_EL_ORDEN = "No se pudo guardar el orden de las categorías. Probá de nuevo.";

/**
 * Guardar el orden de las categorías que se acomodó arrastrando en el punto de
 * venta (18-nov): los chips o los bloques de la lista en columnas.
 *
 * - Se pinta al instante: la sesión toma el orden nuevo antes de que conteste
 *   el servidor, así los chips y las columnas quedan donde se soltaron.
 * - Va adonde le toca a quien lo movió (`configuraElNegocio`, R2): el dueño
 *   cambia el orden de todo el negocio, como en Configuración; el cajero, el
 *   suyo (`/pos/config/mia`), y los demás siguen viendo el del negocio.
 * - De a un pedido por vez, como Configuración › Punto de venta: si se arrastra
 *   dos veces seguidas, sale el último cuando vuelve el que viajaba. Dos PATCH
 *   a la vez podían llegar al revés y dejar el de antes.
 * - Si falla, vuelve al último orden que el servidor sí guardó y lo avisa.
 */
export function useOrdenCategorias(): { guardar: (orden: number[]) => void; aviso: string } {
  const { negocio, usuario, fijarConfigPos } = useAuth();
  const [aviso, setAviso] = useAviso(6000);

  // En refs: el pedido que viaja vuelve después de otros dibujos, y tiene que
  // armar la sesión con lo de ahora y no con lo del dibujo en que salió.
  const sesion = useRef(configPosDe(negocio));
  sesion.current = configPosDe(negocio);
  const delNegocio = useRef(false);
  delNegocio.current = configuraElNegocio(usuario);
  const fijar = useRef(fijarConfigPos);
  fijar.current = fijarConfigPos;
  /** El último orden que el servidor tiene: a éste se vuelve si algo falla. */
  const confirmado = useRef<number[] | null>(null);
  /** El orden que espera a que vuelva el que viaja (sale sólo el último). */
  const pendiente = useRef<number[] | null>(null);
  const enVuelo = useRef(false);

  const mandar = useCallback(async () => {
    enVuelo.current = true;
    try {
      while (pendiente.current) {
        const orden = pendiente.current;
        pendiente.current = null;
        const r = delNegocio.current
          ? normalizarConfigPos(await api.guardarConfigPos({ ordenCategorias: orden }))
          : normalizarMiConfigPos(await api.guardarMiConfigPos({ ordenCategorias: orden })).config;
        confirmado.current = r.ordenCategorias;
        // Con otro esperando, la pantalla ya muestra ése: no se la vuelve atrás.
        if (!pendiente.current) fijar.current?.(r);
      }
    } catch {
      // Lo que esperaba detrás tampoco sale: se partió de un orden que no quedó.
      pendiente.current = null;
      if (confirmado.current) fijar.current?.({ ...sesion.current, ordenCategorias: confirmado.current });
      setAviso(NO_SE_GUARDO_EL_ORDEN);
    } finally {
      enVuelo.current = false;
    }
  }, [setAviso]);

  const guardar = useCallback(
    (orden: number[]) => {
      // El orden de antes de este arrastre (el de la sesión, ya confirmado):
      // con algo viajando, el confirmado lo dice la respuesta.
      if (!enVuelo.current) confirmado.current = sesion.current.ordenCategorias;
      setAviso("");
      fijar.current?.({ ...sesion.current, ordenCategorias: orden });
      pendiente.current = orden;
      if (!enVuelo.current) void mandar();
    },
    [mandar, setAviso],
  );

  return { guardar, aviso };
}
