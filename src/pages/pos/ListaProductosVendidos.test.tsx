import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReporteCierreProductos } from "../../types";
import ListaProductosVendidos, { ListaDeProductos } from "./ListaProductosVendidos";

/**
 * La lista de lo vendido en un turno: el modal "Productos vendidos" del cierre
 * (todos los rubros), Reportes › Cierres y "Lo que salió en el turno" de la
 * Supervisión del billar. Lo que se mira es el texto: jsdom no aplica las
 * container queries, así que están las dos formas (columnas y dos renglones).
 */

const item = (productoId: number, nombre: string, cantidad: number, precio: number, extra: object = {}) => ({
  productoId,
  nombre,
  cantidad,
  precio,
  total: Math.round(cantidad * precio * 100) / 100,
  ...extra,
});

const RESTAURANTE: ReporteCierreProductos = {
  unidades: 4,
  total: 60,
  lineas: 1,
  categorias: [{ nombre: "Cervezas", unidades: 4, total: 60, items: [item(1, "Paceña 620 ml", 4, 15)] }],
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("lo vendido en el turno (todos los rubros)", () => {
  it("la cantidad va sin ceros y la plata con centavos: «4 u × Bs 15,00», no «4,00 × Bs 15,00»", () => {
    render(<ListaProductosVendidos d={RESTAURANTE} />);
    expect(screen.getByText("4 unidades · 1 producto")).toBeInTheDocument();
    expect(screen.getByText("4 u × Bs 15,00")).toBeInTheDocument();
    // Lo que resume, la categoría y el renglón: los tres con centavos.
    expect(screen.getAllByText("Bs 60,00")).toHaveLength(3);
    expect(screen.queryByText(/4,00/)).toBeNull();
  });

  it("con ancho lleva títulos de columna: Producto, Cant., Precio y Total", () => {
    render(<ListaProductosVendidos d={RESTAURANTE} />);
    for (const titulo of ["Producto", "Cant.", "Precio", "Total"]) expect(screen.getByText(titulo)).toBeInTheDocument();
    // Las columnas: la cantidad sola (la de la categoría y la del producto) y el precio con sus centavos.
    expect(screen.getAllByText("4")).toHaveLength(2);
    expect(screen.getByText("Bs 15,00")).toBeInTheDocument();
  });

  it("una sola es «1 unidad», no «1 unidades»", () => {
    render(
      <ListaProductosVendidos
        d={{ unidades: 1, total: 25, lineas: 1, categorias: [{ nombre: "Cervezas", unidades: 1, total: 25, items: [item(1, "PACEÑA BOTELLA", 1, 25)] }] }}
      />,
    );
    expect(screen.getByText("1 unidad · 1 producto")).toBeInTheDocument();
    expect(screen.getByText("1 u × Bs 25,00")).toBeInTheDocument();
  });

  it("un producto que se vendió a dos precios no dice un precio que no multiplica", () => {
    // 2 a Bs 10 y 1 a Bs 8: el backend manda Bs 9,33 de promedio, y "3 × Bs 9,33" no da los Bs 28.
    render(
      <ListaProductosVendidos
        d={{
          unidades: 3,
          total: 28,
          lineas: 1,
          categorias: [{ nombre: "Cervezas", unidades: 3, total: 28, items: [{ productoId: 2, nombre: "PALITO PACEÑA", cantidad: 3, precio: 9.33, total: 28 }] }],
        }}
      />,
    );
    expect(screen.getByText("3 u · varios precios")).toBeInTheDocument();
    expect(screen.getByText("varios precios")).toBeInTheDocument();
    expect(screen.queryByText(/9,33/)).toBeNull();
  });

  it("un nombre largo no se corta sin remedio: el nombre entero queda a mano", () => {
    const largo = "CERVEZA PACEÑA BOTELLA RETORNABLE DE 1 LITRO CON ENVASE";
    render(<ListaProductosVendidos d={{ ...RESTAURANTE, categorias: [{ ...RESTAURANTE.categorias[0], items: [item(1, largo, 4, 15)] }] }} />);
    expect(screen.getByText(largo)).toHaveAttribute("title", largo);
  });

  it("dos artículos que se llaman igual son dos filas, sin keys repetidas", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ListaProductosVendidos
        d={{
          unidades: 3,
          total: 30,
          lineas: 2,
          categorias: [{ nombre: "Cervezas", unidades: 3, total: 30, items: [item(1, "PALITO PACEÑA", 2, 10), item(7, "PALITO PACEÑA", 1, 10)] }],
        }}
      />,
    );
    expect(screen.getAllByText("PALITO PACEÑA")).toHaveLength(2);
    expect(error).not.toHaveBeenCalled();
  });
});

