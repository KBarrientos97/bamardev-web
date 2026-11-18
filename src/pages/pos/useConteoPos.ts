import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/api";
import {
  descontarDelConteo,
  nombreConteo,
  saldosDeConteo,
  unidadesPorCategoria,
  type CategoriaDe,
  type LineaParaConteo,
  type SaldosConteo,
} from "../../lib/conteo";
import { porSubir, useColaOffline, usePedidosEncolados } from "../../lib/offline/cola";
import { cambiarCopia, claveConteo, conCopia, leerCopia } from "../../lib/offline/copias";
import type { EstadoConteoSucursal } from "../../types";

/** Cada cuánto la caja vuelve a mirar cuántos vasos quedan: otra caja del mismo local también vende. */
export const CONTEO_CADA_MS = 30_000;

const NINGUNO: SaldosConteo = new Map();

export interface ConteoDelPos {
  /** Categoría contada → cuántos quedan en el local (null = sin contar). Vacío = el POS de siempre. */
  saldos: SaldosConteo;
  /** Lo que se cuenta, como lo escribió el admin («Vasos»). */
  nombre: string;
  /** Vuelve a pedir el saldo: después de vender, o cuando el servidor rechazó un envío. */
  recargar: () => void;
  /**
   * Baja del saldo lo vendido que el servidor todavía no conoce: la venta o el
   * pedido que quedó en la cola sin señal. `categoriaDe` resuelve la categoría
   * de los toppings extra (sin él cuentan sólo los vasos).
   */
  descontar: (lineas: readonly LineaParaConteo[], categoriaDe?: CategoriaDe) => void;
  /** Ventas y pedidos de plataforma que esperan subir. Mientras haya, el saldo que manda es el de acá. */
  enCola: number;
}

/**
 * Cuántos vasos (o cajas, o envases) de cada tamaño quedan en el local de la
 * caja (conteo por categoría, 18-nov): la tarjeta de cada producto lo dice y el
 * carrito no deja cargar más. Calcado de `usePausados`: se lee al abrir el POS,
 * cada 30 s (otra caja del local también vende) y al volver a la pestaña; con
 * la pestaña oculta no se pide nada. Al cambiar de sucursal lo de la anterior
 * deja de verse. Si falla (sin internet, un 403) se queda con lo último y no
 * molesta: el que frena de verdad es el servidor.
 *
 * Vive en el POS y no en la pantalla de venta: ésa se desmonta cada vez que se
 * recarga el catálogo, y el saldo se perdería justo después de vender.
 *
 * En la app instalada guarda su copia como el catálogo (`conCopia`): sin señal
 * el POS sigue mostrando el último saldo, con lo vendido sin señal ya bajado.
 *
 * Mientras la cola tenga ventas o pedidos sin subir, el saldo de ACÁ manda
 * (contrato §3.8): la venta encolada no pasa por el tope del servidor, así que
 * sin señal —y durante los 3 minutos «pegajosos» en que todo va directo a la
 * cola aunque la red haya vuelto— el único freno es este número. El servidor
 * todavía no conoce esas ventas: su saldo vendría más alto y las tarjetas
 * «devolverían» vasos ya vendidos. Así que con la cola pendiente el sondeo no
 * pide nada (si todavía no hay saldo en pantalla, toma el de la copia); cuando
 * la cola se vacía, vuelve a pedir. Y una respuesta que salió antes de un
 * `descontar` y llega después viene sin esa venta: se descarta (`version`).
 *
 * `activo` en false (conteo apagado, la farmacia, sin caja) no pide nada.
 */
export function useConteoPos(sucursalId?: number | null, activo = true): ConteoDelPos {
  const suc = sucursalId ?? null;
  const [guardado, setGuardado] = useState<{ de: number | null; estado: EstadoConteoSucursal } | null>(null);
  // Lo de otro local no se muestra mientras llega lo del nuevo.
  const estado = activo && guardado != null && guardado.de === suc ? guardado.estado : null;
  const [lectura, setLectura] = useState(0);
  // Lo rechazado no cuenta: no va a subir nunca, el servidor ya dijo que no.
  const enCola = porSubir(useColaOffline()).length + porSubir(usePedidosEncolados()).length;
  const conCola = enCola > 0;
  /** Sube con cada `descontar`: lo que estaba viajando salió antes de esa venta. */
  const version = useRef(0);
  /** Si hay un saldo en pantalla, para el sondeo (que corre fuera del render). */
  const hayLocal = useRef(false);
  useEffect(() => {
    hayLocal.current = estado != null;
  });

  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    const clave = claveConteo(suc);
    const delServidor = () => conCopia(clave, () => api.estadoConteo(suc));
    const traer = () => {
      if (document.hidden) return;
      // Cola pendiente y saldo en pantalla: manda el de acá (ver arriba).
      if (conCola && hayLocal.current) return;
      const desde = version.current;
      // En una cadena de promesas: si `api` no tiene la ruta (o tira de forma
      // síncrona), cae al catch igual que un error de red.
      Promise.resolve()
        .then(() =>
          // Cola pendiente sin saldo en pantalla (se volvió al POS, otra
          // sucursal): la copia ya tiene lo vendido sin señal; sin copia, lo
          // del servidor es mejor que nada.
          conCola ? leerCopia<EstadoConteoSucursal>(clave).then((c) => c ?? delServidor()) : delServidor(),
        )
        .then((r) => {
          if (vivo && r && version.current === desde) setGuardado({ de: suc, estado: r });
        })
        .catch(() => {
          // Sin conexión se queda con lo último.
        });
    };
    traer();
    const id = setInterval(traer, CONTEO_CADA_MS);
    document.addEventListener("visibilitychange", traer);
    return () => {
      vivo = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", traer);
    };
  }, [activo, suc, lectura, conCola]);

  const recargar = useCallback(() => setLectura((n) => n + 1), []);

  const descontar = useCallback(
    (lineas: readonly LineaParaConteo[], categoriaDe?: CategoriaDe) => {
      if (!activo) return;
      version.current++;
      const bajar = (e: EstadoConteoSucursal) =>
        descontarDelConteo(e, unidadesPorCategoria(lineas, saldosDeConteo(e), categoriaDe));
      setGuardado((g) => (g != null && g.de === suc ? { de: g.de, estado: bajar(g.estado) } : g));
      // Y la copia: al reabrir el POS sin señal tiene que volver el número de
      // ahora, no el de antes de vender (como el stock con `descontarDeLaCopia`).
      cambiarCopia<EstadoConteoSucursal>(claveConteo(suc), bajar).catch(() => {});
    },
    [activo, suc],
  );

  const saldos = useMemo(() => (estado ? saldosDeConteo(estado) : NINGUNO), [estado]);
  return { saldos, nombre: nombreConteo(estado?.nombre), recargar, descontar, enCola };
}
