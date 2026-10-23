import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LineaPlanilla, PlanillaDocente as TPlanillaDocente } from "../../../lib/academia/tipos";

/**
 * E14 / N8 · Planilla de los docentes: el mes con cada docente y su bruto, la
 * retención por confirmar (D9); la de un docente con lo que cuenta, lo
 * postergado y de dónde sale cada monto; cerrar y pagar.
 */

vi.mock("../../../store/AuthContext", async () => {
  const { SESION_ADMIN: s } = await import("../../../test/academiaFixtures");
  return { useAuth: () => ({ ...s, puede: () => true }) };
});

vi.mock("../../../lib/api", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../lib/api")>();
  return { ...real, api: { ...real.api, getSucursales: vi.fn().mockResolvedValue([]) } };
});

vi.mock("../../../lib/academia/apiAcademia", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../lib/academia/apiAcademia")>();
  return {
    ...real,
    apiAcademia: {
      planilla: vi.fn(),
      planillaDocente: vi.fn(),
      cerrarPlanilla: vi.fn(),
      pagarPlanilla: vi.fn(),
      guardarMotivoNoPago: vi.fn(),
      quitarMotivoNoPago: vi.fn(),
    },
  };
});

import { apiAcademia } from "../../../lib/academia/apiAcademia";
import { ApiError } from "../../../lib/api";
import PlanillaDocente from "./PlanillaDocente";
import PlanillaMes from "./PlanillaMes";

const linea = (extra: Partial<LineaPlanilla>): LineaPlanilla => ({
  inscripcionId: 101,
  alumno: { id: 51, nombre: "Andrade Villca, Mateo" },
  grupo: { id: 7, nombre: "Barbería · L-M-V 09–11" },
  materia: { orden: 2, nombre: "Degradados" },
  formaPago: "COMPLETO",
  cobradoModulo: 450,
  abonado: 450,
  montoModulo: 450,
  pct: 20,
  monto: 90,
  explicacion: "Pagó Bs 1.350 el 8-sep · 1.350 ÷ 3 = 450 · 20 % = Bs 90",
  ...extra,
});

const PLANILLA: TPlanillaDocente = {
  docente: { personalId: 9, nombre: "Marco Rojas" },
  mes: "2026-10",
  estado: "EN_CURSO",
  pct: { defecto: 20, porCurso: [] },
  resumen: { cuentan: 2, postergados: 1, sinPagar: 0, atrasados: 0, bruto: 190, retencion: null, retencionActiva: false, atrasos: null, liquido: 190 },
  cuentan: [linea({}), linea({ inscripcionId: 104, alumno: { id: 54, nombre: "Durán Aguilar, Luciana" }, formaPago: "MES_A_MES", cobradoModulo: 500, monto: 100, explicacion: "Pagó Bs 500 · 20 % = Bs 100" })],
  postergados: [linea({ inscripcionId: 103, alumno: { id: 53, nombre: "Céspedes Molina, Joaquín" }, formaPago: "MES_A_MES", abonado: 200, montoModulo: 500, monto: 100 })],
  atrasados: [],
  sinPagar: [],
  meses: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 16, 10, 0));
  vi.mocked(apiAcademia.planilla).mockResolvedValue({
    mes: "2026-10",
    retencionActiva: false,
    docentes: [
      { personalId: 9, nombre: "Marco Rojas", grupos: 1, cuentan: 17, total: 22, bruto: 1850, retencion: null, liquido: 1850, estado: "EN_CURSO" },
      { personalId: 10, nombre: "Diego Mamani", grupos: 1, cuentan: 15, total: 18, bruto: 2190, retencion: null, liquido: 2190, estado: "EN_CURSO" },
    ],
    totales: { bruto: 4040, liquido: 4040 },
  });
  vi.mocked(apiAcademia.planillaDocente).mockResolvedValue(PLANILLA);
  vi.mocked(apiAcademia.cerrarPlanilla).mockResolvedValue({});
});

afterEach(() => vi.useRealTimers());

