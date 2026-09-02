import { useCallback, useEffect, useRef, useState } from "react";

interface EstadoCarga<T> {
  datos: T | null;
  cargando: boolean;
  error: string;
}

/**
 * Carga datos del API con estados de carga/error y un `recargar()` para
 * después de guardar. Descarta la respuesta si el componente se desmontó o si
 * ya salió una petición más nueva (evita que una lenta pise a una reciente).
 */
export function useApi<T>(
  fn: () => Promise<T>,
  deps: unknown[] = [],
): EstadoCarga<T> & { recargar: () => void; setDatos: (d: T) => void } {
  const [estado, setEstado] = useState<EstadoCarga<T>>({
    datos: null,
    cargando: true,
    error: "",
  });
  const peticion = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const cargar = useCallback(() => {
    const mia = ++peticion.current;
    setEstado((e) => ({ ...e, cargando: true, error: "" }));
    fnRef
      .current()
      .then((datos) => {
        if (mia === peticion.current) setEstado({ datos, cargando: false, error: "" });
      })
      .catch((err: unknown) => {
        if (mia !== peticion.current) return;
        const mensaje = err instanceof Error ? err.message : "No se pudo cargar";
        setEstado({ datos: null, cargando: false, error: mensaje });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    cargar();
    return () => {
      // Invalida la respuesta en vuelo al desmontar.
      peticion.current++;
    };
  }, [cargar]);

  const setDatos = useCallback((datos: T) => {
    setEstado({ datos, cargando: false, error: "" });
  }, []);

  return { ...estado, recargar: cargar, setDatos };
}
