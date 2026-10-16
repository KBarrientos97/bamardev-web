import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { grupoDetalle } from "../../test/academiaFixtures";

/**
 * E5 · Inscribir: alumno nuevo con tutor si es menor, el plan con su
 * calendario, la beca o promoción con PIN sobre el tope, y el grupo lleno que
 * se confirma y se reintenta.
 */

vi.mock("../../store/AuthContext", async () => {
  const { SESION_SECRETARIA: s } = await import("../../test/academiaFixtures");
  return { useAuth: () => ({ ...s, puede: () => true }) };
});

vi.mock("../../lib/academia/apiAcademia", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/academia/apiAcademia")>();
  return {
    ...real,
    apiAcademia: {
      grupo: vi.fn(),
      grupos: vi.fn(),
      ajustes: vi.fn(),
      alumnos: vi.fn(),
      inscribir: vi.fn(),
      convertir: vi.fn(),
    },
  };
});

import { apiAcademia } from "../../lib/academia/apiAcademia";
import { ApiError } from "../../lib/api";
import Inscribir from "./Inscribir";

const onInscrito = vi.fn();

async function montar() {
  render(
    <MemoryRouter>
      <Inscribir grupoInicial={{ id: 7, nombre: "Barbería · L-V 10:00" }} onCerrar={vi.fn()} onInscrito={onInscrito} />
    </MemoryRouter>,
  );
  await act(async () => {});
}

const panel = () => screen.getByRole("dialog", { name: "Inscribir alumno" });

