import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NotasDelGrupo } from "../../lib/academia/tipos";

/**
 * E13 · Cargar notas: la nota se guarda al soltar el campo, en letras y con
 * su resultado; cerrar pide que estén todas; la deuda no impide nada.
 */

vi.mock("../../store/AuthContext", async () => {
  const { SESION_DOCENTE: s } = await import("../../test/academiaFixtures");
  return { useAuth: () => ({ ...s, puede: () => true }) };
});

vi.mock("../../lib/academia/apiAcademia", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/academia/apiAcademia")>();
  return {
    ...real,
    apiAcademia: { notas: vi.fn(), guardarNotas: vi.fn(), cerrarNotas: vi.fn(), reabrirNotas: vi.fn(), grupo: vi.fn(), grupos: vi.fn() },
  };
});

import { apiAcademia } from "../../lib/academia/apiAcademia";
import { grupoDetalle } from "../../test/academiaFixtures";
import Notas from "./Notas";

const NOTAS: NotasDelGrupo = {
  materia: { id: 32, orden: 2, nombre: "Degradados", desde: "2026-10-10", hasta: "2026-11-09" },
  materias: [
    { id: 31, orden: 1, nombre: "Corte clásico", estado: "CERRADA" },
    { id: 32, orden: 2, nombre: "Degradados", estado: "ACTUAL" },
  ],
  cerrada: false,
  notaMinima: 51,
  escalaMax: 100,
  items: [
    { inscripcionId: 101, nombre: "Andrade Villca, Mateo", estadoPago: "PAGADO", nota: 76 },
    { inscripcionId: 102, nombre: "Bustillos Rek, Camila", estadoPago: "SIN_PAGAR", nota: null },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiAcademia.notas).mockResolvedValue(NOTAS);
  vi.mocked(apiAcademia.grupo).mockResolvedValue(grupoDetalle());
  vi.mocked(apiAcademia.guardarNotas).mockResolvedValue(undefined);
  vi.mocked(apiAcademia.cerrarNotas).mockResolvedValue({});
});

async function montar() {
  render(
    <MemoryRouter initialEntries={["/academia/notas?grupo=7"]}>
      <Routes>
        <Route path="/academia/notas" element={<Notas />} />
      </Routes>
    </MemoryRouter>,
  );
  await act(async () => {});
}

describe("E13 · Notas", () => {
  it("cada nota con su estado de pago, en letras y con su resultado", async () => {
    await montar();
    expect(screen.getByRole("heading", { name: "Notas · M2 Degradados" })).toBeInTheDocument();
    expect(screen.getByText("setenta y seis")).toBeInTheDocument();
    expect(screen.getByText("Aprobado")).toBeInTheDocument();
    expect(screen.getAllByText("Sin nota").length).toBeGreaterThan(0);
    expect(screen.getByText("Sin pagar")).toBeInTheDocument();
  });

  it("la nota se guarda sola al soltar el campo; fuera de escala no se manda", async () => {
    await montar();
    const camila = screen.getByLabelText("Nota de Bustillos Rek, Camila");
    fireEvent.change(camila, { target: { value: "150" } });
    fireEvent.blur(camila);
    expect(apiAcademia.guardarNotas).not.toHaveBeenCalled();
    expect(screen.getByText("De 1 a 100")).toBeInTheDocument();
    fireEvent.change(camila, { target: { value: "45" } });
    await act(async () => {
      fireEvent.blur(camila);
    });
    expect(apiAcademia.guardarNotas).toHaveBeenCalledWith(7, 32, [{ inscripcionId: 102, nota: 45 }]);
    expect(screen.getByText("Reprobado")).toBeInTheDocument();
  });

  it("cerrar con notas que faltan avisa y muestra las que faltan; con todas, cierra", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar notas del módulo" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Falta 1 nota");
    expect(apiAcademia.cerrarNotas).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Nota de Bustillos Rek, Camila"), { target: { value: "60" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Cerrar notas del módulo" }));
    });
    // La nota que se tipeó sin soltar el campo se guarda antes de cerrar.
    expect(apiAcademia.guardarNotas).toHaveBeenCalledWith(7, 32, [{ inscripcionId: 102, nota: 60 }]);
    expect(apiAcademia.cerrarNotas).toHaveBeenCalledWith(7, 32);
  });
});
