import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cita, recurso } from "../../test/agendaFixtures";

/**
 * A10 · Mi agenda: sólo lo del profesional que entró. Sin recurso vinculado,
 * un mensaje que dice qué falta y quién lo arregla (no una lista vacía que
 * parezca "no tenés clientes").
 */

const logout = vi.fn();

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    usuario: { id: 8, username: "carla", nombre: "Carla", rol: "PROFESIONAL", sucursalId: null, modulos: [] },
    negocio: { id: 1, nombre: "Salón Bella Vista", tipoNegocio: "PELUQUERIA" },
    logout,
  }),
}));

vi.mock("../../lib/agenda/apiAgenda", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/agenda/apiAgenda")>();
  return {
    ...real,
    apiAgenda: { miAgenda: vi.fn(), reglas: vi.fn(), cambiarEstado: vi.fn(), cita: vi.fn() },
  };
});

import { apiAgenda } from "../../lib/agenda/apiAgenda";
import MiAgenda from "./MiAgenda";

beforeEach(() => {
  vi.clearAllMocks();
  // Sólo el reloj: los timers siguen reales para que las promesas resuelvan.
  vi.useFakeTimers({ toFake: ["Date"] });
  // Miércoles 21-oct-2026, 09:00 en La Paz.
  vi.setSystemTime(new Date("2026-10-21T13:00:00.000Z"));
  vi.mocked(apiAgenda.reglas).mockRejectedValue(new Error("sin reglas"));
});

afterEach(() => {
  vi.useRealTimers();
});

async function montar() {
  render(
    <MemoryRouter>
      <MiAgenda />
    </MemoryRouter>,
  );
  await act(async () => {});
}

describe("A10 · mi agenda", () => {
  it("sin recurso vinculado explica qué falta, con la palabra del rubro", async () => {
    vi.mocked(apiAgenda.miAgenda).mockResolvedValue({ recursos: [], citas: [] });
    await montar();
    expect(screen.getByText("Tu usuario no está vinculado a una agenda")).toBeInTheDocument();
    expect(screen.getByText(/tu ficha de estilista en Configurar agenda/)).toBeInTheDocument();
    // Pide la semana del día de hoy, de lunes a domingo.
    expect(apiAgenda.miAgenda).toHaveBeenCalledWith("2026-10-19", "2026-10-25");
  });

  it("muestra la próxima cita, sus citas del día y marca estados", async () => {
    const proxima = cita({
      cliente: { ...cita().cliente, telefono: null, alergias: "amoníaco" },
    });
    const manana = cita({
      id: 2,
      inicio: "2026-10-22T14:00:00.000Z",
      fin: "2026-10-22T14:45:00.000Z",
      cliente: { ...cita().cliente, nombre: "Paola Suárez", telefono: null },
    });
    vi.mocked(apiAgenda.miAgenda).mockResolvedValue({
      recursos: [recurso({ usuarioId: 8 })],
      citas: [proxima, manana],
    });
    vi.mocked(apiAgenda.cambiarEstado).mockResolvedValue({ ...proxima, estado: "EN_ESPERA" });
    await montar();

    expect(screen.getByText("Próxima cita · en 1 h")).toBeInTheDocument();
    expect(screen.getByText("10:00 · Rosa Mamani")).toBeInTheDocument();
    // La de mañana no está en la lista de hoy.
    expect(screen.queryByText("Paola Suárez")).not.toBeInTheDocument();
    expect(screen.getByText(/Alergia: amoníaco/)).toBeInTheDocument();
    expect(screen.getByText("El teléfono de los clientes lo ve sólo recepción.")).toBeInTheDocument();
    // Sin la regla, el profesional no agenda.
    expect(screen.queryByRole("button", { name: "Nueva cita" })).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Llegó" }));
    });
    expect(apiAgenda.cambiarEstado).toHaveBeenCalledWith(1, "LLEGO");

    // Otro día de la semana corta.
    fireEvent.click(screen.getByRole("button", { name: "Jueves 22 de octubre" }));
    expect(screen.getByText("Paola Suárez")).toBeInTheDocument();
  });

  it("con la regla del negocio prendida puede agendar", async () => {
    vi.mocked(apiAgenda.reglas).mockResolvedValue({
      granularidadMin: 15,
      bufferGeneralMin: 0,
      profesionalPuedeAgendar: true,
      profesionalPuedeBloquear: false,
      profesionalVeTelefono: false,
      profesionalVePrecios: false,
    });
    vi.mocked(apiAgenda.miAgenda).mockResolvedValue({ recursos: [recurso({ usuarioId: 8 })], citas: [] });
    await montar();
    expect(screen.getByRole("button", { name: "Nueva cita" })).toBeInTheDocument();
  });
});
