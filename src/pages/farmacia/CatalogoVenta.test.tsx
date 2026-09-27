import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Categoria, Producto } from "../../types";

/**
 * La grilla del punto de venta de farmacia: chips de categoría que filtran en
 * el servidor, tarjetas que se tocan para sumar a la venta, y el campo que
 * recibe al lector de código de barras.
 */

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({ puede: () => true }),
}));

vi.mock("../../lib/api", () => ({
  api: { buscarProductos: vi.fn() },
}));

import { api } from "../../lib/api";
import CatalogoVenta from "./CatalogoVenta";
import { ContextoVentaFarmacia, type VentaFarmacia } from "./ventaFarmacia";

function med(over: Partial<Producto>): Producto {
  return {
    id: 1,
    nombre: "Ibuprofeno 400 mg",
    descripcion: null,
    codBarra: null,
    tipoProducto: "ALMACENABLE",
    precio: 0.7,
    costo: 0.3,
    stockMinimo: 10,
    habilitado: true,
    icono: null,
    categoria: null,
    unidadMedida: null,
    stockTotal: 180,
    componentes: [],
    principioActivo: "Ibuprofeno",
    concentracion: "400 mg",
    formaFarmaceutica: "Comprimido",
    laboratorio: "INTI",
    registroSanitario: null,
    condicionVenta: "LIBRE",
    manejaLote: true,
    controlado: false,
    proximoVencimiento: { fecha: "2026-10-09", dias: 13, tramo: "HASTA_30" },
    ...over,
  };
}

const ibuprofeno = med({});
const ranitidina = med({ id: 2, nombre: "Ranitidina 150 mg", stockTotal: 0, proximoVencimiento: null });

const categorias: Categoria[] = [
  { id: 3, nombre: "Antibióticos", activo: true } as Categoria,
  { id: 4, nombre: "Vieja", activo: false } as Categoria,
];

const agregar = vi.fn();

function montar(enCarrito = new Map<number, number>()) {
  const venta = { carrito: {} as VentaFarmacia["carrito"], agregar } satisfies VentaFarmacia;
  render(
    <MemoryRouter>
      <ContextoVentaFarmacia.Provider value={venta}>
        <CatalogoVenta categorias={categorias} enCarrito={enCarrito} />
      </ContextoVentaFarmacia.Provider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.buscarProductos).mockResolvedValue({
    items: [ibuprofeno, ranitidina],
    total: 2,
    limite: 24,
    offset: 0,
  });
});

describe("la grilla", () => {
  it("tocar una tarjeta la suma; una agotada no se puede tocar", async () => {
    montar();
    const tarjeta = await screen.findByRole("button", { name: /Ibuprofeno 400 mg/ });
    await act(async () => {
      fireEvent.click(tarjeta);
    });
    expect(agregar).toHaveBeenCalledWith(ibuprofeno);

    expect(screen.getByRole("button", { name: /Ranitidina 150 mg/ })).toBeDisabled();
    expect(screen.getByText("Agotado")).toBeInTheDocument();
  });

  it("el punto dice cuándo vence el lote que se vende primero", async () => {
    montar();
    expect(await screen.findByLabelText("Vencimiento: 13 días")).toHaveClass("bg-danger");
  });

  it("marca lo que ya está en la venta", async () => {
    montar(new Map([[1, 2]]));
    expect(await screen.findByText("2 en la venta")).toBeInTheDocument();
  });
});

describe("los chips de categoría", () => {
  it("piden esa categoría al servidor, y no ofrecen las apagadas", async () => {
    montar();
    await screen.findByRole("button", { name: /Ibuprofeno/ });
    expect(screen.queryByRole("button", { name: "Vieja" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Antibióticos" }));
    await waitFor(() =>
      expect(api.buscarProductos).toHaveBeenLastCalledWith(
        expect.objectContaining({ categoriaId: 3, soloHabilitados: true }),
      ),
    );
  });
});

describe("el lector de código de barras", () => {
  it("Enter con un solo resultado lo suma y deja el campo listo para el próximo", async () => {
    montar();
    await screen.findByRole("button", { name: /Ibuprofeno/ });
    vi.mocked(api.buscarProductos).mockResolvedValue({
      items: [ibuprofeno],
      total: 1,
      limite: 24,
      offset: 0,
    });
    const campo = screen.getByPlaceholderText(/Buscá o escaneá/);
    fireEvent.change(campo, { target: { value: "7790001" } });
    await waitFor(() =>
      expect(api.buscarProductos).toHaveBeenLastCalledWith(expect.objectContaining({ q: "7790001" })),
    );
    await screen.findByText("Ibuprofeno 400 mg");
    await waitFor(() => expect(screen.queryByText("Ranitidina 150 mg")).not.toBeInTheDocument());

    fireEvent.keyDown(campo, { key: "Enter" });
    expect(agregar).toHaveBeenCalledWith(ibuprofeno);
    expect(campo).toHaveValue("");
  });
});

describe("la sucursal de la caja", () => {
  it("pide el stock de la sucursal de la caja, y muestra la ubicación si la hay", async () => {
    vi.mocked(api.buscarProductos).mockResolvedValue({
      items: [med({ ubicacion: "Estante 3 · fila B" }), ranitidina],
      total: 2,
      limite: 24,
      offset: 0,
    });
    const venta = { carrito: {} as VentaFarmacia["carrito"], agregar } satisfies VentaFarmacia;
    render(
      <MemoryRouter>
        <ContextoVentaFarmacia.Provider value={venta}>
          <CatalogoVenta categorias={categorias} enCarrito={new Map()} sucursalId={917} />
        </ContextoVentaFarmacia.Provider>
      </MemoryRouter>,
    );
    expect(await screen.findByText("Estante 3 · fila B")).toBeInTheDocument();
    expect(api.buscarProductos).toHaveBeenCalledWith(expect.objectContaining({ sucursalId: 917 }));
    // La que no tiene ubicación no dibuja nada: es opcional.
    const sinUbicacion = screen.getByRole("button", { name: /Ranitidina/ });
    expect(sinUbicacion).not.toHaveTextContent("Estante");
  });
});
