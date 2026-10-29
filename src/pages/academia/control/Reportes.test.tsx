import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EstudiantesAcademia, ReportesAcademia } from "../../../lib/academia/tipos";

/**
 * E18 · Reportes del instituto, académicos desde L5 (28-oct): sin resultado en
 * plata (vive en el Estado de resultado), con el período de Reportes de
 * ventas, los estudiantes por día/semana/mes (ingresaron, cobrado en clases,
 * al día y en mora), la mora con los días de espera y "Cómo se calcula" en
 * cada tarjeta.
 */

let permisosExtra: string[] = [];

vi.mock("../../../store/AuthContext", async () => {
  const { SESION_ADMIN: s } = await import("../../../test/academiaFixtures");
  return {
    useAuth: () => ({
      ...s,
      usuario: { ...s.usuario, permisos: [...s.usuario.permisos, ...permisosExtra] },
      puede: () => true,
      incluye: () => true,
    }),
  };
});

vi.mock("../../../lib/api", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../lib/api")>();
  return { ...real, api: { ...real.api, getSucursales: vi.fn().mockResolvedValue([]) } };
});

vi.mock("../../../lib/academia/apiAcademia", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../lib/academia/apiAcademia")>();
  return { ...real, apiAcademia: { reportes: vi.fn(), reportesEstudiantes: vi.fn() } };
});

import { apiAcademia } from "../../../lib/academia/apiAcademia";
import Reportes from "./Reportes";

const REPORTES: ReportesAcademia = {
  mes: "2026-10",
  desde: "2026-10-01",
  hasta: "2026-10-28",
  montos: true,
  activosPorCurso: [{ curso: "Tatuaje", activos: 18, cupo: 20, cobrado: 4200, vencido: 600 }],
  morosidad: { vencido: 5400, estudiantes: 4, pctEstudiantes: 14, activos: 28, enEspera: 3, alDia: 21, diasEspera: 7 },
  asistenciaPromedioPct: 88,
};

const fila = (desde: string, hasta: string, extra: Partial<EstudiantesAcademia["filas"][number]> = {}) => ({
  desde,
  hasta,
  ingresaron: 0,
  cobradoClases: 0,
  alDia: 0,
  porVencer: 0,
  enEspera: 0,
  enMora: 0,
  ...extra,
});

const ESTUDIANTES: EstudiantesAcademia = {
  desde: "2026-10-01",
  hasta: "2026-10-28",
  agrupar: "semana",
  sede: null,
  diasEspera: 7,
  montos: true,
  filas: [
    fila("2026-10-01", "2026-10-05", { ingresaron: 6, cobradoClases: 3000, alDia: 5, enMora: 1 }),
    fila("2026-10-06", "2026-10-12", { ingresaron: 2, cobradoClases: 1200, alDia: 3, enEspera: 2 }),
  ],
  totales: { ingresaron: 8, cobradoClases: 4200, alDia: 8, porVencer: 0, enEspera: 2, enMora: 1 },
  hoy: { activos: 28, alDia: 21, enEspera: 3, enMora: 4, pctMora: 14, vencido: 5400 },
};

function mostrar() {
  return render(
    <MemoryRouter>
      <Reportes />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  permisosExtra = [];
  try {
    sessionStorage.clear();
  } catch {
    // Sin almacenamiento: el período arranca en el mes igual.
  }
  vi.mocked(apiAcademia.reportes).mockResolvedValue(REPORTES);
  vi.mocked(apiAcademia.reportesEstudiantes).mockResolvedValue(ESTUDIANTES);
});

