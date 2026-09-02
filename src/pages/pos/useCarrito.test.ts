import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Producto } from "../../types";
import { useCarrito } from "./useCarrito";

function producto(over: Partial<Producto> = {}): Producto {
  return {
    id: 1,
    nombre: "Pollo Broaster",
    descripcion: null,
    codBarra: null,
    tipoProducto: "ALMACENABLE",
    precio: 10,
    costo: 6,
    stockMinimo: 0,
    habilitado: true,
    icono: null,
    categoria: null,
    unidadMedida: null,
    stockTotal: 5,
    componentes: [],
    ...over,
  };
}

describe("useCarrito", () => {
  it("suma unidades al agregar el mismo producto dos veces", () => {
    const { result } = renderHook(() => useCarrito());
    const p = producto();

    act(() => result.current.agregar(p));
    act(() => result.current.agregar(p));

    expect(result.current.lineas).toHaveLength(1);
    expect(result.current.lineas[0].cantidad).toBe(2);
    expect(result.current.unidades).toBe(2);
    expect(result.current.subtotal).toBe(20);
  });

  it("no deja pasar del stock disponible", () => {
    const { result } = renderHook(() => useCarrito());
    const p = producto({ stockTotal: 2 });

    act(() => result.current.agregar(p));
    act(() => result.current.agregar(p));
    act(() => result.current.agregar(p));

    expect(result.current.lineas[0].cantidad).toBe(2);
  });

  it("no limita los elaborados ni los combos, que no llevan stock", () => {
    const { result } = renderHook(() => useCarrito());
    const combo = producto({ id: 9, tipoProducto: "COMPUESTO", stockTotal: 0 });

    act(() => result.current.agregar(combo));
    act(() => result.current.agregar(combo));

    expect(result.current.lineas[0].cantidad).toBe(2);
  });

  it("quita la línea al bajar la cantidad de 1", () => {
    const { result } = renderHook(() => useCarrito());
    act(() => result.current.agregar(producto()));
    act(() => result.current.setCantidad(1, 0));

    expect(result.current.lineas).toHaveLength(0);
  });

  it("el total es igual al subtotal", () => {
    // El backend arma el total desde las líneas y exige que los pagos sumen
    // exactamente eso: si el total del carrito se desviara del subtotal, la
    // venta se rechazaría con un 400 al cobrar.
    const { result } = renderHook(() => useCarrito());
    act(() => result.current.agregar(producto({ precio: 100 })));
    act(() => result.current.setCantidad(1, 3));

    expect(result.current.subtotal).toBe(300);
    expect(result.current.total).toBe(300);
  });

  it("el total redondea a dos decimales", () => {
    const { result } = renderHook(() => useCarrito());
    act(() => result.current.agregar(producto({ precio: 0.1 })));
    act(() => result.current.setCantidad(1, 3));

    // 0.1 * 3 da 0.30000000000000004 en punto flotante.
    expect(result.current.total).toBe(0.3);
  });

  it("parte la línea en dos detalles cuando hay split mesa/llevar", () => {
    const { result } = renderHook(() => useCarrito());
    act(() => result.current.agregar(producto()));
    act(() => result.current.setCantidad(1, 3));
    act(() => result.current.setEnMesa(1, 2));

    const detalles = result.current.aDetalles();
    expect(detalles).toHaveLength(2);
    expect(detalles[0]).toMatchObject({ productoId: 1, cantidad: 2, consumo: "MESA" });
    expect(detalles[1]).toMatchObject({ productoId: 1, cantidad: 1, consumo: "LLEVAR" });
  });

  it("manda un solo detalle cuando la línea no está partida", () => {
    const { result } = renderHook(() => useCarrito());
    act(() => result.current.agregar(producto()));
    act(() => result.current.setCantidad(1, 2));

    const detalles = result.current.aDetalles();
    expect(detalles).toHaveLength(1);
    expect(detalles[0]).toMatchObject({ cantidad: 2, consumo: "LLEVAR" });
  });

  it("recorta el split al bajar la cantidad por debajo de lo que iba a mesa", () => {
    const { result } = renderHook(() => useCarrito());
    act(() => result.current.agregar(producto()));
    act(() => result.current.setCantidad(1, 4));
    act(() => result.current.setEnMesa(1, 4));
    act(() => result.current.setCantidad(1, 2));

    expect(result.current.lineas[0].enMesa).toBe(2);
    expect(result.current.aDetalles()).toHaveLength(1);
  });

  it("no deja marcar más unidades en mesa que las de la línea", () => {
    const { result } = renderHook(() => useCarrito());
    act(() => result.current.agregar(producto()));
    act(() => result.current.setEnMesa(1, 9));

    expect(result.current.lineas[0].enMesa).toBe(1);
  });

  it("marca todo el carrito como mesa", () => {
    const { result } = renderHook(() => useCarrito());
    act(() => result.current.agregar(producto({ id: 1 })));
    act(() => result.current.agregar(producto({ id: 2, nombre: "Gaseosa" })));
    act(() => result.current.setConsumoTodo("MESA"));

    expect(result.current.aDetalles().every((d) => d.consumo === "MESA")).toBe(true);
  });

  it("incluye la nota del cliente en los dos lados del split", () => {
    const { result } = renderHook(() => useCarrito());
    act(() => result.current.agregar(producto()));
    act(() => result.current.setCantidad(1, 2));
    act(() => result.current.setEnMesa(1, 1));
    act(() => result.current.setNota(1, "sin cebolla"));

    const detalles = result.current.aDetalles();
    expect(detalles).toHaveLength(2);
    expect(detalles.every((d) => d.nota === "sin cebolla")).toBe(true);
  });

  it("vaciar deja el carrito en cero", () => {
    const { result } = renderHook(() => useCarrito());
    act(() => result.current.agregar(producto()));
    act(() => result.current.vaciar());

    expect(result.current.lineas).toHaveLength(0);
    expect(result.current.unidades).toBe(0);
    expect(result.current.total).toBe(0);
  });
});
