import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";
import type { PaginaProductos, Producto } from "../../types";

/**
 * Buscar en el catálogo contra el servidor, mientras se escribe.
 *
 * Lo usan las dos pantallas del mostrador —la de consulta y el punto de
 * venta— porque la mecánica delicada es la misma y no conviene tenerla escrita
 * dos veces:
 *
 *  · **espera** a que la persona deje de teclear antes de preguntar, o serían
 *    ocho consultas para escribir "omeprazol";
 *  · **descarta las respuestas viejas**: "ome" tarda más que "omepra" y
 *    contestaría después, pisando el resultado bueno con uno anterior;
 *  · pagina de a tandas, porque el catálogo de una farmacia no entra en una
 *    pantalla ni tiene por qué viajar entero;
 *  · deja **preguntar ya**, sin la espera, para el Enter del lector de código
 *    de barras (ver `buscarAhora`).
 */

const ESPERA_MS = 250;

export interface Busqueda {
  items: Producto[];
  /**
   * El texto del que salieron `items`. Mientras se espera a que se deje de
   * teclear, lo que se ve es de un texto anterior: esto dice de cuál.
   */
  consulta: string | null;
  total: number;
  cargando: boolean;
  error: string;
  hayMas: boolean;
  trayendoMas: boolean;
  traerMas: () => void;
  /** Vuelve a pedir lo mismo: después de vender, para refrescar el stock. */
  recargar: () => void;
  /**
   * Pregunta por `texto` ya mismo, sin esperar, y devuelve lo que encontró.
   * Devuelve `null` si la respuesta ya no sirve: llegó otra más nueva o el
   * campo dice otra cosa.
   *
   * Es para el lector de código de barras: escribe el código y manda Enter en
   * milisegundos, cuando la búsqueda todavía está esperando a que se deje de
   * teclear. Decidir con lo que había en pantalla era decidir con los
   * resultados del texto anterior.
   */
  buscarAhora: (texto: string) => Promise<Producto[] | null>;
}

export function useBusquedaProductos({
  q,
  limite = 20,
  soloHabilitados = false,
  activo = true,
  categoriaId = null,
  sucursalId = null,
}: {
  q: string;
  limite?: number;
  /** Sólo los de esa categoría: los chips del punto de venta. */
  categoriaId?: number | null;
  /** De qué sucursal: el POS pide la de su caja. */
  sucursalId?: number | null;
  /** El POS sólo ofrece lo que se puede vender; la consulta, todo. */
  soloHabilitados?: boolean;
  /**
   * `false` apaga la búsqueda sin desmontar el hook.
   *
   * Lo necesita el catálogo de Medicamentos, que tiene dos modos: buscar contra
   * el servidor (lo de todos los días) o traerse todo para revisar el stock.
   * Los hooks no se pueden llamar condicionalmente, así que en vez de eso el
   * hook se queda quieto y no gasta una consulta que nadie va a mirar.
   */
  activo?: boolean;
}): Busqueda {
  const [pagina, setPagina] = useState<PaginaProductos | null>(null);
  const [consulta, setConsulta] = useState<string | null>(null);
  const [cargando, setCargando] = useState(activo);
  const [trayendoMas, setTrayendoMas] = useState(false);
  const [error, setError] = useState("");

  /** Número de la última búsqueda pedida, para descartar las que se cruzan. */
  const pedido = useRef(0);
  /** La búsqueda que está esperando a que se deje de teclear, si hay una. */
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Lo que dice el campo ahora. */
  const vigente = useRef(q);
  /**
   * "Ver más" en curso. Ref y no el estado: dos clics en el mismo tick verían
   * los dos `trayendoMas` en false y sumarían la misma tanda dos veces.
   */
  const trayendo = useRef(false);

  /** Devuelve lo encontrado, o `null` si la respuesta llegó tarde o falló. */
  const buscar = useCallback(
    async (texto: string): Promise<Producto[] | null> => {
      if (!activo) return null;
      const mio = ++pedido.current;
      setCargando(true);
      setError("");
      try {
        const res = await api.buscarProductos({
          q: texto,
          limite,
          soloHabilitados,
          categoriaId,
          sucursalId,
        });
        if (pedido.current !== mio) return null;
        setPagina(res);
        setConsulta(texto);
        return res.items;
      } catch (err) {
        if (pedido.current !== mio) return null;
        setError(err instanceof Error ? err.message : "No se pudo buscar");
        setPagina(null);
        setConsulta(null);
        return null;
      } finally {
        if (pedido.current === mio) setCargando(false);
      }
    },
    [limite, soloHabilitados, activo, categoriaId, sucursalId],
  );

  useEffect(() => {
    vigente.current = q;
    if (!activo) {
      // Apagado: no se queda "cargando" para siempre.
      setCargando(false);
      return;
    }
    const id = setTimeout(() => {
      espera.current = null;
      void buscar(q);
    }, ESPERA_MS);
    espera.current = id;
    return () => clearTimeout(id);
  }, [q, buscar, activo]);

  const buscarAhora = useCallback(
    async (texto: string) => {
      // La que estaba esperando preguntaría lo mismo un rato después.
      if (espera.current) {
        clearTimeout(espera.current);
        espera.current = null;
      }
      const items = await buscar(texto);
      return items && vigente.current === texto ? items : null;
    },
    [buscar],
  );

  const traerMas = useCallback(async () => {
    if (!pagina || trayendo.current) return;
    trayendo.current = true;
    // La búsqueda y la lista de las que sale esta tanda. Un "Ver más" que
    // vuelve tarde —ya se escribió "ome", o se cambió la categoría— es de una
    // lista que no está más en pantalla: sumarlo pegaba 24 del catálogo sin
    // filtrar debajo de "ome", o directamente reemplazaba lo nuevo.
    const mio = pedido.current;
    const base = pagina;
    setTrayendoMas(true);
    try {
      const res = await api.buscarProductos({
        // El texto del que salió la lista, no el que hay en el campo: mientras
        // se espera a que se deje de teclear, pueden ser distintos.
        q: consulta ?? q,
        limite,
        offset: base.items.length,
        soloHabilitados,
        categoriaId,
        sucursalId,
      });
      if (pedido.current !== mio) return;
      // La tanda nueva se suma a lo que ya se está mirando; el total viene de
      // la última respuesta, que es la que sabe si entró algo mientras tanto.
      setPagina((actual) =>
        actual === base ? { ...res, items: [...base.items, ...res.items] } : actual,
      );
    } catch (err) {
      if (pedido.current === mio)
        setError(err instanceof Error ? err.message : "No se pudo traer más");
    } finally {
      trayendo.current = false;
      setTrayendoMas(false);
    }
  }, [pagina, consulta, q, limite, soloHabilitados, categoriaId, sucursalId]);

  const items = pagina?.items ?? [];

  return {
    items,
    consulta,
    total: pagina?.total ?? 0,
    cargando,
    error,
    hayMas: pagina ? items.length < pagina.total : false,
    trayendoMas,
    traerMas: () => void traerMas(),
    recargar: () => void buscar(q),
    buscarAhora,
  };
}