describe("E18 · Reportes del instituto (L5)", () => {
  it("ya no hay resultado en plata: lo académico, y el salto al Estado de resultado para quien lo ve", async () => {
    permisosExtra = ["reportes.rentabilidad"];
    mostrar();
    await act(async () => {});
    expect(screen.queryByRole("region", { name: /Resultado por/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Resultado")).not.toBeInTheDocument();
    expect(screen.getByText("18 de 20 activos")).toBeInTheDocument();
    expect(screen.getByText("88 %")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Estado de resultado/ }).length).toBeGreaterThan(0);
  });

  it("la mora usa los días de espera: al día, en la espera y en mora", async () => {
    mostrar();
    await act(async () => {});
    const mora = screen.getByRole("region", { name: "Morosidad" });
    expect(within(mora).getByText("21")).toBeInTheDocument();
    expect(within(mora).getByText("3")).toBeInTheDocument();
    expect(within(mora).getByText("4 · 14 %")).toBeInTheDocument();
    expect(mora).toHaveTextContent(/5\.400/);
    expect(mora).toHaveTextContent(/La espera es de 7 días/);
  });

  it("los estudiantes por semana: ingresaron, cobrado en clases, al día y en mora, con su total", async () => {
    mostrar();
    await act(async () => {});
    const tarjeta = screen.getByRole("region", { name: /por semana/ });
    const filas = within(tarjeta).getAllByRole("row");
    // Encabezado, dos semanas y el total.
    expect(filas).toHaveLength(4);
    expect(within(filas[3]).getByText("Total")).toBeInTheDocument();
    expect(filas[3]).toHaveTextContent(/8.*4\.200/);
    expect(within(tarjeta).getByRole("columnheader", { name: "Cobrado en clases" })).toBeInTheDocument();
  });

  it("el período es el de Reportes de ventas y agrupar pide por día, semana o mes", async () => {
    mostrar();
    await act(async () => {});
    // Arranca en el mes en curso, partido por semana.
    expect(vi.mocked(apiAcademia.reportesEstudiantes)).toHaveBeenLastCalledWith(expect.objectContaining({ agrupar: "semana" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Por mes" }));
    });
    expect(vi.mocked(apiAcademia.reportesEstudiantes)).toHaveBeenLastCalledWith(expect.objectContaining({ agrupar: "mes" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Hoy" }));
    });
    const hoy = vi.mocked(apiAcademia.reportes).mock.lastCall![0];
    expect(hoy.desde).toBe(hoy.hasta);
    // Al cambiar el período, la agrupación vuelve a la que le corresponde: un día.
    expect(vi.mocked(apiAcademia.reportesEstudiantes)).toHaveBeenLastCalledWith(expect.objectContaining({ agrupar: "dia" }));
  });

  it("sin montos no hay columna de cobrado ni Bs en los indicadores", async () => {
    vi.mocked(apiAcademia.reportes).mockResolvedValue({
      ...REPORTES,
      montos: false,
      activosPorCurso: [{ curso: "Tatuaje", activos: 18, cupo: 20, cobrado: null, vencido: null }],
      morosidad: { ...REPORTES.morosidad, vencido: null },
    });
    vi.mocked(apiAcademia.reportesEstudiantes).mockResolvedValue({
      ...ESTUDIANTES,
      montos: false,
      filas: ESTUDIANTES.filas.map((f) => ({ ...f, cobradoClases: null })),
      totales: { ...ESTUDIANTES.totales, cobradoClases: null },
      hoy: { ...ESTUDIANTES.hoy, vencido: null },
    });
    mostrar();
    await act(async () => {});
    expect(screen.queryByRole("columnheader", { name: "Cobrado en clases" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Bs/)).not.toBeInTheDocument();
  });

  it("cada tarjeta explica cómo se calcula", async () => {
    mostrar();
    await act(async () => {});
    for (const nombre of [/Cómo se calcula: Estudiantes por período/, /Cómo se calcula: Por /, /Cómo se calcula: Asistencia promedio/, /Cómo se calcula: Morosidad/]) {
      expect(screen.getByRole("button", { name: nombre })).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole("button", { name: /Cómo se calcula: Morosidad/ }));
    expect(screen.getByRole("dialog", { name: "Cómo se calcula" })).toHaveTextContent(/venció hace más de 7 días/);
  });
});
