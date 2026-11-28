import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiReportesNutricion, type PorDiaReporte, type ReporteNutricion } from "../../../lib/nutricion/reportes";
import ReportesNutricion from "./ReportesNutricion";

/**
 * «Pacientes por día de la semana» (CONTRATO-nutricion-seguimiento-23nov §11.2 d):
 * sólo si alguien tiene día; la frase del día con más (o los que empatan), las
 * seis barras y cada día que se abre con sus nombres.
 */

const sesion = vi.hoisted(() => ({ secciones: [] as string[] }));

vi.mock("../../../store/AuthContext", () => ({
  useAuth: () => ({
    usuario: { id: 1, username: "prueba", rol: "PROFESIONAL", rolNombre: "Médico", permisos: [], permisosPropios: [] },
    negocio: { tipoNegocio: "NUTRICION", features: ["nutricion"] },
    puede: (s: string) => sesion.secciones.includes(s),
  }),
}));

vi.mock("../../../lib/nutricion/reportes", async (original) => ({
  ...(await original<typeof import("../../../lib/nutricion/reportes")>()),
  apiReportesNutricion: { reporte: vi.fn() },
}));

const BASE: ReporteNutricion = {
  periodo: { desde: "2026-11-01", hasta: "2026-11-30" },
  resumen: { pacientesActivos: 20, pacientesNuevos: 2, pacientesAtendidos: 10, controles: 5, semanasAnotadas: 30, enTratamiento: 14 },
  resultados: {
    pacientes: 0,
    bajaron: 0,
    subieron: 0,
    mantuvieron: 0,
    kgBajadosTotal: 0,
    kgBajadosEnPeriodo: 0,
    kgPromedio: null,
    pctPromedio: null,
    grados: { mejoraron: 0, igual: 0, empeoraron: 0, sinDato: 0 },
    ranking: [],
  },
  imc: { grados: [], sinDato: 0 },
  tratamientos: [],
  pagos: { meses: [], total: { medicamento: 0, control: 0, otro: 0, total: 0 } },
};

const nombres = (desde: number, n: number) => Array.from({ length: n }, (_, i) => ({ pacienteId: desde + i, nombre: `Paciente ${desde + i}` }));
const POR_DIA: PorDiaReporte = {
  enTratamiento: 14,
  conDia: 12,
  sinDia: { pacientes: 2, lista: [{ pacienteId: 5, nombre: "Ana Paz" }, { pacienteId: 6, nombre: "Beto Ríos" }] },
  dias: [
    { dia: 1, pacientes: 3, lista: nombres(10, 3) },
    { dia: 2, pacientes: 5, lista: nombres(20, 5) },
    { dia: 3, pacientes: 0, lista: [] },
    { dia: 4, pacientes: 2, lista: nombres(40, 2) },
    { dia: 5, pacientes: 2, lista: nombres(50, 2) },
    { dia: 6, pacientes: 0, lista: [] },
  ],
};

const TITULO = "Pacientes por día de la semana";
const sinNb = (s: string | null) => (s ?? "").replace(/ /g, " ");

async function abrir(reporte: ReporteNutricion) {
  vi.mocked(apiReportesNutricion.reporte).mockResolvedValue(reporte);
  render(
    <MemoryRouter>
      <ReportesNutricion />
    </MemoryRouter>,
  );
  await screen.findByText("Pacientes atendidos");
}
const tarjeta = () => screen.getByText(TITULO).closest("section")!;

beforeEach(() => {
  sessionStorage.clear();
  sesion.secciones = ["nutricion", "seguimiento", "nutricion-reportes"];
});

describe("pacientes por día de la semana (§11)", () => {
  it("un backend anterior (sin `porDia`) o nadie con día: la tarjeta no se dibuja", async () => {
    await abrir(BASE);
    expect(screen.queryByText(TITULO)).not.toBeInTheDocument();
  });

  it("con `conDia` en 0 (el consultorio no usa el día), tampoco", async () => {
    await abrir({ ...BASE, porDia: { enTratamiento: 14, conDia: 0, sinDia: { pacientes: 14, lista: [] }, dias: POR_DIA.dias.map((d) => ({ ...d, pacientes: 0, lista: [] })) } });
    expect(screen.queryByText(TITULO)).not.toBeInTheDocument();
  });

  it("la frase, las seis barras y cada día con pacientes se abre con sus nombres (enlaces a su hoja)", async () => {
    await abrir({ ...BASE, porDia: POR_DIA });
    const t = tarjeta();
    expect(sinNb(within(t).getByText(/^El día con más pacientes es el/).textContent)).toBe("El día con más pacientes es el martes (5).");
    expect(within(t).getAllByRole("listitem").map((li) => sinNb(li.textContent))).toEqual([
      "Lunes3 (25 %)",
      "Martes5 (42 %)",
      "Miércoles0 (0 %)",
      "Jueves2 (17 %)",
      "Viernes2 (17 %)",
      "Sábado0 (0 %)",
    ]);
    // Los días sin pacientes no se abren; los otros, cerrados de entrada.
    expect(within(t).queryByRole("button", { name: /^Miércoles/ })).not.toBeInTheDocument();
    const martes = within(t).getByRole("button", { name: /^Martes/ });
    expect(martes).toHaveAttribute("aria-expanded", "false");
    expect(within(t).queryByRole("link")).not.toBeInTheDocument();
    fireEvent.click(martes);
    expect(martes).toHaveAttribute("aria-expanded", "true");
    expect(within(t).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(["/seguimiento/20", "/seguimiento/21", "/seguimiento/22", "/seguimiento/23", "/seguimiento/24"]);
    // Al pie: cuántos tienen día y los que no, que también se abren.
    expect(within(t).getByText("12 de 14 en tratamiento tienen día.")).toBeInTheDocument();
    fireEvent.click(within(t).getByRole("button", { name: "Sin día fijo: 2" }));
    expect(within(t).getByRole("link", { name: "Beto Ríos" })).toHaveAttribute("href", "/seguimiento/6");
  });

  it("si empatan, los días con más; sin ver el seguimiento, los nombres sin enlace", async () => {
    sesion.secciones = ["nutricion-reportes"];
    const empate = { ...POR_DIA, dias: POR_DIA.dias.map((d) => (d.dia === 4 ? { ...d, pacientes: 5, lista: nombres(40, 5) } : d)) };
    await abrir({ ...BASE, porDia: { ...empate, conDia: 15, enTratamiento: 17 } });
    const t = tarjeta();
    expect(sinNb(within(t).getByText(/^Los días con más pacientes/).textContent)).toBe("Los días con más pacientes: martes y jueves (5 cada uno).");
    fireEvent.click(within(t).getByRole("button", { name: /^Jueves/ }));
    expect(within(t).getByText("Paciente 44")).toBeInTheDocument();
    expect(within(t).queryByRole("link")).not.toBeInTheDocument();
  });
});
