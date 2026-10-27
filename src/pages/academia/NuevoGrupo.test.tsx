import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ESPERA_CHOQUES_MS } from "../../lib/academia/choques";
import { ApiError } from "../../lib/api";
import { ajustesDePrueba, grupoDetalle } from "../../test/academiaFixtures";

/**
 * N3 · Abrir grupo con un inicio pasado (QA ronda 2, N-5; contrato #31):
 * quien configura el instituto puede elegir un inicio que ya pasó y, ante el
 * 400 FECHA_PASADA, confirmar que el grupo ya venía andando; los demás sólo
 * ven inicios futuros y, si igual llega el rechazo, el mensaje sin opción.
 */

const sesion = vi.hoisted(() => ({ configura: true, personal: false, organizacion: false }));

vi.mock("../../store/AuthContext", async () => {
  const { SESION_ADMIN, SESION_SECRETARIA } = await import("../../test/academiaFixtures");
  return {
    useAuth: () =>
      sesion.configura
        ? {
            ...SESION_ADMIN,
            usuario: {
              ...SESION_ADMIN.usuario,
              sucursalId: sesion.organizacion ? null : 1,
              sucursal: sesion.organizacion ? null : "Central",
              permisos: [...SESION_ADMIN.usuario.permisos, ...(sesion.personal ? ["personal.gestionar"] : [])],
            },
            puede: () => true,
          }
        : {
            ...SESION_SECRETARIA,
            usuario: { ...SESION_SECRETARIA.usuario, permisos: [...SESION_SECRETARIA.usuario.permisos, "academia.grupos"] },
            puede: () => true,
          },
  };
});

vi.mock("../../lib/api", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/api")>();
  return { ...real, api: { ...real.api, getSucursales: vi.fn().mockResolvedValue([]) } };
});

vi.mock("../../lib/academia/apiAcademia", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/academia/apiAcademia")>();
  return { ...real, apiAcademia: { ajustes: vi.fn(), carreras: vi.fn(), docentes: vi.fn(), crearGrupo: vi.fn(), aulas: vi.fn(), choques: vi.fn() } };
});

vi.mock("../../lib/personal", () => ({
  apiPersonal: {
    cargos: vi.fn(async () => [{ id: 5, nombre: "Docente", esAdministrador: false, permisos: [] }]),
    crear: vi.fn(),
    darAcceso: vi.fn(),
  },
}));

import { apiAcademia } from "../../lib/academia/apiAcademia";
import { apiPersonal } from "../../lib/personal";
import NuevoGrupo from "./NuevoGrupo";

const fechaPasada = (puedeConfirmar: boolean) =>
  new ApiError("El grupo no puede empezar antes del 2026-10-10, el inicio del módulo en curso.", 400, {
    codigo: "FECHA_PASADA",
    minimo: "2026-10-10",
    puedeConfirmar,
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-19T14:00:00.000Z"));
  sesion.configura = true;
  sesion.personal = false;
  sesion.organizacion = false;
  vi.mocked(apiAcademia.ajustes).mockResolvedValue(ajustesDePrueba({ franjas: [{ almacenId: null, inicio: "18:00", fin: "20:00" }] }));
  vi.mocked(apiAcademia.carreras).mockResolvedValue([
    { id: 3, nombre: "Barbería", activa: true, materias: [{ id: 31, orden: 1, nombre: "Corte", activa: true }], planes: [], cupoDefecto: 20, pctDocente: null, publicarEnPagina: false },
  ] as never);
  vi.mocked(apiAcademia.docentes).mockResolvedValue([]);
  vi.mocked(apiAcademia.aulas).mockResolvedValue([]);
  vi.mocked(apiAcademia.choques).mockResolvedValue({ hayChoques: false, aula: [], docentes: [] });
});

afterEach(() => {
  vi.useRealTimers();
});

async function montar() {
  const onCreado = vi.fn();
  render(
    <MemoryRouter>
      <NuevoGrupo onCerrar={() => {}} onCreado={onCreado} />
    </MemoryRouter>,
  );
  await act(async () => {});
  const panel = screen.getByRole("complementary", { name: "Abrir grupo" });
  fireEvent.change(within(panel).getByLabelText("Curso"), { target: { value: "3" } });
  return { panel, onCreado };
}

