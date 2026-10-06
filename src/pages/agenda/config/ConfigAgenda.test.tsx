import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Recurso, Servicio, TramoHorario } from "../../../lib/agenda/tiposConfigAgenda";

/**
 * A8 · Configuración de agenda, con la API mockeada: el backend de agenda
 * todavía no existe (se programa en paralelo contra el contrato de §10.1).
 */

vi.mock("../../../store/AuthContext", () => ({
  useAuth: () => ({
    usuario: { id: 1, rol: "ADMIN", sucursalId: null },
    negocio: {
      id: 15,
      nombre: "Barbería de prueba",
      tipoNegocio: "BARBERIA",
      features: ["agenda"],
      perfil: { etiquetasRol: { PROFESIONAL: "Barbero", CAJERO: "Recepción" } },
    },
    puede: (s: string) => s === "agenda_config" || s === "config_negocio",
  }),
}));

vi.mock("../../../lib/api", () => ({
  api: {
    getSucursales: vi.fn(async () => [
      { id: 1, nombre: "Centro", activo: true, tipo: "SUCURSAL", esPrincipal: true },
      { id: 2, nombre: "Sur", activo: true, tipo: "SUCURSAL", esPrincipal: false },
      { id: 3, nombre: "Depósito", activo: true, tipo: "DEPOSITO", esPrincipal: false },
    ]),
    getCategorias: vi.fn(async () => [{ id: 4, nombre: "Cortes", activo: true }]),
    getUsuarios: vi.fn(async () => [
      { id: 20, nombre: "Ana Pérez", usuario: "ana", rol: "PROFESIONAL", activo: true },
      { id: 21, nombre: "Caja", usuario: "caja", rol: "CAJERO", activo: true },
    ]),
  },
}));

vi.mock("../../../lib/agenda/apiConfigAgenda", () => ({
  apiConfigAgenda: {
    servicios: vi.fn(),
    crearServicio: vi.fn(),
    actualizarServicio: vi.fn(),
    recursos: vi.fn(),
    crearRecurso: vi.fn(),
    actualizarRecurso: vi.fn(),
    guardarServiciosRecurso: vi.fn(),
    horarios: vi.fn(),
    guardarHorarios: vi.fn(),
    excepciones: vi.fn(),
    crearExcepcion: vi.fn(),
    borrarExcepcion: vi.fn(),
    bloqueos: vi.fn(),
    crearBloqueo: vi.fn(),
    borrarBloqueo: vi.fn(),
  },
}));

import { apiConfigAgenda } from "../../../lib/agenda/apiConfigAgenda";
import ConfigAgenda from "./ConfigAgenda";

const CORTE: Servicio = {
  id: 100,
  nombre: "Corte clásico",
  categoriaId: 4,
  categoria: "Cortes",
  precio: 50,
  duracionMin: 30,
  bufferMin: 5,
  reservableOnline: true,
  recursoIds: [10],
  activo: true,
};
const BARBA: Servicio = { ...CORTE, id: 101, nombre: "Barba", duracionMin: null, bufferMin: null, recursoIds: [] };

const JUAN: Recurso = {
  id: 10,
  tipo: "PROFESIONAL",
  nombre: "Juan",
  nombrePublico: null,
  color: "#2563EB",
  telefono: null,
  comisionPct: null,
  usuarioId: null,
  usuario: null,
  publicadoOnline: false,
  activo: true,
  orden: 1,
  sucursalIds: [1, 2],
  servicioIds: [100],
};
const SILLON: Recurso = { ...JUAN, id: 11, tipo: "ESPACIO", nombre: "Sillón 2", sucursalIds: [1], servicioIds: [] };

const HORARIO: TramoHorario[] = [
  { sucursalId: 1, dia: 1, desde: "09:00", hasta: "13:00" },
  { sucursalId: 1, dia: 1, desde: "14:00", hasta: "19:00" },
  { sucursalId: 2, dia: 2, desde: "09:00", hasta: "18:00" },
];

async function montar(pestana?: string) {
  render(
    <MemoryRouter initialEntries={[`/configuracion/agenda${pestana ? `?pestana=${pestana}` : ""}`]}>
      <ConfigAgenda />
    </MemoryRouter>,
  );
  await act(async () => {});
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiConfigAgenda.servicios).mockResolvedValue([CORTE, BARBA]);
  vi.mocked(apiConfigAgenda.recursos).mockResolvedValue([JUAN, SILLON]);
  vi.mocked(apiConfigAgenda.horarios).mockResolvedValue(HORARIO);
  vi.mocked(apiConfigAgenda.excepciones).mockResolvedValue([]);
  vi.mocked(apiConfigAgenda.bloqueos).mockResolvedValue([]);
});

