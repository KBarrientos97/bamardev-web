import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LineaPlanilla, PlanillaDocente as TPlanillaDocente } from "../../../lib/academia/tipos";

/**
 * E14 / N8 · Planilla de los docentes: el mes con cada docente y su líquido
 * (sin retención desde el 08-nov: un solo monto); la de un docente con lo que
 * cuenta, lo postergado y de dónde sale cada monto; cerrar y pagar.
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
      pagosDocente: vi.fn(),
    },
  };
});

vi.mock("../../../lib/compartirTicket", () => ({
  compartirComoImagen: vi.fn().mockResolvedValue({ ok: true }),
  enviarPorWhatsapp: vi.fn().mockResolvedValue({ ok: true }),
  puedeCompartirImagen: () => false,
}));

import { apiAcademia } from "../../../lib/academia/apiAcademia";
import type { HistorialPagosDocente, ResumenClasesDocente } from "../../../lib/academia/tipos";
import { ApiError } from "../../../lib/api";
import { enviarPorWhatsapp } from "../../../lib/compartirTicket";
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
  modalidad: "PORCENTAJE",
  pct: 20,
  montoFijo: null,
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

/** El historial de Marco: octubre pagado por QR y septiembre por transferencia (ítem 17). */
const HISTORIAL: HistorialPagosDocente = {
  docente: { personalId: 9, nombre: "Marco Rojas", telefono: "70412386" },
  pagos: [
    { mes: "2026-10", estado: "PAGADA", liquido: 1850, cerradaEn: "2026-11-02T14:00:00.000Z", pagadaEn: "2026-11-03T15:00:00.000Z", metodoPago: "QR", pagadoPor: "Hugo Salinas" },
    { mes: "2026-09", estado: "PAGADA", liquido: 1640, cerradaEn: "2026-10-02T14:00:00.000Z", pagadaEn: "2026-10-04T15:00:00.000Z", metodoPago: "TRANSFERENCIA", pagadoPor: "Hugo Salinas" },
    { mes: "2026-08", estado: "CERRADA", liquido: 900, cerradaEn: "2026-09-02T14:00:00.000Z", pagadaEn: null, metodoPago: null, pagadoPor: null },
  ],
};

const CLASES: ResumenClasesDocente = {
  programadas: 12,
  suspendidas: 1,
  porReemplazo: 1,
  porDar: 2,
  conLista: 7,
  conLlegada: 8,
  sinLista: 2,
  comoReemplazo: 0,
  atrasos: { cantidad: 2, minutos: 25, justificados: 1, minutosJustificados: 10 },
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
  vi.mocked(apiAcademia.pagosDocente).mockResolvedValue(HISTORIAL);
});

afterEach(() => vi.useRealTimers());

