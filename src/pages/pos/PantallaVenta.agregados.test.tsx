import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogoAgregados } from "../../lib/agregados/tipos";
import type { Producto } from "../../types";

/**
 * El POS con toppings (PLAN-AGREGADOS §7.4): la tarjeta dice «Incluye 2
 * toppings», tocarla abre la hoja y el carrito muestra el vaso con sus toppings
 * debajo. Sin el catálogo de toppings (ajuste apagado) todo es como siempre.
 */

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    negocio: { alias: "elganadero" },
    usuario: { username: "ana", permisos: [] },
    rubro: "RESTAURANTE",
    incluye: () => false,
    puede: () => true,
  }),
}));

vi.mock("../../lib/api", () => ({
  api: { productosPausados: vi.fn(async () => ({ sucursal: { id: 3, nombre: "Local" }, pausados: [] })) },
}));

import PantallaVenta from "./PantallaVenta";
import { useCarrito, type Carrito } from "./useCarrito";

const vaso = { id: 12, nombre: "Arroz con leche M", precio: 20, tipoProducto: "ALMACENABLE", stockTotal: 10, habilitado: true, componentes: [] } as unknown as Producto;
const gaseosa = { id: 2, nombre: "Gaseosa", precio: 8, tipoProducto: "ALMACENABLE", stockTotal: 10, habilitado: true, componentes: [] } as unknown as Producto;

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

let carrito: Carrito;

/** El carrito de verdad (no un mock): lo que se ve es lo que se vendería. */
function Pantalla({ conToppings }: { conToppings: boolean }) {
  const c = useCarrito("LOCAL", [vaso, gaseosa], true, undefined, conToppings ? catalogo : null);
  carrito = c;
  return (
    <PantallaVenta
      productos={[vaso, gaseosa]}
      categorias={[]}
      carrito={c}
      onCobrar={() => {}}
      sucursalId={3}
      catalogoAgregados={conToppings ? catalogo : null}
    />
  );
}

async function montar(conToppings = true) {
  render(
    <MemoryRouter>
      <Pantalla conToppings={conToppings} />
    </MemoryRouter>,
  );
  await act(async () => {});
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  localStorage.clear();
});

const tarjeta = (nombre: string) => screen.getByRole("heading", { name: nombre }).closest("li")!;

describe("la grilla con toppings", () => {
  it("el producto con grupo dice «Incluye 2 toppings» y el que no, nada", async () => {
    await montar();
    expect(within(tarjeta("Arroz con leche M")).getByText("Incluye 2 toppings")).toBeInTheDocument();
    expect(within(tarjeta("Gaseosa")).queryByText(/Incluye/)).not.toBeInTheDocument();
  });

  it("con el ajuste apagado la tarjeta no dice nada y tocarla suma directo", async () => {
    await montar(false);
    expect(screen.queryByText(/Incluye/)).not.toBeInTheDocument();
    fireEvent.click(within(tarjeta("Arroz con leche M")).getAllByRole("button")[0]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(carrito.lineas).toHaveLength(1);
  });

  it("tocar un producto sin grupo lo agrega sin abrir la hoja", async () => {
    await montar();
    fireEvent.click(within(tarjeta("Gaseosa")).getAllByRole("button")[0]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(carrito.lineas).toHaveLength(1);
  });
});

describe("la hoja y el carrito", () => {
  async function pedirVasoConTres() {
    await montar();
    fireEvent.click(within(tarjeta("Arroz con leche M")).getAllByRole("button")[0]);
    const hoja = screen.getByRole("dialog", { name: /Toppings de Arroz con leche M/ });
    fireEvent.click(within(hoja).getByRole("button", { name: "Agregar Oreo" }));
    fireEvent.click(within(hoja).getByRole("button", { name: "Agregar Chubi" }));
    fireEvent.click(within(hoja).getByRole("button", { name: "Agregar Canela" }));
    fireEvent.click(within(hoja).getByRole("button", { name: "Agregar al pedido" }));
  }

  it("2 incluidos + 1 extra: el carrito muestra el vaso con sus toppings y suma el extra", async () => {
    await pedirVasoConTres();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(carrito.total).toBe(25);
    const fila = screen.getAllByRole("listitem").find((li) => within(li).queryByText(/c\/u/))!;
    expect(within(fila).getByText("+ Oreo")).toBeInTheDocument();
    expect(within(fila).getByText("+ Chubi")).toBeInTheDocument();
    expect(within(fila).getAllByText("incluido")).toHaveLength(2);
    expect(within(fila).getByText("+ Canela")).toBeInTheDocument();
    expect(within(fila).getByText(/Bs\s?5/)).toBeInTheDocument();
  });

  it("tocar los toppings de la línea reabre la hoja para editarlos", async () => {
    await pedirVasoConTres();
    fireEvent.click(screen.getByRole("button", { name: "Cambiar los toppings de Arroz con leche M" }));
    const hoja = screen.getByRole("dialog");
    // Ya trae lo elegido y el botón dice que se guardan cambios.
    expect(within(hoja).getByText(/2 de 2 incluidos · 1 extra/)).toBeInTheDocument();
    fireEvent.click(within(hoja).getByRole("button", { name: "Quitar Canela" }));
    fireEvent.click(within(hoja).getByRole("button", { name: "Guardar cambios" }));
    expect(carrito.lineas).toHaveLength(1);
    expect(carrito.total).toBe(20);
  });

  it("agregar el mismo vaso con otros toppings crea otra línea", async () => {
    await pedirVasoConTres();
    fireEvent.click(within(tarjeta("Arroz con leche M")).getAllByRole("button")[0]);
    const hoja = screen.getByRole("dialog");
    fireEvent.click(within(hoja).getByRole("button", { name: "Agregar Oreo" }));
    fireEvent.click(within(hoja).getByRole("button", { name: "Agregar al pedido" }));
    expect(carrito.lineas).toHaveLength(2);
    expect(carrito.total).toBe(25 + 20);
  });
});
