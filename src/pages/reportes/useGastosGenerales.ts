import { api } from "../../lib/api";
import { rangoParaApi, sinJornada } from "../../lib/rangoApi";
import { useApi } from "../../lib/useApi";
import type { RangoReporte } from "../../types";

/**
 * Los gastos GENERALES del negocio (alquiler de la oficina, el contador…) son
 * los que no se cargaron a ningún local. Con "Todas las sucursales" ya están en
 * la cuenta; con UNA sucursal elegida no, y sin avisar el resultado de un local
 * se leía como si fuera todo (PLAN-SUCURSAL-TOTAL §3 etapa 4, §9.1).
 *
 * Devuelve el monto de esos gastos en el período, o 0 cuando no hay nada que
 * decir: sin sucursal elegida (el consolidado ya los incluye), para quien es de
 * un solo local (el backend le manda 0) o si la consulta falla. Es un aviso: si
 * no llega, el reporte no se cae por él.
 */
export function useGastosGenerales(rango: RangoReporte, activo = true): number {
  const aplica = activo && rango.sucursalId != null;
  const r = useApi(async () => {
    if (!aplica) return 0;
    // Los mismos días que las ventas y sin el corte de la jornada: un gasto
    // lleva fecha y no hora (ver `sinJornada`).
    const { desde, hasta } = rangoParaApi(sinJornada(rango));
    try {
      const res = await api.getResumenGastos({ desde: desde ?? "", hasta: hasta ?? "", sucursalId: rango.sucursalId });
      return res.generales?.total ?? 0;
    } catch {
      return 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aplica, rango.desde, rango.hasta, rango.sucursalId]);
  return aplica ? (r.datos ?? 0) : 0;
}