describe("E14 · Planilla del mes", () => {
  it("cada docente con su bruto y la retención por confirmar; tocarlo abre su planilla", async () => {
    render(
      <MemoryRouter>
        <PlanillaMes />
      </MemoryRouter>,
    );
    await act(async () => {});
    expect(screen.getByRole("heading", { name: "Planilla docentes · Octubre 2026" })).toBeInTheDocument();
    expect(apiAcademia.planilla).toHaveBeenCalledWith("2026-10", null);
    expect(screen.getByRole("region", { name: "Resumen del mes" })).toHaveTextContent(/4\.040/);
    expect(screen.getByText("Por confirmar con el instituto")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver la planilla de Marco Rojas" })).toHaveAttribute("href", "/academia/planilla/9?mes=2026-10");
    fireEvent.click(screen.getByRole("button", { name: "Mes anterior" }));
    await act(async () => {});
    expect(apiAcademia.planilla).toHaveBeenLastCalledWith("2026-09", null);
  });
});

describe("N8 · Planilla de un docente", () => {
  async function montar() {
    render(
      <MemoryRouter initialEntries={["/academia/planilla/9?mes=2026-10"]}>
        <Routes>
          <Route path="/academia/planilla/:id" element={<PlanillaDocente />} />
        </Routes>
      </MemoryRouter>,
    );
    await act(async () => {});
  }

  it("lo que cuenta, por grupo, y de dónde sale cada monto", async () => {
    await montar();
    expect(screen.getByRole("heading", { name: "Prof. Marco Rojas · Octubre 2026" })).toBeInTheDocument();
    const grupo = screen.getByRole("region", { name: "Barbería · L-M-V 09–11" });
    expect(within(grupo).getByText("Pago completo")).toBeInTheDocument();
    fireEvent.click(within(grupo).getByRole("button", { name: "Ver el detalle de Andrade Villca, Mateo" }));
    expect(screen.getByText("Pagó Bs 1.350 el 8-sep · 1.350 ÷ 3 = 450 · 20 % = Bs 90")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Postergados/ }));
    expect(screen.getByText("Céspedes Molina, Joaquín")).toBeInTheDocument();
  });

  it("cerrar un mes que no terminó pide confirmar y se reintenta forzando", async () => {
    vi.mocked(apiAcademia.cerrarPlanilla).mockRejectedValueOnce(new ApiError("El mes no terminó", 400, { codigo: "MES_EN_CURSO" }));
    await montar();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Cerrar planilla" }));
    });
    const confirmar = screen.getByRole("dialog", { name: "El mes no terminó" });
    await act(async () => {
      fireEvent.click(within(confirmar).getByRole("button", { name: "Cerrar igual" }));
    });
    expect(apiAcademia.cerrarPlanilla).toHaveBeenLastCalledWith(9, "2026-10", true);
  });

  it("cerrada, registrar el pago pide confirmar el monto y el método antes de pagar (QA ronda 2, B-12)", async () => {
    vi.mocked(apiAcademia.planillaDocente).mockResolvedValue({ ...PLANILLA, estado: "CERRADA" });
    vi.mocked(apiAcademia.pagarPlanilla).mockResolvedValue({});
    await montar();
    fireEvent.click(screen.getByRole("button", { name: /Registrar pago/ }));
    // Un toque ya no paga: abre el diálogo.
    expect(apiAcademia.pagarPlanilla).not.toHaveBeenCalled();
    const dialogo = screen.getByRole("dialog", { name: "Registrar el pago" });
    expect(dialogo).toHaveTextContent(/Pagar Bs\s?[\d.,]+ a Marco Rojas por octubre 2026/);
    expect(within(dialogo).getByRole("button", { name: "Efectivo" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Transferencia" }));
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: /^Pagar/ }));
    });
    expect(apiAcademia.pagarPlanilla).toHaveBeenCalledWith(9, "2026-10", "TRANSFERENCIA");
  });

  it("cancelar el diálogo no paga", async () => {
    vi.mocked(apiAcademia.planillaDocente).mockResolvedValue({ ...PLANILLA, estado: "CERRADA" });
    await montar();
    fireEvent.click(screen.getByRole("button", { name: /Registrar pago/ }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Registrar el pago" })).getByRole("button", { name: "Cancelar" }));
    expect(apiAcademia.pagarPlanilla).not.toHaveBeenCalled();
  });
});