describe("E14 · Pagos a docentes (el mes)", () => {
  async function montarMes() {
    render(
      <MemoryRouter>
        <PlanillaMes />
      </MemoryRouter>,
    );
    await act(async () => {});
  }
  const tarjeta = (nombre: string) => screen.getByRole("listitem", { name: nombre });

  it("cada docente en su tarjeta con lo que se le paga, sin retención (dueño, 08-nov); «Ver el detalle» abre su planilla", async () => {
    await montarMes();
    expect(screen.getByRole("heading", { name: "Pagos a docentes" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Mes" })).toHaveTextContent("Octubre 2026");
    expect(apiAcademia.planilla).toHaveBeenCalledWith("2026-10", null);
    // Los tres totales: por pagar, pagado y los que cuentan (sin «clases dadas»: no existe ese dato).
    const resumen = screen.getByRole("region", { name: "Resumen del mes" });
    expect(resumen).toHaveTextContent(/Por pagar este mes.*4\.040/);
    expect(resumen).toHaveTextContent(/Ya pagado.*0,00/);
    expect(resumen).toHaveTextContent("32 de 40");
    expect(document.body).not.toHaveTextContent(/clases dadas/i);
    // Sin retención: ni tarjeta, ni columna, ni «por confirmar»; un solo monto por docente.
    expect(document.body).not.toHaveTextContent(/Retención|retención|Por confirmar|Bruto/);
    const marco = tarjeta("Marco Rojas");
    expect(marco).toHaveTextContent("MR");
    expect(marco).toHaveTextContent(/A pagar.*1\.850/);
    expect(within(marco).getByRole("link", { name: "Ver el detalle de Marco Rojas" })).toHaveAttribute("href", "/academia/planilla/9?mes=2026-10");
    fireEvent.click(screen.getByRole("button", { name: "Mes anterior" }));
    await act(async () => {});
    expect(apiAcademia.planilla).toHaveBeenLastCalledWith("2026-09", null);
  });

  it("de dónde sale lo que cobra: lo cobrado × su % o los módulos × el monto fijo, con sus grupos", async () => {
    vi.mocked(apiAcademia.planillaDocente).mockImplementation(async (id) =>
      id === 9
        ? {
            ...PLANILLA,
            grupos: [{ grupoId: 7, nombre: "L-M-V 09–11", carrera: { id: 3, nombre: "Barbería" }, materia: { orden: 2, nombre: "Degradados" }, sede: { id: 1, nombre: "Central" }, estudiantes: 22, pct: 20 }],
          }
        : {
            ...PLANILLA,
            docente: { personalId: 10, nombre: "Diego Mamani" },
            cuentan: [linea({ modalidad: "MONTO", pct: null, montoFijo: 90 }), linea({ inscripcionId: 102, modalidad: "MONTO", pct: null, montoFijo: 90 })],
          },
    );
    await montarMes();
    // Un backend sin el horario: el curso y el nombre del grupo (que sigue al horario).
    expect(tarjeta("Marco Rojas")).toHaveTextContent("Barbería · L-M-V 09–11");
    // 450 + 500 cobrados de sus estudiantes, al 20 %.
    expect(tarjeta("Marco Rojas")).toHaveTextContent("Cobrado de sus estudiantes: Bs 950,00 × 20 %");
    expect(tarjeta("Diego Mamani")).toHaveTextContent("2 módulos × Bs 90,00");
  });

  it("«Pagar Bs X» pide el método y hace en orden lo que eran dos pasos: cerrar la planilla y registrar el pago", async () => {
    vi.mocked(apiAcademia.planilla).mockResolvedValue({
      mes: "2026-09",
      retencionActiva: false,
      docentes: [{ personalId: 9, nombre: "Marco Rojas", grupos: 1, cuentan: 17, total: 22, bruto: 1850, retencion: null, liquido: 1850, estado: "EN_CURSO" }],
      totales: { bruto: 1850, liquido: 1850 },
    });
    vi.mocked(apiAcademia.pagarPlanilla).mockResolvedValue({});
    await montarMes();
    const marco = tarjeta("Marco Rojas");
    fireEvent.click(within(marco).getByRole("button", { name: "Pagar Bs 1.850,00" }));
    const dialogo = screen.getByRole("dialog", { name: "Pagar a Marco Rojas" });
    expect(dialogo).toHaveTextContent("Se cierra su planilla del mes");
    // Los métodos de «Registrar pago», sin la tarjeta.
    expect(within(dialogo).getAllByRole("button", { pressed: false }).map((b) => b.textContent)).toEqual(["Transferencia", "QR"]);
    fireEvent.click(within(dialogo).getByRole("button", { name: "QR" }));
    expect(apiAcademia.cerrarPlanilla).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Pagar Bs 1.850,00" }));
    });
    expect(apiAcademia.cerrarPlanilla).toHaveBeenCalledWith(9, "2026-10", false);
    expect(apiAcademia.pagarPlanilla).toHaveBeenCalledWith(9, "2026-10", "QR");
    expect(vi.mocked(apiAcademia.cerrarPlanilla).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(apiAcademia.pagarPlanilla).mock.invocationCallOrder[0]);
    expect(screen.getByText(/Pagaste Bs 1\.850,00 a Marco Rojas \(QR\)/)).toBeInTheDocument();
    // Vuelve a pedir el mes y la planilla del docente (el estado nuevo).
    expect(apiAcademia.planilla).toHaveBeenCalledTimes(2);
  });

  it("si el mes no terminó, pregunta como antes y, confirmado, cierra forzando y paga", async () => {
    vi.mocked(apiAcademia.cerrarPlanilla).mockRejectedValueOnce(new ApiError("El mes no terminó", 400, { codigo: "MES_EN_CURSO" }));
    vi.mocked(apiAcademia.pagarPlanilla).mockResolvedValue({});
    await montarMes();
    fireEvent.click(within(tarjeta("Marco Rojas")).getByRole("button", { name: /^Pagar/ }));
    await act(async () => {
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^Pagar/ }));
    });
    // No pagó nada todavía: pregunta.
    expect(apiAcademia.pagarPlanilla).not.toHaveBeenCalled();
    const pregunta = screen.getByRole("dialog", { name: "El mes no terminó" });
    await act(async () => {
      fireEvent.click(within(pregunta).getByRole("button", { name: "Cerrar igual y pagar" }));
    });
    expect(apiAcademia.cerrarPlanilla).toHaveBeenLastCalledWith(9, "2026-10", true);
    expect(apiAcademia.pagarPlanilla).toHaveBeenCalledWith(9, "2026-10", "EFECTIVO");
  });

  it("una ya cerrada sólo se paga; una pagada muestra cuándo, sin botón", async () => {
    vi.mocked(apiAcademia.planilla).mockResolvedValue({
      mes: "2026-10",
      retencionActiva: false,
      docentes: [
        { personalId: 9, nombre: "Marco Rojas", grupos: 1, cuentan: 17, total: 22, bruto: 1850, retencion: null, liquido: 1850, estado: "CERRADA" },
        { personalId: 10, nombre: "Diego Mamani", grupos: 1, cuentan: 15, total: 18, bruto: 2190, retencion: null, liquido: 2190, estado: "PAGADA" },
      ],
      totales: { bruto: 4040, liquido: 4040 },
    });
    vi.mocked(apiAcademia.planillaDocente).mockImplementation(async (id) =>
      id === 10 ? { ...PLANILLA, estado: "PAGADA", pagadaEn: new Date(2026, 9, 12, 21, 30).toISOString() } : { ...PLANILLA, estado: "CERRADA" },
    );
    vi.mocked(apiAcademia.pagarPlanilla).mockResolvedValue({});
    await montarMes();
    expect(screen.getByRole("region", { name: "Resumen del mes" })).toHaveTextContent(/Ya pagado.*2\.190/);
    // Sin `pago` (un backend anterior) dice la fecha de la planilla.
    const diego = tarjeta("Diego Mamani");
    expect(within(diego).queryByRole("button", { name: /Pagar/ })).not.toBeInTheDocument();
    expect(diego).toHaveTextContent("Pagado el 12-oct");
    fireEvent.click(within(tarjeta("Marco Rojas")).getByRole("button", { name: /^Pagar/ }));
    await act(async () => {
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^Pagar/ }));
    });
    expect(apiAcademia.cerrarPlanilla).not.toHaveBeenCalled();
    expect(apiAcademia.pagarPlanilla).toHaveBeenCalledWith(9, "2026-10", "EFECTIVO");
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

  it("ronda 1 · D2: con líquido ≤ 0 no se «paga»: el botón y el diálogo dicen que no sale dinero", async () => {
    vi.mocked(apiAcademia.planillaDocente).mockResolvedValue({
      ...PLANILLA,
      estado: "CERRADA",
      resumen: { ...PLANILLA.resumen, bruto: -90, liquido: -90 },
    });
    vi.mocked(apiAcademia.pagarPlanilla).mockResolvedValue({});
    await montar();
    expect(screen.queryByRole("button", { name: /Registrar pago/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar sin pago" }));
    const dialogo = screen.getByRole("dialog", { name: "Cerrar sin pago" });
    expect(dialogo).toHaveTextContent(/no sale dinero/);
    expect(dialogo).toHaveTextContent(/planilla del mes siguiente/);
    // Nada de «Pagar −Bs 90», de «gasto de sueldos» que se registra ni de método de pago.
    expect(dialogo).not.toHaveTextContent(/¿Pagar/);
    expect(dialogo).not.toHaveTextContent(/Queda como gasto/);
    expect(within(dialogo).queryByRole("button", { name: "Transferencia" })).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Cerrar sin pago" }));
    });
    expect(apiAcademia.pagarPlanilla).toHaveBeenCalledWith(9, "2026-10", "EFECTIVO");
    expect(screen.getByText(/no salió dinero ni se registró ningún gasto/)).toBeInTheDocument();
  });

  it("ronda 1 · D10: al cambiar de mes vuelve a «Cuentan» y se cierra el panel de la línea", async () => {
    vi.mocked(apiAcademia.planillaDocente).mockResolvedValue({ ...PLANILLA });
    await montar();
    fireEvent.click(screen.getByRole("tab", { name: /Postergados/ }));
    fireEvent.click(screen.getByRole("button", { name: "Ver el detalle de Céspedes Molina, Joaquín" }));
    expect(screen.getByRole("complementary", { name: "Céspedes Molina, Joaquín" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Mes"), { target: { value: "2026-09" } });
    await act(async () => {});
    expect(screen.queryByRole("complementary", { name: "Céspedes Molina, Joaquín" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Cuentan/ })).toHaveAttribute("aria-selected", "true");
  });

  it("cancelar el diálogo no paga", async () => {
    vi.mocked(apiAcademia.planillaDocente).mockResolvedValue({ ...PLANILLA, estado: "CERRADA" });
    await montar();
    // Con el panel de una línea abierto: el diálogo no queda encima de él.
    fireEvent.click(screen.getByRole("button", { name: "Ver el detalle de Andrade Villca, Mateo" }));
    fireEvent.click(screen.getByRole("button", { name: /Registrar pago/ }));
    expect(screen.queryByRole("complementary", { name: "Andrade Villca, Mateo" })).not.toBeInTheDocument();
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

  it("en «Sin pagar» se anota el motivo dentro del panel de la línea, sin un diálogo encima; con «Otro» pide el texto", async () => {
    vi.mocked(apiAcademia.guardarMotivoNoPago).mockResolvedValue({});
    await montarCon({});
    fireEvent.click(screen.getByRole("tab", { name: /Sin pagar/ }));
    fireEvent.click(screen.getByRole("button", { name: "Agregar motivo de Rivero Gil, Matías" }));
    // El botón de la fila abre el panel de esa línea con el motivo a la vista.
    const panel = screen.getByRole("complementary", { name: "Rivero Gil, Matías" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const dialogo = within(panel).getByRole("group", { name: "Motivo de no pago" });
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
    // El motivo queda en la fila y en el panel, que sigue abierto sin el editor.
    expect(screen.getAllByText(/Se retiró: se mudó/)).toHaveLength(2);
    expect(within(panel).queryByRole("group", { name: "Motivo de no pago" })).not.toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Cambiar motivo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cambiar el motivo de Rivero Gil, Matías" })).toBeInTheDocument();
  });

  it("el que ya tiene motivo lo muestra y se puede quitar", async () => {
    vi.mocked(apiAcademia.quitarMotivoNoPago).mockResolvedValue({});
    await montarCon({
      sinPagar: [{ ...SIN_PAGAR, motivoNoPago: { motivo: "BECA", detalle: null, usuario: "Hugo Salinas", fecha: "2026-10-12T12:00:00.000Z" } }],
    });
    fireEvent.click(screen.getByRole("tab", { name: /Sin pagar/ }));
    expect(screen.getByText("Tiene beca")).toBeInTheDocument();
    // Desde el panel: «Cambiar motivo» abre el editor ahí mismo.
    fireEvent.click(screen.getByRole("button", { name: "Ver el detalle de Rivero Gil, Matías" }));
    const panel = screen.getByRole("complementary", { name: "Rivero Gil, Matías" });
    fireEvent.click(within(panel).getByRole("button", { name: "Cambiar motivo" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(within(panel).getByRole("group", { name: "Motivo de no pago" })).getByRole("button", { name: "Quitar motivo" }));
    });
    expect(apiAcademia.quitarMotivoNoPago).toHaveBeenCalledWith(105, 32);
    expect(screen.queryByText("Tiene beca")).not.toBeInTheDocument();
  });

  it("cancelar el motivo vuelve al panel sin guardar; otra línea abre sin el editor", async () => {
    await montarCon({
      sinPagar: [SIN_PAGAR, { ...SIN_PAGAR, inscripcionId: 106, alumno: { id: 56, nombre: "Soria Paz, Ana" } }],
    });
    fireEvent.click(screen.getByRole("tab", { name: /Sin pagar/ }));
    fireEvent.click(screen.getByRole("button", { name: "Agregar motivo de Rivero Gil, Matías" }));
    const panel = screen.getByRole("complementary", { name: "Rivero Gil, Matías" });
    fireEvent.click(within(within(panel).getByRole("group", { name: "Motivo de no pago" })).getByRole("button", { name: "Cancelar" }));
    expect(within(panel).queryByRole("group", { name: "Motivo de no pago" })).not.toBeInTheDocument();
    expect(within(panel).getByText("Sin motivo anotado.")).toBeInTheDocument();
    expect(apiAcademia.guardarMotivoNoPago).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Agregar motivo de Rivero Gil, Matías" }));
    fireEvent.click(screen.getByRole("button", { name: "Ver el detalle de Soria Paz, Ana" }));
    const otro = screen.getByRole("complementary", { name: "Soria Paz, Ana" });
    expect(within(otro).queryByRole("group", { name: "Motivo de no pago" })).not.toBeInTheDocument();
  });

  it("cerrar la planilla o registrar el pago cierran antes el panel de la línea", async () => {
    vi.mocked(apiAcademia.cerrarPlanilla).mockRejectedValueOnce(new ApiError("El mes no terminó", 400, { codigo: "MES_EN_CURSO" }));
    await montarCon({});
    fireEvent.click(screen.getByRole("button", { name: "Ver el detalle de Andrade Villca, Mateo" }));
    expect(screen.getByRole("complementary", { name: "Andrade Villca, Mateo" })).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Cerrar planilla" }));
    });
    expect(screen.getByRole("dialog", { name: "El mes no terminó" })).toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "Andrade Villca, Mateo" })).not.toBeInTheDocument();
  });

  it("con un backend anterior (sin el módulo de la línea) no ofrece anotar nada", async () => {
    await montarCon({ sinPagar: [{ ...SIN_PAGAR, materia: { orden: 2, nombre: "Degradados" }, motivoNoPago: undefined }] });
    fireEvent.click(screen.getByRole("tab", { name: /Sin pagar/ }));
    expect(screen.getByText("Rivero Gil, Matías")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /motivo/ })).not.toBeInTheDocument();
  });
});