describe("pestañas", () => {
  it("arranca en Servicios y el nombre del profesional sale del perfil", async () => {
    await montar();
    expect(screen.getByRole("tab", { name: "Servicios" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Barberos y espacios" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Reglas del negocio/ })).toHaveAttribute(
      "href",
      "/configuracion/negocio",
    );
  });

  it("Servicios: duración, margen, online, quién lo hace y aviso de los que no tienen duración", async () => {
    await montar("servicios");
    expect(screen.getByText(/Cortes · Bs 50,00 · 30 min \+ 5 min de margen/)).toBeInTheDocument();
    expect(screen.getAllByText("Online").length).toBeGreaterThan(0);
    expect(screen.getByRole("status")).toHaveTextContent("1 servicio no tiene duración");
    expect(screen.getByRole("status")).toHaveTextContent("Barba");
    expect(screen.getByText("Nadie lo hace todavía")).toBeInTheDocument();
  });

  it("Servicios: editar manda duración, margen y quién lo hace", async () => {
    await montar("servicios");
    vi.mocked(apiConfigAgenda.actualizarServicio).mockResolvedValue({ ...BARBA, duracionMin: 20 });
    fireEvent.click(screen.getByRole("button", { name: "Editar Barba" }));
    const dialogo = screen.getByRole("dialog", { name: "Barba" });
    fireEvent.change(within(dialogo).getByLabelText("Duración (min)"), { target: { value: "20" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Juan" }));
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    });
    expect(apiConfigAgenda.actualizarServicio).toHaveBeenCalledWith(101, {
      duracionMin: 20,
      bufferMin: 0,
      reservableOnline: true,
      recursoIds: [10],
    });
  });

  it("Profesionales y espacios: lista los dos tipos y vincula sólo usuarios con rol profesional", async () => {
    await montar("recursos");
    expect(screen.getByRole("region", { name: "Barberos" })).toHaveTextContent("Juan");
    expect(screen.getByRole("region", { name: "Espacios" })).toHaveTextContent("Sillón 2");

    fireEvent.click(screen.getByRole("button", { name: "Editar Juan" }));
    await act(async () => {});
    const usuario = screen.getByLabelText(/Usuario vinculado/);
    const opciones = within(usuario).getAllByRole("option").map((o) => o.textContent);
    expect(opciones).toEqual(["Sin usuario", "Ana Pérez (@ana)"]);
  });

  it("Profesionales: precio y duración propios por servicio (fase 2)", async () => {
    await montar("recursos");
    vi.mocked(apiConfigAgenda.actualizarRecurso).mockResolvedValue(JUAN);
    vi.mocked(apiConfigAgenda.guardarServiciosRecurso).mockResolvedValue(JUAN);
    fireEvent.click(screen.getByRole("button", { name: "Editar Juan" }));
    await act(async () => {});
    const dialogo = screen.getByRole("dialog", { name: "Editar Juan" });
    fireEvent.click(within(dialogo).getByRole("checkbox", { name: /Precio y duración propios/ }));
    // Vacío muestra lo del servicio como pista.
    const minutos = within(dialogo).getByLabelText("Minutos de Corte clásico");
    expect(minutos).toHaveAttribute("placeholder", "30 min");
    fireEvent.change(minutos, { target: { value: "25" } });
    fireEvent.change(within(dialogo).getByLabelText("Precio de Corte clásico"), { target: { value: "60" } });
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    });
    expect(apiConfigAgenda.actualizarRecurso).toHaveBeenCalled();
    expect(apiConfigAgenda.guardarServiciosRecurso).toHaveBeenCalledWith(10, [
      { servicioId: 100, duracionMin: 25, precio: 60 },
    ]);
  });

  it("Profesionales: sin nada propio se guarda como siempre", async () => {
    await montar("recursos");
    vi.mocked(apiConfigAgenda.actualizarRecurso).mockResolvedValue(JUAN);
    fireEvent.click(screen.getByRole("button", { name: "Editar Juan" }));
    await act(async () => {});
    const dialogo = screen.getByRole("dialog", { name: "Editar Juan" });
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    });
    expect(apiConfigAgenda.actualizarRecurso).toHaveBeenCalled();
    expect(apiConfigAgenda.guardarServiciosRecurso).not.toHaveBeenCalled();
  });

  it("Profesionales: no deja guardar sin sucursal", async () => {
    await montar("recursos");
    fireEvent.click(screen.getByRole("button", { name: "Nuevo barbero" }));
    await act(async () => {});
    const dialogo = screen.getByRole("dialog", { name: "Nuevo barbero" });
    fireEvent.change(within(dialogo).getByLabelText("Nombre"), { target: { value: "Pedro" } });
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    });
    expect(within(dialogo).getByText("Elegí al menos una sucursal donde atiende.")).toBeInTheDocument();
    expect(apiConfigAgenda.crearRecurso).not.toHaveBeenCalled();
  });

  it("Excepciones: lista las del recurso y crea un día que no trabaja", async () => {
    vi.mocked(apiConfigAgenda.excepciones).mockResolvedValue([
      { id: 1, recursoId: 10, fecha: "2099-12-24", tramos: [{ desde: "09:00", hasta: "12:00" }] },
    ]);
    await montar("excepciones");
    expect(screen.getByText(/24\/12\/2099/)).toBeInTheDocument();
    expect(screen.getByText("09:00-12:00")).toBeInTheDocument();

    vi.mocked(apiConfigAgenda.crearExcepcion).mockResolvedValue({
      id: 2,
      recursoId: 10,
      fecha: "2099-12-25",
      tramos: [],
    });
    fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: "2099-12-25" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Guardar excepción" }));
    });
    expect(apiConfigAgenda.crearExcepcion).toHaveBeenCalledWith(10, { fecha: "2099-12-25", tramos: [] });
  });

  it("Bloqueos: si quedan citas adentro, las muestra sin cancelar nada", async () => {
    vi.mocked(apiConfigAgenda.crearBloqueo).mockResolvedValue({
      id: 5,
      recursoId: 10,
      sucursalId: null,
      inicio: "2099-12-24T04:00:00.000Z",
      fin: "2099-12-25T04:00:00.000Z",
      motivo: "Vacaciones",
      citasAfectadas: [
        {
          id: 77,
          codigo: "C-077",
          estado: "CONFIRMADA",
          inicio: "2099-12-24T14:00:00.000Z",
          fin: "2099-12-24T14:30:00.000Z",
          cliente: { nombre: "María López" },
          lineas: [{ servicio: "Corte clásico", recurso: "Juan" }],
        },
      ],
    });
    await montar("bloqueos");
    expect(screen.getByText("No hay bloqueos cargados.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2099-12-24" } });
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "Vacaciones" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Bloquear" }));
    });

    expect(apiConfigAgenda.crearBloqueo).toHaveBeenCalledWith({
      recursoId: 10,
      sucursalId: null,
      inicio: "2099-12-24T04:00:00.000Z",
      fin: "2099-12-25T04:00:00.000Z",
      motivo: "Vacaciones",
    });
    const alerta = screen.getByRole("alert");
    expect(alerta).toHaveTextContent("1 cita queda dentro del bloqueo");
    expect(alerta).toHaveTextContent("No se canceló ninguna");
    expect(alerta).toHaveTextContent("María López · 24/12/2099 10:00 a 10:30");
    expect(alerta).toHaveTextContent("Corte clásico con Juan");
  });

  it("Bloqueos: el fin tiene que ser posterior al inicio", async () => {
    await montar("bloqueos");
    fireEvent.click(screen.getByLabelText("Todo el día"));
    fireEvent.change(screen.getByLabelText("Hora de inicio"), { target: { value: "15:00" } });
    fireEvent.change(screen.getByLabelText("Hora de fin"), { target: { value: "14:00" } });
    expect(screen.getByText("El fin tiene que ser posterior al inicio.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bloquear" })).toBeDisabled();
  });
});

