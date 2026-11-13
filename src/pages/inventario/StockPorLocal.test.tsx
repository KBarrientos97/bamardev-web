import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Existencia } from "../../types";

vi.mock("../../lib/api", () => ({ api: { existenciasProducto: vi.fn() } }));

import { api } from "../../lib/api";
import { StockPorLocal } from "./StockPorLocal";

const existencia = (p: Partial<Existencia>): Existencia => ({
  almacenId: 1,
  nombre: "Central",
  tipo: "SUCURSAL",
  esPrincipal: true,
  direccion: null,
  telefono: null,
  cantidad: 5,
  ubicacion: null,
  ...p,
});

const producto = { id: 7, unidadMedida: { id: 1, nombre: "Unidad" }, stockTotal: 12 };

beforeEach(() => {
  vi.mocked(api.existenciasProducto).mockReset();
});

describe("stock por local en el detalle del artículo", () => {
  it("lista cuánto hay en cada local, con el depósito rotulado", async () => {
    vi.mocked(api.existenciasProducto).mockResolvedValue([
      existencia({ cantidad: 5 }),
      existencia({ almacenId: 2, nombre: "Norte", cantidad: 0 }),
      existencia({ almacenId: 3, nombre: "Galpón", tipo: "DEPOSITO", cantidad: 7 }),
    ]);
    render(<StockPorLocal producto={producto} />);
    expect(await screen.findByText("Stock por sucursal")).toBeInTheDocument();
    expect(screen.getByText("Central")).toBeInTheDocument();
    expect(screen.getByText("Depósito")).toBeInTheDocument();
    expect(screen.getByText(/^7 Unidad/)).toBeInTheDocument();
    expect(api.existenciasProducto).toHaveBeenCalledWith(7);
  });

  it("con un solo lugar no dice nada que el stock actual no diga", async () => {
    vi.mocked(api.existenciasProducto).mockResolvedValue([existencia({})]);
    render(<StockPorLocal producto={producto} />);
    await act(async () => {});
    expect(api.existenciasProducto).toHaveBeenCalled();
    expect(screen.queryByText("Stock por sucursal")).not.toBeInTheDocument();
  });

  it("si la lista falla no muestra nada: el detalle ya está completo sin ella", async () => {
    vi.mocked(api.existenciasProducto).mockRejectedValue(new Error("sin red"));
    render(<StockPorLocal producto={producto} />);
    await act(async () => {});
    expect(api.existenciasProducto).toHaveBeenCalled();
    expect(screen.queryByText("Stock por sucursal")).not.toBeInTheDocument();
  });
});
