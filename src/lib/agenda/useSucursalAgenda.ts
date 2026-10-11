import { useState } from "react";
import { useAuth } from "../../store/AuthContext";
import type { Almacen } from "../../types";
import { api } from "../api";
import { useApi } from "../useApi";

/**
 * La sucursal que mira la agenda. A diferencia del filtro de reportes
 * (`useSucursales`) acá no hay "todas": una agenda son las columnas de UN local.
 *
 * - Quien pertenece a una sucursal ve la suya, sin selector (§4: recepción y
 *   encargado ven su sucursal).
 * - Quien es de la organización arranca en la principal y puede cambiar, si
 *   hay más de una.
 *
 * `listo` evita pedir la agenda sin sucursal mientras todavía se está
 * averiguando cuál es: sería una consulta de más y, si el backend la exige,
 * un error que parpadea al entrar.
 */
export function useSucursalAgenda() {
  const { usuario } = useAuth();
  const propia = usuario?.sucursalId ?? null;
  const esDeOrganizacion = usuario?.sucursalId == null;

  const lista = useApi(
    () => (esDeOrganizacion ? api.getSucursales() : Promise.resolve([] as Almacen[])),
    [esDeOrganizacion],
  );
  const sucursales = (lista.datos ?? []).filter((a) => a.activo && a.tipo !== "DEPOSITO");
  const [elegida, setElegida] = useState<number | null>(null);
  const sugerida = sucursales.find((a) => a.esPrincipal) ?? sucursales[0];
  const sucursalId = propia ?? elegida ?? sugerida?.id ?? null;

  return {
    sucursalId,
    setSucursalId: setElegida,
    sucursales,
    elegir: esDeOrganizacion && sucursales.length > 1,
    listo: !esDeOrganizacion || !lista.cargando,
    nombre:
      propia != null
        ? (usuario?.sucursal ?? "")
        : (sucursales.find((a) => a.id === sucursalId)?.nombre ?? ""),
  };
}
