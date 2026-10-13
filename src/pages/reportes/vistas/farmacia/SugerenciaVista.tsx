import SugerenciaCompraPagina from "../../../farmacia/SugerenciaCompra";
import { useReporte } from "../../contexto";

/**
 * Sugerencia de compra dentro de Reportes: la pantalla de la farmacia con la
 * sucursal de arriba. El período no se le pasa: es una foto de hoy con sus
 * propios días de historia y de cobertura.
 */
export default function SugerenciaVista() {
  const { rango } = useReporte();
  return <SugerenciaCompraPagina embebido={{ sucursalId: rango.sucursalId ?? null }} />;
}
