import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClaseDelDia, ListaDeClase, PlanillaDocente } from "../../../lib/academia/tipos";

/**
 * Las pantallas del docente (E11a, N6, E16): sus clases con cuántos pagaron,
 * pasar lista con el estado de pago (nunca montos) y su planilla con
 * cantidades, sin nombres ni montos por estudiante.
 */

vi.mock("../../../store/AuthContext", async () => {
  const { SESION_DOCENTE: s } = await import("../../../test/academiaFixtures");
  const { puedeVer } = await import("../../../lib/permisos");
  return {
    useAuth: () => ({
      ...s,
      puede: (sec: Parameters<typeof puedeVer>[1]) =>
        puedeVer({ features: s.negocio.features, rubro: "ACADEMIA", permisos: s.usuario.permisos, permisosPropios: s.usuario.permisosPropios }, sec),
    }),
  };
});

vi.mock("../../../lib/academia/apiAcademia", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../lib/academia/apiAcademia")>();
  return {
    ...real,
    apiAcademia: { misClases: vi.fn(), lista: vi.fn(), guardarLista: vi.fn(), grupo: vi.fn(), planilla: vi.fn(), planillaDocente: vi.fn() },
  };
});

import { apiAcademia } from "../../../lib/academia/apiAcademia";
import { ApiError } from "../../../lib/api";
import { grupoDetalle } from "../../../test/academiaFixtures";
import MiPlanilla from "./MiPlanilla";
import MisClases from "./MisClases";
import PasarLista from "./PasarLista";

const CLASE: ClaseDelDia = {
  sesionId: 11,
  grupoId: 7,
  nombre: "L-M-V 09:00–11:00",
  carrera: "Barbería",
  materia: { orden: 2, nombre: "Degradados" },
  horaInicio: "09:00",
  horaFin: "11:00",
  aula: "Aula 2",
  sede: "Central",
  docente: null,
  inscritos: 22,
  pagaronModulo: 17,
  llegadaEn: null,
  atrasoMin: null,
  lista: { pasada: false, presentes: 0, total: 22 },
};

const LISTA: ListaDeClase = {
  sesion: { id: 11, fecha: "2026-10-16", horaInicio: "09:00", horaFin: "11:00", estado: "PROGRAMADA", materia: { orden: 2, nombre: "Degradados" } },
  guardada: false,
  editable: true,
  resumen: { pagaron: 1, total: 3 },
  alumnos: [
    { inscripcionId: 101, nombre: "Andrade Villca, Mateo", estadoPago: "PAGADO", estado: null },
    { inscripcionId: 102, nombre: "Bustillos Rek, Camila", estadoPago: "SIN_PAGAR", estado: null },
    { inscripcionId: 103, nombre: "Céspedes Molina, Joaquín", estadoPago: "ABONO", estado: "AUSENTE" },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 16, 8, 48));
  vi.mocked(apiAcademia.misClases).mockResolvedValue({
    fecha: "2026-10-16",
    clases: [CLASE],
    proximas: [{ fecha: "2026-10-19", grupoId: 7, nombre: "Barbería", materia: { orden: 2, nombre: "Degradados" }, horaInicio: "09:00", horaFin: "11:00", aula: "Aula 2" }],
  });
  vi.mocked(apiAcademia.lista).mockResolvedValue(LISTA);
  vi.mocked(apiAcademia.guardarLista).mockResolvedValue(undefined);
  vi.mocked(apiAcademia.grupo).mockResolvedValue(grupoDetalle());
});

afterEach(() => vi.useRealTimers());

describe("E11a · Mis clases", () => {
  it("saluda, dice cuántas clases da, cuándo empieza y cuántos pagaron el módulo", async () => {
    render(
      <MemoryRouter>
        <MisClases />
      </MemoryRouter>,
    );
    await act(async () => {});
    expect(screen.getByRole("heading", { name: "Hola, Marco" })).toBeInTheDocument();
    expect(screen.getByText("Hoy das 1 clase")).toBeInTheDocument();
    expect(screen.getByText("en 12 min")).toBeInTheDocument();
    expect(screen.getByText("17 de 22 pagaron el M2")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Pasar lista/ })).toHaveAttribute("href", "/academia/lista?grupo=7");
    expect(screen.getByRole("region", { name: "Próximas clases" })).toBeInTheDocument();
    // Su barra de abajo en el celular: sus tres lugares.
    expect(within(screen.getByRole("navigation", { name: "Secciones del docente" })).getAllByRole("link")).toHaveLength(3);
  });
});

