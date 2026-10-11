import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Almacen } from "../../types";

/**
 * Cómo se llama esta pantalla según el rubro.
 *
 * En farmacia un almacén es otro local: la pantalla dice "Sucursales", y cada
 * lugar se nombra por su tipo (sucursal o depósito). El restaurante la usa en
 * producción y su app dice "almacén": sus textos quedan exactamente como
 * estaban.
 */

const sesion = vi.hoisted(() => ({ rubro: "FARMACIA" as string }));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({ rubro: sesion.rubro }),
}));

vi.mock("../../lib/api", () => ({
  api: {
    getAlmacenes: vi.fn(),
    getPreciosSucursal: vi.fn(async () => []),
    getProductos: vi.fn(async () => []),
    getBitacoraStock: vi.fn(async () => []),
  },
}));

import { api } from "../../lib/api";
import Almacenes from "./Almacenes";

function almacen(id: number, nombre: string, tipo: Almacen["tipo"]): Almacen {
  return {
    id,
    nombre,
    grupo: null,
    activo: true,
    tipo,
    esPrincipal: id === 1,
    direccion: null,
    telefono: null,
    totalArticulos: 0,
    totalUnidades: 0,
    valorTotal: 0,
    articulos: [],
  };
}

const LUGARES = [almacen(1, "Sucursal Centro", "SUCURSAL"), almacen(2, "Depósito central", "DEPOSITO")];

beforeEach(() => {
  vi.clearAllMocks();
  sesion.rubro = "FARMACIA";
  vi.mocked(api.getAlmacenes).mockResolvedValue(LUGARES);
});

async function abrir() {
  render(<Almacenes />);
  await screen.findByText("Sucursal Centro");
}

function abrirDetalle(nombre: string) {
  fireEvent.click(screen.getByText(nombre));
  return screen.getByRole("dialog");
}

describe("farmacia: almacén es sucursal", () => {
  it("la pantalla se llama Sucursales", async () => {
    await abrir();
    expect(screen.getByRole("heading", { name: "Sucursales" })).toBeInTheDocument();
    expect(screen.queryByText(/almac[eé]n/i)).not.toBeInTheDocument();
  });

  it("el detalle nombra a la sucursal como sucursal", async () => {
    await abrir();
    const detalle = abrirDetalle("Sucursal Centro");
    expect(detalle).toHaveAccessibleName("Detalle de la sucursal");
    expect(within(detalle).getByText("Sucursal vacía")).toBeInTheDocument();
    expect(within(detalle).getByText("Todavía no entró stock a esta sucursal.")).toBeInTheDocument();
  });

  it("y al depósito como depósito: guarda pero no vende", async () => {
    await abrir();
    const detalle = abrirDetalle("Depósito central");
    expect(detalle).toHaveAccessibleName("Detalle del depósito");
    expect(within(detalle).getByText("Depósito vacío")).toBeInTheDocument();

    fireEvent.click(within(detalle).getByRole("button", { name: "Eliminar" }));
    expect(screen.getByRole("dialog", { name: "Eliminar depósito" })).toBeInTheDocument();
  });

  it("el alta sigue al tipo elegido", async () => {
    await abrir();
    fireEvent.click(screen.getByRole("button", { name: "Nuevo" }));
    expect(screen.getByRole("dialog", { name: "Nueva sucursal" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Depósito" }));
    expect(screen.getByRole("dialog", { name: "Nuevo depósito" })).toBeInTheDocument();
  });

  it("sin ninguna, invita a crear la primera sucursal", async () => {
    vi.mocked(api.getAlmacenes).mockResolvedValue([]);
    render(<Almacenes />);
    expect(await screen.findByText("Todavía no hay sucursales")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nueva sucursal" })).toBeInTheDocument();
  });
});

describe("restaurante: los textos de siempre", () => {
  beforeEach(() => {
    sesion.rubro = "RESTAURANTE";
  });

  it("la pantalla sigue llamándose Almacenes", async () => {
    await abrir();
    expect(screen.getByRole("heading", { name: "Almacenes" })).toBeInTheDocument();
  });

  it("el detalle y el borrado dicen almacén, sea sucursal o depósito", async () => {
    await abrir();
    const detalle = abrirDetalle("Depósito central");
    expect(detalle).toHaveAccessibleName("Detalle del almacén");
    expect(within(detalle).getByText("Almacén vacío")).toBeInTheDocument();
    expect(
      within(detalle).getByText("Todavía no entró stock a esta ubicación."),
    ).toBeInTheDocument();

    fireEvent.click(within(detalle).getByRole("button", { name: "Eliminar" }));
    expect(screen.getByRole("dialog", { name: "Eliminar almacén" })).toBeInTheDocument();
  });

  it("el alta dice Nuevo almacén con cualquier tipo", async () => {
    await abrir();
    fireEvent.click(screen.getByRole("button", { name: "Nuevo" }));
    expect(screen.getByRole("dialog", { name: "Nuevo almacén" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Depósito" }));
    expect(screen.getByRole("dialog", { name: "Nuevo almacén" })).toBeInTheDocument();
  });

  it("sin ninguno, el vacío de siempre", async () => {
    vi.mocked(api.getAlmacenes).mockResolvedValue([]);
    render(<Almacenes />);
    expect(await screen.findByText("Todavía no hay almacenes")).toBeInTheDocument();
    expect(screen.getByText("Creá la primera ubicación donde guardás el stock.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nuevo almacén" })).toBeInTheDocument();
  });
});