describe("N3 · Abrir grupo con un inicio pasado", () => {
  it("quien configura elige un inicio pasado y confirma que el grupo ya venía andando", async () => {
    vi.mocked(apiAcademia.crearGrupo).mockRejectedValueOnce(fechaPasada(true)).mockResolvedValueOnce(grupoDetalle());
    const { panel, onCreado } = await montar();
    const empieza = within(panel).getByLabelText("Empieza el");
    // El primero sigue siendo el próximo inicio; los pasados van aparte.
    expect(empieza).toHaveValue("2026-11");
    expect(within(empieza).getByRole("group", { name: /Ya empezó/ })).toBeInTheDocument();
    fireEvent.change(empieza, { target: { value: "2026-08" } });
    expect(within(panel).getByText(/Esa fecha ya pasó: elegila sólo para cargar un grupo que ya estaba en clases/)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "Abrir grupo" }));
    });
    expect(apiAcademia.crearGrupo).toHaveBeenCalledTimes(1);
    expect(vi.mocked(apiAcademia.crearGrupo).mock.calls[0][0]).not.toHaveProperty("confirmarInicioPasado");
    const aviso = within(panel).getByRole("alert");
    expect(aviso).toHaveTextContent("El 10 de agosto ya pasó.");
    expect(aviso).toHaveTextContent("El primer inicio posible es el 10 de octubre.");
    expect(within(panel).getByRole("button", { name: "Abrir grupo" })).toBeDisabled();
    await act(async () => {
      fireEvent.click(within(aviso).getByRole("button", { name: "El grupo ya venía andando" }));
    });
    expect(apiAcademia.crearGrupo).toHaveBeenLastCalledWith(expect.objectContaining({ fechaInicio: "2026-08-10", confirmarInicioPasado: true }));
    expect(onCreado).toHaveBeenCalled();
  });

  it("'Elegir otra fecha' saca el aviso sin mandar nada", async () => {
    vi.mocked(apiAcademia.crearGrupo).mockRejectedValueOnce(fechaPasada(true));
    const { panel } = await montar();
    fireEvent.change(within(panel).getByLabelText("Empieza el"), { target: { value: "2026-09" } });
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "Abrir grupo" }));
    });
    fireEvent.click(within(panel).getByRole("button", { name: "Elegir otra fecha" }));
    expect(within(panel).queryByRole("alert")).not.toBeInTheDocument();
    expect(apiAcademia.crearGrupo).toHaveBeenCalledTimes(1);
  });

  it("sin academia.configurar: sólo inicios futuros, y el rechazo se explica sin opción de confirmar", async () => {
    sesion.configura = false;
    vi.mocked(apiAcademia.crearGrupo).mockRejectedValueOnce(fechaPasada(false));
    const { panel } = await montar();
    const empieza = within(panel).getByLabelText("Empieza el");
    expect(within(empieza).queryByRole("group", { name: /Ya empezó/ })).not.toBeInTheDocument();
    expect(within(empieza).queryByRole("option", { name: /agosto/ })).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "Abrir grupo" }));
    });
    const aviso = within(panel).getByRole("alert");
    expect(aviso).toHaveTextContent("El primer inicio posible es el 10 de octubre.");
    expect(within(aviso).queryByRole("button")).not.toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Abrir grupo" })).toBeEnabled();
  });
});

