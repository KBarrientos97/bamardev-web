import { useCallback, useEffect, useRef, useState } from "react";

interface EstadoCarga<T> {
  datos: T | null;
  cargando: boolean;
  error: string;
  /**
   * El error tal cual llegó (un `ApiError` con su status y su código), para
   * la pantalla que tiene que distinguir un "no existe" de un corte de red.
   */
  falla: unknown;
}

/**
 * Carga datos del API con estados de carga/error y un `recargar()` para
 * después de guardar. Descarta la respuesta si el componente se desmontó o si
 * ya salió una petición más nueva (evita que una lenta pise a una reciente).
 *
 * Mientras vuelve a pedir conserva los `datos` anteriores (lo que se quiere
 * después de tocar algo: la lista no se va a un spinner). Pero cuando lo que
 * cambia es DE QUÉ son los datos —otra sucursal, otro filtro—, lo anterior es
 * ajeno y se ve (y se toca) como si fuera lo nuevo. Para eso está `opciones.clave`:
 * los datos guardan la clave con la que se pidieron y, si la de ahora es
 * distinta, `datos` vale `null` hasta que llegue lo nuevo. Un `recargar()` o
 * el refresco periódico, con la misma clave, siguen conservando lo cargado.
 * Sin `clave` el comportamiento es el de siempre.
 */
export function useApi<T>(
  fn: () => Promise<T>,
  deps: unknown[] = [],
  opciones: { clave?: unknown } = {},
): EstadoCarga<T> & { recargar: () => void; setDatos: (d: T) => void } {
  const usaClave = "clave" in opciones;
  const clave = opciones.clave;
  const [estado, setEstado] = useState<EstadoCarga<T> & { clave: unknown }>({
    datos: null,
    cargando: true,
    error: "",
    falla: null,
    clave,
  });
  const peticion = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  // La clave de ESTE render: la respuesta se etiqueta con la que tenía al pedir.
  const claveRef = useRef(clave);
  claveRef.current = clave;

  const cargar = useCallback(() => {
    const mia = ++peticion.current;
    const claveAlPedir = claveRef.current;
    setEstado((e) => ({ ...e, cargando: true, error: "", falla: null }));
    fnRef
      .current()
      .then((datos) => {
        if (mia === peticion.current)
          setEstado({ datos, cargando: false, error: "", falla: null, clave: claveAlPedir });
      })
      .catch((err: unknown) => {
        if (mia !== peticion.current) return;
        const mensaje = err instanceof Error ? err.message : "No se pudo cargar";
        setEstado({ datos: null, cargando: false, error: mensaje, falla: err, clave: claveAlPedir });
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
    setEstado({ datos, cargando: false, error: "", falla: null, clave: claveRef.current });
  }, []);

  // Datos de otra clave: ajenos hasta que llegue lo nuevo.
  const ajenos = usaClave && !Object.is(estado.clave, clave);
  return {
    datos: ajenos ? null : estado.datos,
    cargando: estado.cargando || ajenos,
    error: estado.error,
    falla: estado.falla,
    recargar: cargar,
    setDatos,
  };
}