describe("N6 · Pasar lista", () => {
  async function montar(ruta = "/academia/lista?grupo=7") {
    render(
      <MemoryRouter initialEntries={[ruta]}>
        <Routes>
          <Route path="/academia/lista" element={<PasarLista />} />
        </Routes>
      </MemoryRouter>,
    );
    await act(async () => {});
  }

  it("cada uno con su estado de pago, sin montos; los no marcados arrancan presentes y se guarda todo junto", async () => {
    await montar();
    expect(screen.getByText("1 de 3 ya pagaron el M2")).toBeInTheDocument();
    expect(screen.getByText("Sin pagar")).toBeInTheDocument();
    expect(screen.getByText("Abonó")).toBeInTheDocument();
    expect(screen.queryByText(/Bs/)).not.toBeInTheDocument();
    const camila = screen.getByRole("group", { name: "Asistencia de Bustillos Rek, Camila" });
    expect(within(camila).getByRole("button", { name: "Presente" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(camila).getByRole("button", { name: "Ausente" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Guardar lista (1 presente, 2 ausentes)" }));
    });
    expect(apiAcademia.guardarLista).toHaveBeenCalledWith(7, "2026-10-16", [
      { inscripcionId: 101, estado: "PRESENTE" },
      { inscripcionId: 102, estado: "AUSENTE" },
      { inscripcionId: 103, estado: "AUSENTE" },
    ]);
    expect(screen.getByRole("status")).toHaveTextContent(/podés corregirla hasta el final del día/);
  });

  it("el filtro deja a los que no pagaron completo", async () => {
    await montar();
    fireEvent.click(screen.getByRole("tab", { name: /Sin pagar o abonó/ }));
    expect(screen.queryByText("Andrade Villca, Mateo")).not.toBeInTheDocument();
  });

  it("sin clase ese día lo dice, sin error", async () => {
    vi.mocked(apiAcademia.lista).mockRejectedValue(new ApiError("No hay clase", 404, { codigo: "SIN_CLASE" }));
    await montar();
    expect(screen.getByText("Ese día no hay clase de este grupo")).toBeInTheDocument();
  });

  it("sin grupo y con una sola clase hoy, abre esa", async () => {
    await montar("/academia/lista");
    expect(apiAcademia.lista).toHaveBeenCalledWith(7, undefined);
  });
});

describe("E16 · Mi planilla", () => {
  const PLANILLA: PlanillaDocente = {
    docente: { personalId: 9, nombre: "Marco Rojas" },
    mes: "2026-10",
    estado: "EN_CURSO",
    pct: { defecto: 20, porCurso: [] },
    resumen: { cuentan: 17, postergados: 4, sinPagar: 1, atrasados: 2, bruto: 1850, retencion: null, retencionActiva: false, atrasos: null, liquido: 1850 },
    cuentan: [],
    postergados: [],
    atrasados: [],
    sinPagar: [],
    meses: [{ mes: "2026-09", estado: "PAGADA", liquido: 1850 }],
  };

  it("lo que va ganando, con cantidades y sin nombres; retención y atrasos por confirmar", async () => {
    vi.mocked(apiAcademia.planilla).mockResolvedValue({
      mes: "2026-10",
      retencionActiva: false,
      docentes: [{ personalId: 9, nombre: "Marco Rojas", grupos: 1, cuentan: 17, total: 22, bruto: 1850, retencion: null, liquido: 1850, estado: "EN_CURSO" }],
      totales: { bruto: 1850, liquido: 1850 },
    });
    vi.mocked(apiAcademia.planillaDocente).mockResolvedValue(PLANILLA);
    render(
      <MemoryRouter>
        <MiPlanilla />
      </MemoryRouter>,
    );
    await act(async () => {});
    expect(apiAcademia.planillaDocente).toHaveBeenCalledWith(9, "2026-10");
    expect(screen.getByText("Cuentan 17 estudiantes")).toBeInTheDocument();
    expect(screen.getByText("4 postergados")).toBeInTheDocument();
    expect(screen.getByText("1 sin pagar")).toBeInTheDocument();
    expect(screen.getAllByText("Por confirmar con el instituto")).toHaveLength(2);
    expect(screen.getByText("Septiembre 2026")).toBeInTheDocument();
  });
});
