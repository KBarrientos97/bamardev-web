import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
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

describe("useCarrito · el carrito sobrevive a un F5", () => {
  // El caso real: el cajero carga quince items, el navegador recarga la
  // pestaña (o le da F5 sin querer) y la venta se perdía entera, con el
  // cliente enfrente.
  beforeEach(() => sessionStorage.clear());

  it("rehidrata las líneas guardadas contra el catálogo", () => {
    const p = producto();
    const primero = renderHook(() => useCarrito("LOCAL", [p]));
    act(() => primero.result.current.agregar(p));
    act(() => primero.result.current.setCantidad(p.id, 3));
    primero.unmount();

    // Otro montaje = lo que pasa al recargar la página.
    const segundo = renderHook(() => useCarrito("LOCAL", [p]));
    expect(segundo.result.current.lineas).toHaveLength(1);
    expect(segundo.result.current.unidades).toBe(3);
  });

  it("usa el precio de HOY, no el de cuando se cargó la línea", () => {
    // Se guardan ids, no productos: si el dueño cambió el precio mientras el
    // carrito estaba a medio armar, la venta tiene que cobrar el nuevo.
    const antes = producto({ precio: 10 });
    const primero = renderHook(() => useCarrito("LOCAL", [antes]));
    act(() => primero.result.current.agregar(antes));
    primero.unmount();

    const despues = producto({ precio: 15 });
    const segundo = renderHook(() => useCarrito("LOCAL", [despues]));
    expect(segundo.result.current.lineas[0].producto.precio).toBe(15);
    expect(segundo.result.current.total).toBe(15);
  });

  it("descarta lo que ya no está en el catálogo", () => {
    // El artículo se dio de baja mientras el carrito esperaba: no puede volver
    // —la venta lo rechazaría— y el resto del carrito sí.
    const a = producto({ id: 1 });
    const b = producto({ id: 2, nombre: "Gaseosa" });
    const primero = renderHook(() => useCarrito("LOCAL", [a, b]));
    act(() => primero.result.current.agregar(a));
    act(() => primero.result.current.agregar(b));
    primero.unmount();

    const segundo = renderHook(() => useCarrito("LOCAL", [a]));
    expect(segundo.result.current.lineas).toHaveLength(1);
    expect(segundo.result.current.lineas[0].producto.id).toBe(1);
  });

  it("el carrito del mostrador y el del delivery no se pisan", () => {
    const p = producto();
    const local = renderHook(() => useCarrito("LOCAL", [p]));
    act(() => local.result.current.agregar(p));
    local.unmount();

    const delivery = renderHook(() => useCarrito("DELIVERY", [p]));
    expect(delivery.result.current.lineas).toHaveLength(0);
  });

  it("vaciar el carrito también lo borra de la sesión", () => {
    const p = producto();
    const primero = renderHook(() => useCarrito("LOCAL", [p]));
    act(() => primero.result.current.agregar(p));
    act(() => primero.result.current.vaciar());
    primero.unmount();

    const segundo = renderHook(() => useCarrito("LOCAL", [p]));
    expect(segundo.result.current.lineas).toHaveLength(0);
  });
});

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
    // En el local lo nuevo arranca en MESA, como en la app.
    expect(detalles[0]).toMatchObject({ cantidad: 2, consumo: "MESA" });
  });

  it("en el local lo nuevo arranca en mesa", () => {
    const { result } = renderHook(() => useCarrito("LOCAL"));
    act(() => result.current.agregar(producto()));
    expect(result.current.lineas[0].enMesa).toBe(1);
  });

  it("en un delivery no hay mesa: lo nuevo arranca para llevar", () => {
    const { result } = renderHook(() => useCarrito("DELIVERY"));
    act(() => result.current.agregar(producto()));
    expect(result.current.lineas[0].enMesa).toBe(0);
  });

  it("sumar una unidad a una línea entera en mesa la deja entera en mesa", () => {
    // Sin esto, la segunda unidad de un pedido de mesa se iba sola a "llevar"
    // y la comanda salía partida sin que nadie lo pidiera.
    const { result } = renderHook(() => useCarrito("LOCAL"));
    act(() => result.current.agregar(producto()));
    act(() => result.current.agregar(producto()));

    expect(result.current.lineas[0]).toMatchObject({ cantidad: 2, enMesa: 2 });
  });

  it("sumar una unidad a una línea partida no toca el reparto", () => {
    const { result } = renderHook(() => useCarrito("LOCAL"));
    act(() => result.current.agregar(producto()));
    act(() => result.current.setCantidad(1, 3));
    act(() => result.current.setEnMesa(1, 1));
    act(() => result.current.agregar(producto()));

    expect(result.current.lineas[0]).toMatchObject({ cantidad: 4, enMesa: 1 });
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
