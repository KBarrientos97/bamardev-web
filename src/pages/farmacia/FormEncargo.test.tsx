import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Producto } from "../../types";

/**
 * El alta de un encargo fuera de la pantalla de Encargos (11-nov): Buscar
 * medicamento y la ficha lo abren con el medicamento ya puesto, para que
 * anotar lo que faltó sea un toque y no siete. Lo de buscar el artículo a mano
 * se prueba en `Encargos.test.tsx`.
 */

vi.mock("../../lib/api", () => ({
  api: {
    crearEncargo: vi.fn(),
    buscarProductos: vi.fn(),
  },
}));

import { api } from "../../lib/api";
import { FormEncargo } from "./FormEncargo";

/** La concentración viene aparte: el encargo tiene que decir "Ranitidina 150 mg". */
const ranitidina = {
  id: 2,
  nombre: "Ranitidina",
  concentracion: "150 mg",
  laboratorio: "INTI",
  stockTotal: 0,
  unidadMedida: { id: 1, nombre: "Unidad" },
} as unknown as Producto;

const onClose = vi.fn();
const onGuardado = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.crearEncargo).mockResolvedValue({} as never);
});

const campoQuePidieron = () => screen.getByPlaceholderText(/La crema para la alergia/);

async function anotar() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Anotar" }));
  });
}

describe("FormEncargo", () => {
  it("con el medicamento puesto abre prellenado y Anotar lo manda con su id", async () => {
    render(<FormEncargo productoInicial={ranitidina} onClose={onClose} onGuardado={onGuardado} />);
    expect(campoQuePidieron()).toHaveValue("Ranitidina 150 mg");
    // El artículo ya está elegido, no hay que buscarlo; y dice que no hay.
    expect(screen.getByRole("button", { name: "Quitar el artículo" })).toBeInTheDocument();
    expect(screen.getByText("INTI · Agotado")).toBeInTheDocument();

    await anotar();
    expect(api.crearEncargo).toHaveBeenCalledWith(
      expect.objectContaining({ productoId: 2, descripcion: "Ranitidina 150 mg", cantidad: 1 }),
    );
    expect(onGuardado).toHaveBeenCalledTimes(1);
  });

  it("sin medicamento se anota lo que se escribió, sin productoId", async () => {
    render(<FormEncargo onClose={onClose} onGuardado={onGuardado} />);
    expect(campoQuePidieron()).toHaveValue("");
    fireEvent.change(campoQuePidieron(), { target: { value: "  La crema del pomo azul " } });

    await anotar();
    expect(api.crearEncargo).toHaveBeenCalledWith(
      expect.not.objectContaining({ productoId: expect.anything() }),
    );
    expect(api.crearEncargo).toHaveBeenCalledWith(
      expect.objectContaining({ descripcion: "La crema del pomo azul" }),
    );
    expect(onGuardado).toHaveBeenCalledTimes(1);
  });

  it("vacío no se anota: pide qué pidieron", async () => {
    render(<FormEncargo onClose={onClose} onGuardado={onGuardado} />);
    await anotar();
    expect(api.crearEncargo).not.toHaveBeenCalled();
    expect(screen.getByText("Escribí qué te pidieron.")).toBeInTheDocument();
    expect(onGuardado).not.toHaveBeenCalled();
  });

  it("si el servidor falla, el error se ve y el formulario sigue abierto para reintentar", async () => {
    vi.mocked(api.crearEncargo).mockRejectedValueOnce(new Error("Sin conexión"));
    render(<FormEncargo productoInicial={ranitidina} onClose={onClose} onGuardado={onGuardado} />);
    await anotar();
    expect(await screen.findByText("Sin conexión")).toBeInTheDocument();
    expect(onGuardado).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    // El segundo intento sí sale: el candado del doble clic se soltó al fallar.
    await anotar();
    expect(api.crearEncargo).toHaveBeenCalledTimes(2);
    expect(onGuardado).toHaveBeenCalledTimes(1);
  });
});
