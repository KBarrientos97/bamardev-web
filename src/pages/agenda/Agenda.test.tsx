import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/api";
import { FECHA, cita, propuesta, recurso, recursoDelDia, servicio } from "../../test/agendaFixtures";

/**
 * A1 · Agenda del día: tocar un hueco abre la nueva cita precargada, y
 * arrastrar una cita la mueve; si el backend dice 409, vuelve a su lugar.
 */

const sesion = vi.hoisted(() => ({ features: ["agenda", "cola_walkin"] as string[] }));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    usuario: { id: 1, username: "admin", rol: "ADMIN", sucursalId: 1, sucursal: "Centro", modulos: [] },
    negocio: { id: 1, nombre: "Salón Bella Vista", tipoNegocio: "PELUQUERIA", features: sesion.features },
  }),
}));

vi.mock("../../lib/agenda/apiAgenda", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/agenda/apiAgenda")>();
  return {
    ...real,
    apiAgenda: {
      dia: vi.fn(),
      reglas: vi.fn(),
      moverCita: vi.fn(),
      servicios: vi.fn(),
      recursos: vi.fn(),
      huecos: vi.fn(),
      buscarClientes: vi.fn(),
      cita: vi.fn(),
    },
  };
});

import { apiAgenda } from "../../lib/agenda/apiAgenda";
import Agenda from "./Agenda";

beforeEach(() => {
  vi.clearAllMocks();
  sesion.features = ["agenda", "cola_walkin"];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-21T13:00:00.000Z"));
  vi.mocked(apiAgenda.dia).mockResolvedValue({
    fecha: FECHA,
    sucursalId: 1,
    recursos: [recursoDelDia()],
    citas: [cita()],
    bloqueos: [
      { id: 1, recursoId: 1, sucursalId: 1, inicio: "2026-10-21T17:00:00.000Z", fin: "2026-10-21T18:00:00.000Z", motivo: "Curso" },
    ],
    cola: [],
  });
  vi.mocked(apiAgenda.reglas).mockRejectedValue(new Error("sin reglas"));
  vi.mocked(apiAgenda.servicios).mockResolvedValue([servicio()]);
  vi.mocked(apiAgenda.recursos).mockResolvedValue([recurso()]);
  vi.mocked(apiAgenda.huecos).mockResolvedValue({ huecos: [propuesta("2026-10-21T15:00:00.000Z")] });
  vi.mocked(apiAgenda.buscarClientes).mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

async function montar() {
  render(
    <MemoryRouter>
      <Agenda />
    </MemoryRouter>,
  );
  await act(async () => {});
}

const bloque = () => screen.getByRole("button", { name: /Rosa Mamani, Corte dama/ });

describe("A1 · agenda del día", () => {
  it("dibuja la columna del profesional con su cita, el bloqueo y la cola", async () => {
    await montar();
    expect(apiAgenda.dia).toHaveBeenCalledWith(FECHA, 1);
    expect(screen.getByText("Carla R.")).toBeInTheDocument();
    expect(bloque()).toHaveAccessibleName(/^10:00 Rosa Mamani/);
    expect(screen.getByText("Curso")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Cola de espera" })).toBeInTheDocument();
  });

  it("sin la feature de cola no hay panel de cola", async () => {
    sesion.features = ["agenda"];
    await montar();
    expect(screen.queryByRole("region", { name: "Cola de espera" })).not.toBeInTheDocument();
  });

  it("tocar un hueco abre la nueva cita con el profesional y la hora", async () => {
    await montar();
    // La grilla arranca a las 9:00 (el primer tramo) y son 1,6 px por minuto:
    // 192 px más abajo son las 11:00.
    await act(async () => {
      fireEvent.click(screen.getByTestId("columna-1"), { clientY: 192 });
    });
    expect(screen.getByRole("dialog", { name: "Nueva cita" })).toBeInTheDocument();
    expect(screen.getByLabelText("Con")).toHaveValue("1");
  });

  it("arrastrar mueve la cita; con 409 vuelve a su lugar y avisa", async () => {
    vi.mocked(apiAgenda.moverCita).mockRejectedValue(
      new ApiError("Ocupado", 409, { codigo: "HUECO_OCUPADO", huecos: [] }),
    );
    await montar();

    fireEvent.pointerDown(bloque(), { pointerType: "mouse", button: 0, clientX: 10, clientY: 100 });
    // 48 px = 30 minutos más tarde.
    fireEvent.pointerMove(window, { pointerType: "mouse", clientX: 10, clientY: 148 });
    expect(bloque()).toHaveAccessibleName(/^10:00/);
    await act(async () => {
      fireEvent.pointerUp(window, { pointerType: "mouse", clientX: 10, clientY: 148 });
    });

    expect(apiAgenda.moverCita).toHaveBeenCalledWith(1, {
      lineas: [{ servicioId: 100, recursoId: 1, inicio: "2026-10-21T14:30:00.000Z" }],
    });
    expect(screen.getByText("Ese horario se acaba de ocupar: la cita volvió a su lugar.")).toBeInTheDocument();
    expect(bloque()).toHaveAccessibleName(/^10:00 Rosa Mamani/);
  });

  it("arrastrar y que el backend acepte la deja en la hora nueva", async () => {
    vi.mocked(apiAgenda.moverCita).mockImplementation(async (_id, { lineas }) =>
      cita({
        inicio: lineas![0].inicio,
        fin: "2026-10-21T15:15:00.000Z",
        lineas: [{ ...cita().lineas[0], inicio: lineas![0].inicio, fin: "2026-10-21T15:15:00.000Z" }],
      }),
    );
    await montar();
    fireEvent.pointerDown(bloque(), { pointerType: "mouse", button: 0, clientX: 10, clientY: 100 });
    fireEvent.pointerMove(window, { pointerType: "mouse", clientX: 10, clientY: 148 });
    await act(async () => {
      fireEvent.pointerUp(window, { pointerType: "mouse", clientX: 10, clientY: 148 });
    });
    expect(bloque()).toHaveAccessibleName(/^10:30 Rosa Mamani/);
  });
});