describe("Horarios", () => {
  it("muestra la semana tipo de la sucursal con varios tramos por día y lo de las otras", async () => {
    await montar("horarios");
    expect(screen.getByLabelText("Lunes: desde (tramo 1)")).toHaveValue("09:00");
    expect(screen.getByLabelText("Lunes: hasta (tramo 2)")).toHaveValue("19:00");
    expect(screen.getByText(/También atiende en:/).parentElement).toHaveTextContent(
      "Sur: Mar 09:00-18:00",
    );
  });

  it("valida que el fin sea posterior al inicio y no deja guardar", async () => {
    await montar("horarios");
    fireEvent.change(screen.getByLabelText("Lunes: hasta (tramo 1)"), { target: { value: "08:00" } });
    expect(screen.getByRole("alert")).toHaveTextContent("termina antes de empezar");
    expect(screen.getByRole("button", { name: "Guardar horario" })).toBeDisabled();
  });

  it("valida que dos tramos del mismo día no se pisen", async () => {
    await montar("horarios");
    fireEvent.change(screen.getByLabelText("Lunes: desde (tramo 2)"), { target: { value: "12:00" } });
    expect(screen.getByRole("alert")).toHaveTextContent("Los tramos 09:00-13:00 y 12:00-19:00 se pisan.");
    expect(screen.getByRole("button", { name: "Guardar horario" })).toBeDisabled();
  });

  it("copia un día a otros y al guardar no pierde lo de la otra sucursal", async () => {
    vi.mocked(apiConfigAgenda.guardarHorarios).mockResolvedValue({ tramos: [] });
    await montar("horarios");
    fireEvent.click(screen.getAllByRole("button", { name: "Copiar a otros días" })[0]);
    const grupo = screen.getByRole("group", { name: "Copiar el Lunes a" });
    fireEvent.click(within(grupo).getByLabelText("Martes"));
    fireEvent.click(within(grupo).getByRole("button", { name: "Copiar" }));
    expect(screen.getByLabelText("Martes: desde (tramo 2)")).toHaveValue("14:00");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Guardar horario" }));
    });
    const [id, tramos] = vi.mocked(apiConfigAgenda.guardarHorarios).mock.calls[0];
    expect(id).toBe(10);
    expect(tramos).toContainEqual({ sucursalId: 2, dia: 2, desde: "09:00", hasta: "18:00" });
    expect(tramos.filter((t) => t.sucursalId === 1)).toHaveLength(4);
    expect(screen.getByText("Horario guardado.")).toBeInTheDocument();
  });

  it("muestra HORARIO_SUPERPUESTO cuando el backend lo rechaza", async () => {
    vi.mocked(apiConfigAgenda.guardarHorarios).mockRejectedValue(
      Object.assign(new Error("Juan ya trabaja en Sur el martes de 09:00 a 18:00"), {
        status: 400,
        codigo: "HORARIO_SUPERPUESTO",
      }),
    );
    await montar("horarios");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Guardar horario" }));
    });
    expect(screen.getByText(/Se pisa con el horario que ya tiene en otra sucursal/)).toHaveTextContent(
      "Juan ya trabaja en Sur el martes de 09:00 a 18:00",
    );
  });
});

