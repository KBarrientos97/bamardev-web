import { useEffect, useState } from "react";
import { agregarLinea, cambiarCantidad, type LineaPedido } from "./pedido";
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
    agregar: (item: ItemCatalogoPublico) => setLineas((l) => agregarLinea(l, item)),
    cambiar: (id: number, delta: number) => setLineas((l) => cambiarCantidad(l, id, delta)),
    vaciar: () => setLineas([]),
  };
}

export type Pedido = ReturnType<typeof usePedido>;
