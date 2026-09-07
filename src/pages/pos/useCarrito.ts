import { useCallback, useMemo, useState } from "react";
import type { Consumo, DetalleVentaInput, Producto, TipoPedido } from "../../types";

/**
 * Una línea del carrito. El split Mesa/Llevar se guarda como cantidad en mesa:
 * lo que no está en mesa se lleva. Se maneja así (y no como dos líneas) porque
 * la comanda necesita saber que "3 pollos, 2 para mesa y 1 para llevar" es un
 * mismo pedido, y porque el cajero cambia el split sin re-teclear cantidades.
 */
export interface LineaCarrito {
  producto: Producto;
  cantidad: number;
  /** Cuántas unidades de esta línea se consumen en mesa (0..cantidad). */
  enMesa: number;
  nota: string;
}

export interface Carrito {
  lineas: LineaCarrito[];
  unidades: number;
  subtotal: number;
  /**
   * Igual al subtotal. El backend calcula el total desde las líneas y exige
   * que los pagos sumen exactamente eso, así que no hay dónde meter un
   * descuento: se deja el campo para no salpicar las pantallas de cálculos.
   */
  total: number;
  agregar: (p: Producto) => void;
  setCantidad: (id: number, cantidad: number) => void;
  setNota: (id: number, nota: string) => void;
  setEnMesa: (id: number, enMesa: number) => void;
  /** Marca la línea entera como mesa o llevar. */
  setConsumo: (id: number, consumo: Consumo) => void;
  /** Marca TODO el carrito como mesa o llevar. */
  setConsumoTodo: (consumo: Consumo) => void;
  quitar: (id: number) => void;
  vaciar: () => void;
  /** Lo que espera POST /ventas: una línea por cada consumo distinto. */
  aDetalles: () => DetalleVentaInput[];
}

/** Un artículo con stock agotado no se puede seguir sumando. */
function topeStock(p: Producto): number {
  // Elaborados y combos no llevan stock propio: se preparan al vender.
  if (p.tipoProducto !== "ALMACENABLE") return Number.POSITIVE_INFINITY;
  return p.stockTotal;
}

export function useCarrito(tipoPedido: TipoPedido = "LOCAL"): Carrito {
  const [lineas, setLineas] = useState<LineaCarrito[]>([]);

  /**
   * Consumo con el que nace una línea nueva. En el local la mayoría se sienta
   * a comer, así que MESA es el default y LLEVAR la excepción que se marca;
   * un delivery o un "recoger" no tienen mesa y ahí no hay más opción que
   * LLEVAR. Mismo criterio que `CarritoViewModel.consumoPorDefecto` (Android).
   */
  const enMesaPorDefecto = tipoPedido === "LOCAL";

  const agregar = useCallback(
    (p: Producto) => {
      setLineas((prev) => {
        const ex = prev.find((l) => l.producto.id === p.id);
        const tope = topeStock(p);
        if (!ex) {
          if (tope < 1) return prev;
          return [
            ...prev,
            { producto: p, cantidad: 1, enMesa: enMesaPorDefecto ? 1 : 0, nota: "" },
          ];
        }
        if (ex.cantidad >= tope) return prev;
        // Al subir la cantidad, una línea entera en mesa sigue entera en mesa:
        // si no, sumar la segunda unidad la mandaba sola a "llevar".
        const pura = ex.enMesa === ex.cantidad;
        return prev.map((l) =>
          l.producto.id === p.id
            ? { ...l, cantidad: l.cantidad + 1, enMesa: pura ? l.enMesa + 1 : l.enMesa }
            : l,
        );
      });
    },
    [enMesaPorDefecto],
  );

  const quitar = useCallback((id: number) => {
    setLineas((prev) => prev.filter((l) => l.producto.id !== id));
  }, []);

  const setCantidad = useCallback(
    (id: number, cantidad: number) => {
      if (cantidad < 1) return quitar(id);
      setLineas((prev) =>
        prev.map((l) => {
          if (l.producto.id !== id) return l;
          const tope = topeStock(l.producto);
          const nueva = Math.min(cantidad, tope);
          // Una línea entera en un consumo se queda entera en ese consumo al
          // cambiar la cantidad: subir de 2 a 3 en una mesa no manda la tercera
          // unidad a "llevar" sola. Si estaba partida, el reparto se conserva y
          // sólo se recorta para no exceder la cantidad nueva. Es lo que hace
          // `CarritoViewModel.ajustarTotal` en la app.
          const pura = l.enMesa === l.cantidad;
          return {
            ...l,
            cantidad: nueva,
            enMesa: pura ? nueva : Math.min(l.enMesa, nueva),
          };
        }),
      );
    },
    [quitar],
  );

  const setNota = useCallback((id: number, nota: string) => {
    setLineas((prev) => prev.map((l) => (l.producto.id === id ? { ...l, nota } : l)));
  }, []);

  const setEnMesa = useCallback((id: number, enMesa: number) => {
    setLineas((prev) =>
      prev.map((l) =>
        l.producto.id === id
          ? { ...l, enMesa: Math.max(0, Math.min(enMesa, l.cantidad)) }
          : l,
      ),
    );
  }, []);

  const setConsumo = useCallback((id: number, consumo: Consumo) => {
    setLineas((prev) =>
      prev.map((l) =>
        l.producto.id === id ? { ...l, enMesa: consumo === "MESA" ? l.cantidad : 0 } : l,
      ),
    );
  }, []);

  const setConsumoTodo = useCallback((consumo: Consumo) => {
    setLineas((prev) =>
      prev.map((l) => ({ ...l, enMesa: consumo === "MESA" ? l.cantidad : 0 })),
    );
  }, []);

  const vaciar = useCallback(() => {
    setLineas([]);
  }, []);

  const { unidades, subtotal } = useMemo(() => {
    let u = 0;
    let s = 0;
    for (const l of lineas) {
      u += l.cantidad;
      s += l.cantidad * l.producto.precio;
    }
    return { unidades: u, subtotal: s };
  }, [lineas]);

  const total = useMemo(() => Math.round(subtotal * 100) / 100, [subtotal]);

  const aDetalles = useCallback((): DetalleVentaInput[] => {
    const out: DetalleVentaInput[] = [];
    for (const l of lineas) {
      const nota = l.nota.trim() || undefined;
      // Una línea partida viaja como dos detalles: el backend guarda el
      // consumo por detalle, así la comanda sabe qué va a la mesa.
      if (l.enMesa > 0) {
        out.push({
          productoId: l.producto.id,
          cantidad: l.enMesa,
          precio: l.producto.precio,
          consumo: "MESA",
          ...(nota ? { nota } : {}),
        });
      }
      const llevar = l.cantidad - l.enMesa;
      if (llevar > 0) {
        out.push({
          productoId: l.producto.id,
          cantidad: llevar,
          precio: l.producto.precio,
          consumo: "LLEVAR",
          ...(nota ? { nota } : {}),
        });
      }
    }
    return out;
  }, [lineas]);

  return {
    lineas,
    unidades,
    subtotal,
    total,
    agregar,
    setCantidad,
    setNota,
    setEnMesa,
    setConsumo,
    setConsumoTodo,
    quitar,
    vaciar,
    aDetalles,
  };
}
