import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { esperarDemora, relojDeLaDemora } from "../../test/demora";
import type { AlumnoFila } from "../../lib/academia/tipos";

/**
 * E7 · Estudiantes: las pestañas son los indicadores con su número, cada fila
 * dice si debe y cómo están sus fotos.
 */

/** L9: la recepción a la que el administrador le dio `academia.fotos` desde Roles. */
const quien = vi.hoisted(() => ({ conFotos: false }));

vi.mock("../../store/AuthContext", async () => {
  const { SESION_SECRETARIA: s } = await import("../../test/academiaFixtures");
  return {
    useAuth: () => ({
      ...s,
      usuario: { ...s.usuario, permisos: quien.conFotos ? [...s.usuario.permisos, "academia.fotos"] : s.usuario.permisos },
      puede: () => true,
    }),
  };
});

vi.mock("../../lib/academia/apiAcademia", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/academia/apiAcademia")>();
  return {
    ...real,
    apiAcademia: { alumnos: vi.fn(), carreras: vi.fn(async () => []), grupos: vi.fn(), preinscripciones: vi.fn() },
  };
});

// El alta tiene su propio test: acá sólo importa qué hace la lista cuando termina.
vi.mock("./Inscribir", () => ({
  default: ({ onInscrito }: { onInscrito: (r: unknown) => void }) => (
    <button onClick={() => onInscrito({ inscripcion: { id: 900, fotosPendientes: false }, cobrar: false })}>Terminar alta</button>
  ),
}));

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
  quien.conFotos = false;
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
  it("sin montos (el docente: plan, saldo y vencido en null) no hay estado de deuda ni «Bs 0» ni «Al día» falso ni pestaña «Deben»", async () => {
    vi.mocked(apiAcademia.alumnos).mockImplementation(async (f = {}) => ({
      items: f.pageSize === 1 ? [] : [fila({ plan: null, saldo: null, vencido: null })],
      total: 1,
      page: 1,
      pageSize: f.pageSize ?? 20,
    }));
    render(
      <MemoryRouter>
        <Alumnos />
      </MemoryRouter>,
    );
    await act(async () => {});
    expect(screen.getAllByText("Bustillos Rek, Camila").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Bs\s?0/)).not.toBeInTheDocument();
    expect(screen.queryByText("Al día")).not.toBeInTheDocument();
    expect(screen.queryByText(/Debe /)).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Estado" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Forma de pago" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Deben/ })).not.toBeInTheDocument();
  });

  it("con montos se sigue viendo la columna Estado y la pestaña «Deben»", async () => {
    render(
      <MemoryRouter>
        <Alumnos />
      </MemoryRouter>,
    );
    await act(async () => {});
    expect(screen.getByRole("columnheader", { name: "Estado" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Deben 7" })).toBeInTheDocument();
  });
});

describe("ronda 2 · B7 · el mínimo de 2 letras del buscador", () => {
  afterEach(() => vi.useRealTimers());

  it("con una sola letra no se pregunta nada (ni la lista ni los 4 conteos); con dos, sí", async () => {
    relojDeLaDemora();
    render(
      <MemoryRouter>
        <Alumnos />
      </MemoryRouter>,
    );
    await act(async () => {});
    vi.mocked(apiAcademia.alumnos).mockClear();
    const buscador = screen.getByPlaceholderText("Nombre, CI, código o teléfono");
    fireEvent.change(buscador, { target: { value: "a" } });
    await esperarDemora();
    expect(apiAcademia.alumnos).not.toHaveBeenCalled();
    fireEvent.change(buscador, { target: { value: "ca" } });
    await esperarDemora();
    expect(apiAcademia.alumnos).toHaveBeenCalledWith(expect.objectContaining({ q: "ca" }));
    // Lista + 3 conteos de las pestañas (Todos, Deben, Retirados) con el mismo filtro.
    expect(vi.mocked(apiAcademia.alumnos).mock.calls.every(([f]) => f?.q === "ca")).toBe(true);
  });
});

describe("ronda 1 · D12 · al inscribir se recargan también los conteos", () => {
  it("quien se inscribió sin fotos hace aparecer la pestaña «Faltan fotos» y sube el total", async () => {
    let faltan = 0;
    let todos = 148;
    vi.mocked(apiAcademia.alumnos).mockImplementation(async (f = {}) => ({
      items: f.pageSize === 1 ? [] : [fila({})],
      total: f.fotos === "FALTAN" ? faltan : f.debe ? 7 : f.estado === "RETIRADA" ? 3 : todos,
      page: 1,
      pageSize: f.pageSize ?? 20,
    }));
    render(
      <MemoryRouter>
        <Alumnos />
      </MemoryRouter>,
    );
    await act(async () => {});
    expect(screen.queryByRole("tab", { name: /Faltan fotos/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /^Inscribir/ })[0]);
    // Mientras está abierta el alta, el backend suma al nuevo con sus fotos pendientes.
    faltan = 1;
    todos = 149;
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Terminar alta" }));
    });
    expect(screen.getByRole("tab", { name: "Faltan fotos 1" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Todos 149" })).toBeInTheDocument();
  });

  it("R8: sin cobrar y sin fotos pendientes igual queda un aviso de que se inscribió", async () => {
    render(
      <MemoryRouter>
        <Alumnos />
      </MemoryRouter>,
    );
    await act(async () => {});
    fireEvent.click(screen.getAllByRole("button", { name: /^Inscribir/ })[0]);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Terminar alta" }));
    });
    expect(screen.getByText("La inscripción quedó registrada.")).toBeInTheDocument();
  });
});