describe("QA 23-oct · planilla", () => {
  async function montarCon(extra: Partial<TPlanillaDocente>) {
    vi.mocked(apiAcademia.planillaDocente).mockResolvedValue({ ...PLANILLA, ...extra });
    render(
      <MemoryRouter initialEntries={["/academia/planilla/9?mes=2026-10"]}>
        <Routes>
          <Route path="/academia/planilla/:id" element={<PlanillaDocente />} />
        </Routes>
      </MemoryRouter>,
    );
    await act(async () => {});
  }

  it("el encabezado dice el monto fijo del curso que paga así", async () => {
    await montarCon({
      carreras: [
        { id: 3, nombre: "Barbería", modo: "MONTO", pct: null, monto: 90 },
        { id: 4, nombre: "Uñas", modo: "PORCENTAJE", pct: 20, monto: null },
      ],
    });
    expect(screen.getByText(/Cobra: Barbería Bs 90,00 fijo por módulo · Uñas 20 %/)).toBeInTheDocument();
  });

  it("todo por %, el texto de siempre", async () => {
    await montarCon({});
    expect(screen.getByText(/Cobra el 20 % de lo cobrado/)).toBeInTheDocument();
  });

  it("en «Sin pagar» la fila y el subtotal valen 0; lo que sumaría va aparte en gris", async () => {
    await montarCon({
      resumen: { ...PLANILLA.resumen, sinPagar: 2 },
      sinPagar: [
        linea({ inscripcionId: 105, alumno: { id: 55, nombre: "Rivero Gil, Matías" }, monto: 0, montoPotencial: 90 }),
        linea({ inscripcionId: 106, alumno: { id: 56, nombre: "Soria Paz, Ana" }, monto: 0, montoPotencial: 90 }),
      ],
    });
    fireEvent.click(screen.getByRole("tab", { name: /Sin pagar/ }));
    const grupo = screen.getByRole("region", { name: "Barbería · L-M-V 09–11" });
    expect(grupo).toHaveTextContent(/2 estudiantes · Bs 0,00/);
    expect(grupo).not.toHaveTextContent(/Bs 180/);
    expect(within(grupo).getAllByText("Bs 90,00 si paga")).toHaveLength(2);
  });

  it("deja ir al mes que viene", async () => {
    await montarCon({});
    const mes = screen.getByRole("combobox");
    expect(Array.from(mes.querySelectorAll("option")).map((o) => o.getAttribute("value"))).toContain("2026-11");
  });
});

