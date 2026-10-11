import { useEffect, useState } from "react";
import { PaginaNoDisponible, pedirPaginaPublica } from "./apiPagina";
import type { PaginaPublica as Pagina } from "./tipos";

/** Carga la página pública del negocio del enlace. */
export function usePaginaPublica(subdominio: string | undefined) {
  const [pagina, setPagina] = useState<Pagina | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    setPagina(null);
    setError(null);
    if (!subdominio) {
      setError("Esta página no está disponible");
      return;
    }
    pedirPaginaPublica(subdominio)
      .then((p) => vivo && setPagina(p))
      .catch((e: unknown) => {
        if (!vivo) return;
        setError(e instanceof PaginaNoDisponible ? e.message : e instanceof Error ? e.message : "Error");
      });
    return () => {
      vivo = false;
    };
  }, [subdominio]);
  return { pagina, error };
}