function cargarNuevo(fechaNacimiento: string) {
  fireEvent.click(within(panel()).getByRole("button", { name: "Nuevo alumno" }));
  fireEvent.change(within(panel()).getByLabelText("Carnet de identidad"), { target: { value: "14550221" } });
  fireEvent.change(within(panel()).getByLabelText("Apellidos"), { target: { value: "Céspedes Molina" } });
  fireEvent.change(within(panel()).getByLabelText("Nombres"), { target: { value: "Joaquín" } });
  fireEvent.change(within(panel()).getByLabelText(/Fecha de nacimiento/), { target: { value: fechaNacimiento } });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-15T14:00:00.000Z"));
  vi.spyOn(window, "open").mockImplementation(() => null);
  vi.mocked(apiAcademia.grupo).mockResolvedValue(grupoDetalle());
  vi.mocked(apiAcademia.ajustes).mockResolvedValue({
    notaMinima: 51,
    escalaMax: 100,
    toleranciaAtrasoMin: 5,
    descuentoAtrasoPorMin: null,
    pctDocenteDefecto: 20,
    retencionPctDefecto: 16,
    topePromoSinPinPct: 10,
    asistenciaMinimaPct: null,
    preinscripcionActiva: true,
    textosWhatsapp: null,
  });
  vi.mocked(apiAcademia.alumnos).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 6 });
  vi.mocked(apiAcademia.inscribir).mockResolvedValue({ id: 555 } as never);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("E5 · inscribir", () => {
  it("un menor pide el tutor; con él, inscribe con el plan elegido", async () => {
    await montar();
    cargarNuevo("2011-03-12");
    expect(within(panel()).getByText(/Tutor · obligatorio/)).toBeInTheDocument();
    fireEvent.click(within(panel()).getByRole("radio", { name: /Cuotas/ }));
    // El calendario del plan a la vista, sin renglón de matrícula.
    expect(within(panel()).getByText(/Cuota 2 · M2–M3 · al empezar M2/)).toBeInTheDocument();
    fireEvent.click(within(panel()).getByRole("button", { name: "Inscribir sin cobrar" }));
    expect(within(panel()).getByText(/Es menor: falta el tutor/)).toBeInTheDocument();
    expect(apiAcademia.inscribir).not.toHaveBeenCalled();

    fireEvent.change(within(panel()).getByLabelText("Nombre del tutor"), { target: { value: "Rosa Molina" } });
    fireEvent.change(within(panel()).getByLabelText("WhatsApp"), { target: { value: "71234567" } });
    await act(async () => {
      fireEvent.click(within(panel()).getByRole("button", { name: "Inscribir sin cobrar" }));
    });
    expect(apiAcademia.inscribir).toHaveBeenCalledWith({
      alumno: {
        ci: "14550221",
        ciExpedido: "SC",
        apellidos: "Céspedes Molina",
        nombres: "Joaquín",
        fechaNacimiento: "2011-03-12",
      },
      tutor: { nombre: "Rosa Molina", telefono: "71234567", parentesco: "Madre" },
      grupoId: 7,
      planPagoId: 2,
    });
    expect(onInscrito).toHaveBeenCalledWith({ inscripcion: { id: 555 }, cobrar: false });
  });

  it("una beca sobre el tope pide el PIN de quien autoriza y viaja con él", async () => {
    await montar();
    cargarNuevo("2000-01-01");
    fireEvent.click(within(panel()).getByRole("radio", { name: /Completo/ }));
    fireEvent.click(within(panel()).getByRole("button", { name: "Beca" }));
    fireEvent.change(within(panel()).getByLabelText("Descuento"), { target: { value: "50" } });
    fireEvent.change(within(panel()).getByLabelText("Motivo"), { target: { value: "Situación económica" } });
    expect(within(panel()).getByText(/Total del curso/).parentElement).toHaveTextContent(/680/);
    fireEvent.click(within(panel()).getByRole("button", { name: /Inscribir y cobrar/ }));
    const pin = screen.getByRole("dialog", { name: "Autorización del encargado" });
    fireEvent.change(within(pin).getByLabelText("Usuario del encargado"), { target: { value: "rosa" } });
    fireEvent.change(within(pin).getByLabelText("PIN"), { target: { value: "1234" } });
    await act(async () => {
      fireEvent.click(within(pin).getByRole("button", { name: "Autorizar" }));
    });
    expect(apiAcademia.inscribir).toHaveBeenCalledWith(
      expect.objectContaining({
        planPagoId: 1,
        descuento: { tipo: "BECA", pct: 50, motivo: "Situación económica", autorizador: { username: "rosa", pin: "1234" } },
      }),
    );
    expect(onInscrito).toHaveBeenCalledWith({ inscripcion: { id: 555 }, cobrar: true });
  });

  it("el grupo lleno se confirma y se reintenta con confirmarSobreCupo", async () => {
    vi.mocked(apiAcademia.inscribir)
      .mockRejectedValueOnce(new ApiError("Grupo lleno", 409, { codigo: "GRUPO_LLENO", inscritos: 30, cupo: 30 }))
      .mockResolvedValueOnce({ id: 556 } as never);
    await montar();
    cargarNuevo("2000-01-01");
    fireEvent.click(within(panel()).getByRole("radio", { name: /Completo/ }));
    await act(async () => {
      fireEvent.click(within(panel()).getByRole("button", { name: "Inscribir sin cobrar" }));
    });
    const confirmar = screen.getByRole("dialog", { name: "El grupo está lleno" });
    expect(confirmar).toHaveTextContent("Tiene 30 inscritos y el cupo es de 30");
    await act(async () => {
      fireEvent.click(within(confirmar).getByRole("button", { name: "Inscribir igual" }));
    });
    expect(apiAcademia.inscribir).toHaveBeenLastCalledWith(expect.objectContaining({ confirmarSobreCupo: true }));
    expect(onInscrito).toHaveBeenCalledWith({ inscripcion: { id: 556 }, cobrar: false });
  });

  it("un alumno ya cargado sin tutor: el 400 TUTOR_REQUERIDO muestra el bloque del tutor", async () => {
    vi.mocked(apiAcademia.alumnos).mockResolvedValue({
      items: [
        { id: 60, codigo: "2026-0140", apellidos: "Rojas Lima", nombres: "Thiago", ci: "1", telefono: null, grupoActual: null, plan: null, saldo: 0, vencido: false, ultimaAsistencia: null, estado: "ACTIVA" },
      ],
      total: 1,
      page: 1,
      pageSize: 6,
    });
    vi.mocked(apiAcademia.inscribir).mockRejectedValueOnce(new ApiError("Falta el tutor", 400, { codigo: "TUTOR_REQUERIDO" }));
    vi.useRealTimers();
    await montar();
    fireEvent.change(within(panel()).getByLabelText("Buscar alumno"), { target: { value: "Thiago" } });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 350));
    });
    fireEvent.click(await within(panel()).findByRole("button", { name: /Rojas Lima, Thiago/ }));
    fireEvent.click(within(panel()).getByRole("radio", { name: /Completo/ }));
    await act(async () => {
      fireEvent.click(within(panel()).getByRole("button", { name: "Inscribir sin cobrar" }));
    });
    expect(apiAcademia.inscribir).toHaveBeenCalledWith(expect.objectContaining({ alumnoId: 60 }));
    expect(within(panel()).getByText(/Tutor · obligatorio/)).toBeInTheDocument();
  });
});