describe("QA 23-oct · planilla del mes", () => {
  it("«Mes siguiente» anda desde el mes actual (uno más)", async () => {
    render(
      <MemoryRouter>
        <PlanillaMes />
      </MemoryRouter>,
    );
    await act(async () => {});
    const siguiente = screen.getByRole("button", { name: "Mes siguiente" });
    expect(siguiente).toBeEnabled();
    fireEvent.click(siguiente);
    await act(async () => {});
    expect(apiAcademia.planilla).toHaveBeenLastCalledWith("2026-11", null);
    expect(screen.getByRole("button", { name: "Mes siguiente" })).toBeDisabled();
  });
});

describe("Bug 17 · una línea con monto fijo no muestra « %»", () => {
  async function montar(extra: Partial<TPlanillaDocente>) {
    vi.mocked(apiAcademia.planillaDocente).mockResolvedValue({ ...PLANILLA, ...extra });
    render(
      <MemoryRouter initialEntries={["/academia/planilla/9?mes=2026-10"]}>
        <Routes>
          <Route path="/academia/planilla/:id" element={<PlanillaDocente />} />
        </Routes>
      </MemoryRouter>,
    );
    await act(async () => {});
  }

  const FIJA = (extra: Partial<LineaPlanilla> = {}) =>
    linea({
      modalidad: "MONTO",
      pct: null,
      montoFijo: 90,
      explicacion: "Monto fijo de Bs 90 por módulo pagado",
      ...extra,
    });

  it("con MONTO la columna dice «Bs 90 fijo» y por % sigue «20 %»", async () => {
    await montar({
      cuentan: [FIJA({ alumno: { id: 51, nombre: "Andrade Villca, Mateo" } }), linea({ inscripcionId: 104, alumno: { id: 54, nombre: "Durán Aguilar, Luciana" } })],
    });
    const grupo = screen.getByRole("region", { name: "Barbería · L-M-V 09–11" });
    expect(within(grupo).getByText("Bs 90 fijo")).toBeInTheDocument();
    expect(within(grupo).getByText("20 %")).toBeInTheDocument();
    expect(grupo).not.toHaveTextContent(/null|NaN/);
  });

  it("el panel de la línea con MONTO dice cómo se le paga, sin porcentaje", async () => {
    await montar({ cuentan: [FIJA()] });
    fireEvent.click(screen.getByRole("button", { name: "Ver el detalle de Andrade Villca, Mateo" }));
    const panel = screen.getByRole("complementary", { name: "Andrade Villca, Mateo" });
    expect(within(panel).getByText("Monto fijo Bs 90 por estudiante y módulo")).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(/ %/);
  });
});

