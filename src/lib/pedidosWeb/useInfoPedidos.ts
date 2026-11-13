import { useCallback, useEffect, useState } from "react";
import { apiPedidoPublico } from "./apiPublica";
import type { InfoPedidos } from "./tipos";

/**
 * Lo que la página necesita saber antes de que el cliente arme el pedido: si
 * el local recibe pedidos ahora y qué sucursales están abiertas. Sólo se pide
 * si el negocio recibe pedidos en el sistema (`activo`): las demás páginas no
 * hacen ni una consulta de más.
 */
export function useInfoPedidos(subdominio: string | undefined, activo: boolean) {
  const [info, setInfo] = useState<InfoPedidos | null>(null);
  const [error, setError] = useState("");
  const [vuelta, setVuelta] = useState(0);

  useEffect(() => {
    if (!activo || !subdominio) return;
    let vivo = true;
    setError("");
    apiPedidoPublico
      .info(subdominio)
      .then((i) => vivo && setInfo(i))
      .catch((e: unknown) => vivo && setError(e instanceof Error ? e.message : "No pudimos cargar los datos del local."));
    return () => {
      vivo = false;
    };
  }, [subdominio, activo, vuelta]);

  const recargar = useCallback(() => setVuelta((v) => v + 1), []);
  return { info, error, recargar };
}