describe("C9 · el docente por módulo sin salir de «Abrir grupo»", () => {
  const MARCO = { personalId: 7, nombre: "Marco Rojas", sedes: [{ id: 1, nombre: "Central" }], pctDocente: null, retencionPct: null, tieneLogin: true };
  const LUCIA = { personalId: 8, nombre: "Lucía Paz", sedes: [{ id: 1, nombre: "Central" }], pctDocente: null, retencionPct: null, tieneLogin: false };

  /** Un curso de tres módulos, para que «el mismo en todos» tenga a quién pasarlo. */
  function cursoDeTres() {
    vi.mocked(apiAcademia.carreras).mockResolvedValue([
      {
        id: 3,
        nombre: "Barbería",
        activa: true,
        materias: [
          { id: 31, orden: 1, nombre: "Corte", activa: true },
          { id: 32, orden: 2, nombre: "Degradados", activa: true },
          { id: 33, orden: 3, nombre: "Barba", activa: true },
        ],
        planes: [],
        cupoDefecto: 20,
        pctDocente: null,
        publicarEnPagina: false,
      },
    ] as never);
  }

  const selectDe = (panel: HTMLElement, n: number) => within(panel).getByLabelText(`Docente de M${n}`) as HTMLSelectElement;

  it("«El mismo docente en todos» pasa el elegido en un módulo a los demás, y el grupo se manda con él en cada uno", async () => {
    cursoDeTres();
    vi.mocked(apiAcademia.docentes).mockResolvedValue([MARCO, LUCIA]);
    vi.mocked(apiAcademia.crearGrupo).mockResolvedValue(grupoDetalle());
    const { panel } = await montar();
    // Sin docente elegido no hay atajo que ofrecer.
    expect(within(panel).queryByRole("button", { name: /El mismo docente en todos/ })).not.toBeInTheDocument();
    fireEvent.change(selectDe(panel, 2), { target: { value: "7" } });
    expect(selectDe(panel, 1)).toHaveValue("");
    fireEvent.click(within(panel).getByRole("button", { name: "El mismo docente en todos" }));
    for (const n of [1, 2, 3]) expect(selectDe(panel, n)).toHaveValue("7");
    // Ya están todos iguales: el atajo desaparece.
    expect(within(panel).queryByRole("button", { name: /El mismo docente en todos/ })).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "Abrir grupo" }));
    });
    expect(vi.mocked(apiAcademia.crearGrupo).mock.calls[0][0].materias).toEqual([
      { materiaId: 31, personalId: 7 },
      { materiaId: 32, personalId: 7 },
      { materiaId: 33, personalId: 7 },
    ]);
  });

  it("sin permiso de Personal no se ofrece dar de alta un docente", async () => {
    const { panel } = await montar();
    expect(within(selectDe(panel, 1)).queryByRole("option", { name: /Nuevo docente/ })).not.toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: "Nuevo docente" })).not.toBeInTheDocument();
  });

  it("con el instituto sin docentes se ofrece «Nuevo docente»; se crea con su sede, queda elegido en ese módulo y entra a la lista", async () => {
    sesion.personal = true;
    vi.mocked(apiPersonal.crear).mockResolvedValue({ id: 21, nombre: "Pedro Gil" } as never);
    const { panel } = await montar();
    expect(within(panel).getByText(/Todavía no hay docentes en esta sede/)).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("button", { name: "Nuevo docente" }));
    await act(async () => {}); // llegan los cargos
    fireEvent.change(within(panel).getByLabelText("Nombre"), { target: { value: " Pedro Gil " } });
    fireEvent.change(within(panel).getByLabelText(/Teléfono/), { target: { value: "70011223" } });
    expect(within(panel).getByText("Central")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "Guardar docente" }));
    });
    expect(apiPersonal.crear).toHaveBeenCalledWith({ nombre: "Pedro Gil", telefono: "70011223", cargoRolId: 5, sucursalIds: [1] });
    expect(apiPersonal.darAcceso).not.toHaveBeenCalled();
    // Queda elegido en el módulo y en la lista de los demás.
    expect(selectDe(panel, 1)).toHaveValue("21");
    expect(within(selectDe(panel, 1)).getByRole("option", { name: "Pedro Gil" })).toBeInTheDocument();
    expect(within(panel).queryByLabelText("Nombre")).not.toBeInTheDocument();
    vi.mocked(apiAcademia.crearGrupo).mockResolvedValue(grupoDetalle());
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "Abrir grupo" }));
    });
    expect(vi.mocked(apiAcademia.crearGrupo).mock.calls[0][0].materias).toEqual([{ materiaId: 31, personalId: 21 }]);
  });

  it("«+ Nuevo docente…» en el desplegable de un módulo, con acceso: encadena el alta y el acceso en un gesto", async () => {
    sesion.personal = true;
    cursoDeTres();
    vi.mocked(apiAcademia.docentes).mockResolvedValue([MARCO]);
    vi.mocked(apiPersonal.crear).mockResolvedValue({ id: 22, nombre: "Rosa Luna" } as never);
    vi.mocked(apiPersonal.darAcceso).mockResolvedValue({ id: 22 } as never);
    const { panel } = await montar();
    fireEvent.change(selectDe(panel, 3), { target: { value: "nuevo-docente" } });
    // El módulo sigue sin docente hasta que se guarde.
    expect(selectDe(panel, 3)).toHaveValue("");
    expect(within(panel).getByText(/Nuevo docente · M3 Barba/)).toBeInTheDocument();
    await act(async () => {}); // llegan los cargos
    fireEvent.change(within(panel).getByLabelText("Nombre"), { target: { value: "Rosa Luna" } });
    fireEvent.click(within(panel).getByRole("switch", { name: "Darle acceso al sistema" }));
    fireEvent.change(within(panel).getByLabelText("Usuario"), { target: { value: "Rosa.Luna" } });
    fireEvent.change(within(panel).getByLabelText("Contraseña"), { target: { value: "secreta1" } });
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "Guardar docente" }));
    });
    expect(apiPersonal.crear).toHaveBeenCalledWith({ nombre: "Rosa Luna", telefono: null, cargoRolId: 5, sucursalIds: [1] });
    // La sesión de la prueba ya es de una sede: no manda sucursalId.
    expect(apiPersonal.darAcceso).toHaveBeenCalledWith(22, { username: "rosa.luna", password: "secreta1", rolId: 5 });
    expect(selectDe(panel, 3)).toHaveValue("22");
    expect(within(panel).queryByRole("status")).not.toBeInTheDocument();
  });

  it("si el acceso falla, el docente igual queda guardado y elegido, y el aviso dice cómo darle el acceso", async () => {
    sesion.personal = true;
    vi.mocked(apiPersonal.crear).mockResolvedValue({ id: 23, nombre: "Ana Rios" } as never);
    vi.mocked(apiPersonal.darAcceso).mockRejectedValue(new ApiError("Tu plan no tiene más lugares para usuarios.", 409, { codigo: "CUPO_USUARIOS" }));
    const { panel } = await montar();
    fireEvent.click(within(panel).getByRole("button", { name: "Nuevo docente" }));
    await act(async () => {}); // llegan los cargos
    fireEvent.change(within(panel).getByLabelText("Nombre"), { target: { value: "Ana Rios" } });
    fireEvent.click(within(panel).getByRole("switch", { name: "Darle acceso al sistema" }));
    fireEvent.change(within(panel).getByLabelText("Usuario"), { target: { value: "ana.rios" } });
    fireEvent.change(within(panel).getByLabelText("Contraseña"), { target: { value: "secreta1" } });
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "Guardar docente" }));
    });
    expect(selectDe(panel, 1)).toHaveValue("23");
    const aviso = within(panel).getByRole("status");
    expect(aviso).toHaveTextContent("«Ana Rios» quedó guardado, pero sin acceso");
    expect(aviso).toHaveTextContent("Tu plan no tiene más lugares para usuarios.");
    expect(aviso).toHaveTextContent("Personal");
  });

  it("valida antes de llamar: nombre, usuario y clave; y si falla el alta, el error queda en el formulario", async () => {
    sesion.personal = true;
    const { panel } = await montar();
    fireEvent.click(within(panel).getByRole("button", { name: "Nuevo docente" }));
    await act(async () => {}); // llegan los cargos
    fireEvent.click(within(panel).getByRole("button", { name: "Guardar docente" }));
    expect(within(panel).getByText("Poné el nombre.")).toBeInTheDocument();
    fireEvent.change(within(panel).getByLabelText("Nombre"), { target: { value: "Ana" } });
    fireEvent.click(within(panel).getByRole("switch", { name: "Darle acceso al sistema" }));
    fireEvent.change(within(panel).getByLabelText("Usuario"), { target: { value: "a" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Guardar docente" }));
    expect(within(panel).getByText(/El usuario lleva 3 a 30/)).toBeInTheDocument();
    fireEvent.change(within(panel).getByLabelText("Usuario"), { target: { value: "ana" } });
    fireEvent.change(within(panel).getByLabelText("Contraseña"), { target: { value: "123" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Guardar docente" }));
    expect(within(panel).getByText(/al menos 6 caracteres/)).toBeInTheDocument();
    expect(apiPersonal.crear).not.toHaveBeenCalled();
    vi.mocked(apiPersonal.crear).mockRejectedValue(new ApiError("Ese nombre ya existe.", 409));
    fireEvent.change(within(panel).getByLabelText("Contraseña"), { target: { value: "secreta1" } });
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "Guardar docente" }));
    });
    expect(within(panel).getByText("Ese nombre ya existe.")).toBeInTheDocument();
    expect(apiPersonal.darAcceso).not.toHaveBeenCalled();
    expect(selectDe(panel, 1)).toHaveValue("");
  });
  it("sin un cargo «Docente» en Roles no inventa uno: lo dice y no crea nada", async () => {
    sesion.personal = true;
    vi.mocked(apiPersonal.cargos).mockResolvedValueOnce([{ id: 9, nombre: "Recepción", esAdministrador: false, permisos: [] }]);
    const { panel } = await montar();
    fireEvent.click(within(panel).getByRole("button", { name: "Nuevo docente" }));
    await act(async () => {});
    fireEvent.change(within(panel).getByLabelText("Nombre"), { target: { value: "Ana" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Guardar docente" }));
    expect(within(panel).getByText(/No hay un cargo «Docente» en Roles/)).toBeInTheDocument();
    expect(apiPersonal.crear).not.toHaveBeenCalled();
  });
});

/** Deja pasar la espera del aviso de choques (el temporizador de verdad: sólo `Date` está falseado). */
const esperarAviso = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, ESPERA_CHOQUES_MS + 80));
  });

