import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/api";
import { FECHA, cita, ficha, propuesta, recurso, servicio } from "../../test/agendaFixtures";

/**
 * A5 · Nueva cita. Lo que más importa (§7.2): si otro toma el horario en el
 * medio, el 409 trae los huecos recalculados y NADA de lo cargado se pierde.
 */

const sesion = vi.hoisted(() => ({ rol: "CAJERO" as string }));

vi.mock("../../store/AuthContext", async () => {
  // Los permisos de la plantilla de ese rol: la pantalla decide sólo con ellos.
  const { permisosDe } = await import("../../test/sesiones");
  return {
    useAuth: () => ({
      usuario: {
        id: 3,
        username: "recepcion",
        rol: sesion.rol,
        sucursalId: 1,
        ...permisosDe(sesion.rol as Parameters<typeof permisosDe>[0]),
      },
      negocio: { id: 1, nombre: "Salón Bella Vista", tipoNegocio: "PELUQUERIA" },
    }),
  };
});

vi.mock("../../lib/agenda/apiAgenda", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/agenda/apiAgenda")>();
  return {
    ...real,
    apiAgenda: {
      servicios: vi.fn(),
      recursos: vi.fn(),
      buscarClientes: vi.fn(),
      crearCliente: vi.fn(),
      huecos: vi.fn(),
      crearCita: vi.fn(),
      reglas: vi.fn(),
    },
  };
});

import { apiAgenda } from "../../lib/agenda/apiAgenda";
import NuevaCita from "./NuevaCita";

const A_LAS_10 = propuesta("2026-10-21T14:00:00.000Z");
const A_LAS_1030 = propuesta("2026-10-21T14:30:00.000Z");
const A_LAS_11 = propuesta("2026-10-21T15:00:00.000Z");
const A_LAS_1130 = propuesta("2026-10-21T15:30:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  sesion.rol = "CAJERO";
  vi.mocked(apiAgenda.servicios).mockResolvedValue([servicio()]);
  vi.mocked(apiAgenda.recursos).mockResolvedValue([recurso()]);
  vi.mocked(apiAgenda.buscarClientes).mockResolvedValue([]);
  vi.mocked(apiAgenda.crearCliente).mockResolvedValue(
    ficha({ id: 9, nombre: "María Flores", telefono: "70011122" }),
  );
  vi.mocked(apiAgenda.huecos).mockResolvedValue({ huecos: [A_LAS_10, A_LAS_1030] });
  vi.mocked(apiAgenda.reglas).mockRejectedValue(new Error("sin reglas"));
});

async function montar(onCreada = vi.fn()) {
  render(<NuevaCita sucursalId={1} precarga={{ fecha: FECHA }} onClose={vi.fn()} onCreada={onCreada} />);
  await act(async () => {});
  return onCreada;
}

async function cargarFormulario() {
  fireEvent.change(screen.getByLabelText("Teléfono del cliente"), { target: { value: "70011122" } });
  fireEvent.change(screen.getByLabelText(/^Nombre/), { target: { value: "María Flores" } });
  fireEvent.change(screen.getByLabelText("Servicio 1"), { target: { value: "100" } });
  fireEvent.change(screen.getByLabelText("Nota (opcional)"), { target: { value: "Pidió no cortar las puntas" } });
  // El primer hueco viene elegido.
  expect(await screen.findByRole("radio", { name: "10:00" })).toHaveAttribute("aria-checked", "true");
}