/**
 * QA ronda 1 (06-oct): guardar un horario o una excepción que deja citas
 * afuera las lista para reprogramarlas (M-06), y el bloqueo de día completo
 * se lee "todo el día" (B-28).
 */
describe("citas afectadas y bloqueos de día completo", () => {
  const AFECTADA = {
    id: 46,
    codigo: "C-046",
    estado: "RESERVADA",
    inicio: "2099-10-09T14:00:00.000Z",
    fin: "2099-10-09T14:45:00.000Z",
    cliente: { nombre: "Carla Pisa" },
    lineas: [{ servicio: "Corte clásico", recurso: "Juan" }],
  };

  it("M-06: guardar el horario lista las citas que quedan fuera", async () => {
    vi.mocked(apiConfigAgenda.guardarHorarios).mockResolvedValue({ tramos: [], citasAfectadas: [AFECTADA] });
    await montar("horarios");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Guardar horario" }));
    });
    const alerta = screen.getByRole("alert");
    expect(alerta).toHaveTextContent("1 cita queda fuera del nuevo horario");
    expect(alerta).toHaveTextContent("Carla Pisa · 09/10/2099 10:00 a 10:45");
    expect(alerta).toHaveTextContent("No se canceló ninguna");
  });

  it("M-06: un backend que no manda las afectadas no muestra nada de más", async () => {
    vi.mocked(apiConfigAgenda.guardarHorarios).mockResolvedValue({ tramos: [] });
    await montar("horarios");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Guardar horario" }));
    });
    expect(screen.getByText("Horario guardado.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("M-06: una excepción que deja citas afuera las lista", async () => {
    vi.mocked(apiConfigAgenda.crearExcepcion).mockResolvedValue({
      id: 2,
      recursoId: 10,
      fecha: "2099-10-09",
      tramos: [],
      citasAfectadas: [AFECTADA],
    });
    await montar("excepciones");
    fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: "2099-10-09" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Guardar excepción" }));
    });
    const alerta = screen.getByRole("alert");
    expect(alerta).toHaveTextContent("1 cita queda fuera del horario de ese día");
    expect(alerta).toHaveTextContent("Carla Pisa");
  });

  it("B-28: un bloqueo de medianoche a medianoche se lee 'todo el día'", async () => {
    vi.mocked(apiConfigAgenda.bloqueos).mockResolvedValue([
      {
        id: 1,
        recursoId: 10,
        sucursalId: null,
        inicio: "2099-10-08T04:00:00.000Z",
        fin: "2099-10-09T04:00:00.000Z",
        motivo: "Curso",
      },
      {
        id: 2,
        recursoId: 10,
        sucursalId: null,
        inicio: "2099-12-20T04:00:00.000Z",
        fin: "2099-12-25T04:00:00.000Z",
        motivo: "Vacaciones",
      },
      {
        id: 3,
        recursoId: 10,
        sucursalId: null,
        inicio: "2099-11-03T13:00:00.000Z",
        fin: "2099-11-03T17:00:00.000Z",
        motivo: "Médico",
      },
    ]);
    await montar("bloqueos");
    expect(screen.getByText("08/10/2099 · todo el día")).toBeInTheDocument();
    expect(screen.getByText("del 20/12/2099 al 24/12/2099 · todo el día")).toBeInTheDocument();
    expect(screen.getByText("03/11/2099 09:00 a 13:00")).toBeInTheDocument();
  });
});

