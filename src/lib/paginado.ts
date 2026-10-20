import { useCallback, useEffect, useRef, useState } from "react";

/**
 * La cuenta de las listas paginadas en el backend (`?page=&pageSize=`), aparte
 * del componente que las dibuja (`components/Paginacion.tsx`).
 */

export const FILAS_POR_PAGINA = [20, 50, 100] as const;

/**
 * Las páginas a dibujar: la primera, la última y dos a cada lado de la actual,
 * con `null` donde va un "…". Con 7 o menos, todas.
 */
export function numerosDePagina(actual: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set([1, total, actual - 1, actual, actual + 1]);
  const lista = [...set].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const salida: (number | null)[] = [];
  lista.forEach((n, i) => {
    if (i > 0 && n - lista[i - 1] > 1) salida.push(null);
    salida.push(n);
  });
  return salida;
}

interface PaginadoApi<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * La cuenta de una lista paginada en el backend. `irA` reemplaza la página
 * (escritorio); `verMas` suma la siguiente debajo (celular). Cambiar los
 * filtros (`deps`) vuelve a la página 1.
 */
export function usePaginado<T>(
  pedir: (p: { page: number; pageSize: number }) => Promise<PaginadoApi<T>>,
  deps: unknown[],
  pageSizeInicial = 20,
) {
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeEstado] = useState(pageSizeInicial);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const pedirRef = useRef(pedir);
  pedirRef.current = pedir;
  const vuelta = useRef(0);

  const cargar = useCallback((p: number, tam: number, sumar: boolean) => {
    const mia = ++vuelta.current;
    setCargando(true);
    setError("");
    pedirRef
      .current({ page: p, pageSize: tam })
      .then((r) => {
        if (mia !== vuelta.current) return;
        setItems((antes) => (sumar ? [...antes, ...r.items] : r.items));
        setTotal(r.total);
        setPage(p);
      })
      .catch((e: unknown) => {
        if (mia !== vuelta.current) return;
        setError(e instanceof Error ? e.message : "No se pudo cargar");
        if (!sumar) setItems([]);
      })
      .finally(() => {
        if (mia === vuelta.current) setCargando(false);
      });
  }, []);
  /** Lo que esté en vuelo ya no cuenta (filtros nuevos o pantalla cerrada). */
  const invalidar = useCallback(() => {
    vuelta.current++;
  }, []);

  // Filtros nuevos: de vuelta a la página 1.
  useEffect(() => {
    cargar(1, pageSize, false);
    return invalidar;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, pageSize]);

  return {
    items,
    setItems,
    total,
    page,
    pageSize,
    cargando,
    error,
    irA: (p: number) => cargar(p, pageSize, false),
    verMas: () => cargar(page + 1, pageSize, true),
    setPageSize: (n: number) => setPageSizeEstado(n),
    recargar: () => cargar(1, pageSize, false),
    /** Props listas para `<Paginacion>`. */
    paginacion: {
      total,
      page,
      pageSize,
      mostrados: items.length,
      cargando,
      onPage: (p: number) => cargar(p, pageSize, false),
      onPageSize: (n: number) => setPageSizeEstado(n),
      onVerMas: () => cargar(page + 1, pageSize, true),
    },
  };
}
