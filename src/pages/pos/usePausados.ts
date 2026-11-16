import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";

/** Cada cuánto la caja vuelve a mirar qué pausó otra caja o el encargado. */
const CADA_MS = 60_000;

const NINGUNO = new Set<number>();

export interface PausadosDelLocal {
  /** Los productos pausados en el local de la caja. */
  ids: Set<number>;
  /** Cómo se llama ese local, para decirlo en el aviso; null mientras no llegó la lista. */
  sucursal: string | null;
  /** Deja el producto pausado o activo en pantalla sin esperar a la próxima lectura. */
  marcar: (productoId: number, pausado: boolean) => void;
  /** Vuelve a pedir la lista al servidor. */
  recargar: () => void;
}

/**
 * Los productos PAUSADOS en la sucursal de la caja (PLAN-ELGANADERO-16NOV
 * §4.1): la tarjeta sale en gris con «Pausado» y al venderlo la caja pregunta
 * antes de agregarlo. No bloquea nada: pausar es para que no se pida por la
 * página, y quien lo tiene guardado lo puede vender igual.
 *
 * Es de cada local, como el stock: `sucursalId` es el de la caja. Se lee al
 * abrir el POS y cada minuto (otra caja o el encargado también pausan), y al
 * volver a la pestaña. Sin internet, o contra un backend que todavía no tiene
 * la ruta, se queda con lo último que tenía: el cobro no se frena por esto.
 *
 * `activo` en false (la farmacia, que arma su catálogo aparte) no pide nada.
 */
export function usePausados(sucursalId?: number | null, activo = true): PausadosDelLocal {
  const [estado, setEstado] = useState<{ ids: Set<number>; sucursal: string | null }>({
    ids: NINGUNO,
    sucursal: null,
  });
  const [lectura, setLectura] = useState(0);

  // Lo que había es de otro local: no se muestra mientras llega la lista del nuevo.
  useEffect(() => {
    setEstado({ ids: NINGUNO, sucursal: null });
  }, [sucursalId]);

  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    const traer = () => {
      if (document.hidden) return;
      // En una cadena de promesas: si `api` no tiene la ruta (o tira de forma
      // síncrona), cae al catch igual que un error de red.
      Promise.resolve()
        .then(() => api.productosPausados(sucursalId))
        .then((r) => {
          if (vivo) setEstado({ ids: new Set(r.pausados.map((x) => x.productoId)), sucursal: r.sucursal.nombre });
        })
        .catch(() => {
          // Sin conexión se queda con lo último.
        });
    };
    traer();
    const id = setInterval(traer, CADA_MS);
    document.addEventListener("visibilitychange", traer);
    return () => {
      vivo = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", traer);
    };
  }, [activo, sucursalId, lectura]);

  const marcar = useCallback((productoId: number, pausado: boolean) => {
    setEstado((e) => {
      const ids = new Set(e.ids);
      if (pausado) ids.add(productoId);
      else ids.delete(productoId);
      return { ...e, ids };
    });
  }, []);
  const recargar = useCallback(() => setLectura((n) => n + 1), []);

  return activo ? { ...estado, marcar, recargar } : { ids: NINGUNO, sucursal: null, marcar, recargar };
}
