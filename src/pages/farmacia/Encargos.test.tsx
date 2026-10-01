import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Producto } from "../../types";

/**
 * El alta de un encargo: el artículo del catálogo se BUSCA.
 *
 * Antes era un desplegable con los primeros 100 productos, y con el catálogo
 * de una farmacia de verdad (2.000 medicamentos) lo que pedían casi nunca
 * estaba ahí.
 */

vi.mock("../../lib/api", () => ({
  api: {
    getEncargos: vi.fn(),
    buscarProductos: vi.fn(),
    crearEncargo: vi.fn(),
  },
}));

import { api } from "../../lib/api";
import Encargos from "./Encargos";

const tramadol = {
  id: 2796,
  nombre: "Tramadol",
  concentracion: "50 mg",
  principioActivo: "Tramadol clorhidrato",
  laboratorio: "LAFAR",
  formaFarmaceutica: "Cápsula",
  stockTotal: 29,
  unidadMedida: { id: 1, nombre: "Unidad" },
} as unknown as Producto;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getEncargos).mockResolvedValue({
    abiertos: 0,
    anotados: 0,
    pedidos: 0,
    llegaron: 0,
    entregados: 0,
    items: [],
  } as never);
  vi.mocked(api.buscarProductos).mockResolvedValue({
    items: [tramadol],
    total: 1,
    limite: 8,
    offset: 0,
  });
  vi.mocked(api.crearEncargo).mockResolvedValue({} as never);
});

async function abrirFormulario() {
  render(<Encargos />);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Nuevo" }));
  });
}

describe("el artículo del encargo", () => {
  it("abrir el formulario no trae el catálogo: se busca lo que se escribe", async () => {
    await abrirFormulario();
    // Sin texto no se pide nada (antes: los primeros 100, siempre).
    await new Promise((r) => setTimeout(r, 300));
    expect(api.buscarProductos).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Artículo del catálogo"), {
      target: { value: "trama" },
    });
    await waitFor(() =>
      expect(api.buscarProductos).toHaveBeenCalledWith(expect.objectContaining({ q: "trama" })),
    );
    expect(await screen.findByText("50 mg")).toBeInTheDocument();
  });

  it("el elegido dice cuánto hay y viaja con el encargo", async () => {
    await abrirFormulario();
    fireEvent.change(screen.getByLabelText("Artículo del catálogo"), {
      target: { value: "trama" },
    });
    fireEvent.click(await screen.findByRole("button", { name: /Tramadol/ }));

    expect(screen.getByText("LAFAR · Hay 29 u.")).toBeInTheDocument();
    // Tocar el nombre no lo quita (dentro de un <label> sí lo hacía).
    fireEvent.click(screen.getByText("Tramadol"));
    expect(screen.getByRole("button", { name: "Quitar el artículo" })).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/La crema para la alergia/), {
      target: { value: "Tramadol de 50" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Anotar" }));
    });
    expect(api.crearEncargo).toHaveBeenCalledWith(
      expect.objectContaining({ productoId: 2796, descripcion: "Tramadol de 50" }),
    );
  });

  it("quitado, el encargo se anota sin artículo", async () => {
    await abrirFormulario();
    fireEvent.change(screen.getByLabelText("Artículo del catálogo"), {
      target: { value: "trama" },
    });
    fireEvent.click(await screen.findByRole("button", { name: /Tramadol/ }));
    fireEvent.click(screen.getByRole("button", { name: "Quitar el artículo" }));
    expect(screen.getByLabelText("Artículo del catálogo")).toHaveValue("");

    fireEvent.change(screen.getByPlaceholderText(/La crema para la alergia/), {
      target: { value: "La crema del pomo azul" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Anotar" }));
    });
    expect(api.crearEncargo).toHaveBeenCalledWith(
      expect.not.objectContaining({ productoId: expect.anything() }),
    );
  });
});
