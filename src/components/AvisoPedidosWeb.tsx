import { Link, useLocation } from "react-router-dom";
import { Icon } from "./Icon";
import { activarSonido, useAvisoPedidosWeb, useSonidoListo } from "../lib/pedidosWeb/contador";
import { useAuth } from "../store/AuthContext";

/**
 * «Tenés pedidos web nuevos», visible desde cualquier pantalla (pedidos web,
 * 13-nov): un cliente está esperando y a los 10 minutos el pedido vence. Vive
 * en el Layout, así el contador, el sonido y el título de la pestaña
 * («(2) Pedidos nuevos») andan con cualquier pantalla abierta.
 *
 * No se dibuja donde ya hay otro aviso: en el POS (su propia franja) y en la
 * bandeja. El sonido sólo puede sonar después de un toque del cajero: hasta
 * entonces, un botón «Activar sonido».
 */
export default function AvisoPedidosWeb() {
  const { puede } = useAuth();
  const { pathname } = useLocation();
  const activo = puede("pedidos_web");
  const { nuevos } = useAvisoPedidosWeb(activo);
  const sonidoListo = useSonidoListo();

  if (!activo || nuevos === 0) return null;
  if (pathname === "/pos" || pathname.startsWith("/pedidos-web")) return null;
  return (
    <div role="status" className="flex items-center gap-3 border-b border-warning-text/20 bg-warning-bg px-4 py-2.5 text-warning-text">
      <Icon name="bolsa" size={20} />
      <Link to="/pedidos-web" className="min-w-0 flex-1 text-[13px] font-bold underline-offset-2 hover:underline">
        {nuevos === 1 ? "1 pedido web nuevo" : `${nuevos} pedidos web nuevos`} · Ver
      </Link>
      {!sonidoListo && (
        <button
          type="button"
          onClick={activarSonido}
          className="shrink-0 rounded-lg border border-warning-text/30 px-2.5 py-1 text-xs font-semibold hover:bg-warning-text/10"
        >
          Activar sonido
        </button>
      )}
    </div>
  );
}
