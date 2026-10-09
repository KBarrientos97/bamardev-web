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
// Los permisos de más de su rol (`agenda.crear_propias` = agendar lo suyo).
const sesion = vi.hoisted(() => ({
  extra: [] as string[],
  /** Plan Emprendedor: sin cupo en los casos de siempre. */
  cupo: undefined as import("../../types").CupoEstado | undefined,
}));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    usuario: { id: 8, username: "carla", nombre: "Carla", rol: "PROFESIONAL", rolNombre: "Estilista", sucursalId: null, permisos: ["agenda.ver", "agenda.estado", "comisiones.ver", ...sesion.extra], permisosPropios: ["agenda.ver", "agenda.estado", "comisiones.ver", ...sesion.extra] },
    negocio: { id: 1, nombre: "Salón Bella Vista", tipoNegocio: "PELUQUERIA" },
    logout,
    cupo: sesion.cupo,
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
import { CUPO_ILIMITADO, cupoEmprendedor } from "../../test/cupoFixtures";
import MiAgenda from "./MiAgenda";

beforeEach(() => {
  vi.clearAllMocks();
  // Sólo el reloj: los timers siguen reales para que las promesas resuelvan.
  vi.useFakeTimers({ toFake: ["Date"] });
  // Miércoles 21-oct-2026, 09:00 en La Paz.
  vi.setSystemTime(new Date("2026-10-21T13:00:00.000Z"));
  sesion.extra = [];
  sesion.cupo = undefined;
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

  it("con `agenda.crear_propias` en su rol puede agendar", async () => {
    sesion.extra = ["agenda.crear_propias"];
    vi.mocked(apiAgenda.miAgenda).mockResolvedValue({ recursos: [recurso({ usuarioId: 8 })], citas: [] });
    await montar();
    expect(screen.getByRole("button", { name: "Nueva cita" })).toBeInTheDocument();
  });

  it("la regla vieja de la agenda ya no decide: sin el permiso no agenda aunque esté prendida", async () => {
    vi.mocked(apiAgenda.reglas).mockResolvedValue({
      granularidadMin: 15,
      bufferGeneralMin: 0,
      profesionalPuedeAgendar: true,
    } as Awaited<ReturnType<typeof apiAgenda.reglas>>);
    vi.mocked(apiAgenda.miAgenda).mockResolvedValue({ recursos: [recurso({ usuarioId: 8 })], citas: [] });
    await montar();
    expect(screen.queryByRole("button", { name: "Nueva cita" })).not.toBeInTheDocument();
  });

  it("M-12: en una secuencia ve sólo su tramo (hora, duración y servicio)", async () => {
    const secuencia = cita({
      id: 13,
      inicio: "2026-10-21T13:15:00.000Z",
      fin: "2026-10-21T15:30:00.000Z",
      cliente: { ...cita().cliente, nombre: "Ana Pisa" },
      lineas: [
        {
          id: 31,
          servicioId: 100,
          servicio: "Corte de dama",
          recursoId: 1,
          recurso: "Carla R.",
          inicio: "2026-10-21T13:15:00.000Z",
          fin: "2026-10-21T14:00:00.000Z",
          sobreTurno: false,
          precio: 80,
        },
        {
          id: 32,
          servicioId: 101,
          servicio: "Tinte raíz",
          recursoId: 2,
          recurso: "Sofía",
          inicio: "2026-10-21T14:00:00.000Z",
          fin: "2026-10-21T15:30:00.000Z",
          sobreTurno: false,
          precio: 150,
        },
      ],
    });
    vi.mocked(apiAgenda.miAgenda).mockResolvedValue({
      recursos: [recurso({ id: 1, usuarioId: 8 })],
      citas: [secuencia],
    });
    await montar();
    const tarjeta = screen.getByRole("button", { name: "Ver la cita de Ana Pisa" });
    expect(tarjeta).toHaveTextContent("09:15");
    expect(tarjeta).toHaveTextContent("45 min");
    expect(tarjeta).toHaveTextContent("Corte de dama");
    expect(tarjeta).not.toHaveTextContent("Tinte raíz");
    expect(tarjeta).not.toHaveTextContent("2 h");
  });

  it("QA R2-03: sin menú lateral, el profesional cambia su contraseña desde la cabecera", async () => {
    vi.mocked(apiAgenda.miAgenda).mockResolvedValue({
      recursos: [recurso({ usuarioId: 8 })],
      citas: [],
    });
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Cambiar mi contraseña" }));
    expect(screen.getByText("Contraseña actual")).toBeInTheDocument();
    expect(screen.getByText("Repetir la nueva")).toBeInTheDocument();
  });

  it("QA R2-03: también sin recurso vinculado", async () => {
    vi.mocked(apiAgenda.miAgenda).mockResolvedValue({ recursos: [], citas: [] });
    await montar();
    // El de la cabecera y el de la tarjeta.
    expect(screen.getAllByRole("button", { name: /Cambiar mi contraseña/ })).toHaveLength(2);
  });
});

describe("Plan Emprendedor: el chip de citas en Mi agenda (fuera del Layout)", () => {
  it("quien agenda, en un Emprendedor, ve el chip y tocarlo abre la hoja acá mismo", async () => {
    sesion.extra = ["agenda.crear_propias"];
    sesion.cupo = cupoEmprendedor({ fecha: "2026-10-21", citas: 3, saldo: 10 });
    vi.mocked(apiAgenda.miAgenda).mockResolvedValue({ recursos: [recurso({ usuarioId: 8 })], citas: [] });
    await montar();
    const chip = screen.getByRole("button", { name: /Créditos 10/ });
    expect(chip).toHaveTextContent("Citas hoy 3/50 · Créditos 10");
  });

  it("con ilimitado no hay chip aunque pueda agendar", async () => {
    sesion.extra = ["agenda.crear_propias"];
    sesion.cupo = CUPO_ILIMITADO;
    vi.mocked(apiAgenda.miAgenda).mockResolvedValue({ recursos: [recurso({ usuarioId: 8 })], citas: [] });
    await montar();
    expect(screen.getByRole("button", { name: "Nueva cita" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Créditos/ })).not.toBeInTheDocument();
  });
});
