import { useState } from "react";
import { round2 } from "./calculo";
import type { ProductoBillar } from "./tipos";

/** El pedido del catálogo: producto → cantidad. */
export type Carrito = Map<number, number>;

export function useCarritoBillar() {
  const [carrito, setCarrito] = useState<Carrito>(() => new Map());
  const poner = (id: number, cant: number) =>
    setCarrito((c) => {
      const n = new Map(c);
      if (cant <= 0) n.delete(id);
      else n.set(id, cant);
      return n;
    });
  return {
    carrito,
    poner,
    vaciar: () => setCarrito(new Map()),
    items: [...carrito.entries()].map(([productoId, cant]) => ({ productoId, cant })),
  };
}

export function totalCarrito(carrito: Carrito, productos: ProductoBillar[]): number {
  let t = 0;
  for (const [id, cant] of carrito) t += (productos.find((p) => p.id === id)?.precio ?? 0) * cant;
  return round2(t);
}