describe("A5 · nueva cita", () => {
  it("con el 409 HUECO_OCUPADO avisa, reemplaza los huecos y conserva lo cargado", async () => {
    vi.mocked(apiAgenda.crearCita).mockRejectedValueOnce(
      new ApiError("Ese horario ya no está libre", 409, {
        codigo: "HUECO_OCUPADO",
        huecos: [A_LAS_11, A_LAS_1130],
      }),
    );
    const onCreada = await montar();
    await cargarFormulario();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirmar cita" }));
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Ese horario se acaba de ocupar");
    // Los huecos son los del error, no los de antes.
    expect(screen.queryByRole("radio", { name: "10:00" })).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "11:00" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "11:30" })).toBeInTheDocument();
    // Nada de lo cargado se perdió.
    expect(screen.getByLabelText("Teléfono del cliente")).toHaveValue("70011122");
    expect(screen.getByText("María Flores")).toBeInTheDocument();
    expect(screen.getByLabelText("Servicio 1")).toHaveValue("100");
    expect(screen.getByLabelText("Nota (opcional)")).toHaveValue("Pidió no cortar las puntas");
    expect(onCreada).not.toHaveBeenCalled();

    // El segundo intento va con el hueco nuevo y el cliente ya creado (no lo duplica).
    vi.mocked(apiAgenda.crearCita).mockResolvedValueOnce(cita({ id: 7 }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirmar cita" }));
    });
    expect(apiAgenda.crearCliente).toHaveBeenCalledTimes(1);
    const [primero, segundo] = vi.mocked(apiAgenda.crearCita).mock.calls.map((c) => c[0]);
    expect(primero.lineas[0].inicio).toBe("2026-10-21T14:00:00.000Z");
    expect(segundo).toMatchObject({
      sucursalId: 1,
      clienteId: 9,
      nota: "Pidió no cortar las puntas",
      lineas: [{ servicioId: 100, recursoId: 1, inicio: "2026-10-21T15:00:00.000Z" }],
    });
    // Un intento rechazado no creó nada: el siguiente es otra petición.
    expect(segundo.clienteRequestId).not.toBe(primero.clienteRequestId);
    expect(onCreada).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }));
  });

  it("si el teléfono ya es de un cliente, lo elige solo y no crea otro", async () => {
    vi.mocked(apiAgenda.buscarClientes).mockResolvedValue([
      ficha({ id: 5, nombre: "Rosa Mamani", telefono: "71234567", noShows: 2, alergias: "amoníaco" }),
    ]);
    vi.mocked(apiAgenda.crearCita).mockResolvedValue(cita());
    await montar();

    fireEvent.change(screen.getByLabelText("Teléfono del cliente"), { target: { value: "71234567" } });
    expect(await screen.findByText("Rosa Mamani")).toBeInTheDocument();
    expect(screen.getByText("2 inasistencias")).toBeInTheDocument();
    expect(screen.getByText("Alergia: amoníaco")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Servicio 1"), { target: { value: "100" } });
    await screen.findByRole("radio", { name: "10:00" });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirmar cita" }));
    });
    expect(apiAgenda.crearCliente).not.toHaveBeenCalled();
    expect(vi.mocked(apiAgenda.crearCita).mock.calls[0][0]).toMatchObject({ clienteId: 5 });
  });

  it("el sobre-turno de recepción pide el PIN de un encargado y lo manda", async () => {
    vi.mocked(apiAgenda.crearCita).mockResolvedValue(cita());
    await montar();
    await cargarFormulario();

    fireEvent.click(screen.getByLabelText(/Sobre-turno/));
    fireEvent.change(screen.getByLabelText(/^Hora del sobre-turno/), { target: { value: "10:15" } });
    // Sin propuesta del backend no hay "cualquiera": el profesional se elige.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirmar cita" }));
    });
    expect(screen.getByText("En un sobre-turno elegí el profesional de cada servicio.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Con"), { target: { value: "1" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirmar cita" }));
    });
    expect(apiAgenda.crearCita).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Autorización del encargado" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Usuario del encargado"), { target: { value: "encargada" } });
    fireEvent.change(screen.getByLabelText("PIN"), { target: { value: "1234" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Autorizar" }));
    });
    await waitFor(() => expect(apiAgenda.crearCita).toHaveBeenCalled());
    expect(vi.mocked(apiAgenda.crearCita).mock.calls[0][0]).toMatchObject({
      sobreTurno: true,
      pin: "1234",
      autorizadorUsername: "encargada",
      lineas: [{ servicioId: 100, recursoId: 1, inicio: "2026-10-21T14:15:00.000Z" }],
    });
  });

  it("el encargado hace el sobre-turno sin PIN", async () => {
    sesion.rol = "SUPERVISOR";
    vi.mocked(apiAgenda.crearCita).mockResolvedValue(cita());
    await montar();
    await cargarFormulario();
    fireEvent.click(screen.getByLabelText(/Sobre-turno/));
    fireEvent.change(screen.getByLabelText("Con"), { target: { value: "1" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirmar cita" }));
    });
    expect(screen.queryByRole("dialog", { name: "Autorización del encargado" })).not.toBeInTheDocument();
    expect(vi.mocked(apiAgenda.crearCita).mock.calls[0][0]).toMatchObject({ sobreTurno: true });
    expect(vi.mocked(apiAgenda.crearCita).mock.calls[0][0].pin).toBeUndefined();
  });

  it("la hora del sobre-turno tiene que caer en la grilla del negocio (QA M-07)", async () => {
    sesion.rol = "SUPERVISOR";
    vi.mocked(apiAgenda.reglas).mockResolvedValue({ granularidadMin: 15 } as never);
    vi.mocked(apiAgenda.crearCita).mockResolvedValue(cita());
    await montar();
    await cargarFormulario();
    fireEvent.click(screen.getByLabelText(/Sobre-turno/));
    fireEvent.change(screen.getByLabelText("Con"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText(/^Hora del sobre-turno/), { target: { value: "12:07" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirmar cita" }));
    });
    expect(apiAgenda.crearCita).not.toHaveBeenCalled();
    expect(screen.getByText(/Elegí una hora en la grilla de 15 min/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^Hora del sobre-turno/), { target: { value: "12:15" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirmar cita" }));
    });
    expect(apiAgenda.crearCita).toHaveBeenCalled();
  });

  it("muestra el mensaje del backend cuando rechaza la hora (HORA_PASADA)", async () => {
    vi.mocked(apiAgenda.crearCita).mockRejectedValue(
      Object.assign(new Error("Esa hora ya pasó: elegí un horario de ahora en adelante."), {
        status: 400,
        codigo: "HORA_PASADA",
      }),
    );
    await montar();
    await cargarFormulario();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirmar cita" }));
    });
    expect(screen.getByText("Esa hora ya pasó: elegí un horario de ahora en adelante.")).toBeInTheDocument();
  });
});
