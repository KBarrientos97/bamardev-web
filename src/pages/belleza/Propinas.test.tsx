import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReportePropinas } from "../../lib/belleza/apiExtras";

/**
 * Propinas: por profesional, con lo que se le debe. El encargado se las
 * entrega (sale de su caja o se marca pagada por fuera); el profesional entra
 * a la misma pantalla y sólo ve las suyas (lo filtra el backend), sin botón.
 */

const sesion = vi.hoisted(() => ({
  rol: "SUPERVISOR" as string,
  permisos: ["propinas.ver", "propinas.pagar"] as string[],
}));

vi.mock("../../store/AuthContext", () => {
  const valor = () => ({
    negocio: { id: 1, tipoNegocio: "BARBERIA", features: ["propinas"] },
    usuario: { id: 1, username: "u", rol: sesion.rol, permisos: sesion.permisos, permisosPropios: [] },
  });
  return { useAuth: valor, useAuthOpcional: valor };
});

vi.mock("../../lib/belleza/apiExtras", () => ({
  apiExtras: { propinas: vi.fn(), pagarPropinas: vi.fn() },
}));

import { apiExtras } from "../../lib/belleza/apiExtras";
import Propinas from "./Propinas";

const REPORTE: ReportePropinas = {
  desde: "2026-09-07",
  hasta: "2026-10-06",
  total: 15,
  pendiente: 15,
  profesionales: [
    { recursoId: 7, nombre: "Ana", total: 10, efectivo: 10, otras: 0, cantidad: 1, pendiente: 10, pendienteEfectivo: 10, pendienteOtras: 0 },
    { recursoId: 8, nombre: "Beto", total: 5, efectivo: 0, otras: 5, cantidad: 1, pendiente: 5, pendienteEfectivo: 0, pendienteOtras: 5 },
  ],
  detalle: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  sesion.rol = "SUPERVISOR";
  sesion.permisos = ["propinas.ver", "propinas.pagar"];
  vi.mocked(apiExtras.propinas).mockResolvedValue(REPORTE);
});

async function montar() {
  render(
    <MemoryRouter>
      <Propinas />
    </MemoryRouter>,
  );
  await act(async () => {});
}

describe("Propinas", () => {
  it("muestra cada profesional con lo que se le debe", async () => {
    await montar();
    const lista = screen.getByRole("list", { name: "Propinas por profesional" });
    const ana = within(lista).getByText("Ana").closest("li")!;
    expect(ana).toHaveTextContent(/10,00 por entregar/);
  });

  it("el encargado entrega el efectivo desde la caja donde se cobró", async () => {
    vi.mocked(apiExtras.pagarPropinas).mockResolvedValue({
      recursoId: 7,
      recurso: "Ana",
      cantidad: 1,
      total: 10,
      desdeCaja: true,
    });
    await montar();
    const ana = screen.getByText("Ana").closest("li")!;
    fireEvent.click(within(ana).getByText("Entregar"));
    await act(async () => {
      fireEvent.click(screen.getAllByText("Entregar").at(-1)!);
    });
    expect(apiExtras.pagarPropinas).toHaveBeenCalledWith(7, true, false);
    expect(screen.getByText(/Entregaste Bs.10,00 a Ana \(salió de la caja\)/)).toBeInTheDocument();
  });

  it("QA S2SEG-06: lo de QR no sale del cajón salvo que se marque", async () => {
    vi.mocked(apiExtras.pagarPropinas).mockResolvedValue({
      recursoId: 8,
      recurso: "Beto",
      cantidad: 1,
      total: 5,
      desdeCaja: true,
    });
    await montar();
    fireEvent.click(within(screen.getByText("Beto").closest("li")!).getByText("Entregar"));
    const entregar = screen.getAllByText("Entregar").at(-1)!.closest("button")!;
    // Sólo tiene QR: sin marcar, no hay nada que sacar del cajón.
    expect(entregar).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/también/));
    expect(entregar).not.toBeDisabled();
    await act(async () => {
      fireEvent.click(entregar);
    });
    expect(apiExtras.pagarPropinas).toHaveBeenCalledWith(8, true, true);
  });

  it("o la marca pagada por fuera de la caja", async () => {
    vi.mocked(apiExtras.pagarPropinas).mockResolvedValue({
      recursoId: 8,
      recurso: "Beto",
      cantidad: 1,
      total: 5,
      desdeCaja: false,
    });
    await montar();
    fireEvent.click(within(screen.getByText("Beto").closest("li")!).getByText("Entregar"));
    fireEvent.click(screen.getByLabelText(/por fuera de la caja/));
    await act(async () => {
      fireEvent.click(screen.getAllByText("Entregar").at(-1)!);
    });
    expect(apiExtras.pagarPropinas).toHaveBeenCalledWith(8, false, true);
  });

  it("el profesional ve las suyas sin el botón de entregar", async () => {
    sesion.rol = "PROFESIONAL";
    sesion.permisos = ["propinas.ver"];
    vi.mocked(apiExtras.propinas).mockResolvedValue({
      ...REPORTE,
      profesionales: [REPORTE.profesionales[0]],
    });
    await montar();
    expect(screen.getByText("Ana")).toBeInTheDocument();
    expect(screen.queryByText("Entregar")).not.toBeInTheDocument();
  });
});
