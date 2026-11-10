import { Link } from "react-router-dom";
import { veFicha } from "../pages/reportes/catalogo";
import { useAuth } from "../store/AuthContext";
import { Icon } from "./Icon";

/**
 * El negocio vende sin stock (Configuración › Inventario y stock, 09-nov).
 *
 * Va arriba de Artículos y del tablero de Inventario: ahí el stock dejó de
 * mostrarse, y sin decir por qué parecía que se había roto algo. Azul y no
 * rojo ni ámbar: no es un error ni una deuda, es cómo eligió trabajar el
 * local mientras no cuenta su mercadería.
 *
 * El enlace sólo lo ve quien puede prenderlo (el dueño); el resto lee el aviso
 * y sabe a quién preguntarle. El del reporte "Vendido sin stock", quien lo ve.
 */
export function AvisoVendeSinStock() {
  const { puede, rubro, negocio, usuario, incluye } = useAuth();
  const verReporte = veFicha("vendido-sin-stock", {
    rubro,
    features: negocio?.features,
    permisos: usuario?.permisos,
    puede,
    incluye,
  });
  return (
    <div
      role="status"
      className="flex items-start gap-2.5 rounded-xl bg-info-bg px-3.5 py-3 text-sm text-info-text"
    >
      <Icon name="info" size={18} className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="font-semibold">Estás vendiendo sin control de stock</p>
        <p className="mt-0.5">
          Las ventas no se frenan por lo que haya y el stock no se muestra. Lo que vendiste en cada turno
          sigue en «Productos vendidos» del cierre de caja
          {verReporte ? (
            <>
              , y todo lo que salió sin estar cargado, en{" "}
              <Link to="/reportes/vendido-sin-stock" className="font-semibold underline">
                Vendido sin stock
              </Link>
              .
            </>
          ) : (
            "."
          )}
          {puede("config_inventario") ? (
            <>
              {" "}
              Cuando cuentes tu mercadería,{" "}
              <Link to="/configuracion/inventario" className="font-semibold underline">
                prendé el control de stock
              </Link>
              .
            </>
          ) : (
            " Cuando el local cuente su mercadería, el administrador lo vuelve a prender."
          )}
        </p>
      </div>
    </div>
  );
}