const aulaDe = (id: number, nombre: string, extra = {}) => ({
  id,
  almacenId: 1,
  sede: { id: 1, nombre: "Central" },
  nombre,
  capacidad: null,
  activa: true,
  enUso: 0,
  ...extra,
});

describe("BACK-5 · el aula se elige de la lista de la sede", () => {
  it("ofrece las aulas activas de la sede del grupo y manda aulaId, no el texto", async () => {
    vi.mocked(apiAcademia.aulas).mockResolvedValue([aulaDe(11, "Aula 1", { capacidad: 25 }), aulaDe(12, "Taller")]);
    vi.mocked(apiAcademia.crearGrupo).mockResolvedValue(grupoDetalle());
    const { panel } = await montar();
    expect(apiAcademia.aulas).toHaveBeenCalledWith({ sede: 1, soloActivas: true });
    const aula = within(panel).getByLabelText("Aula") as HTMLSelectElement;
    expect(Array.from(aula.options, (o) => o.textContent)).toEqual(["Sin aula", "Aula 1 · 25 lugares", "Taller"]);
    fireEvent.change(aula, { target: { value: "12" } });
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "Abrir grupo" }));
    });
    const mandado = vi.mocked(apiAcademia.crearGrupo).mock.calls[0][0];
    expect(mandado.aulaId).toBe(12);
    expect(mandado).not.toHaveProperty("aula");
  });

  it("«Sin aula» no manda ninguna", async () => {
    vi.mocked(apiAcademia.aulas).mockResolvedValue([aulaDe(11, "Aula 1")]);
    vi.mocked(apiAcademia.crearGrupo).mockResolvedValue(grupoDetalle());
    const { panel } = await montar();
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "Abrir grupo" }));
    });
    const mandado = vi.mocked(apiAcademia.crearGrupo).mock.calls[0][0];
    expect(mandado).not.toHaveProperty("aulaId");
    expect(mandado).not.toHaveProperty("aula");
  });

  it("sin aulas cargadas: selector vacío, enlace «Cargar aulas» para quien configura, y se guarda igual", async () => {
    vi.mocked(apiAcademia.crearGrupo).mockResolvedValue(grupoDetalle());
    const { panel } = await montar();
    expect(within(panel).getByText(/Esta sede todavía no tiene aulas cargadas/)).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: "Cargar aulas" })).toHaveAttribute("href", "/configuracion/sedes?sede=1&ver=aulas");
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "Abrir grupo" }));
    });
    expect(apiAcademia.crearGrupo).toHaveBeenCalledTimes(1);
  });

  it("quien no configura no ve el enlace", async () => {
    sesion.configura = false;
    const { panel } = await montar();
    expect(within(panel).getByText(/Esta sede todavía no tiene aulas cargadas/)).toBeInTheDocument();
    expect(within(panel).queryByRole("link", { name: "Cargar aulas" })).not.toBeInTheDocument();
  });
});

