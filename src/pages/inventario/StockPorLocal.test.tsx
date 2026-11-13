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

  it("bajo stock por local: cada uno contra su mínimo (el propio o el del artículo)", async () => {
    vi.mocked(api.existenciasProducto).mockResolvedValue([
      existencia({ cantidad: 8, stockMinimo: 5 }), // Central: 8 > 5, bien
      existencia({ almacenId: 2, nombre: "Norte", cantidad: 3, stockMinimo: null }), // global 4: bajo
      existencia({ almacenId: 4, nombre: "Sur", cantidad: 6, stockMinimo: 10 }), // propio 10: bajo
      existencia({ almacenId: 3, nombre: "Galpón", tipo: "DEPOSITO", cantidad: 1 }), // depósito sin propio: no cuenta
    ]);
    render(<StockPorLocal producto={{ ...producto, stockMinimo: 4 }} />);
    const aviso = await screen.findByRole("note");
    expect(aviso).toHaveTextContent("Bajo su mínimo en Norte (3 de 4) · Sur (6 de 10)");
    expect(aviso).not.toHaveTextContent("Central");
    expect(aviso).not.toHaveTextContent("Galpón");
    // El mínimo propio se rotula en su fila; el global no se repite.
    expect(screen.getByText("mínimo 5")).toBeInTheDocument();
    expect(screen.getByText("mínimo 10")).toBeInTheDocument();
    expect(screen.queryByText("mínimo 4")).not.toBeInTheDocument();
  });

  it("si todos están por encima de su mínimo no hay aviso, y un backend viejo (sin el campo) tampoco", async () => {
    vi.mocked(api.existenciasProducto).mockResolvedValue([
      existencia({ cantidad: 8 }),
      existencia({ almacenId: 2, nombre: "Norte", cantidad: 9 }),
    ]);
    render(<StockPorLocal producto={{ ...producto, stockMinimo: 4 }} />);
    await screen.findByText("Stock por sucursal");
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    expect(screen.queryByText(/^mínimo/)).not.toBeInTheDocument();
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
