import { useLayoutEffect, useRef } from "react";

/**
 * El detalle de una venta que se abre DENTRO de otro diálogo (el de una caja,
 * el de los cobros de un medio) arranca arriba, donde está su "Volver", y al
 * volver la lista queda donde estaba (26-oct). Sin esto, desde un cobro del
 * fondo de la lista la venta se abría por la mitad, y al volver había que
 * buscar otra vez el renglón.
 *
 * `raiz` va en el único hijo del Modal: su padre es la parte que se desplaza.
 * `recordar()` se llama justo antes de abrir la venta.
 */
export function useScrollDelDialogo(abierta: unknown) {
  const raiz = useRef<HTMLDivElement>(null);
  const alto = useRef(0);
  useLayoutEffect(() => {
    const caja = raiz.current?.parentElement;
    if (!caja) return;
    caja.scrollTop = abierta != null ? 0 : alto.current;
  }, [abierta]);
  const recordar = () => {
    alto.current = raiz.current?.parentElement?.scrollTop ?? 0;
  };
  return { raiz, recordar };
}
