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
 *    pantalla ni tiene por qué viajar entero.
 */

const ESPERA_MS = 250;

export interface Busqueda {
  items: Producto[];
  total: number;
  cargando: boolean;
  error: string;
  hayMas: boolean;
  trayendoMas: boolean;
  traerMas: () => void;
  /** Vuelve a pedir lo mismo: después de vender, para refrescar el stock. */
  recargar: () => void;
}

export function useBusquedaProductos({
  q,
  limite = 20,
  soloHabilitados = false,
}: {
  q: string;
  limite?: number;
  /** El POS sólo ofrece lo que se puede vender; la consulta, todo. */
  soloHabilitados?: boolean;
}): Busqueda {
  const [pagina, setPagina] = useState<PaginaProductos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [trayendoMas, setTrayendoMas] = useState(false);
  const [error, setError] = useState("");

  /** Número de la última búsqueda pedida, para descartar las que se cruzan. */
  const pedido = useRef(0);

  const buscar = useCallback(
    async (texto: string) => {
      const mio = ++pedido.current;
      setCargando(true);
      setError("");
      try {
        const res = await api.buscarProductos({ q: texto, limite, soloHabilitados });
        if (pedido.current !== mio) return;
        setPagina(res);
      } catch (err) {
        if (pedido.current !== mio) return;
        setError(err instanceof Error ? err.message : "No se pudo buscar");
        setPagina(null);
      } finally {
        if (pedido.current === mio) setCargando(false);
      }
    },
    [limite, soloHabilitados],
  );

  useEffect(() => {
    const id = setTimeout(() => void buscar(q), ESPERA_MS);
    return () => clearTimeout(id);
  }, [q, buscar]);

  const traerMas = useCallback(async () => {
    if (!pagina || trayendoMas) return;
    setTrayendoMas(true);
    try {
      const res = await api.buscarProductos({
        q,
        limite,
        offset: pagina.items.length,
        soloHabilitados,
      });
      // La tanda nueva se suma a lo que ya se está mirando; el total viene de
      // la última respuesta, que es la que sabe si entró algo mientras tanto.
      setPagina({ ...res, items: [...pagina.items, ...res.items] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo traer más");
    } finally {
      setTrayendoMas(false);
    }
  }, [pagina, trayendoMas, q, limite, soloHabilitados]);

  const items = pagina?.items ?? [];

  return {
    items,
    total: pagina?.total ?? 0,
    cargando,
    error,
    hayMas: pagina ? items.length < pagina.total : false,
    trayendoMas,
    traerMas: () => void traerMas(),
    recargar: () => void buscar(q),
  };
}
