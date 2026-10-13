import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/api";
import { FECHA, cita, ficha, propuesta, recurso, servicio } from "../../test/agendaFixtures";

/**
 * A5 · Nueva cita. Lo que más importa (§7.2): si otro toma el horario en el
 * medio, el 409 trae los huecos recalculados y NADA de lo cargado se pierde.
 */

const sesion = vi.hoisted(() => ({
  rol: "CAJERO" as string,
  /** Plan Emprendedor: sin cupo en los casos de siempre. */
  cupo: undefined as import("../../types").CupoEstado | undefined,
  actualizarCupo: vi.fn(),
  refrescarCupo: vi.fn(async () => {}),
}));

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
      cupo: sesion.cupo,
      actualizarCupo: sesion.actualizarCupo,
      refrescarCupo: sesion.refrescarCupo,
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
import { fechaNegocio } from "../../lib/agenda/horaAgenda";
import { EVENTO_HOJA_CUPO } from "../../lib/hojaCupo";
import { CUPO_ILIMITADO, cupoEmprendedor } from "../../test/cupoFixtures";
import NuevaCita from "./NuevaCita";

const A_LAS_10 = propuesta("2026-10-21T14:00:00.000Z");
const A_LAS_1030 = propuesta("2026-10-21T14:30:00.000Z");
const A_LAS_11 = propuesta("2026-10-21T15:00:00.000Z");
const A_LAS_1130 = propuesta("2026-10-21T15:30:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  sesion.rol = "CAJERO";
  sesion.cupo = undefined;
  vi.mocked(apiAgenda.servicios).mockResolvedValue([servicio()]);
  vi.mocked(apiAgenda.recursos).mockResolvedValue([recurso()]);
  vi.mocked(apiAgenda.buscarClientes).mockResolvedValue([]);
  vi.mocked(apiAgenda.crearCliente).mockResolvedValue(
    ficha({ id: 9, nombre: "María Flores", telefono: "70011122" }),
  );
  vi.mocked(apiAgenda.huecos).mockResolvedValue({ huecos: [A_LAS_10, A_LAS_1030] });
  vi.mocked(apiAgenda.reglas).mockRejectedValue(new Error("sin reglas"));
});

/** El formulario de siempre (modo completo, el de recepción con personal). */
async function montar(onCreada = vi.fn(), modo: "SIMPLE" | "COMPLETO" = "COMPLETO") {
  render(<NuevaCita sucursalId={1} precarga={{ fecha: FECHA }} modo={modo} onClose={vi.fn()} onCreada={onCreada} />);
  await act(async () => {});
  return onCreada;
}

/** Dos personas en la sucursal: así aparece "Con" para elegir. */
function conDosProfesionales() {
  vi.mocked(apiAgenda.recursos).mockResolvedValue([recurso(), recurso({ id: 2, nombre: "Sofía", orden: 2 })]);
}

