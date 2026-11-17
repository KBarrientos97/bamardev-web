import { useEffect, useState } from "react";
import { api } from "../api";
import { conCopia } from "../offline/copias";
import type { CatalogoAgregados } from "./tipos";

/** La copia del catálogo de toppings, por sucursal como la del catálogo de productos. */
export const claveCatalogoAgregados = (sucursalId: number | null) => `agregados:${sucursalId ?? "todos"}`;

/**
 * El catálogo de toppings del punto de venta (`GET /agregados/catalogo`), con
 * la sucursal del turno: de ahí salen los precios de cada opción.
 *
 * Sólo se pide con el ajuste prendido (`activo`): el resto de los negocios no
 * paga un pedido de más ni ve nada distinto. En la app instalada de la compu
 * pasa por `conCopia`, como el resto del catálogo: sin señal el POS sigue
 * ofreciendo los toppings con la última copia.
 *
 * Una falla no frena la venta: sin catálogo, los productos se venden sin hoja
 * de toppings (el backend, si la línea trajera toppings, los valida igual).
 */
export function useCatalogoAgregados(sucursalId: number | null, activo: boolean): CatalogoAgregados | null {
  const [catalogo, setCatalogo] = useState<CatalogoAgregados | null>(null);

  useEffect(() => {
    if (!activo) {
      setCatalogo(null);
      return;
    }
    let vivo = true;
    conCopia(claveCatalogoAgregados(sucursalId), () => api.catalogoAgregados(sucursalId))
      .then((c) => vivo && setCatalogo(c))
      .catch(() => vivo && setCatalogo(null));
    return () => {
      vivo = false;
    };
  }, [sucursalId, activo]);

  return activo ? catalogo : null;
}
