import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mesa } from "../../types/salon";

/**
 * BUG-salon-2: la nota de la mesa ("al lado de la parrilla", la que ve el
 * mesero al abrirla) no se guardaba desde la web. Viajaba como `notaMesa` y
 * el backend espera `nota`: con whitelist la descartaba, al crear y al editar.
 */

vi.mock("../../lib/api", () => ({
  api: {
    getMesas: vi.fn(),
    getZonas: vi.fn(),
    crearMesa: vi.fn(),
    actualizarMesa: vi.fn(),
  },
}));

vi.mock("../../lib/useSucursales", () => ({
  useSucursales: () => ({ sucursalId: null, setSucursalId: vi.fn(), elegir: false, sucursales: [] }),
}));

import { api } from "../../lib/api";
import Mesas from "./Mesas";

const M3: Mesa = {
  id: 3,
  codigo: "M3",
  nombre: "Mesa M3",
  zonaId: 1,
  zonaCodigo: "salon",
  zonaNombre: "Salón",
  capacidad: 4,
  capacidadTotal: 4,
  unidas: [],
  notaMesa: "Junto a la ventana",
  activa: true,
  estado: "LIBRE",
  comensales: 0,
  consumo: 0,
  propina: 0,
  comandas: [],
};

async function montar() {
  render(<Mesas />);
  await screen.findByText("Mesa M3");
}

async function guardar() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /Guardar/ }));
  });
}

const nota = () => screen.getByLabelText("Nota (opcional)");

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getMesas).mockResolvedValue([M3]);
  vi.mocked(api.getZonas).mockResolvedValue([{ id: 1, codigo: "salon", nombre: "Salón" }]);
  vi.mocked(api.crearMesa).mockResolvedValue(M3);
  vi.mocked(api.actualizarMesa).mockResolvedValue(M3);
});

describe("la nota de la mesa", () => {
  it("al crear viaja como nota", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: /Nueva/ }));
    fireEvent.change(screen.getByLabelText("Código"), { target: { value: "M7" } });
    fireEvent.change(nota(), { target: { value: "Al lado de la parrilla" } });
    await guardar();

    expect(api.crearMesa).toHaveBeenCalledWith({
      codigo: "M7",
      zonaId: 1,
      capacidad: 4,
      activa: true,
      nota: "Al lado de la parrilla",
    });
  });

  it("al crear sin nota no manda la clave", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: /Nueva/ }));
    fireEvent.change(screen.getByLabelText("Código"), { target: { value: "M7" } });
    await guardar();
    expect(vi.mocked(api.crearMesa).mock.calls[0][0]).not.toHaveProperty("nota");
  });

  it("al editar la cambia", async () => {
    await montar();
    fireEvent.click(screen.getByText("Mesa M3"));
    expect(nota()).toHaveValue("Junto a la ventana");
    fireEvent.change(nota(), { target: { value: "Al fondo, cerca del baño" } });
    await guardar();
    expect(api.actualizarMesa).toHaveBeenCalledWith(3, expect.objectContaining({ nota: "Al fondo, cerca del baño" }));
  });

  it("al editar, dejarla vacía la borra", async () => {
    // Además de la clave, sólo se mandaba si no estaba vacía: borrar la nota
    // desde la web no la borraba nunca.
    await montar();
    fireEvent.click(screen.getByText("Mesa M3"));
    fireEvent.change(nota(), { target: { value: "" } });
    await guardar();
    expect(api.actualizarMesa).toHaveBeenCalledWith(3, expect.objectContaining({ nota: "" }));
    expect(vi.mocked(api.actualizarMesa).mock.calls[0][1]).not.toHaveProperty("notaMesa");
  });
});