describe("A6 · planilla sólo del admin: abre en Cuentan y el motivo de no pago", () => {
  const SIN_PAGAR = linea({
    inscripcionId: 105,
    alumno: { id: 55, nombre: "Rivero Gil, Matías" },
    materia: { id: 32, orden: 2, nombre: "Degradados" },
    formaPago: "MES_A_MES",
    cobradoModulo: 0,
    abonado: 0,
    montoModulo: 500,
    monto: 0,
    montoPotencial: 100,
    explicacion: "No pagó el M2 · quedaría 20 % de 500 = Bs 100",
    motivoNoPago: null,
  });

  async function montarCon(extra: Partial<TPlanillaDocente>) {
    vi.mocked(apiAcademia.planillaDocente).mockResolvedValue({
      ...PLANILLA,
      resumen: { ...PLANILLA.resumen, sinPagar: 1 },
      sinPagar: [SIN_PAGAR],
      ...extra,
    });
    render(
      <MemoryRouter initialEntries={["/academia/planilla/9?mes=2026-10"]}>
        <Routes>
          <Route path="/academia/planilla/:id" element={<PlanillaDocente />} />
        </Routes>
      </MemoryRouter>,
    );
    await act(async () => {});
  }

  it("abre en «Cuentan» y cada línea dice de dónde sale el monto", async () => {
    await montarCon({});
    expect(screen.getByRole("tab", { name: /Cuentan/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: "Ver el detalle de Andrade Villca, Mateo" })).toHaveAttribute(
      "title",
      "Pagó Bs 1.350 el 8-sep · 1.350 ÷ 3 = 450 · 20 % = Bs 90",
    );
    // En lo que cuenta no hay motivo que anotar.
    expect(screen.queryByRole("button", { name: /Agregar motivo/ })).not.toBeInTheDocument();
  });

  it("en «Sin pagar» se anota el motivo; con «Otro» pide el texto", async () => {
    vi.mocked(apiAcademia.guardarMotivoNoPago).mockResolvedValue({});
    await montarCon({});
    fireEvent.click(screen.getByRole("tab", { name: /Sin pagar/ }));
    fireEvent.click(screen.getByRole("button", { name: "Agregar motivo de Rivero Gil, Matías" }));
    const dialogo = screen.getByRole("dialog", { name: "Motivo de no pago" });
    const opciones = within(dialogo).getAllByRole("radio");
    expect(opciones).toHaveLength(5);
    fireEvent.click(within(dialogo).getByRole("radio", { name: "Otro" }));
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar motivo" }));
    });
    expect(apiAcademia.guardarMotivoNoPago).not.toHaveBeenCalled();
    expect(within(dialogo).getByText("Contá cuál es el motivo.")).toBeInTheDocument();

    fireEvent.click(within(dialogo).getByRole("radio", { name: "Se retiró" }));
    fireEvent.change(within(dialogo).getByLabelText("Detalle (opcional)"), { target: { value: "se mudó" } });
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar motivo" }));
    });
    expect(apiAcademia.guardarMotivoNoPago).toHaveBeenCalledWith({
      inscripcionId: 105,
      materiaId: 32,
      motivo: "RETIRO",
      detalle: "se mudó",
    });
    // El motivo queda en la fila.
    expect(screen.getByText(/Se retiró: se mudó/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cambiar el motivo de Rivero Gil, Matías" })).toBeInTheDocument();
  });

  it("el que ya tiene motivo lo muestra y se puede quitar", async () => {
    vi.mocked(apiAcademia.quitarMotivoNoPago).mockResolvedValue({});
    await montarCon({
      sinPagar: [{ ...SIN_PAGAR, motivoNoPago: { motivo: "BECA", detalle: null, usuario: "Hugo Salinas", fecha: "2026-10-12T12:00:00.000Z" } }],
    });
    fireEvent.click(screen.getByRole("tab", { name: /Sin pagar/ }));
    expect(screen.getByText("Tiene beca")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cambiar el motivo de Rivero Gil, Matías" }));
    await act(async () => {
      fireEvent.click(within(screen.getByRole("dialog", { name: "Motivo de no pago" })).getByRole("button", { name: "Quitar motivo" }));
    });
    expect(apiAcademia.quitarMotivoNoPago).toHaveBeenCalledWith(105, 32);
    expect(screen.queryByText("Tiene beca")).not.toBeInTheDocument();
  });

  it("con un backend anterior (sin el módulo de la línea) no ofrece anotar nada", async () => {
    await montarCon({ sinPagar: [{ ...SIN_PAGAR, materia: { orden: 2, nombre: "Degradados" }, motivoNoPago: undefined }] });
    fireEvent.click(screen.getByRole("tab", { name: /Sin pagar/ }));
    expect(screen.getByText("Rivero Gil, Matías")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /motivo/ })).not.toBeInTheDocument();
  });
});
