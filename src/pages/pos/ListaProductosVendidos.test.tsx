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