describe("billar: el tiempo de mesa no es un producto (25-oct)", () => {
  const BILLAR: ReporteCierreProductos = {
    unidades: 7,
    total: 130,
    lineas: 5,
    categorias: [
      {
        nombre: "Sin categoría",
        unidades: 4,
        total: 80,
        items: [item(99, "Tiempo de mesa", 2, 25, { tiempoMesa: true }), item(5, "Cerveza", 2, 15)],
      },
      { nombre: "Cervezas", unidades: 2, total: 35, items: [item(1, "PACEÑA BOTELLA", 1, 25), item(2, "PALITO PACEÑA", 1, 10)] },
      { nombre: "Cigarros", unidades: 1, total: 15, items: [item(3, "HILLS", 1, 15)] },
    ],
  };

  it("va arriba en su propio renglón y no cuenta como unidades ni como producto", () => {
    render(<ListaProductosVendidos d={BILLAR} />);
    expect(screen.getByText("Tiempo de mesa · 2 mesas cobradas")).toBeInTheDocument();
    expect(screen.getByText("Bs 50,00")).toBeInTheDocument();
    // Antes: "7 unidades · 5 productos · Bs 130", con dos mesas contadas como unidades.
    expect(screen.getByText("5 unidades · 4 productos")).toBeInTheDocument();
    expect(screen.getByText("Bs 80,00")).toBeInTheDocument();
    // Ni como renglón de producto ni con el precio promedio por mesa ("2 × Bs 25").
    expect(screen.queryByText("Tiempo de mesa")).toBeNull();
    expect(screen.queryByText("2 u × Bs 25,00")).toBeNull();
    // Su categoría queda con lo que de verdad salió.
    expect(screen.getByText("Sin categoría")).toBeInTheDocument();
    expect(screen.getByText("2 u × Bs 15,00")).toBeInTheDocument();
  });

  it("si la categoría sólo tenía el tiempo, no queda una categoría vacía", () => {
    render(
      <ListaProductosVendidos
        d={{
          unidades: 3,
          total: 40,
          lineas: 2,
          categorias: [
            { nombre: "Cervezas", unidades: 2, total: 30, items: [item(1, "Paceña", 2, 15)] },
            { nombre: "Sin categoría", unidades: 1, total: 10, items: [item(99, "Tiempo de mesa", 1, 10, { tiempoMesa: true })] },
          ],
        }}
      />,
    );
    expect(screen.getByText("Tiempo de mesa · 1 mesa cobrada")).toBeInTheDocument();
    expect(screen.queryByText("Sin categoría")).toBeNull();
    expect(screen.getByText("2 unidades · 1 producto")).toBeInTheDocument();
  });
});

describe("con tope: los primeros y «Ver los N»", () => {
  // 9 productos en dos categorías, del que más salió al que menos.
  const MUCHOS: ReporteCierreProductos = {
    unidades: 45,
    total: 450,
    lineas: 9,
    categorias: [
      { nombre: "Cervezas", unidades: 35, total: 350, items: [9, 8, 7, 6, 5].map((n) => item(n, `Cerveza ${n}`, n, 10)) },
      { nombre: "Cigarros", unidades: 10, total: 100, items: [4, 3, 2, 1].map((n) => item(10 + n, `Cigarro ${n}`, n, 10)) },
    ],
  };

  it("muestra los primeros 6 y despliega el resto", () => {
    render(<ListaProductosVendidos d={MUCHOS} limite={6} />);
    expect(screen.getByText("Cerveza 9")).toBeInTheDocument();
    expect(screen.getByText("Cigarro 4")).toBeInTheDocument();
    expect(screen.queryByText("Cigarro 3")).toBeNull();
    // El resumen sigue siendo el de todo, no el de lo que se ve.
    expect(screen.getByText("45 unidades · 9 productos")).toBeInTheDocument();
    const ver = screen.getByRole("button", { name: "Ver los 9 productos" });
    expect(ver).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(ver);
    expect(screen.getByText("Cigarro 1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ver menos" }));
    expect(screen.queryByText("Cigarro 1")).toBeNull();
  });

  it("sin tope (el modal del cierre) se ven todos", () => {
    render(<ListaProductosVendidos d={MUCHOS} />);
    expect(screen.getByText("Cigarro 1")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Ver los/ })).toBeNull();
  });
});