describe("L9 · las fotos por revisar en Estudiantes, para quien tiene el permiso", () => {
  const conConteos = (porRevisar: number, observadas: number) =>
    vi.mocked(apiAcademia.alumnos).mockImplementation(async (f = {}) => ({
      items: f.pageSize === 1 ? [] : [fila({ fotos: f.fotos === "OBSERVADAS" ? "OBSERVADAS" : "POR_REVISAR" })],
      total: f.fotos === "POR_REVISAR" ? porRevisar : f.fotos === "OBSERVADAS" ? observadas : f.fotos ? 0 : 148,
      page: 1,
      pageSize: f.pageSize ?? 20,
    }));

  it("sin el permiso no hay pestañas de fotos ni se piden sus conteos", async () => {
    conConteos(4, 2);
    render(
      <MemoryRouter>
        <Alumnos />
      </MemoryRouter>,
    );
    await act(async () => {});
    expect(screen.queryByRole("tab", { name: /Fotos por revisar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Observadas/ })).not.toBeInTheDocument();
    expect(apiAcademia.alumnos).not.toHaveBeenCalledWith(expect.objectContaining({ fotos: "POR_REVISAR" }));
  });

  it("con el permiso: «Fotos por revisar» y «Observadas» cuentan y filtran", async () => {
    quien.conFotos = true;
    conConteos(4, 2);
    render(
      <MemoryRouter>
        <Alumnos />
      </MemoryRouter>,
    );
    await act(async () => {});
    fireEvent.click(screen.getByRole("tab", { name: "Fotos por revisar 4" }));
    await act(async () => {});
    expect(apiAcademia.alumnos).toHaveBeenLastCalledWith(expect.objectContaining({ fotos: "POR_REVISAR", page: 1, pageSize: 20 }));
    fireEvent.click(screen.getByRole("tab", { name: "Observadas 2" }));
    await act(async () => {});
    expect(apiAcademia.alumnos).toHaveBeenLastCalledWith(expect.objectContaining({ fotos: "OBSERVADAS", page: 1, pageSize: 20 }));
  });

  it("sin observadas, esa pestaña no aparece; la de por revisar sí (es la cola)", async () => {
    quien.conFotos = true;
    conConteos(0, 0);
    render(
      <MemoryRouter>
        <Alumnos />
      </MemoryRouter>,
    );
    await act(async () => {});
    expect(screen.getByRole("tab", { name: "Fotos por revisar 0" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Observadas/ })).not.toBeInTheDocument();
  });
});
