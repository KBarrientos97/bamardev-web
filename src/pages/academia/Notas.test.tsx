import { act, fireEvent, render, screen } from "@testing-library/react";
import { ApiError } from "../../lib/api";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NotasDelGrupo } from "../../lib/academia/tipos";

/**
 * E13 · Cargar notas: la nota se guarda al soltar el campo, en letras y con
 * su resultado; cerrar pide que estén todas; la deuda no impide nada.
 */

const sesion = vi.hoisted(() => ({ recepcion: false }));

vi.mock("../../store/AuthContext", async () => {
  const { SESION_DOCENTE, SESION_SECRETARIA } = await import("../../test/academiaFixtures");
  return { useAuth: () => ({ ...(sesion.recepcion ? SESION_SECRETARIA : SESION_DOCENTE), puede: () => true }) };
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
  sesion.recepcion = false;
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

  it("recepción, sin notas.registrar, las ve en sólo lectura y sin cerrar (QA ronda 2, B-05)", async () => {
    sesion.recepcion = true;
    await montar();
    expect(screen.getByLabelText("Nota de Andrade Villca, Mateo")).toBeDisabled();
    expect(screen.getByLabelText("Nota de Bustillos Rek, Camila")).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Cerrar notas/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Sólo lectura/)).toBeInTheDocument();
  });
});

describe("E13 · Notas: lo guardado de verdad (QA ronda 2, B-18)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("una nota inválida no dice Guardado: dice cuántas no son válidas, y el decimal queda a la vista", async () => {
    await montar();
    const mateo = screen.getByLabelText("Nota de Andrade Villca, Mateo");
    fireEvent.change(mateo, { target: { value: "80" } });
    await act(async () => {
      fireEvent.blur(mateo);
    });
    expect(screen.getByRole("status")).toHaveTextContent("Guardado");
    const camila = screen.getByLabelText("Nota de Bustillos Rek, Camila");
    fireEvent.change(camila, { target: { value: "75.5" } });
    fireEvent.blur(camila);
    expect(camila).toHaveValue("75.5");
    expect(screen.getByText("Sin decimales")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Sin guardar: 1 nota no es válida");
    expect(screen.queryByText("Guardado")).not.toBeInTheDocument();
    expect(apiAcademia.guardarNotas).toHaveBeenCalledTimes(1);
  });

  it("si el servidor rechaza la nota, la casilla dice que no se guardó", async () => {
    vi.mocked(apiAcademia.guardarNotas).mockRejectedValue(new ApiError("Tu usuario no tiene permiso para esto", 403));
    await montar();
    const camila = screen.getByLabelText("Nota de Bustillos Rek, Camila");
    fireEvent.change(camila, { target: { value: "55" } });
    await act(async () => {
      fireEvent.blur(camila);
    });
    expect(screen.getByText("No se guardó")).toBeInTheDocument();
    expect(camila).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("status")).toHaveTextContent("1 nota no se guardó");
  });

  it("tipeada y sin soltar el campo dice Sin guardar, y tras la pausa se guarda sola", async () => {
    await montar();
    vi.useFakeTimers();
    const camila = screen.getByLabelText("Nota de Bustillos Rek, Camila");
    fireEvent.change(camila, { target: { value: "62" } });
    expect(screen.getByRole("status")).toHaveTextContent("Sin guardar");
    expect(apiAcademia.guardarNotas).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(apiAcademia.guardarNotas).toHaveBeenCalledWith(7, 32, [{ inscripcionId: 102, nota: 62 }]);
    expect(screen.getByRole("status")).toHaveTextContent("Guardado");
  });
});

describe("B7 · el semáforo en las notas del docente", () => {
  it("con semáforo, rojo o amarillo en vez de «Pagado / Sin pagar»; la recepción sigue como siempre", async () => {
    vi.mocked(apiAcademia.notas).mockResolvedValue({
      ...NOTAS,
      items: [
        { inscripcionId: 101, nombre: "Andrade Villca, Mateo", estadoPago: null, nota: 76, semaforo: "AMARILLO" },
        { inscripcionId: 102, nombre: "Bustillos Rek, Camila", estadoPago: null, nota: null, semaforo: null },
      ],
    });
    await montar();
    expect(screen.getByLabelText("Debe, en semana de espera")).toBeInTheDocument();
    expect(screen.queryByText("Pagado")).not.toBeInTheDocument();
    // Nunca bloquea: la nota se carga igual.
    expect(screen.getByText("setenta y seis")).toBeInTheDocument();
  });
});
