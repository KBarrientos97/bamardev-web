import { useEffect, useState } from "react";
import type { CatalogoAgregados } from "../agregados/tipos";
import { agregarLinea, ajustarASucursal, cambiarAgregados, cambiarCantidad, type LineaPedido, type ToppingsElegidos } from "./pedido";
import type { ItemCatalogoPublico } from "./tipos";

/**
 * El pedido de la página (IDEAS/6 #1). Vive en el estado y en sessionStorage,
 * por si el cliente recarga o vuelve de WhatsApp.
 */

function clave(sub: string) {
  return `pedido:${sub}`;
}

function leer(sub: string): LineaPedido[] {
  try {
    const crudo = sessionStorage.getItem(clave(sub));
    const v = crudo ? (JSON.parse(crudo) as LineaPedido[]) : [];
    return Array.isArray(v) ? v.filter((l) => typeof l?.id === "number" && l.cantidad > 0) : [];
  } catch {
    return [];
  }
}

export function usePedido(sub: string) {
  const [lineas, setLineas] = useState<LineaPedido[]>(() => leer(sub));
  useEffect(() => {
    try {
      if (lineas.length) sessionStorage.setItem(clave(sub), JSON.stringify(lineas));
      else sessionStorage.removeItem(clave(sub));
    } catch {
      // Sin storage: el pedido vive sólo en memoria.
    }
  }, [sub, lineas]);
  return {
    lineas,
    agregar: (item: ItemCatalogoPublico, toppings?: ToppingsElegidos) => setLineas((l) => agregarLinea(l, item, toppings)),
    /** `ref`: el id del ítem o, con toppings, la clave de la línea (`claveLinea`). */
    cambiar: (ref: number | string, delta: number) => setLineas((l) => cambiarCantidad(l, ref, delta)),
    /** Cambia los toppings de una línea (tocarla en el carrito reabre la hoja). */
    cambiarToppings: (clave: string, toppings: ToppingsElegidos) => setLineas((l) => cambiarAgregados(l, clave, toppings)),
    /** Otra sucursal elegida: sus precios (también los de los toppings), y fuera lo que ahí no se ofrece. */
    ajustar: (items: ItemCatalogoPublico[], todos: ItemCatalogoPublico[], toppings?: CatalogoAgregados | null) =>
      setLineas((l) => ajustarASucursal(l, items, todos, toppings)),
    vaciar: () => setLineas([]),
  };
}

export type Pedido = ReturnType<typeof usePedido>;
