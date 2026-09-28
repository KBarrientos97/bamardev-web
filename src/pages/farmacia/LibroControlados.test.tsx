import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AsientoControlado } from "../../types";

/**
 * El libro de controlados: lo que la farmacia presenta al SEDES. Se lee por
 * libro (psicotrópicos o estupefacientes) y por período, y una venta anulada
 * sigue ahí, marcada.
 */

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    negocio: { id: 1, nombre: "Farmacia San Rafael" },
    usuario: { rol: "ADMIN", sucursalId: 917 },
  }),
}));

vi.mock("../../lib/api", () => ({
  api: { libroControlados: vi.fn(), getSucursales: vi.fn(async () => []) },
}));

import { api } from "../../lib/api";
import LibroControlados from "./LibroControlados";

function asiento(over: Partial<AsientoControlado>): AsientoControlado {
  return {
    id: 1,
    fecha: "2026-09-28T14:30:00.000Z",
    ventaId: 50,
    comprobante: "V-000012",
    producto: { id: 14, nombre: "Clonazepam 2 mg", principioActivo: "Clonazepam", concentracion: "2 mg" },
    condicionVenta: "RECETA_ARCHIVADA",
    controlado: true,
    cantidad: 10,
    pacienteNombre: "Juan Pérez",
    pacienteDocumento: "4567890 LP",
    medicoNombre: "Dra. Ana Rojas",
    medicoMatricula: "R-1234",
    recetaNumero: null,
    recetaFecha: "2026-09-27T00:00:00.000Z",
    almacen: { id: 917, nombre: "Sucursal Centro" },
    despachadoPor: { id: 3, nombre: "Regente" },
    anuladaEn: null,
    ...over,
  };
}

async function montar() {
  render(<LibroControlados />);
  await act(async () => {});
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.libroControlados).mockResolvedValue([
    asiento({}),
    asiento({
      id: 2,
      ventaId: 51,
      producto: { id: 20, nombre: "Morfina 10 mg", principioActivo: "Morfina", concentracion: "10 mg" },
      condicionVenta: "RECETA_VALORADA",
      recetaNumero: "V-000981",
      anuladaEn: "2026-09-28T16:00:00.000Z",
    }),
  ]);
});

describe("el libro", () => {
  it("cada asiento dice paciente, médico, receta y quién lo despachó", async () => {
    await montar();
    const tabla = screen.getByRole("table");
    const fila = within(tabla).getByText("Clonazepam 2 mg").closest("tr")!;
    expect(fila).toHaveTextContent("Juan Pérez (CI 4567890 LP)");
    expect(fila).toHaveTextContent("Dra. Ana Rojas · Mat. R-1234");
    expect(fila).toHaveTextContent("27/09/2026");
    expect(fila).toHaveTextContent("Regente");
    expect(fila).toHaveTextContent("V-000012");
  });

  it("una venta anulada sigue en el libro, marcada", async () => {
    await montar();
    const fila = within(screen.getByRole("table")).getByText("Morfina 10 mg").closest("tr")!;
    expect(within(fila).getByText("Anulada")).toBeInTheDocument();
    expect(fila).toHaveTextContent("N° V-000981");
    expect(screen.getByText(/2 asientos · 1 de ventas anuladas/)).toBeInTheDocument();
  });

  it("arranca en el mes y se filtra por libro", async () => {
    await montar();
    expect(api.libroControlados).toHaveBeenLastCalledWith(
      expect.objectContaining({ libro: null, almacenId: null }),
    );
    const primero = vi.mocked(api.libroControlados).mock.calls[0][0];
    expect(primero.desde).toMatch(/^\d{4}-\d{2}-01$/);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Estupefacientes" }));
    });
    expect(api.libroControlados).toHaveBeenLastCalledWith(
      expect.objectContaining({ libro: "ESTUPEFACIENTES" }),
    );
  });

  it("sin ventas de controlados en el período, lo dice", async () => {
    vi.mocked(api.libroControlados).mockResolvedValue([]);
    await montar();
    expect(screen.getByText("No hay ventas de controlados")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Imprimir/ })).toBeDisabled();
  });
});
