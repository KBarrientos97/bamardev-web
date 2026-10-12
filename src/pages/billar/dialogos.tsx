import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * Los diálogos del billar, en una pila. Los abren lugares que no se conocen
 * entre sí —la tarjeta, el panel, el menú "…", un aviso flotante, la lista de
 * ventas— y se dibuja sólo el de arriba: el ticket se abre desde el detalle de
 * la venta y al cerrarlo se vuelve al detalle (con dos a la vez, Escape
 * cerraba los dos).
 */

export type Dialogo =
  | { tipo: "abrir"; mesaId: number }
  | { tipo: "extender"; mesaId: number }
  | { tipo: "cambiar"; mesaId: number }
  | { tipo: "pausar"; mesaId: number }
  | { tipo: "fuera"; mesaId: number }
  | { tipo: "reservar"; mesaId: number }
  | { tipo: "pago"; mesaId: number }
  | { tipo: "anularMesa"; mesaId: number }
  | { tipo: "editarInicio"; mesaId: number }
  | { tipo: "historial"; mesaId: number }
  | { tipo: "anularConsumo"; mesaId: number; itemId: string }
  | { tipo: "venta"; codigo: string }
  | { tipo: "ticket"; codigo: string }
  | { tipo: "anularVenta"; codigo: string }
  | { tipo: "avisos" };

interface Pila {
  actual: Dialogo | null;
  abrir: (d: Dialogo) => void;
  /** Cierra el de arriba y vuelve al anterior, si había. */
  cerrar: () => void;
  /** Cierra todos (después de una acción que termina el flujo). */
  cerrarTodo: () => void;
  /**
   * Saca ESE diálogo, esté donde esté. Cerrar dos veces el mismo no cierra el
   * de abajo: después de anular una venta, el diálogo del PIN se iba solo (la
   * venta ya estaba anulada) y el cierre del botón se llevaba además el
   * detalle de la venta, que era a donde había que volver.
   */
  quitar: (d: Dialogo) => void;
}

const Contexto = createContext<Pila | null>(null);

export function DialogosProvider({ children }: { children: ReactNode }) {
  const [pila, setPila] = useState<Dialogo[]>([]);
  const abrir = useCallback((d: Dialogo) => setPila((p) => [...p, d]), []);
  const cerrar = useCallback(() => setPila((p) => p.slice(0, -1)), []);
  const cerrarTodo = useCallback(() => setPila([]), []);
  const quitar = useCallback((d: Dialogo) => setPila((p) => p.filter((x) => x !== d)), []);
  const valor = useMemo(
    () => ({ actual: pila[pila.length - 1] ?? null, abrir, cerrar, cerrarTodo, quitar }),
    [pila, abrir, cerrar, cerrarTodo, quitar],
  );
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useDialogos(): Pila {
  const p = useContext(Contexto);
  if (!p) throw new Error("useDialogos va dentro de <DialogosProvider>");
  return p;
}
