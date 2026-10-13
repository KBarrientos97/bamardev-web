import { Icon } from "../../../../components/Icon";
import { useSucursales } from "../../../../lib/useSucursales";
import { useReporte } from "../../contexto";

/**
 * El billar no tiene consolidado: sin sucursal, el backend arma el reporte de
 * la principal (las mesas son de un local, y sumar la ocupación de dos locales
 * no da la de ninguno). Con "Todas las sucursales" arriba, sin este aviso el
 * dueño leía las mesas de la principal como si fueran las de todo el negocio.
 *
 * Un negocio de un solo local no lo ve nunca: ahí no hay nada que aclarar.
 */
export function NotaSucursal() {
  const { rango } = useReporte();
  const suc = useSucursales();
  if (!suc.elegir || rango.sucursalId != null) return null;
  const principal = suc.sucursales.find((s) => s.esPrincipal);
  return (
    <p className="flex items-start gap-1.5 text-[12px] leading-snug text-texto-3">
      <span className="mt-px shrink-0">
        <Icon name="info" size={14} />
      </span>
      <span>
        El billar se mira de a un local: con “Todas las sucursales” ves las mesas de la principal
        {principal ? ` (${principal.nombre})` : ""}. Elegí otra sucursal arriba para ver las suyas.
      </span>
    </p>
  );
}
