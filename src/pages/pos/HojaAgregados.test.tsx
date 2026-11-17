import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CatalogoAgregados } from "../../lib/agregados/tipos";
import type { Producto } from "../../types";
import HojaAgregados from "./HojaAgregados";

/**
 * La hoja de toppings (PLAN-AGREGADOS §7.4): el vaso de Bs 20 de El Ganadero
 * trae 2 toppings y el extra se cobra a Bs 5. La hoja muestra lo mismo que
 * calcula el backend.
 */

const vaso = {
  id: 12,
  nombre: "Arroz con leche M",
  precio: 20,
} as Producto;

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

const mas = (nombre: string) => fireEvent.click(screen.getByRole("button", { name: `Agregar ${nombre}` }));
const menos = (nombre: string) => fireEvent.click(screen.getByRole("button", { name: `Quitar ${nombre}` }));

function montar(over: Partial<React.ComponentProps<typeof HojaAgregados>> = {}) {
  const onConfirmar = vi.fn();
  const onClose = vi.fn();
  render(<HojaAgregados producto={vaso} catalogo={catalogo} onConfirmar={onConfirmar} onClose={onClose} {...over} />);
  return { onConfirmar, onClose };
}

describe("HojaAgregados", () => {
  it("dice lo que trae el producto y arranca en el precio base", () => {
    montar();
    expect(screen.getByText(/Incluye 2 toppings/)).toBeInTheDocument();
    expect(screen.getByText("0 de 2 incluidos")).toBeInTheDocument();
    expect(screen.getByTestId("total-hoja")).toHaveTextContent(/Bs\s?20/);
  });

  it("2 incluidos + 1 extra: «2 de 2 incluidos», el extra con su precio y el total en vivo", () => {
    const { onConfirmar } = montar();
    mas("Oreo");
    mas("Chubi");
    expect(screen.getByText("2 de 2 incluidos")).toBeInTheDocument();
    // Sin extras todavía el total es el del vaso.
    expect(screen.getByTestId("total-hoja")).toHaveTextContent(/Bs\s?20/);
    mas("Canela");
    expect(screen.getByText(/2 de 2 incluidos · 1 extra/)).toBeInTheDocument();
    expect(screen.getByText(/Extra: Canela/)).toBeInTheDocument();
    expect(screen.getByTestId("total-hoja")).toHaveTextContent(/Bs\s?25/);

    fireEvent.click(screen.getByRole("button", { name: "Agregar al pedido" }));
    // En el orden en que se tocaron.
    expect(onConfirmar).toHaveBeenCalledWith([
      { grupoId: 7, productoId: 32, cantidad: 1 },
      { grupoId: 7, productoId: 31, cantidad: 1 },
      { grupoId: 7, productoId: 33, cantidad: 1 },
    ]);
  });

  it("repetir un topping cuenta: doble Oreo usa los dos incluidos", () => {
    const { onConfirmar } = montar();
    mas("Oreo");
    mas("Oreo");
    expect(screen.getByText("2 de 2 incluidos")).toBeInTheDocument();
    expect(screen.getByLabelText("Oreo: 2")).toBeInTheDocument();
    // Un tercero ya es extra.
    mas("Oreo");
    expect(screen.getByText(/1 extra/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Agregar al pedido" }));
    expect(onConfirmar).toHaveBeenCalledWith([{ grupoId: 7, productoId: 32, cantidad: 3 }]);
  });

  it("el «−» saca el último toque de ese topping y el contador baja", () => {
    montar();
    mas("Oreo");
    mas("Chubi");
    mas("Canela");
    menos("Canela");
    expect(screen.getByText("2 de 2 incluidos")).toBeInTheDocument();
    expect(screen.queryByText(/Extra:/)).not.toBeInTheDocument();
    // Un topping en cero no se puede bajar más.
    expect(screen.getByRole("button", { name: "Quitar Canela" })).toBeDisabled();
  });

  it("se puede agregar sin ningún topping: el vaso va igual, sin descuento", () => {
    const { onConfirmar } = montar();
    fireEvent.click(screen.getByRole("button", { name: "Agregar al pedido" }));
    expect(onConfirmar).toHaveBeenCalledWith([]);
  });

  it("al editar una línea parte de lo que ya tenía y ofrece «Guardar cambios»", () => {
    const { onConfirmar } = montar({
      inicial: [
        { grupoId: 7, productoId: 32, cantidad: 2 },
        { grupoId: 7, productoId: 33, cantidad: 1 },
      ],
    });
    expect(screen.getByLabelText("Oreo: 2")).toBeInTheDocument();
    expect(screen.getByText(/2 de 2 incluidos · 1 extra/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(onConfirmar).toHaveBeenCalledWith([
      { grupoId: 7, productoId: 32, cantidad: 2 },
      { grupoId: 7, productoId: 33, cantidad: 1 },
    ]);
  });

  it("el máximo del grupo apaga el «+»", () => {
    const tope: CatalogoAgregados = { ...catalogo, grupos: [{ ...catalogo.grupos[0], maximo: 2 }] };
    montar({ catalogo: tope });
    mas("Oreo");
    mas("Chubi");
    expect(screen.getByRole("button", { name: "Agregar Canela" })).toBeDisabled();
  });
});
