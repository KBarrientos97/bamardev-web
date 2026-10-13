import MermasPagina from "../../../farmacia/Mermas";
import { useReporte } from "../../contexto";

/**
 * Vencimientos y mermas dentro de Reportes: la pantalla de la farmacia, con el
 * período y la sucursal de arriba. Todo lo demás (el riesgo de hoy que lleva a
 * Vencimientos, el detalle, su Excel) es el de siempre.
 */
export default function MermasVista() {
  const { periodo, rango } = useReporte();
  return <MermasPagina embebido={{ desde: periodo.desde, hasta: periodo.hasta, sucursalId: rango.sucursalId ?? null }} />;
}
