import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Dashboard as DatosDashboard } from "../../types";

/**
 * El tablero de Inventario vendiendo sin stock (Configuración › Inventario y
 * stock, 09-nov): el valor del inventario, el "bajo stock" y el stock crítico
 * miden un número que el local no está cargando.
 */

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({ puede: (s: string) => s === "config_inventario" }),
}));

vi.mock("../../lib/useSucursales", () => ({
  useSucursales: () => ({ sucursalId: null, elegir: false, nombre: "", opciones: [], valorChip: "" }),
}));

vi.mock("../../lib/api", () => ({ api: { getDashboard: vi.fn() } }));

import { api } from "../../lib/api";
import Dashboard from "./Dashboard";

function datos(over: Partial<DatosDashboard> = {}): DatosDashboard {
  return {
    articulos: 25,
    almacenes: 1,
    totalInventario: 7632.44,
    bajoStock: 2,
    stockCritico: [{ id: 1, nombre: "Coca Cola 2L", stock: 0, stockMinimo: 5 }],
    movimientos: [],
    ...over,
  };
}

async function montar() {
  render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>,
  );
  await act(async () => {});
}

beforeEach(() => vi.clearAllMocks());

describe("Inventario › Dashboard y el control de stock", () => {
  it("controlando el stock (o con un backend que no lo dice) se ve como siempre", async () => {
    vi.mocked(api.getDashboard).mockResolvedValue(datos());
    await montar();
    expect(screen.getByText("Valor inventario")).toBeInTheDocument();
    expect(screen.getByText("Stock crítico")).toBeInTheDocument();
    expect(screen.queryByText("Estás vendiendo sin control de stock")).not.toBeInTheDocument();
  });

  it("vendiendo sin stock: el aviso con el camino para prenderlo, sin las tarjetas de stock", async () => {
    vi.mocked(api.getDashboard).mockResolvedValue(
      datos({ controlaStock: false, totalInventario: 0, bajoStock: 0, stockCritico: [] }),
    );
    await montar();
    expect(screen.getByText("Estás vendiendo sin control de stock")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "prendé el control de stock" })).toHaveAttribute(
      "href",
      "/configuracion/inventario",
    );
    expect(screen.queryByText("Valor inventario")).not.toBeInTheDocument();
    expect(screen.queryByText("Bajo stock")).not.toBeInTheDocument();
    expect(screen.queryByText("Stock crítico")).not.toBeInTheDocument();
    // Lo que no depende del stock sigue.
    expect(screen.getByText("Artículos")).toBeInTheDocument();
  });
});