describe("la lista sin categorías (lo pedido en las mesas abiertas)", () => {
  it("el mismo renglón que lo cobrado, con su resumen", () => {
    render(
      <ListaDeProductos
        renglones={[
          { clave: "p7", nombre: "CONTI PALITO", cantidad: 2, precio: 8, total: 16 },
          { clave: "p8", nombre: "PALITO PACEÑA", cantidad: 1, precio: 10, total: 10 },
          { clave: "p9", nombre: "CONTI", cantidad: 1, precio: null, total: 8 },
        ]}
      />,
    );
    expect(screen.getByText("4 unidades · 3 productos")).toBeInTheDocument();
    expect(screen.getByText("Bs 34,00")).toBeInTheDocument();
    expect(screen.getByText("2 u × Bs 8,00")).toBeInTheDocument();
    expect(screen.getByText("1 u · varios precios")).toBeInTheDocument();
  });
});

describe("11-nov: lo fiado sale el día que se fía, marcado; el cobro entra sin producto", () => {
  const CON_FIADO: ReporteCierreProductos = {
    unidades: 6,
    total: 90,
    lineas: 2,
    categorias: [
      {
        nombre: "Cervezas",
        unidades: 6,
        total: 90,
        items: [item(1, "Paceña 620 ml", 4, 15, { fiado: 2 }), item(2, "Huari", 2, 15)],
      },
    ],
    fiado: { ventas: 1, unidades: 2, total: 30, adelantos: 0, porCobrar: 30 },
    cobrosDeFiado: { total: 45 },
  };

  it("el producto fiado se cuenta entero y dice cuántas salieron fiadas", () => {
    render(<ListaProductosVendidos d={CON_FIADO} />);
    // Las 4 unidades del renglón, no sólo las 2 cobradas: salieron las 4.
    expect(screen.getByText("4 u × Bs 15,00")).toBeInTheDocument();
    expect(screen.getByText("2 al fiado")).toBeInTheDocument();
    // El que no se fió no dice nada.
    expect(screen.getAllByText(/al fiado$/)).toHaveLength(1);
  });

  it("arriba va lo fiado en ámbar con lo que quedó por cobrar, sin sacarlo del total", () => {
    render(<ListaProductosVendidos d={CON_FIADO} />);
    expect(screen.getByText("6 unidades · 2 productos").closest("div")).toHaveTextContent("Bs 90,00");
    const fiado = screen.getByText("Al fiado · 2 unidades");
    // El texto va en un span pelado adentro del que lleva el color.
    expect(fiado.parentElement).toHaveClass("text-amber-700");
    expect(fiado.closest("div")).toHaveTextContent("Bs 30,00");
  });

  it("explica lo que salió sin plata y la plata que entró sin producto", () => {
    render(<ListaProductosVendidos d={CON_FIADO} />);
    expect(screen.getByText("2 unidades en 1 venta al fiado: Bs 30,00 que no entraron al cajón.")).toBeInTheDocument();
    expect(
      screen.getByText("Además entraron Bs 45,00 de cobros de fiado, sin producto: esos salieron el día que se fiaron."),
    ).toBeInTheDocument();
  });

  it("sin fiado ni cobros (un servidor anterior, o un turno sin fiados), la lista de siempre", () => {
    render(<ListaProductosVendidos d={RESTAURANTE} />);
    expect(screen.queryByText(/al fiado/)).not.toBeInTheDocument();
    expect(screen.queryByText(/cobros de fiado/)).not.toBeInTheDocument();
  });
});