describe("Bug 4 · los ajustes de cobros anulados o repuestos", () => {
  const ANULADO = linea({
    inscripcionId: 120,
    alumno: { id: 60, nombre: "Vargas Cruz, Lidia" },
    monto: -90,
    montoPotencial: -90,
    explicacion: "Se anuló el cobro del módulo liquidado en 2026-09: se descuenta Bs 90",
  });
  const REPUESTO = linea({
    inscripcionId: 121,
    alumno: { id: 61, nombre: "Quiroga Peña, Saúl" },
    monto: 40,
    montoPotencial: 40,
    explicacion: "Se volvió a cobrar el módulo descontado: se devuelve Bs 40",
  });

  async function montar(extra: Partial<TPlanillaDocente>) {
    vi.mocked(apiAcademia.planillaDocente).mockResolvedValue({ ...PLANILLA, ...extra });
    render(
      <MemoryRouter initialEntries={["/academia/planilla/9?mes=2026-10"]}>
        <Routes>
          <Route path="/academia/planilla/:id" element={<PlanillaDocente />} />
        </Routes>
      </MemoryRouter>,
    );
    await act(async () => {});
  }

  it("sin ajustes no hay pestaña «Ajustes»", async () => {
    await montar({});
    expect(screen.queryByRole("tab", { name: /Ajustes/ })).not.toBeInTheDocument();
  });

  it("la pestaña lista cada ajuste con su motivo y el monto con signo (negativo en rojo)", async () => {
    await montar({
      resumen: { ...PLANILLA.resumen, ajustes: 2, brutoAjustes: -50, bruto: 140, liquido: 140, brutoCuentan: 190 },
      ajustes: [ANULADO, REPUESTO],
    });
    fireEvent.click(screen.getByRole("tab", { name: /Ajustes/ }));
    const grupo = screen.getByRole("region", { name: "Barbería · L-M-V 09–11" });
    expect(within(grupo).getByText("Cobro anulado")).toBeInTheDocument();
    expect(within(grupo).getByText("Cobro repuesto")).toBeInTheDocument();
    const rojo = within(grupo).getByText("− Bs 90,00");
    expect(rojo).toHaveClass("text-danger-text");
    expect(within(grupo).getByText("+ Bs 40,00")).not.toHaveClass("text-danger-text");
    // El subtotal del grupo también lleva signo.
    expect(grupo).toHaveTextContent(/2 estudiantes · − Bs 50,00/);
    fireEvent.click(within(grupo).getByRole("button", { name: "Ver el detalle de Vargas Cruz, Lidia" }));
    const panel = screen.getByRole("complementary", { name: "Vargas Cruz, Lidia" });
    expect(within(panel).getByText("Se anuló el cobro del módulo liquidado en 2026-09: se descuenta Bs 90")).toBeInTheDocument();
  });

  it("sin retención el resumen tiene un solo monto, y dice los ajustes que lo componen", async () => {
    await montar({
      resumen: { ...PLANILLA.resumen, ajustes: 1, brutoAjustes: -90, brutoCuentan: 190, bruto: 100, liquido: 100 },
      ajustes: [ANULADO],
    });
    const resumen = screen.getByRole("region", { name: "Resumen de la planilla" });
    expect(resumen).toHaveTextContent(/Bs 190,00 del mes − Bs 90,00 de ajustes/);
    // Sin tarjeta de retención ni de bruto; la de atrasos sigue (D9, otra decisión).
    expect(resumen).not.toHaveTextContent(/Retención|Bruto/);
    expect(resumen).toHaveTextContent(/Atrasos/);
  });

  it("un líquido negativo se muestra con el número y una nota neutra", async () => {
    await montar({
      resumen: { ...PLANILLA.resumen, ajustes: 1, brutoAjustes: -90, brutoCuentan: 0, cuentan: 0, postergados: 0, bruto: -90, liquido: -90 },
      cuentan: [],
      postergados: [],
      ajustes: [ANULADO],
    });
    const resumen = screen.getByRole("region", { name: "Resumen de la planilla" });
    expect(resumen).toHaveTextContent(/-90,00/);
    expect(resumen).toHaveTextContent("El líquido es negativo por ajustes de cobros anulados");
  });

  it("la lista del mes avisa del docente con ajustes", async () => {
    vi.mocked(apiAcademia.planilla).mockResolvedValue({
      mes: "2026-10",
      retencionActiva: false,
      docentes: [{ personalId: 9, nombre: "Marco Rojas", grupos: 1, cuentan: 0, total: 0, bruto: -90, retencion: null, liquido: -90, estado: "EN_CURSO", ajustes: 2 }],
      totales: { bruto: -90, liquido: -90 },
    });
    render(
      <MemoryRouter>
        <PlanillaMes />
      </MemoryRouter>,
    );
    await act(async () => {});
    expect(screen.getByRole("listitem", { name: "Marco Rojas" })).toHaveTextContent("2 ajustes");
  });
});

