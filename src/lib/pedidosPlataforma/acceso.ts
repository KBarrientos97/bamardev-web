import type { Feature, SesionUsuario } from "../../types";
import { tienePermiso } from "../permisos";
import { FEATURE_PLATAFORMA, PLATAFORMAS, type Plataforma } from "./tipos";

/**
 * Quién ve y quién hace qué con los pedidos de Yango y PedidosYa
 * (PLAN-PEDIDOS-PLATAFORMA §3).
 *
 * Dos features extra, una por plataforma (`pedidos_yango`, `pedidos_pedidosya`),
 * que el operador prende por negocio desde el panel; y tres permisos del rol:
 *
 *   • `plataformas.registrar`: tomar el pedido desde el POS (ADMIN, SUPERVISOR y CAJERO).
 *   • `plataformas.ver`: el reporte (ADMIN y SUPERVISOR).
 *   • `plataformas.anular`: anular un pedido, con el PIN de un encargado.
 *
 * A diferencia del resto de la app, acá la feature NO falla abierta con la
 * lista vacía: `tieneFeature` deja pasar todo cuando la sesión no trae
 * features (un negocio con los códigos sin migrar no se queda sin menú), pero
 * estas dos son extras que nadie tiene por defecto. Un botón de Yango en el
 * POS de un negocio que no lo contrató sería un 403 en la cara del cajero.
 */

type Sesion = Pick<SesionUsuario, "permisos" | "permisosPropios"> | null | undefined;

/** La plataforma con su feature explícitamente en la lista del plan. */
export function plataformaPrendida(features: Feature[] | undefined, p: Plataforma): boolean {
  return !!features?.includes(FEATURE_PLATAFORMA[p]);
}

/** Las plataformas que el negocio tiene prendidas, en el orden de siempre. */
export function plataformasPrendidas(features: Feature[] | undefined): Plataforma[] {
  return PLATAFORMAS.filter((p) => plataformaPrendida(features, p));
}

/** Las plataformas a las que este usuario puede cargarles un pedido desde el POS. */
export function plataformasQueRegistra(features: Feature[] | undefined, usuario: Sesion): Plataforma[] {
  return tienePermiso(usuario, "plataformas.registrar") ? plataformasPrendidas(features) : [];
}

/** Las plataformas cuyo reporte puede ver. Vacío = la pestaña no existe para él. */
export function plataformasQueVe(features: Feature[] | undefined, usuario: Sesion): Plataforma[] {
  return tienePermiso(usuario, "plataformas.ver") ? plataformasPrendidas(features) : [];
}

/** ¿Se le ofrece «Anular» en la lista del reporte? */
export function puedeAnularPedidos(usuario: Sesion): boolean {
  return tienePermiso(usuario, "plataformas.anular");
}
