import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AlumnoFila } from "../../lib/academia/tipos";

/**
 * E7 · Estudiantes: las pestañas son los indicadores con su número, cada fila
 * dice si debe y cómo están sus fotos.
 */

vi.mock("../../store/AuthContext", async () => {
  const { SESION_SECRETARIA: s } = await import("../../test/academiaFixtures");
  return { useAuth: () => ({ ...s, puede: () => true }) };
});

vi.mock("../../lib/academia/apiAcademia", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/academia/apiAcademia")>();
  return {
    ...real,
    apiAcademia: { alumnos: vi.fn(), carreras: vi.fn(async () => []), grupos: vi.fn(), preinscripciones: vi.fn() },
  };
});

import { apiAcademia } from "../../lib/academia/apiAcademia";
import Alumnos from "./Alumnos";

const fila = (extra: Partial<AlumnoFila>): AlumnoFila => ({
  id: 52,
  codigo: "2026-0102",
  apellidos: "Bustillos Rek",
  nombres: "Camila",
  ci: null,
  telefono: null,
  grupoActual: { id: 7, nombre: "Barbería · L-M-V 09:00", sede: { id: 1, nombre: "Central" } },
  plan: "Mes a mes",
  saldo: 500,
  vencido: true,
  ultimaAsistencia: null,
  estado: "ACTIVA",
  fotos: "COMPLETAS",
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  const TOTAL = { todos: 148, deben: 7, retirados: 3 };
  vi.mocked(apiAcademia.alumnos).mockImplementation(async (f = {}) => ({
    items: f.pageSize === 1 ? [] : [fila({}), fila({ id: 51, apellidos: "Andrade Villca", nombres: "Mateo", saldo: 0, vencido: false, fotos: "POR_REVISAR" })],
    total: f.debe ? TOTAL.deben : f.estado === "RETIRADA" ? TOTAL.retirados : TOTAL.todos,
    page: 1,
    pageSize: f.pageSize ?? 20,
  }));
  vi.mocked(apiAcademia.grupos).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 100 });
  vi.mocked(apiAcademia.preinscripciones).mockResolvedValue({ items: [], total: 3, page: 1, pageSize: 1 });
});

describe("E7 · Estudiantes", () => {
  it("las pestañas cuentan y filtran; la fila dice si debe y cómo están sus fotos", async () => {
    render(
      <MemoryRouter>
        <Alumnos />
      </MemoryRouter>,
    );
    await act(async () => {});
    expect(screen.getByRole("tab", { name: "Todos 148" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByText(/Debe Bs\s?500,00/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Al día").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Fotos por revisar").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /Inscripciones online/ })).toHaveTextContent("3");
    fireEvent.click(screen.getByRole("tab", { name: "Deben 7" }));
    await act(async () => {});
    expect(apiAcademia.alumnos).toHaveBeenLastCalledWith(expect.objectContaining({ debe: true, page: 1, pageSize: 20 }));
  });

  it("con 2 cursos y 2 grupos no se cae: buscador y desplegables a la vista (QA ronda 2, B-01)", async () => {
    vi.mocked(apiAcademia.carreras).mockResolvedValue([
      { id: 1, nombre: "Barbería" },
      { id: 2, nombre: "Tatuaje" },
    ] as never);
    vi.mocked(apiAcademia.grupos).mockResolvedValue({
      items: [
        { id: 7, carrera: { id: 1, nombre: "Barbería" }, dias: [1, 3, 5], horaInicio: "09:00", horaFin: "11:00" },
        { id: 8, carrera: { id: 2, nombre: "Tatuaje" }, dias: [2, 4], horaInicio: "19:00", horaFin: "21:00" },
      ],
      total: 2,
      page: 1,
      pageSize: 100,
    } as never);
    render(
      <MemoryRouter>
        <Alumnos />
      </MemoryRouter>,
    );
    await act(async () => {});
    expect(screen.queryByText(/tuvo un error/)).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Nombre, CI, código o teléfono")).toBeInTheDocument();
    const grupo = screen.getByRole("combobox", { name: "Grupo" });
    expect(screen.getByRole("combobox", { name: /Curso|Carrera/ })).toBeInTheDocument();
    fireEvent.change(grupo, { target: { value: "8" } });
    await act(async () => {});
    expect(apiAcademia.alumnos).toHaveBeenLastCalledWith(expect.objectContaining({ grupoId: 8 }));
  });

  it("el filtro de fotos pide ?fotos= al backend, también para los números de las pestañas (contrato #47)", async () => {
    render(
      <MemoryRouter>
        <Alumnos />
      </MemoryRouter>,
    );
    await act(async () => {});
    const fotos = screen.getByRole("combobox", { name: "Fotos" });
    expect(Array.from((fotos as HTMLSelectElement).options).map((o) => o.value)).toEqual(["", "FALTAN", "POR_REVISAR", "OBSERVADAS"]);
    vi.mocked(apiAcademia.alumnos).mockClear();
    fireEvent.change(fotos, { target: { value: "OBSERVADAS" } });
    await act(async () => {});
    expect(apiAcademia.alumnos).toHaveBeenCalledWith(expect.objectContaining({ fotos: "OBSERVADAS", page: 1, pageSize: 20 }));
    expect(apiAcademia.alumnos).toHaveBeenCalledWith(expect.objectContaining({ fotos: "OBSERVADAS", debe: true, pageSize: 1 }));
    fireEvent.change(fotos, { target: { value: "" } });
    await act(async () => {});
    expect(apiAcademia.alumnos).toHaveBeenLastCalledWith(expect.objectContaining({ fotos: undefined }));
  });
});
