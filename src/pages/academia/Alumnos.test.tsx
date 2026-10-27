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
    total: f.fotos ? 0 : f.debe ? TOTAL.deben : f.estado === "RETIRADA" ? TOTAL.retirados : TOTAL.todos,
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

  it("U4: sólo el buscador y los chips; ya no hay selectores de curso, grupo ni fotos", async () => {
    vi.mocked(apiAcademia.carreras).mockResolvedValue([
      { id: 1, nombre: "Barbería" },
      { id: 2, nombre: "Tatuaje" },
    ] as never);
    render(
      <MemoryRouter>
        <Alumnos />
      </MemoryRouter>,
    );
    await act(async () => {});
    expect(screen.queryByText(/tuvo un error/)).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Nombre, CI, código o teléfono")).toBeInTheDocument();
    // El único desplegable es el de las pestañas en el celular, no un filtro.
    for (const nombre of [/Grupo/, /Fotos/, /Curso|Carrera/]) expect(screen.queryByRole("combobox", { name: nombre })).not.toBeInTheDocument();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Todos 148", "Deben 7", "Retirados 3"]);
    // Ni los grupos ni los cursos se piden ya para armar la lista.
    expect(apiAcademia.grupos).not.toHaveBeenCalled();
    expect(apiAcademia.alumnos).not.toHaveBeenCalledWith(expect.objectContaining({ grupoId: expect.anything() }));
  });

  it("U4: sin nadie con fotos faltantes no hay chip «Faltan fotos»", async () => {
    // Sin ninguno: no hay chip.
    render(
      <MemoryRouter>
        <Alumnos />
      </MemoryRouter>,
    );
    await act(async () => {});
    expect(screen.queryByRole("tab", { name: /Faltan fotos/ })).not.toBeInTheDocument();
  });

  it("U4: con alumnos sin fotos aparece el chip con su número y filtra", async () => {
    const base = vi.mocked(apiAcademia.alumnos).getMockImplementation()!;
    vi.mocked(apiAcademia.alumnos).mockImplementation(async (f = {}) =>
      f.fotos === "FALTAN" ? { items: f.pageSize === 1 ? [] : [fila({ fotos: "FALTAN" })], total: 4, page: 1, pageSize: f.pageSize ?? 20 } : base(f),
    );
    render(
      <MemoryRouter>
        <Alumnos />
      </MemoryRouter>,
    );
    await act(async () => {});
    fireEvent.click(screen.getByRole("tab", { name: "Faltan fotos 4" }));
    await act(async () => {});
    expect(apiAcademia.alumnos).toHaveBeenLastCalledWith(expect.objectContaining({ fotos: "FALTAN", page: 1, pageSize: 20 }));
  });
});