async function cargarFormulario() {
  fireEvent.change(screen.getByLabelText(/^Teléfono/), { target: { value: "70011122" } });
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
    expect(screen.getByLabelText(/^Teléfono/)).toHaveValue("70011122");
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

    fireEvent.change(screen.getByLabelText(/^Teléfono/), { target: { value: "71234567" } });
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
    conDosProfesionales();
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
    conDosProfesionales();
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
    conDosProfesionales();
    vi.mocked(apiAgenda.reglas).mockResolvedValue({ granularidadMin: 15, modoAgenda: "COMPLETO" } as never);
    vi.mocked(apiAgenda.crearCita).mockResolvedValue(cita());
    render(<NuevaCita sucursalId={1} precarga={{ fecha: FECHA }} onClose={vi.fn()} onCreada={vi.fn()} />);
    await act(async () => {});
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

describe("teléfono opcional y una sola persona (IDEAS/7, decisión del 12-oct)", () => {
  it("agenda sin teléfono: no crea ficha y manda sólo el nombre", async () => {
    vi.mocked(apiAgenda.crearCita).mockResolvedValue(cita({ id: 3 }));
    const onCreada = await montar();
    fireEvent.change(screen.getByLabelText(/^Nombre/), { target: { value: "Juan" } });
    fireEvent.change(screen.getByLabelText("Servicio 1"), { target: { value: "100" } });
    await screen.findByRole("radio", { name: "10:00" });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirmar cita" }));
    });
    expect(apiAgenda.crearCliente).not.toHaveBeenCalled();
    const enviado = vi.mocked(apiAgenda.crearCita).mock.calls[0][0];
    expect(enviado.cliente).toEqual({ nombre: "Juan" });
    expect(enviado.clienteId).toBeUndefined();
    expect(onCreada).toHaveBeenCalled();
  });

  it("un teléfono escrito a medias no se manda", async () => {
    await montar();
    fireEvent.change(screen.getByLabelText(/^Teléfono/), { target: { value: "7001" } });
    fireEvent.change(screen.getByLabelText(/^Nombre/), { target: { value: "Juan" } });
    fireEvent.change(screen.getByLabelText("Servicio 1"), { target: { value: "100" } });
    await screen.findByRole("radio", { name: "10:00" });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirmar cita" }));
    });
    expect(screen.getByText(/Ese teléfono está incompleto/)).toBeInTheDocument();
    expect(apiAgenda.crearCita).not.toHaveBeenCalled();
  });

  it("con una sola persona en la sucursal no hay «Con» ni «Cualquiera»", async () => {
    await montar();
    expect(screen.getByLabelText("Servicio 1")).toBeInTheDocument();
    expect(screen.queryByLabelText("Con")).not.toBeInTheDocument();
  });

  it("con dos, «Con» está y arranca en «Cualquiera»", async () => {
    conDosProfesionales();
    await montar();
    expect(screen.getByLabelText("Con")).toHaveValue("");
  });
});

describe("modo simple (IDEAS/7, propuesta A)", () => {
  it("nombre, servicio en chips, la primera hora ya elegida y Guardar: nace confirmada", async () => {
    vi.mocked(apiAgenda.servicios).mockResolvedValue([servicio(), servicio({ id: 101, nombre: "Barba", precio: 30 })]);
    vi.mocked(apiAgenda.crearCita).mockResolvedValue(cita({ id: 4 }));
    const onCreada = await montar(vi.fn(), "SIMPLE");

    // Lo avanzado no está a la vista.
    expect(screen.queryByLabelText("Nota (opcional)")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Sobre-turno/)).not.toBeInTheDocument();
    expect(screen.queryByText(/El cliente ya confirmó/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Con")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Servicio 1")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Cliente"), { target: { value: "Juan Pérez" } });
    // Es un nombre: el teléfono queda al lado y es opcional.
    expect(screen.getByLabelText("Teléfono (opcional, para recordarle)")).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: /^Corte dama/ }));
    expect(screen.getByRole("button", { name: /^Corte dama/ })).toHaveAttribute("aria-pressed", "true");
    expect(await screen.findByRole("radio", { name: "10:00" })).toHaveAttribute("aria-checked", "true");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    });
    expect(apiAgenda.crearCliente).not.toHaveBeenCalled();
    expect(vi.mocked(apiAgenda.crearCita).mock.calls[0][0]).toMatchObject({
      confirmada: true,
      cliente: { nombre: "Juan Pérez" },
      lineas: [{ servicioId: 100, recursoId: 1, inicio: "2026-10-21T14:00:00.000Z" }],
    });
    expect(onCreada).toHaveBeenCalledWith(expect.objectContaining({ id: 4 }));
  });

  it("dos chips son dos servicios, en el orden en que se tocaron", async () => {
    vi.mocked(apiAgenda.servicios).mockResolvedValue([servicio(), servicio({ id: 101, nombre: "Barba", precio: 30 })]);
    await montar(vi.fn(), "SIMPLE");
    fireEvent.click(screen.getByRole("button", { name: /^Barba/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Corte dama/ }));
    await act(async () => {});
    const pedido = vi.mocked(apiAgenda.huecos).mock.calls.at(-1)![0];
    expect(pedido.lineas.map((l) => l.servicioId)).toEqual([101, 100]);
    // Tocarlo otra vez lo saca.
    fireEvent.click(screen.getByRole("button", { name: /^Barba/ }));
    await act(async () => {});
    expect(vi.mocked(apiAgenda.huecos).mock.calls.at(-1)![0].lineas.map((l) => l.servicioId)).toEqual([100]);
  });

  it("un número en «Cliente» es el teléfono: lo busca y, si no está, pide el nombre", async () => {
    vi.mocked(apiAgenda.crearCita).mockResolvedValue(cita());
    await montar(vi.fn(), "SIMPLE");
    fireEvent.change(screen.getByLabelText("Cliente"), { target: { value: "70011122" } });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 350));
    });
    expect(apiAgenda.buscarClientes).toHaveBeenCalledWith("70011122");
    fireEvent.change(screen.getByLabelText(/^Nombre/), { target: { value: "María Flores" } });
    fireEvent.click(screen.getByRole("button", { name: /^Corte dama/ }));
    await screen.findByRole("radio", { name: "10:00" });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    });
    expect(apiAgenda.crearCliente).toHaveBeenCalledWith({ nombre: "María Flores", telefono: "70011122" });
    expect(vi.mocked(apiAgenda.crearCita).mock.calls[0][0]).toMatchObject({ clienteId: 9, confirmada: true });
  });

  it("por nombre sugiere clientes conocidos (no elige solo)", async () => {
    vi.mocked(apiAgenda.buscarClientes).mockResolvedValue([ficha({ id: 5, nombre: "Rosa Mamani" })]);
    await montar(vi.fn(), "SIMPLE");
    fireEvent.change(screen.getByLabelText("Cliente"), { target: { value: "ros" } });
    const sugerida = await screen.findByRole("button", { name: /Rosa Mamani/ });
    expect(apiAgenda.buscarClientes).toHaveBeenCalledWith("ros");
    expect(screen.queryByRole("button", { name: "Cambiar" })).not.toBeInTheDocument();
    fireEvent.click(sugerida);
    expect(screen.getByRole("button", { name: "Cambiar" })).toBeInTheDocument();
  });

  it("sobre-turno y nota están en «Más opciones»", async () => {
    await montar(vi.fn(), "SIMPLE");
    fireEvent.click(screen.getByRole("button", { name: "Más opciones" }));
    expect(screen.getByLabelText("Nota (opcional)")).toBeInTheDocument();
    expect(screen.getByLabelText(/Sobre-turno/)).toBeInTheDocument();
  });

  it("sin el modo dado, lo toma de las reglas de la sucursal (sin el dato, simple)", async () => {
    vi.mocked(apiAgenda.reglas).mockResolvedValue({ granularidadMin: 15, bufferGeneralMin: 0 });
    render(<NuevaCita sucursalId={1} precarga={{ fecha: FECHA }} onClose={vi.fn()} onCreada={vi.fn()} />);
    await act(async () => {});
    expect(apiAgenda.reglas).toHaveBeenCalledWith(1);
    expect(screen.getByLabelText("Cliente")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeInTheDocument();
  });
});