describe("Tanda 2 · si dio sus clases, con qué se pagó y el comprobante (revisión del 08-nov)", () => {
  const GRUPO_DEL_MES = {
    grupoId: 7,
    materiaId: 12,
    nombre: "L-M-V 09–11",
    carrera: { id: 3, nombre: "Barbería" },
    materia: { orden: 2, nombre: "Degradados" },
    dias: [1, 3, 5],
    horaInicio: "09:00",
    horaFin: "11:00",
    clases: 12,
    comoReemplazo: false,
  };

  async function montarMes(entrada = "/academia/planilla") {
    render(
      <MemoryRouter initialEntries={[entrada]}>
        <Routes>
          <Route path="/academia/planilla" element={<PlanillaMes />} />
        </Routes>
      </MemoryRouter>,
    );
    await act(async () => {});
  }
  const tarjeta = (nombre: string) => screen.getByRole("listitem", { name: nombre });
  const pagada = (extra: object = {}) => ({
    mes: "2026-10",
    retencionActiva: false,
    docentes: [
      {
        personalId: 9,
        nombre: "Marco Rojas",
        grupos: 1,
        cuentan: 17,
        total: 22,
        bruto: 1850,
        retencion: null,
        liquido: 1850,
        estado: "PAGADA" as const,
        clases: CLASES,
        pago: { pagadaEn: "2026-11-03T15:00:00.000Z", metodoPago: "QR" as const, pagadoPor: "Hugo Salinas" },
        ...extra,
      },
    ],
    totales: { bruto: 1850, liquido: 1850 },
  });

  it("ítem 15: cada tarjeta dice si dio sus clases, al lado del monto; los atrasos no descuentan (D2) y el reemplazo no es faltar (D7)", async () => {
    vi.mocked(apiAcademia.planilla).mockResolvedValue({
      mes: "2026-10",
      retencionActiva: false,
      docentes: [{ personalId: 9, nombre: "Marco Rojas", grupos: 1, cuentan: 17, total: 22, bruto: 1850, retencion: null, liquido: 1850, estado: "EN_CURSO", clases: CLASES }],
      totales: { bruto: 1850, liquido: 1850 },
    });
    await montarMes();
    const clases = within(tarjeta("Marco Rojas")).getByRole("group", { name: "Clases del mes" });
    expect(clases).toHaveTextContent("12 clases en el mes");
    expect(clases).toHaveTextContent("7 con lista");
    expect(clases).toHaveTextContent("8 con llegada");
    expect(clases).toHaveTextContent("2 sin lista");
    expect(clases).toHaveTextContent("1 la dio un reemplazo");
    expect(clases).toHaveTextContent("2 todavía no llegan");
    expect(clases).toHaveTextContent("2 atrasos · 25 min (1 justificado, 10 min)");
    expect(clases).toHaveTextContent("no se descuentan solos");
    expect(clases).toHaveTextContent(/se le paga igual al docente del módulo/);
    // El monto no cambia: lo que se paga es lo de siempre.
    expect(tarjeta("Marco Rojas")).toHaveTextContent(/A pagar.*1\.850,00/);
  });

  it("ítem 4: los grupos que dio, con días y horario", async () => {
    vi.mocked(apiAcademia.planillaDocente).mockResolvedValue({
      ...PLANILLA,
      gruposDelMes: [GRUPO_DEL_MES, { ...GRUPO_DEL_MES, grupoId: 8, materia: { orden: 1, nombre: "Cortes" }, dias: [6], horaInicio: "14:00", horaFin: "18:00", clases: 1, comoReemplazo: true }],
    });
    await montarMes();
    const grupos = within(tarjeta("Marco Rojas")).getByRole("list", { name: "Grupos de Marco Rojas" });
    expect(within(grupos).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Barbería · M2 Degradados · L Mi V 09:00–11:00 · 12 clases",
      "Barbería · M1 Cortes · Sáb 14:00–18:00 · 1 clase · como reemplazo",
    ]);
  });

  it("ítem 3: la tarjeta pagada dice con qué se pagó", async () => {
    vi.mocked(apiAcademia.planilla).mockResolvedValue(pagada());
    await montarMes();
    expect(tarjeta("Marco Rojas")).toHaveTextContent("Pagado el 03-nov · QR");
  });

  it("ítem 17: «Mandar el comprobante» abre la imagen y la manda por WhatsApp al docente, con el mensaje", async () => {
    vi.mocked(apiAcademia.planilla).mockResolvedValue(pagada());
    await montarMes();
    await act(async () => {
      fireEvent.click(within(tarjeta("Marco Rojas")).getByRole("button", { name: "Mandar el comprobante a Marco Rojas" }));
    });
    expect(apiAcademia.pagosDocente).toHaveBeenCalledWith(9);
    const dialogo = screen.getByRole("dialog", { name: "Comprobante de pago" });
    const papel = within(dialogo).getByRole("article", { name: "Comprobante" });
    expect(papel).toHaveTextContent("Marco Rojas");
    expect(papel).toHaveTextContent("Octubre 2026");
    expect(papel).toHaveTextContent("Bs 1.850,00");
    expect(papel).toHaveTextContent("QR");
    expect(papel).toHaveTextContent("Pagó: Hugo Salinas");
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Mandar por WhatsApp" }));
    });
    const [nodo, archivo, mensaje, url] = vi.mocked(enviarPorWhatsapp).mock.calls[0];
    expect(nodo).toBe(papel);
    expect(archivo).toBe("comprobante-marco-rojas-2026-10");
    expect(mensaje).toMatch(/^Hola Marco, te pagamos Bs 1\.850,00 por tus clases de octubre 2026, por QR/);
    expect(url).toMatch(/^https:\/\/wa\.me\/59170412386\?text=/);
  });

  it("ítem 17: recién pagado, se abre el comprobante para mandárselo", async () => {
    vi.mocked(apiAcademia.planilla).mockResolvedValue({
      mes: "2026-10",
      retencionActiva: false,
      docentes: [{ personalId: 9, nombre: "Marco Rojas", grupos: 1, cuentan: 17, total: 22, bruto: 1850, retencion: null, liquido: 1850, estado: "CERRADA" }],
      totales: { bruto: 1850, liquido: 1850 },
    });
    vi.mocked(apiAcademia.pagarPlanilla).mockResolvedValue({});
    await montarMes();
    fireEvent.click(within(tarjeta("Marco Rojas")).getByRole("button", { name: /^Pagar/ }));
    await act(async () => {
      fireEvent.click(within(screen.getByRole("dialog", { name: "Pagar a Marco Rojas" })).getByRole("button", { name: /^Pagar/ }));
    });
    expect(screen.getByRole("dialog", { name: "Comprobante de pago" })).toHaveTextContent("Bs 1.850,00");
  });

  it("?docente=: sólo ese docente, con su historial de pagos (el botón «Pagos» de Docentes)", async () => {
    vi.mocked(apiAcademia.planilla).mockResolvedValue({
      ...pagada(),
      docentes: [...pagada().docentes, { personalId: 10, nombre: "Diego Mamani", grupos: 1, cuentan: 15, total: 18, bruto: 2190, retencion: null, liquido: 2190, estado: "EN_CURSO" as const }],
    });
    await montarMes("/academia/planilla?docente=9");
    expect(screen.getByRole("heading", { name: "Pagos a Marco Rojas" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Todos los docentes/ })).toHaveAttribute("href", "/academia/planilla");
    expect(screen.queryByRole("listitem", { name: "Diego Mamani" })).not.toBeInTheDocument();
    // Ya está mirando su historial: la tarjeta no ofrece abrirlo otra vez.
    expect(within(tarjeta("Marco Rojas")).queryByRole("button", { name: /Historial de pagos/ })).not.toBeInTheDocument();
    expect(apiAcademia.pagosDocente).toHaveBeenCalledWith(9);
    const historial = screen.getByRole("list", { name: "Pagos a Marco Rojas" });
    const filas = within(historial).getAllByRole("listitem");
    expect(filas.map((f) => f.getAttribute("aria-label"))).toEqual(["Octubre 2026", "Septiembre 2026", "Agosto 2026"]);
    expect(filas[1]).toHaveTextContent("Pagado el 04-oct · Transferencia · pagó Hugo Salinas");
    expect(filas[1]).toHaveTextContent("Bs 1.640,00");
    // Cerrada sin pagar: no hay comprobante que mandar.
    expect(filas[2]).toHaveTextContent("Cerrada, falta pagarla");
    expect(within(filas[2]).queryByRole("button")).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(filas[1]).getByRole("button", { name: "Mandar el comprobante de Septiembre 2026" }));
    });
    // El historial ya cargado: no se vuelve a pedir.
    expect(apiAcademia.pagosDocente).toHaveBeenCalledTimes(1);
    expect(within(screen.getByRole("dialog", { name: "Comprobante de pago" })).getByRole("article")).toHaveTextContent("Bs 1.640,00");
  });

  it("?docente= de alguien sin nada este mes: igual su historial", async () => {
    vi.mocked(apiAcademia.planilla).mockResolvedValue({ mes: "2026-10", retencionActiva: false, docentes: [], totales: { bruto: 0, liquido: 0 } });
    await montarMes("/academia/planilla?docente=9");
    expect(screen.getByText("En octubre 2026 no tiene nada que cobrar.")).toBeInTheDocument();
    // El nombre sale del historial.
    expect(screen.getByRole("heading", { name: "Pagos a Marco Rojas" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Pagos a Marco Rojas" })).toBeInTheDocument();
  });

  it("desde la lista, «Historial de pagos» lleva a ese docente", async () => {
    await montarMes();
    await act(async () => {
      fireEvent.click(within(tarjeta("Marco Rojas")).getByRole("button", { name: "Historial de pagos de Marco Rojas" }));
    });
    expect(screen.getByRole("heading", { name: "Pagos a Marco Rojas" })).toBeInTheDocument();
    expect(screen.queryByRole("listitem", { name: "Diego Mamani" })).not.toBeInTheDocument();
  });

  it("la planilla del docente: con qué se pagó, quién, el comprobante y los atrasos", async () => {
    vi.mocked(apiAcademia.planillaDocente).mockResolvedValue({
      ...PLANILLA,
      estado: "PAGADA",
      pagadaEn: "2026-11-03T15:00:00.000Z",
      pago: { pagadaEn: "2026-11-03T15:00:00.000Z", metodoPago: "QR", pagadoPor: "Hugo Salinas" },
      clases: CLASES,
    });
    render(
      <MemoryRouter initialEntries={["/academia/planilla/9?mes=2026-10"]}>
        <Routes>
          <Route path="/academia/planilla/:id" element={<PlanillaDocente />} />
        </Routes>
      </MemoryRouter>,
    );
    await act(async () => {});
    expect(screen.getByText(/Pagado el 03-nov · QR · pagó Hugo Salinas/)).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Clases del mes" })).toHaveTextContent(/12 clases en el mes.*7 con lista.*2 sin lista/);
    const resumen = screen.getByRole("region", { name: "Resumen de la planilla" });
    expect(resumen).toHaveTextContent("2 atrasos · 25 min (1 justificado, 10 min) · no se descuentan solos");
    expect(document.body).not.toHaveTextContent(/Por confirmar/);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Mandar el comprobante" }));
    });
    expect(screen.getByRole("dialog", { name: "Comprobante de pago" })).toHaveTextContent("Bs 1.850,00");
  });
});
