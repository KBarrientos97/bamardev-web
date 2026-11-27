import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { Producto, TipoPedido } from "../../types";
import type { AgregadoElegido, CatalogoAgregados } from "../../lib/agregados/tipos";
import { claveDeLinea, controlaStock, idsGuardados, paraVender, topeStock, useCarrito } from "./useCarrito";

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
    // Ficha farmacéutica: en un artículo de restaurante es todo neutro, que es
    // justo lo que el backend devuelve para él.
    principioActivo: null,
    concentracion: null,
    formaFarmaceutica: null,
    laboratorio: null,
    registroSanitario: null,
    condicionVenta: "LIBRE",
    manejaLote: false,
    controlado: false,
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

  it("lo vencido no cuenta para el tope: sigue en el estante pero no se vende", () => {
    // Farmacia: 5 en stock, 3 de ellas vencidas. El servidor rechaza la venta
    // que las necesite, así que el carrito no las deja cargar.
    const { result } = renderHook(() => useCarrito());
    const p = producto({ stockTotal: 5, stockVencido: 3 });
    expect(paraVender(p)).toBe(2);

    act(() => result.current.agregar(p));
    act(() => result.current.agregar(p));
    act(() => result.current.agregar(p));

    expect(result.current.lineas[0].cantidad).toBe(2);
  });

  it("sin stockVencido (el restaurante) el tope es el stock de siempre", () => {
    expect(paraVender(producto({ stockTotal: 4 }))).toBe(4);
  });

  it("el combo no pasa de su propio stock", () => {
    // Este test decía lo contrario ("no limita los combos, que no llevan
    // stock") y fijaba la regla vieja. Desde el 25-ago el combo tiene su
    // PROPIO stock y el backend rechaza la venta de mostrador que no alcanza:
    // sin tope, el carrito cargaba 3 combos de los 2 que había y el cobro
    // rebotaba al confirmar con "Stock insuficiente de …" (POS-2).
    const { result } = renderHook(() => useCarrito());
    const combo = producto({ id: 9, tipoProducto: "COMPUESTO", stockTotal: 2 });

    act(() => result.current.agregar(combo));
    act(() => result.current.agregar(combo));
    act(() => result.current.agregar(combo));
    expect(result.current.lineas[0].cantidad).toBe(2);

    // Escribir la cantidad tampoco lo pasa.
    act(() => result.current.setCantidad(9, 5));
    expect(result.current.lineas[0].cantidad).toBe(2);
  });

  it("un combo en 0 no entra al carrito", () => {
    const { result } = renderHook(() => useCarrito());
    act(() => result.current.agregar(producto({ id: 9, tipoProducto: "COMPUESTO", stockTotal: 0 })));
    expect(result.current.lineas).toHaveLength(0);
  });

  it("el elaborado sigue sin tope: se prepara al vender", () => {
    // Guarda: el cambio del combo no puede alcanzar al SERVICIO (el elaborado
    // del restaurante, el servicio de belleza, el paquete, la carrera).
    const { result } = renderHook(() => useCarrito());
    const elaborado = producto({ id: 8, tipoProducto: "SERVICIO", stockTotal: 0 });

    act(() => result.current.agregar(elaborado));
    act(() => result.current.agregar(elaborado));
    act(() => result.current.setCantidad(8, 40));

    expect(result.current.lineas[0].cantidad).toBe(40);
    expect(topeStock(elaborado)).toBe(Number.POSITIVE_INFINITY);
  });

  it("sólo el elaborado deja de controlar stock", () => {
    expect(controlaStock({ tipoProducto: "ALMACENABLE" })).toBe(true);
    expect(controlaStock({ tipoProducto: "COMPUESTO" })).toBe(true);
    expect(controlaStock({ tipoProducto: "SERVICIO" })).toBe(false);
  });

  it("vendiendo sin stock, nada se agota ni tiene tope aunque el stock esté en negativo", () => {
    // Configuración › Inventario y stock (09-nov): la pollería que no contó sus
    // bebidas tenía todo en cero y el POS no le dejaba cobrar ni una gaseosa.
    const coca = producto({ stockTotal: -12, vendeSinStock: true });
    expect(controlaStock(coca)).toBe(false);
    expect(topeStock(coca)).toBe(Number.POSITIVE_INFINITY);
    expect(controlaStock({ tipoProducto: "COMPUESTO", vendeSinStock: true })).toBe(false);

    const { result } = renderHook(() => useCarrito());
    act(() => result.current.agregar(coca));
    act(() => result.current.setCantidad(coca.id, 24));
    expect(result.current.lineas[0].cantidad).toBe(24);
  });

  it("farmacia: el tope sigue siendo lo vendible, sin lo vencido", () => {
    // Guarda: el tope del combo usa la misma cuenta, así que lo de siempre no
    // cambia — un almacenable con lotes vencidos se topa en lo que se vende.
    expect(topeStock(producto({ stockTotal: 10, stockVencido: 4 }))).toBe(6);
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

  it("pase oct: lo armado en el mostrador y pasado a delivery o recoger viaja para llevar", () => {
    // El carrito se arma con el pedido en LOCAL (líneas en mesa) y recién
    // después se toca "Delivery": sin esto la venta a domicilio se grababa
    // con consumo MESA y el historial le ponía la etiqueta "Mesa".
    const p = producto();
    const { result, rerender } = renderHook(({ t }) => useCarrito(t), {
      initialProps: { t: "LOCAL" as TipoPedido },
    });
    act(() => result.current.agregar(p));
    act(() => result.current.agregar(p));
    rerender({ t: "DELIVERY" });
    expect(result.current.aDetalles()).toEqual([
      expect.objectContaining({ productoId: 1, cantidad: 2, consumo: "LLEVAR" }),
    ]);
    rerender({ t: "RECOGER" });
    expect(result.current.aDetalles()).toEqual([expect.objectContaining({ cantidad: 2, consumo: "LLEVAR" })]);
    // Al volver al mostrador, el reparto que había elegido sigue ahí.
    rerender({ t: "LOCAL" });
    expect(result.current.aDetalles()).toEqual([expect.objectContaining({ cantidad: 2, consumo: "MESA" })]);
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

describe("useCarrito · la venta de la farmacia", () => {
  // La farmacia no se trae el catálogo: busca los artículos guardados. Con un
  // carrito vacío no hay nada que buscar, y antes eso dejaba al carrito sin
  // rehidratar para siempre — y sin rehidratar tampoco guardaba.
  beforeEach(() => sessionStorage.clear());

  it("con el catálogo 'listo' aunque esté vacío, guarda lo que se agrega", () => {
    const p = producto({ id: 7 });
    const { result } = renderHook(() => useCarrito("LOCAL", [], true));
    act(() => result.current.agregar(p));
    expect(idsGuardados("LOCAL")).toEqual([7]);
  });

  it("sin decir nada, se comporta como siempre: espera al catálogo", () => {
    const p = producto({ id: 7 });
    const { result } = renderHook(() => useCarrito("LOCAL", []));
    act(() => result.current.agregar(p));
    expect(idsGuardados("LOCAL")).toEqual([]);
  });
});

describe("useCarrito · en memoria (modificar una venta ya cobrada, 15-nov)", () => {
  beforeEach(() => sessionStorage.clear());

  it("arranca con las líneas que le dan y no lee ni pisa la venta a medio armar del mostrador", () => {
    // El mostrador tiene su venta guardada en la pestaña.
    sessionStorage.setItem("bamar.carrito.LOCAL", '[{"id":9,"cantidad":3,"enMesa":3,"nota":""}]');
    const pollo = producto({ id: 1, stockTotal: 5 });
    const { result } = renderHook(() =>
      useCarrito("LOCAL", [pollo], true, { inicial: [{ producto: pollo, cantidad: 2, enMesa: 2, nota: "sin ají" }] }),
    );
    expect(result.current.lineas.map((l) => [l.producto.id, l.cantidad, l.enMesa, l.nota])).toEqual([[1, 2, 2, "sin ají"]]);

    act(() => result.current.agregar(pollo));
    act(() => result.current.setCantidad(1, 1));
    expect(result.current.lineas[0].cantidad).toBe(1);
    // Lo del mostrador sigue como estaba.
    expect(sessionStorage.getItem("bamar.carrito.LOCAL")).toBe('[{"id":9,"cantidad":3,"enMesa":3,"nota":""}]');
  });

  it("vaciarlo tampoco borra lo guardado del mostrador", () => {
    sessionStorage.setItem("bamar.carrito.LOCAL", '[{"id":9,"cantidad":1,"enMesa":1,"nota":""}]');
    const pollo = producto({ id: 1 });
    const { result } = renderHook(() =>
      useCarrito("LOCAL", [pollo], true, { inicial: [{ producto: pollo, cantidad: 1, enMesa: 1, nota: "" }] }),
    );
    act(() => result.current.vaciar());
    expect(result.current.lineas).toHaveLength(0);
    expect(idsGuardados("LOCAL")).toEqual([9]);
  });

  it("respeta el mismo tope de stock y manda los renglones como una venta", () => {
    const coca = producto({ id: 2, precio: 23, stockTotal: 2 });
    const { result } = renderHook(() =>
      useCarrito("LOCAL", [coca], true, { inicial: [{ producto: coca, cantidad: 2, enMesa: 1, nota: "" }] }),
    );
    act(() => result.current.agregar(coca));
    expect(result.current.lineas[0].cantidad).toBe(2);
    expect(result.current.aDetalles()).toEqual([
      { productoId: 2, cantidad: 1, precio: 23, consumo: "MESA" },
      { productoId: 2, cantidad: 1, precio: 23, consumo: "LLEVAR" },
    ]);
  });
});

// ── Toppings (PLAN-AGREGADOS §7.4) ─────────────────────────────────────────

describe("useCarrito · vasos con toppings", () => {
  beforeEach(() => sessionStorage.clear());

  /** El Ganadero: un vaso de Bs 20 que trae 2 toppings y cobra los extras a su precio. */
  const vaso = producto({ id: 12, nombre: "Arroz con leche M", precio: 20, stockTotal: 10 });
  const catalogo: CatalogoAgregados = {
    activo: true,
    grupos: [
      {
        id: 7,
        nombre: "Toppings",
        incluidos: 2,
        precioExtra: null,
        maximo: null,
        opciones: [
          { productoId: 31, nombre: "Chubi", precio: 5, icono: null },
          { productoId: 32, nombre: "Oreo", precio: 5, icono: null },
          { productoId: 33, nombre: "Canela", precio: 5, icono: null },
        ],
      },
    ],
    productos: [{ productoId: 12, grupos: [{ grupoId: 7, incluidos: 2 }] }],
  };
  const tres: AgregadoElegido[] = [
    { grupoId: 7, productoId: 32, cantidad: 1 },
    { grupoId: 7, productoId: 31, cantidad: 1 },
    { grupoId: 7, productoId: 33, cantidad: 1 },
  ];

  it("el total suma los extras: vaso de Bs 20 con 2 incluidos y 1 extra es Bs 25", () => {
    const { result } = renderHook(() => useCarrito("LOCAL", [vaso], true, undefined, catalogo));
    act(() => result.current.agregar(vaso, tres));
    expect(result.current.total).toBe(25);
    expect(result.current.totalAgregados).toBe(5);
    // Un vaso es una unidad: los toppings no inflan el contador.
    expect(result.current.unidades).toBe(1);
    expect(result.current.lineas[0].vista?.hijas.map((h) => [h.nombre, h.incluido])).toEqual([
      ["Oreo", true],
      ["Chubi", true],
      ["Canela", false],
    ]);
  });

  it("con cantidad 2 cada vaso trae sus incluidos: los extras se multiplican", () => {
    const { result } = renderHook(() => useCarrito("LOCAL", [vaso], true, undefined, catalogo));
    act(() => result.current.agregar(vaso, tres));
    act(() => result.current.agregar(vaso, tres));
    expect(result.current.lineas).toHaveLength(1);
    expect(result.current.lineas[0].cantidad).toBe(2);
    expect(result.current.total).toBe(50);
  });

  it("dos vasos iguales con toppings distintos son líneas distintas", () => {
    const { result } = renderHook(() => useCarrito("LOCAL", [vaso], true, undefined, catalogo));
    act(() => result.current.agregar(vaso, tres));
    act(() => result.current.agregar(vaso, [tres[1]]));
    act(() => result.current.agregar(vaso));
    expect(result.current.lineas).toHaveLength(3);
    expect(result.current.unidades).toBe(3);
    expect(result.current.total).toBe(25 + 20 + 20);
  });

  it("el tope de stock es del producto: las líneas con toppings distintos comparten el stock", () => {
    const poco = producto({ id: 12, precio: 20, stockTotal: 2 });
    const { result } = renderHook(() => useCarrito("LOCAL", [poco], true, undefined, catalogo));
    act(() => result.current.agregar(poco, tres));
    act(() => result.current.agregar(poco, [tres[0]]));
    act(() => result.current.agregar(poco, [tres[1]]));
    expect(result.current.unidades).toBe(2);
  });

  it("aDetalles manda los toppings en orden, con el precio de cada extra, en las dos mitades de una línea partida", () => {
    const { result } = renderHook(() => useCarrito("LOCAL", [vaso], true, undefined, catalogo));
    act(() => result.current.agregar(vaso, tres));
    act(() => result.current.agregar(vaso, tres));
    const clave = claveDeLinea(result.current.lineas[0]);
    act(() => result.current.setEnMesa(clave, 1));
    const esperados = [
      { productoId: 32, cantidad: 1, grupoId: 7 },
      { productoId: 31, cantidad: 1, grupoId: 7 },
      { productoId: 33, cantidad: 1, grupoId: 7, precio: 5 },
    ];
    expect(result.current.aDetalles()).toEqual([
      { productoId: 12, cantidad: 1, precio: 20, consumo: "MESA", agregados: esperados },
      { productoId: 12, cantidad: 1, precio: 20, consumo: "LLEVAR", agregados: esperados },
    ]);
  });

  it("una línea sin toppings no manda el campo", () => {
    const { result } = renderHook(() => useCarrito("LOCAL", [vaso], true, undefined, catalogo));
    act(() => result.current.agregar(vaso));
    expect(result.current.aDetalles()[0]).not.toHaveProperty("agregados");
    expect(result.current.totalAgregados).toBe(0);
  });

  it("editar los toppings de una línea que queda igual a otra las junta", () => {
    const { result } = renderHook(() => useCarrito("LOCAL", [vaso], true, undefined, catalogo));
    act(() => result.current.agregar(vaso, tres));
    act(() => result.current.agregar(vaso, [tres[0]]));
    const segunda = claveDeLinea(result.current.lineas[1]);
    act(() => result.current.setAgregados(segunda, tres));
    expect(result.current.lineas).toHaveLength(1);
    expect(result.current.lineas[0].cantidad).toBe(2);
  });

  it("quitar toda la selección deja el vaso sin toppings", () => {
    const { result } = renderHook(() => useCarrito("LOCAL", [vaso], true, undefined, catalogo));
    act(() => result.current.agregar(vaso, tres));
    act(() => result.current.setAgregados(claveDeLinea(result.current.lineas[0]), []));
    expect(result.current.lineas[0].agregados).toBeUndefined();
    expect(result.current.total).toBe(20);
  });

  it("un F5 conserva lo elegido y recalcula los extras con el catálogo de hoy", () => {
    const primero = renderHook(() => useCarrito("LOCAL", [vaso], true, undefined, catalogo));
    act(() => primero.result.current.agregar(vaso, tres));
    primero.unmount();

    const hoy: CatalogoAgregados = {
      ...catalogo,
      grupos: [{ ...catalogo.grupos[0], opciones: catalogo.grupos[0].opciones.map((o) => ({ ...o, precio: 6 })) }],
    };
    const segundo = renderHook(() => useCarrito("LOCAL", [vaso], true, undefined, hoy));
    expect(segundo.result.current.lineas[0].agregados).toEqual(tres);
    expect(segundo.result.current.total).toBe(26);
  });

  it("sin el catálogo de toppings (ajuste apagado) las líneas son las de siempre", () => {
    const { result } = renderHook(() => useCarrito("LOCAL", [vaso]));
    act(() => result.current.agregar(vaso));
    expect(result.current.total).toBe(20);
    expect(result.current.lineas[0].vista).toBeUndefined();
  });
});

// ── El conteo por categoría (vasos por tamaño, 18-nov) ─────────────────────

describe("useCarrito · el tope del conteo es del tamaño, no del producto", () => {
  beforeEach(() => sessionStorage.clear());

  const C = { id: 1, nombre: "C" };
  const L = { id: 3, nombre: "L" };
  // El arroz con leche se prepara al vender: no lleva stock, sólo gasta vaso.
  const dulce = producto({ id: 21, nombre: "Dulce de leche C", tipoProducto: "SERVICIO", stockTotal: 0, categoria: C });
  const nutella = producto({ id: 22, nombre: "Nutella C", tipoProducto: "SERVICIO", stockTotal: 0, categoria: C });
  const gaseosa = producto({ id: 30, nombre: "Gaseosa", stockTotal: 500, categoria: { id: 5, nombre: "Bebidas" } });
  const catalogo = [dulce, nutella, gaseosa];
  const quedanC = (n: number | null) => new Map([[C.id, n]]);
  const cantidades = (lineas: { producto: Producto; cantidad: number }[]) =>
    lineas.map((l) => [l.producto.id, l.cantidad]);

  it("60 «Dulce de leche C» y 40 «Nutella C» llenan un C de 100: ninguno suma más, lo no contado sí", () => {
    const saldos = quedanC(100);
    const { result } = renderHook(() => useCarrito("LOCAL", catalogo, true, undefined, undefined, saldos));
    act(() => result.current.agregar(dulce));
    act(() => result.current.setCantidad(dulce.id, 60));
    act(() => result.current.agregar(nutella));
    act(() => result.current.setCantidad(nutella.id, 40));
    expect(result.current.unidades).toBe(100);
    act(() => result.current.agregar(dulce));
    act(() => result.current.agregar(nutella));
    act(() => result.current.setCantidad(nutella.id, 41));
    expect(cantidades(result.current.lineas)).toEqual([
      [21, 60],
      [22, 40],
    ]);
    act(() => result.current.agregar(gaseosa));
    expect(result.current.unidades).toBe(101);
  });

  it("setCantidad recorta a lo que queda menos lo que llevan las OTRAS líneas de ese tamaño", () => {
    const saldos = quedanC(100);
    const { result } = renderHook(() => useCarrito("LOCAL", catalogo, true, undefined, undefined, saldos));
    act(() => result.current.agregar(dulce));
    act(() => result.current.setCantidad(dulce.id, 60));
    act(() => result.current.agregar(nutella));
    act(() => result.current.setCantidad(nutella.id, 75));
    expect(cantidades(result.current.lineas)).toEqual([
      [21, 60],
      [22, 40],
    ]);
  });

  it("con 0 o menos en el local no entra ninguno de ese tamaño", () => {
    const saldos = quedanC(-2);
    const { result } = renderHook(() => useCarrito("LOCAL", catalogo, true, undefined, undefined, saldos));
    act(() => result.current.agregar(dulce));
    act(() => result.current.agregar(nutella));
    expect(result.current.lineas).toHaveLength(0);
  });

  it("nunca contado en el local (null) = sin tope", () => {
    const saldos = quedanC(null);
    const { result } = renderHook(() => useCarrito("LOCAL", catalogo, true, undefined, undefined, saldos));
    act(() => result.current.agregar(dulce));
    act(() => result.current.setCantidad(dulce.id, 500));
    expect(result.current.unidades).toBe(500);
  });

  it("sin saldos (Modificar venta, la farmacia, un negocio sin conteo) es el carrito de siempre", () => {
    const sinNada = renderHook(() => useCarrito("LOCAL", catalogo, true));
    act(() => sinNada.result.current.agregar(dulce));
    act(() => sinNada.result.current.setCantidad(dulce.id, 500));
    expect(sinNada.result.current.unidades).toBe(500);

    // Modificar una venta ya cobrada: en memoria y sin tope de conteo.
    const enMemoria = renderHook(() =>
      useCarrito("LOCAL", catalogo, true, { inicial: [{ producto: dulce, cantidad: 3, enMesa: 3, nota: "" }] }),
    );
    act(() => enMemoria.result.current.setCantidad(dulce.id, 300));
    expect(enMemoria.result.current.unidades).toBe(300);

    // El mapa vacío (el conteo apagado en el POS) también.
    const vacio = new Map<number, number | null>();
    const apagado = renderHook(() => useCarrito("DELIVERY", catalogo, true, undefined, undefined, vacio));
    act(() => apagado.result.current.agregar(nutella));
    act(() => apagado.result.current.setCantidad(nutella.id, 250));
    expect(apagado.result.current.unidades).toBe(250);
  });

  it("si otra caja vendió y el saldo bajó, el carrito no se recorta solo: no suma más y el «−» baja de a uno", () => {
    let saldos = quedanC(10);
    const { result, rerender } = renderHook(() => useCarrito("LOCAL", catalogo, true, undefined, undefined, saldos));
    act(() => result.current.agregar(dulce));
    act(() => result.current.setCantidad(dulce.id, 8));
    saldos = quedanC(5);
    rerender();
    expect(result.current.lineas[0].cantidad).toBe(8);
    act(() => result.current.agregar(dulce));
    act(() => result.current.setCantidad(dulce.id, 9));
    expect(result.current.lineas[0].cantidad).toBe(8);
    act(() => result.current.setCantidad(dulce.id, 7));
    expect(result.current.lineas[0].cantidad).toBe(7);
  });

  it("el topping incluido no gasta vaso; uno EXTRA de una categoría contada, sí (como en el saldo del servidor)", () => {
    const vasoL = producto({ id: 12, nombre: "Arroz con leche L", tipoProducto: "SERVICIO", stockTotal: 0, precio: 20, categoria: L });
    // Los toppings, de una categoría que también se cuenta (raro, pero el servidor lo cuenta así).
    const toppings = [31, 32, 33].map((id) => producto({ id, nombre: `Topping ${id}`, precio: 5, categoria: C }));
    const catalogoToppings: CatalogoAgregados = {
      activo: true,
      grupos: [
        {
          id: 7,
          nombre: "Toppings",
          incluidos: 2,
          precioExtra: null,
          maximo: null,
          opciones: toppings.map((t) => ({ productoId: t.id, nombre: t.nombre, precio: 5, icono: null })),
        },
      ],
      productos: [{ productoId: 12, grupos: [{ grupoId: 7, incluidos: 2 }] }],
    };
    // Dos incluidos y un extra (el 33).
    const tres: AgregadoElegido[] = [
      { grupoId: 7, productoId: 32, cantidad: 1 },
      { grupoId: 7, productoId: 31, cantidad: 1 },
      { grupoId: 7, productoId: 33, cantidad: 1 },
    ];
    const saldos = new Map<number, number | null>([
      [L.id, 10],
      [C.id, 1],
    ]);
    const { result } = renderHook(() =>
      useCarrito("LOCAL", [vasoL, ...toppings], true, undefined, catalogoToppings, saldos),
    );
    act(() => result.current.agregar(vasoL, tres));
    // El segundo pide otro C para su extra, y ya no queda.
    act(() => result.current.agregar(vasoL, tres));
    expect(result.current.unidades).toBe(1);
    // Con sólo un incluido no gasta C: entra.
    act(() => result.current.agregar(vasoL, [tres[0]]));
    expect(result.current.unidades).toBe(2);
  });
});

// ── El plato con receta (CONTRATO-recetas-plato §4.2, 27-nov) ──────────────

describe("useCarrito · el armado del plato con receta es parte de la línea", () => {
  beforeEach(() => sessionStorage.clear());

  /** Un cuarto de pollo con receta: 2 presas y la guarnición que puede ir «puro». */
  const cuarto = producto({
    id: 12,
    nombre: "Broaster cuarto",
    precio: 28,
    tipoProducto: "SERVICIO",
    stockTotal: 0,
    conReceta: true,
    receta: {
      presas: 2,
      partes: "POLLO_8",
      guarnicion: [
        { insumoId: 7, nombre: "Arroz", puro: true },
        { insumoId: 9, nombre: "Fideo", puro: true },
      ],
      alcanza: null,
    },
  });
  const pechoYAla = { piezas: { pecho: 1, ala: 1 } };
  const piernaYContra = { piezas: { pierna: 1, contra: 1 } };

  it("sin armado la clave es la de siempre: el id, igual que antes de las recetas", () => {
    const { result } = renderHook(() => useCarrito("LOCAL", [cuarto]));
    act(() => result.current.agregar(cuarto));
    act(() => result.current.agregar(cuarto, undefined, {}));
    expect(result.current.lineas).toHaveLength(1);
    expect(claveDeLinea(result.current.lineas[0])).toBe(12);
    expect(result.current.lineas[0]).not.toHaveProperty("armado");
    expect(result.current.aDetalles()[0]).not.toHaveProperty("armado");
  });

  it("con armado la clave suma «|a:» y su firma, que no depende del orden en que se marcó", () => {
    const a = claveDeLinea({ producto: cuarto, armado: { piezas: { ala: 1, pecho: 1 }, sin: [9, 7] } });
    const b = claveDeLinea({ producto: cuarto, armado: { piezas: { pecho: 1, ala: 1 }, sin: [7, 9] } });
    expect(a).toBe(b);
    expect(String(a)).toMatch(/^12\|a:/);
    // Con toppings la firma del armado va al final de la de siempre.
    const conToppings = claveDeLinea({ producto: cuarto, agregados: [{ grupoId: 1, productoId: 2, cantidad: 1 }], armado: pechoYAla });
    expect(String(conToppings)).toMatch(/^12\|1\.2x1\|a:/);
  });

  it("dos armados distintos no se juntan; el mismo otra vez suma a su línea", () => {
    const { result } = renderHook(() => useCarrito("LOCAL", [cuarto]));
    act(() => result.current.agregar(cuarto, undefined, pechoYAla));
    act(() => result.current.agregar(cuarto, undefined, piernaYContra));
    act(() => result.current.agregar(cuarto, undefined, { piezas: { ala: 1, pecho: 1 } }));
    act(() => result.current.agregar(cuarto));
    expect(result.current.lineas.map((l) => [l.armado ?? null, l.cantidad])).toEqual([
      [{ piezas: { ala: 1, pecho: 1 } }, 2],
      [{ piezas: { pierna: 1, contra: 1 } }, 1],
      [null, 1],
    ]);
    expect(result.current.unidades).toBe(4);
    expect(result.current.total).toBe(112);
  });

  it("aDetalles manda el armado en las dos mitades de una línea partida", () => {
    const { result } = renderHook(() => useCarrito("LOCAL", [cuarto]));
    act(() => result.current.agregar(cuarto, undefined, { ...piernaYContra, sin: [9] }));
    act(() => result.current.agregar(cuarto, undefined, { ...piernaYContra, sin: [9] }));
    act(() => result.current.setEnMesa(claveDeLinea(result.current.lineas[0]), 1));
    const armado = { piezas: { pierna: 1, contra: 1 }, sin: [9] };
    expect(result.current.aDetalles()).toStrictEqual([
      { productoId: 12, cantidad: 1, precio: 28, consumo: "MESA", armado },
      { productoId: 12, cantidad: 1, precio: 28, consumo: "LLEVAR", armado },
    ]);
  });

  it("si el catálogo ya no trae la receta (recetas apagadas), el armado no viaja", () => {
    const sinReceta = producto({ id: 12, precio: 28, tipoProducto: "SERVICIO" });
    const { result } = renderHook(() =>
      useCarrito("LOCAL", [sinReceta], true, { inicial: [{ producto: sinReceta, cantidad: 1, enMesa: 1, nota: "", armado: pechoYAla }] }),
    );
    expect(result.current.aDetalles()).toStrictEqual([{ productoId: 12, cantidad: 1, precio: 28, consumo: "MESA" }]);
  });

  it("cambiar el armado de una línea que queda igual a otra las junta; dejarlo vacío vuelve a la de siempre", () => {
    const { result } = renderHook(() => useCarrito("LOCAL", [cuarto]));
    act(() => result.current.agregar(cuarto, undefined, pechoYAla));
    act(() => result.current.agregar(cuarto, undefined, piernaYContra));
    act(() => result.current.setArmado?.(claveDeLinea(result.current.lineas[1]), pechoYAla));
    expect(result.current.lineas).toHaveLength(1);
    expect(result.current.lineas[0].cantidad).toBe(2);
    act(() => result.current.setArmado?.(claveDeLinea(result.current.lineas[0]), undefined));
    expect(result.current.lineas[0]).not.toHaveProperty("armado");
    expect(claveDeLinea(result.current.lineas[0])).toBe(12);
  });

  it("un F5 conserva el armado y lo guardado viejo o roto no rompe nada", () => {
    const primero = renderHook(() => useCarrito("LOCAL", [cuarto]));
    act(() => primero.result.current.agregar(cuarto, undefined, { ...pechoYAla, sin: [7] }));
    primero.unmount();
    const segundo = renderHook(() => useCarrito("LOCAL", [cuarto]));
    expect(segundo.result.current.lineas[0].armado).toEqual({ piezas: { ala: 1, pecho: 1 }, sin: [7] });
    segundo.unmount();

    sessionStorage.setItem(
      "bamar.carrito.LOCAL",
      JSON.stringify([{ id: 12, cantidad: 1, enMesa: 1, nota: "", armado: { piezas: { ala: "x" }, sin: "nada" } }]),
    );
    const tercero = renderHook(() => useCarrito("LOCAL", [cuarto]));
    expect(tercero.result.current.lineas).toHaveLength(1);
    expect(tercero.result.current.lineas[0]).not.toHaveProperty("armado");
    expect(claveDeLinea(tercero.result.current.lineas[0])).toBe(12);
  });
});