describe("Plan Emprendedor: el cupo de citas al confirmar (§5.1)", () => {
  const pedidos: Event[] = [];
  const escuchar = (e: Event) => pedidos.push(e);
  beforeEach(() => {
    pedidos.length = 0;
    window.addEventListener(EVENTO_HOJA_CUPO, escuchar);
    return () => window.removeEventListener(EVENTO_HOJA_CUPO, escuchar);
  });

  it("un negocio Básico (ilimitado) agenda como siempre", async () => {
    sesion.cupo = CUPO_ILIMITADO;
    vi.mocked(apiAgenda.crearCita).mockResolvedValue(cita({ id: 8 }));
    const onCreada = await montar();
    await cargarFormulario();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirmar cita" }));
    });
    expect(apiAgenda.crearCita).toHaveBeenCalledTimes(1);
    expect(onCreada).toHaveBeenCalled();
    expect(pedidos).toHaveLength(0);
    expect(sesion.refrescarCupo).not.toHaveBeenCalled();
  });

  it("una cita cuesta 2 créditos: con el cupo lleno y 1 crédito no se manda y se abre la hoja", async () => {
    sesion.cupo = cupoEmprendedor({ fecha: fechaNegocio(), citas: 25, saldo: 1 });
    const onCreada = await montar();
    await cargarFormulario();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirmar cita" }));
    });
    expect(apiAgenda.crearCita).not.toHaveBeenCalled();
    expect(apiAgenda.crearCliente).not.toHaveBeenCalled();
    expect(onCreada).not.toHaveBeenCalled();
    expect((pedidos[0] as CustomEvent).detail).toEqual({ unidad: "CITA", agotado: true });
    expect(screen.getByText(/No te queda cupo de citas hoy/)).toBeInTheDocument();
    // Lo cargado sigue ahí.
    expect(screen.getByLabelText("Nota (opcional)")).toHaveValue("Pidió no cortar las puntas");
  });

  it("con 2 créditos alcanza: agenda y guarda el consumo", async () => {
    sesion.cupo = cupoEmprendedor({ fecha: fechaNegocio(), citas: 25, saldo: 2 });
    const despues = cupoEmprendedor({ fecha: fechaNegocio(), citas: 25, saldo: 0 });
    vi.mocked(apiAgenda.crearCita).mockResolvedValue({
      ...cita({ id: 9 }),
      consumo: { unidad: "CITA", fuente: "CREDITOS", creditos: 2, cupo: despues },
    });
    const onCreada = await montar();
    await cargarFormulario();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirmar cita" }));
    });
    expect(apiAgenda.crearCita).toHaveBeenCalledTimes(1);
    expect(sesion.actualizarCupo).toHaveBeenCalledWith(despues);
    expect(onCreada).toHaveBeenCalled();
    expect(pedidos).toHaveLength(0);
  });

  it("un 403 CUPO_AGOTADO abre la hoja, no borra nada y reintenta con el mismo pedido", async () => {
    sesion.cupo = cupoEmprendedor({ fecha: fechaNegocio(), citas: 24, saldo: 0 });
    const delServidor = cupoEmprendedor({ fecha: fechaNegocio(), citas: 25, saldo: 0 });
    vi.mocked(apiAgenda.crearCita).mockRejectedValueOnce(
      new ApiError("Llegaste a tus 25 citas de hoy y no te quedan créditos.", 403, {
        codigo: "CUPO_AGOTADO",
        unidad: "CITA",
        cupo: delServidor,
      }),
    );
    const onCreada = await montar();
    await cargarFormulario();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirmar cita" }));
    });
    expect(sesion.actualizarCupo).toHaveBeenCalledWith(delServidor);
    expect((pedidos[0] as CustomEvent).detail).toEqual({ unidad: "CITA", agotado: true });
    expect(screen.getByText(/No te queda cupo de citas hoy/)).toBeInTheDocument();
    expect(screen.getByLabelText("Nota (opcional)")).toHaveValue("Pidió no cortar las puntas");
    expect(onCreada).not.toHaveBeenCalled();

    // Compró créditos: el snapshot nuevo deja pasar y el reintento es el mismo pedido.
    sesion.cupo = cupoEmprendedor({ fecha: fechaNegocio(), citas: 25, saldo: 50 });
    vi.mocked(apiAgenda.crearCita).mockResolvedValueOnce(cita({ id: 10 }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirmar cita" }));
    });
    const [primero, segundo] = vi.mocked(apiAgenda.crearCita).mock.calls.map((c) => c[0]);
    expect(segundo.clienteRequestId).toBe(primero.clienteRequestId);
    expect(onCreada).toHaveBeenCalledWith(expect.objectContaining({ id: 10 }));
  });
  it("una cita que quedó en duda (sin respuesta) se reintenta aunque el contador ya diga lleno", async () => {
    // La cita se grabó con el último lugar pero la respuesta se perdió; el
    // chequeo de licencia trajo 25/25 sin créditos. El reintento con el mismo
    // clienteRequestId devuelve la cita existente sin consumir otra vez.
    sesion.cupo = cupoEmprendedor({ fecha: fechaNegocio(), citas: 24, saldo: 0 });
    let intentos = 0;
    vi.mocked(apiAgenda.crearCita).mockImplementation(async () => {
      intentos += 1;
      if (intentos > 1) return cita({ id: 11 });
      sesion.cupo = cupoEmprendedor({ fecha: fechaNegocio(), citas: 25, saldo: 0 });
      throw new ApiError("Sin internet. Revisá la conexión del local.", 0);
    });
    const onCreada = await montar();
    await cargarFormulario();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirmar cita" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirmar cita" }));
    });
    expect(pedidos).toHaveLength(0);
    expect(apiAgenda.crearCita).toHaveBeenCalledTimes(2);
    const [primero, segundo] = vi.mocked(apiAgenda.crearCita).mock.calls.map((c) => c[0]);
    expect(segundo.clienteRequestId).toBe(primero.clienteRequestId);
    expect(onCreada).toHaveBeenCalledWith(expect.objectContaining({ id: 11 }));
  });
});
