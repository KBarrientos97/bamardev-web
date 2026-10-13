import { useApi } from "../../../../lib/useApi";
import { apiReportes } from "../../api";
import { useReporte } from "../../contexto";

/**
 * El reporte del billar del período de arriba, con el anterior para las
 * flechas. Los tres reportes del grupo leen la misma respuesta: cada uno toma
 * su parte.
 */
export function useReporteBillar() {
  const { rango, rangoAnterior } = useReporte();
  return useApi(
    () => apiReportes.billar(rango, rangoAnterior),
    [rango.desde, rango.hasta, rango.sucursalId, rangoAnterior.desde, rangoAnterior.hasta],
  );
}