describe("los pedidos de Yango y PedidosYa (PLAN-PEDIDOS-PLATAFORMA §11)", () => {
  const CON_PLATAFORMAS: ReporteCierreProductos = {
    ...RESTAURANTE,
    plataformas: [
      {
        plataforma: "YANGO",
        pedidos: 3,
        unidades: 5,
        total: 85,
        categorias: [{ nombre: "Pollos", unidades: 5, total: 85, items: [item(7, "Brasa medio", 1, 56), item(8, "Brasa cuarto", 4, 7.25)] }],
      },
      {
        plataforma: "PEDIDOS_YA",
        pedidos: 1,
        unidades: 1,
        total: 15,
        categorias: [{ nombre: "Gaseosas", unidades: 1, total: 15, items: [item(9, "Coca Cola 1.5L", 1, 15)] }],
      },
    ],
  };

  it("una sección por plataforma con su marca, pedidos, unidades, y total", () => {
    render(<ListaProductosVendidos d={CON_PLATAFORMAS} />);
    const yango = screen.getByRole("region", { name: "Yango · 3 pedidos · 5 unidades · Bs 85,00" });
    expect(yango).toHaveTextContent("3 pedidos · 5 unidades");
    expect(yango).toHaveTextContent("Bs 85,00");
    expect(yango).not.toHaveTextContent(/No se cobra/);
    expect(yango.querySelector('[data-plataforma="YANGO"]')).toHaveTextContent("Yango");
    expect(yango).toHaveTextContent("Brasa medio");
    expect(yango).toHaveTextContent("4 u × Bs 7,25");
    const pya = screen.getByRole("region", { name: "PedidosYa · 1 pedido · 1 unidad · Bs 15,00" });
    expect(pya.querySelector('[data-plataforma="PEDIDOS_YA"]')).toHaveTextContent("PedidosYa");
    expect(pya).toHaveTextContent("Coca Cola 1.5L");
  });

  it("van después de lo vendido y no cambian su total, sus unidades ni sus productos", () => {
    render(<ListaProductosVendidos d={CON_PLATAFORMAS} />);
    expect(screen.getByText("4 unidades · 1 producto").closest("div")).toHaveTextContent("Bs 60,00");
    const resumen = screen.getByText("4 unidades · 1 producto");
    const yango = screen.getByRole("region", { name: /^Yango/ });
    // Orden del documento: el resumen de las ventas y después las plataformas.
    expect(resumen.compareDocumentPosition(yango) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Lo de las ventas no se mezcla con lo de las plataformas.
    expect(screen.getAllByText("Paceña 620 ml")).toHaveLength(1);
    expect(screen.queryByRole("region", { name: /Paceña/ })).toBeNull();
  });

  it("sin el campo, o vacío, la lista de siempre", () => {
    const { container, rerender } = render(<ListaProductosVendidos d={RESTAURANTE} />);
    expect(screen.queryByRole("region")).toBeNull();
    expect(screen.queryByText("No se cobra en caja")).toBeNull();
    const antes = container.innerHTML;
    rerender(<ListaProductosVendidos d={{ ...RESTAURANTE, plataformas: [] }} />);
    expect(container.innerHTML).toBe(antes);
  });

  it("con descuentos de la app (19-nov): el encabezado dice lo que paga la app y la tabla termina con «Descuentos»", () => {
    const [yangoBase, pyaBase] = CON_PLATAFORMAS.plataformas!;
    render(<ListaProductosVendidos d={{ ...CON_PLATAFORMAS, plataformas: [{ ...yangoBase, descuentos: 6 }, pyaBase] }} />);
    // 85 de renglones − 6 de descuentos = 79, lo que paga la app.
    const yango = screen.getByRole("region", { name: "Yango · 3 pedidos · 5 unidades · Bs 79,00" });
    const fila = yango.querySelector("[data-descuentos-plataforma]")!;
    expect(fila).toHaveTextContent("Descuentos");
    expect(fila).toHaveTextContent("−Bs 6,00");
    // Es lo último de la tabla de la sección, debajo de los productos.
    expect(yango.lastElementChild?.lastElementChild).toBe(fila);
    expect(screen.getByText("Brasa medio").compareDocumentPosition(fila) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // La otra plataforma, sin descuentos: como siempre.
    const pya = screen.getByRole("region", { name: "PedidosYa · 1 pedido · 1 unidad · Bs 15,00" });
    expect(pya.querySelector("[data-descuentos-plataforma]")).toBeNull();
  });

  it("sin descuentos (ausente o 0) la sección es exactamente la de hoy", () => {
    const { container, rerender } = render(<ListaProductosVendidos d={CON_PLATAFORMAS} />);
    const antes = container.innerHTML;
    rerender(
      <ListaProductosVendidos
        d={{ ...CON_PLATAFORMAS, plataformas: CON_PLATAFORMAS.plataformas!.map((p) => ({ ...p, descuentos: 0 })) }}
      />,
    );
    expect(container.innerHTML).toBe(antes);
    expect(screen.queryByText("Descuentos")).toBeNull();
  });

  it("un turno con sólo pedidos de plataforma muestra sus secciones", () => {
    render(
      <ListaProductosVendidos
        d={{ unidades: 0, total: 0, lineas: 0, categorias: [], plataformas: [CON_PLATAFORMAS.plataformas![0]] }}
      />,
    );
    expect(screen.getByRole("region", { name: /^Yango/ })).toBeInTheDocument();
  });
});

describe("por forma de pago y total de unidades (PLAN-PEDIDOS-PLATAFORMA §11 bis)", () => {
  const POR_MEDIO: ReporteCierreProductos = {
    unidades: 10,
    total: 170,
    lineas: 3,
    categorias: [
      { nombre: "M", unidades: 7, total: 140, items: [item(1, "Arroz con leche M", 7, 20)] },
      { nombre: "Topping", unidades: 3, total: 30, items: [item(2, "Topping oreo", 3, 10)] },
    ],
    porMedio: [
      {
        medio: "EFECTIVO",
        nombre: "Efectivo",
        ventas: 4,
        unidades: 7,
        total: 140,
        categorias: [{ nombre: "M", unidades: 7, total: 140, items: [item(1, "Arroz con leche M", 7, 20)] }],
      },
      {
        medio: "FIADO",
        nombre: "Al fiado",
        ventas: 1,
        unidades: 3,
        total: 30,
        categorias: [{ nombre: "Topping", unidades: 3, total: 30, items: [item(2, "Topping oreo", 3, 10, { fiado: 3 })] }],
      },
    ],
    plataformas: [
      {
        plataforma: "YANGO",
        pedidos: 1,
        unidades: 2,
        total: 40,
        categorias: [{ nombre: "M", unidades: 2, total: 40, items: [item(1, "Arroz con leche M", 2, 20)] }],
      },
    ],
    todo: {
      unidades: 12,
      categorias: [
        { nombre: "M", unidades: 9 },
        { nombre: "Topping", unidades: 3 },
      ],
    },
  };

  it("por defecto: una sección por medio con su encabezado, después las plataformas y al final el resumen", () => {
    render(<ListaProductosVendidos d={POR_MEDIO} />);
    const efectivo = screen.getByRole("region", { name: "Efectivo · 4 ventas · 7 unidades · Bs 140,00" });
    expect(efectivo).toHaveTextContent("Arroz con leche M");
    const fiado = screen.getByRole("region", { name: "Al fiado · 1 venta · 3 unidades · Bs 30,00" });
    expect(fiado).toHaveTextContent("No entró al cajón");
    // No repite «al fiado» en cada renglón de la sección de lo fiado.
    expect(fiado).not.toHaveTextContent("3 al fiado");
    const yango = screen.getByRole("region", { name: /^Yango/ });
    const orden = (a: Element, b: Element) => a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING;
    expect(orden(efectivo, fiado)).toBeTruthy();
    expect(orden(fiado, yango)).toBeTruthy();
    const total = screen.getByText("Total vendido en caja");
    expect(orden(yango, total)).toBeTruthy();
    expect(total.closest("div")).toHaveTextContent("Bs 170,00");
    expect(screen.getByText("Total de unidades: 12")).toBeInTheDocument();
    expect(screen.getByText("M 9 · Topping 3")).toBeInTheDocument();
  });

  it("«Todo junto» deja la lista de siempre, con las plataformas y sin el resumen final", () => {
    render(<ListaProductosVendidos d={POR_MEDIO} />);
    fireEvent.click(screen.getByRole("button", { name: "Todo junto" }));
    expect(screen.getByRole("button", { name: "Todo junto" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("region", { name: /^Efectivo/ })).toBeNull();
    expect(screen.queryByText("Total vendido en caja")).toBeNull();
    expect(screen.getByText("10 unidades · 3 productos").closest("div")).toHaveTextContent("Bs 170,00");
    expect(screen.getByRole("region", { name: /^Yango/ })).toBeInTheDocument();
  });

  it("avisa al padre qué vista se elige (el PDF sale como se mira)", () => {
    const onVista = vi.fn();
    render(<ListaProductosVendidos d={POR_MEDIO} onVista={onVista} />);
    fireEvent.click(screen.getByRole("button", { name: "Todo junto" }));
    expect(onVista).toHaveBeenCalledWith("todo");
  });

  it("sin `porMedio` (un backend anterior) no hay selector ni cambia nada", () => {
    render(<ListaProductosVendidos d={RESTAURANTE} />);
    expect(screen.queryByRole("button", { name: "Todo junto" })).toBeNull();
    expect(screen.queryByText("Total vendido en caja")).toBeNull();
  });

  it("en la tarjeta compacta (con límite, la Supervisión) sigue la lista de siempre", () => {
    render(<ListaProductosVendidos d={POR_MEDIO} limite={5} />);
    expect(screen.queryByRole("button", { name: "Todo junto" })).toBeNull();
    expect(screen.queryByRole("region", { name: /^Efectivo/ })).toBeNull();
  });

  it("«Sin pago», una forma de pago propia (OTRO:) y dos productos borrados se muestran sin repetir keys", () => {
    const errores = vi.spyOn(console, "error").mockImplementation(() => {});
    const sinCat = (id: number, n: string) => item(id, n, 1, 10);
    const D: ReporteCierreProductos = {
      unidades: 4,
      total: 40,
      lineas: 4,
      categorias: [{ nombre: "Sin categoría", unidades: 4, total: 40, items: [sinCat(0, "Borrado A"), sinCat(0, "Borrado B")] }],
      porMedio: [
        {
          medio: "SIN_PAGO",
          nombre: "Sin pago",
          ventas: 1,
          unidades: 2,
          total: 20,
          categorias: [{ nombre: "Sin categoría", unidades: 2, total: 20, items: [sinCat(0, "Borrado A"), sinCat(0, "Borrado B")] }],
        },
        {
          medio: "OTRO:Tarjeta",
          nombre: "Tarjeta",
          ventas: 2,
          unidades: 2,
          total: 20,
          categorias: [{ nombre: "Sin categoría", unidades: 2, total: 20, items: [sinCat(0, "Borrado C"), sinCat(0, "Borrado D")] }],
        },
      ],
      todo: { unidades: 4, total: 40, categorias: [{ nombre: "Sin categoría", unidades: 4 }] },
    };
    render(<ListaProductosVendidos d={D} />);
    expect(screen.getByRole("region", { name: "Sin pago · 1 venta · 2 unidades · Bs 20,00" })).toHaveTextContent("Borrado B");
    expect(screen.getByRole("region", { name: "Tarjeta · 2 ventas · 2 unidades · Bs 20,00" })).toHaveTextContent("Borrado D");
    expect(screen.getByText("Total de unidades: 4")).toBeInTheDocument();
    // React avisa por consola de las keys repetidas.
    expect(errores.mock.calls.some((c) => String(c[0]).includes("same key"))).toBe(false);
    errores.mockRestore();
  });

  it("con tiempo de mesa (billar) no se parte por forma de pago", () => {
    const BILLAR_MEDIO: ReporteCierreProductos = {
      ...POR_MEDIO,
      porMedio: [
        {
          medio: "EFECTIVO",
          nombre: "Efectivo",
          ventas: 1,
          unidades: 1,
          total: 25,
          categorias: [{ nombre: "Mesas", unidades: 1, total: 25, items: [item(5, "Tiempo de mesa", 1, 25, { tiempoMesa: true })] }],
        },
      ],
    };
    render(<ListaProductosVendidos d={BILLAR_MEDIO} />);
    expect(screen.queryByRole("button", { name: "Todo junto" })).toBeNull();
  });
});