// QA S2-03 (ronda 2 del spa, §7.3): desactivar un profesional, un espacio o
// un servicio no cancela nada, pero lista las citas que quedan con él.
describe("desactivar lista las citas afectadas", () => {
  const AFECTADA = {
    id: 72,
    codigo: "C-0072",
    estado: "RESERVADA",
    inicio: "2099-10-07T17:15:00.000Z",
    fin: "2099-10-07T18:15:00.000Z",
    cliente: { nombre: "Marta Quispe" },
    lineas: [{ servicio: "Corte clásico", recurso: "Juan" }],
  };

  it("un profesional desactivado muestra sus citas para reprogramar", async () => {
    vi.mocked(apiConfigAgenda.actualizarRecurso).mockResolvedValue({
      ...JUAN,
      activo: false,
      citasAfectadas: [AFECTADA],
    });
    await montar("recursos");
    fireEvent.click(screen.getByRole("button", { name: "Editar Juan" }));
    await act(async () => {});
    const dialogo = screen.getByRole("dialog");
    fireEvent.click(within(dialogo).getByRole("checkbox", { name: /^Activo/ }));
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    });
    expect(vi.mocked(apiConfigAgenda.actualizarRecurso).mock.calls[0][1]).toMatchObject({ activo: false });
    const alerta = screen.getByRole("alert");
    expect(alerta).toHaveTextContent('1 cita queda con "Juan", que quedó inactivo');
    expect(alerta).toHaveTextContent("Marta Quispe");
    expect(alerta).toHaveTextContent("No se canceló ninguna");
  });

  it("un servicio se desactiva desde la agenda y lista sus citas", async () => {
    vi.mocked(apiConfigAgenda.actualizarServicio).mockResolvedValue({
      ...CORTE,
      activo: false,
      citasAfectadas: [AFECTADA],
    });
    await montar("servicios");
    fireEvent.click(screen.getByRole("button", { name: "Editar Corte clásico" }));
    const dialogo = screen.getByRole("dialog", { name: "Corte clásico" });
    fireEvent.click(within(dialogo).getByRole("checkbox", { name: /^Activo/ }));
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    });
    expect(vi.mocked(apiConfigAgenda.actualizarServicio).mock.calls[0][1]).toMatchObject({ activo: false });
    expect(screen.getByRole("alert")).toHaveTextContent('1 cita queda con "Corte clásico", que quedó desactivado');
  });

  it("sin citas afectadas no aparece ningún aviso de más", async () => {
    vi.mocked(apiConfigAgenda.actualizarRecurso).mockResolvedValue({ ...JUAN, activo: false });
    await montar("recursos");
    fireEvent.click(screen.getByRole("button", { name: "Editar Juan" }));
    await act(async () => {});
    const dialogo = screen.getByRole("dialog");
    fireEvent.click(within(dialogo).getByRole("checkbox", { name: /^Activo/ }));
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