describe("C10 · aviso de choques al abrir un grupo", () => {
  const CHOQUE_AULA = {
    grupoId: 40,
    nombre: "Base",
    carrera: { id: 3, nombre: "Barbería" },
    sede: { id: 1, nombre: "Central" },
    horario: "Lu Mi Vi 08:00–10:00",
    dias: [1, 3, 5],
    horaInicio: "08:00",
    horaFin: "10:00",
    fechaInicio: "2026-10-10",
    fechaFin: "2027-01-09",
  };
  const MARCO = { personalId: 7, nombre: "Juan Pérez", sedes: [{ id: 1, nombre: "Central" }], pctDocente: null, retencionPct: null, tieneLogin: true };

  it("sin aula ni docente elegidos no pregunta nada", async () => {
    await montar();
    await esperarAviso();
    expect(apiAcademia.choques).not.toHaveBeenCalled();
  });

  it("con choque de aula: lo dice, no bloquea y el botón pasa a «Guardar igual»", async () => {
    vi.mocked(apiAcademia.aulas).mockResolvedValue([aulaDe(11, "Aula 1")]);
    vi.mocked(apiAcademia.choques).mockResolvedValue({ hayChoques: true, aula: [CHOQUE_AULA], docentes: [] });
    vi.mocked(apiAcademia.crearGrupo).mockResolvedValue(grupoDetalle());
    const { panel } = await montar();
    fireEvent.change(within(panel).getByLabelText("Aula"), { target: { value: "11" } });
    await esperarAviso();
    expect(vi.mocked(apiAcademia.choques).mock.calls.at(-1)![0]).toMatchObject({
      almacenId: 1,
      dias: [1, 3, 5],
      aulaId: 11,
      fechaInicio: "2026-11-10",
      // Un módulo de un mes: termina el día antes del siguiente inicio.
      fechaFin: "2026-12-09",
    });
    const aviso = within(panel).getByRole("alert");
    expect(aviso).toHaveTextContent("El aula «Aula 1» ya está ocupada de Lu Mi Vi 08:00–10:00 por Barbería (Base).");
    const guardar = within(panel).getByRole("button", { name: "Guardar igual" });
    expect(guardar).toBeEnabled();
    await act(async () => {
      fireEvent.click(guardar);
    });
    expect(apiAcademia.crearGrupo).toHaveBeenCalledTimes(1);
  });

  it("con choque de docente: dice dónde ya dicta", async () => {
    vi.mocked(apiAcademia.docentes).mockResolvedValue([MARCO]);
    vi.mocked(apiAcademia.choques).mockResolvedValue({
      hayChoques: true,
      aula: [],
      docentes: [{ ...CHOQUE_AULA, personalId: 7, docente: "Juan Pérez", sede: { id: 2, nombre: "Base" }, desde: "2026-10-10", hasta: "2026-11-09" }],
    });
    const { panel } = await montar();
    fireEvent.change(within(panel).getByLabelText("Docente de M1"), { target: { value: "7" } });
    await esperarAviso();
    expect(vi.mocked(apiAcademia.choques).mock.calls.at(-1)![0]).toMatchObject({ docentes: [7] });
    expect(within(panel).getByRole("alert")).toHaveTextContent("El docente Juan Pérez ya dicta Barbería (Base) Lu Mi Vi 08:00–10:00 en Base.");
  });

  it("sin choque: ni aviso ni «Guardar igual»", async () => {
    vi.mocked(apiAcademia.aulas).mockResolvedValue([aulaDe(11, "Aula 1")]);
    vi.mocked(apiAcademia.choques).mockResolvedValue({ hayChoques: false, aula: [], docentes: [] });
    const { panel } = await montar();
    fireEvent.change(within(panel).getByLabelText("Aula"), { target: { value: "11" } });
    await esperarAviso();
    expect(apiAcademia.choques).toHaveBeenCalled();
    expect(within(panel).queryByRole("alert")).not.toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Abrir grupo" })).toBeEnabled();
  });

  it("si el aviso falla (red), lo dice en gris y guardar sigue andando", async () => {
    vi.mocked(apiAcademia.aulas).mockResolvedValue([aulaDe(11, "Aula 1")]);
    vi.mocked(apiAcademia.choques).mockRejectedValue(new Error("Failed to fetch"));
    vi.mocked(apiAcademia.crearGrupo).mockResolvedValue(grupoDetalle());
    const { panel } = await montar();
    fireEvent.change(within(panel).getByLabelText("Aula"), { target: { value: "11" } });
    await esperarAviso();
    expect(within(panel).getByText(/No pudimos revisar si el aula o el docente ya están ocupados/)).toBeInTheDocument();
    expect(within(panel).queryByRole("alert")).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "Abrir grupo" }));
    });
    expect(apiAcademia.crearGrupo).toHaveBeenCalledTimes(1);
  });

  it("al cambiar de día vuelve a preguntar una sola vez (con espera)", async () => {
    vi.mocked(apiAcademia.aulas).mockResolvedValue([aulaDe(11, "Aula 1")]);
    const { panel } = await montar();
    fireEvent.change(within(panel).getByLabelText("Aula"), { target: { value: "11" } });
    await esperarAviso();
    vi.mocked(apiAcademia.choques).mockClear();
    fireEvent.click(within(panel).getByRole("button", { name: "Martes" }));
    fireEvent.click(within(panel).getByRole("button", { name: "Jueves" }));
    expect(apiAcademia.choques).not.toHaveBeenCalled();
    await esperarAviso();
    expect(apiAcademia.choques).toHaveBeenCalledTimes(1);
    expect(vi.mocked(apiAcademia.choques).mock.calls[0][0].dias).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("ronda 1 · W3 y W10 · cambiar de sede y de curso en «Abrir grupo»", () => {
  const MARCO = { personalId: 7, nombre: "Marco Rojas", sedes: [{ id: 1, nombre: "Central" }], pctDocente: null, retencionPct: null, tieneLogin: true };
  const LUCIA = { personalId: 8, nombre: "Lucía Paz", sedes: [{ id: 2, nombre: "Norte" }], pctDocente: null, retencionPct: null, tieneLogin: false };
  const curso = (id: number, nombre: string, cupoDefecto: number | null) => ({
    id,
    nombre,
    activa: true,
    materias: [{ id: id * 10 + 1, orden: 1, nombre: "Módulo", activa: true }],
    planes: [],
    cupoDefecto,
    pctDocente: null,
    publicarEnPagina: false,
  });

  it("W3: al cambiar de sede se descarta el docente de la otra y no viaja", async () => {
    sesion.organizacion = true;
    const { api } = await import("../../lib/api");
    vi.mocked(api.getSucursales).mockResolvedValue([
      { id: 1, nombre: "Central", tipo: "SUCURSAL", activo: true, esPrincipal: true },
      { id: 2, nombre: "Norte", tipo: "SUCURSAL", activo: true, esPrincipal: false },
    ] as never);
    vi.mocked(apiAcademia.docentes).mockResolvedValue([MARCO, LUCIA]);
    vi.mocked(apiAcademia.crearGrupo).mockResolvedValue(grupoDetalle());
    const { panel } = await montar();
    await act(async () => {});
    // Arma el grupo en Central con Marco.
    fireEvent.change(within(panel).getByLabelText("Sede"), { target: { value: "1" } });
    fireEvent.change(within(panel).getByLabelText("Docente de M1"), { target: { value: "7" } });
    expect(within(panel).getByLabelText("Docente de M1")).toHaveValue("7");
    // Cambia a Norte: Marco no es de Norte, ya no puede seguir elegido ni mandarse.
    fireEvent.change(within(panel).getByLabelText("Sede"), { target: { value: "2" } });
    expect(within(panel).getByLabelText("Docente de M1")).toHaveValue("");
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "Abrir grupo" }));
    });
    const materias = vi.mocked(apiAcademia.crearGrupo).mock.calls[0][0].materias;
    expect(materias).toEqual([{ materiaId: 31 }]);
  });

  it("W10: al cambiar de curso el cupo sigue al del curso nuevo, salvo que se haya tocado", async () => {
    vi.mocked(apiAcademia.carreras).mockResolvedValue([curso(3, "Barbería", 20), curso(4, "Tatuaje", 12)] as never);
    const { panel } = await montar();
    const cupo = within(panel).getByLabelText(/^Cupo/) as HTMLInputElement;
    expect(cupo.value).toBe("20");
    expect(within(panel).getByText("Viene del curso")).toBeInTheDocument();
    fireEvent.change(within(panel).getByLabelText("Curso"), { target: { value: "4" } });
    expect(cupo.value).toBe("12");
    // Lo tocó a mano: el curso siguiente no lo pisa y el texto ya no dice que viene del curso.
    fireEvent.change(cupo, { target: { value: "15" } });
    expect(within(panel).queryByText("Viene del curso")).not.toBeInTheDocument();
    fireEvent.change(within(panel).getByLabelText("Curso"), { target: { value: "3" } });
    expect(cupo.value).toBe("15");
  });
});
