import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DominioPermisos, EventoRol, PermisoCatalogo, RolNegocio, SesionUsuario } from "../../types";

/**
 * La pantalla Roles (PLAN-ROLES-NEGOCIO): lista, crear, renombrar, editar
 * permisos por dominio (con alcance), el Administrador en sólo lectura,
 * borrar con reasignación y la bitácora. El API de roles se programa contra
 * el contrato de §8 y acá va mockeado.
 */

const sesion = vi.hoisted(() => ({ actor: null as unknown as SesionUsuario }));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({ usuario: sesion.actor }),
}));

vi.mock("../../lib/roles", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/roles")>();
  return {
    ...real,
    apiRoles: {
      listar: vi.fn(),
      catalogo: vi.fn(),
      crear: vi.fn(),
      editar: vi.fn(),
      borrar: vi.fn(),
      bitacora: vi.fn(),
      bitacoraDe: vi.fn(),
    },
  };
});

import { ApiError } from "../../lib/api";
import { apiRoles } from "../../lib/roles";
import Roles from "./Roles";

const permiso = (codigo: string, nombre: string, extra: Partial<PermisoCatalogo> = {}): PermisoCatalogo => ({
  codigo,
  nombre,
  descripcion: `Descripción de ${nombre}.`,
  sensible: false,
  admitePropio: false,
  disponible: true,
  otorgable: true,
  ...extra,
});

const CATALOGO: DominioPermisos[] = [
  {
    dominio: "Ventas",
    nombre: "Ventas",
    permisos: [permiso("ventas.vender", "Vender"), permiso("ventas.anular", "Anular ventas")],
  },
  {
    dominio: "Agenda",
    nombre: "Agenda",
    permisos: [
      permiso("agenda.ver", "Ver la agenda", { admitePropio: true }),
      permiso("agenda.configurar", "Configurar la agenda"),
    ],
  },
  {
    dominio: "Reportes",
    nombre: "Reportes",
    permisos: [
      permiso("reportes.rentabilidad", "Rentabilidad", { disponible: false }),
      permiso("gastos.gestionar", "Gastos", { otorgable: false }),
    ],
  },
];

function rol(id: number, nombre: string, extra: Partial<RolNegocio> = {}): RolNegocio {
  return { id, nombre, descripcion: null, esAdministrador: false, plantilla: null, usuarios: 0, personal: 0, permisos: [], ...extra };
}
const ADMINISTRADOR = rol(1, "Administrador", { esAdministrador: true, usuarios: 1 });
const CAJERO = rol(3, "Cajero", {
  usuarios: 2,
  personal: 1,
  permisos: [
    { codigo: "ventas.vender", alcance: "GENERAL" },
    { codigo: "gastos.gestionar", alcance: "GENERAL" },
  ],
});
const AYUDANTE = rol(7, "Ayudante");
const ROLES = [ADMINISTRADOR, CAJERO, AYUDANTE];

async function montar() {
  render(<Roles />);
  await act(async () => {});
}

/** Abre un dominio plegado del editor. */
function abrirDominio(nombre: string) {
  fireEvent.click(screen.getByText(nombre, { selector: "summary span" }));
}

const editor = () => screen.getByRole("dialog");

beforeEach(() => {
  vi.clearAllMocks();
  sesion.actor = {
    id: 1,
    username: "duena",
    rol: "SUPERVISOR",
    rolNombre: "Encargada",
    esAdministrador: false,
    permisos: ["roles.gestionar", "ventas.vender", "ventas.anular", "agenda.ver", "agenda.configurar"],
    permisosPropios: [],
  };
  vi.mocked(apiRoles.listar).mockResolvedValue(ROLES);
  vi.mocked(apiRoles.catalogo).mockResolvedValue(CATALOGO);
  vi.mocked(apiRoles.bitacoraDe).mockResolvedValue([]);
});

describe("la lista", () => {
  it("cada rol con cuánta gente lo tiene; el Administrador con candado", async () => {
    await montar();
    const lista = screen.getByRole("list", { name: "Roles del negocio" });
    const cajero = within(lista).getByRole("button", { name: "Ver el rol Cajero" });
    expect(cajero).toHaveTextContent("2 usuarios · 1 en personal");
    expect(cajero).toHaveTextContent("2 permisos");
    const admin = within(lista).getByRole("button", { name: "Ver el rol Administrador" });
    expect(admin).toHaveTextContent("Sólo lectura");
    expect(admin).toHaveTextContent("Todos los permisos");
  });
});

describe("crear un rol", () => {
  it("con nombre y permisos por dominio", async () => {
    vi.mocked(apiRoles.crear).mockResolvedValue(rol(9, "Ayudante de caja"));
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Nuevo rol" }));
    fireEvent.change(within(editor()).getByLabelText(/^Nombre/), { target: { value: "Ayudante de caja" } });
    abrirDominio("Ventas");
    fireEvent.click(within(editor()).getByLabelText(/Vender/));
    await act(async () => {
      fireEvent.click(within(editor()).getByRole("button", { name: "Guardar" }));
    });
    expect(apiRoles.crear).toHaveBeenCalledWith({
      nombre: "Ayudante de caja",
      permisos: [{ codigo: "ventas.vender", alcance: "GENERAL" }],
    });
    expect(screen.getByText('Rol "Ayudante de caja" creado.')).toBeInTheDocument();
    expect(apiRoles.listar).toHaveBeenCalledTimes(2);
  });

  it("un permiso que admite 'sólo lo suyo' elige el alcance", async () => {
    vi.mocked(apiRoles.crear).mockResolvedValue(rol(9, "Estilista"));
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Nuevo rol" }));
    fireEvent.change(within(editor()).getByLabelText(/^Nombre/), { target: { value: "Estilista" } });
    abrirDominio("Agenda");
    fireEvent.click(within(editor()).getByLabelText(/Ver la agenda/));
    const alcance = within(editor()).getByRole("radiogroup", { name: "Alcance de Ver la agenda" });
    expect(within(alcance).getByRole("radio", { name: "General" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(within(alcance).getByRole("radio", { name: "Sólo lo suyo" }));
    await act(async () => {
      fireEvent.click(within(editor()).getByRole("button", { name: "Guardar" }));
    });
    expect(apiRoles.crear).toHaveBeenCalledWith({
      nombre: "Estilista",
      permisos: [{ codigo: "agenda.ver", alcance: "PROPIO" }],
    });
  });

  it("lo que el plan no incluye o quien edita no tiene, apagado y con el motivo", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Nuevo rol" }));
    abrirDominio("Reportes");
    expect(within(editor()).getByLabelText(/Rentabilidad/)).toBeDisabled();
    expect(within(editor()).getByText("Tu plan no lo incluye.")).toBeInTheDocument();
    expect(within(editor()).getByLabelText(/^Gastos/)).toBeDisabled();
    expect(within(editor()).getByText("No lo tenés, así que no lo podés dar.")).toBeInTheDocument();
  });

  it("quien tiene un permiso sólo sobre lo suyo no puede dar el general", async () => {
    sesion.actor = { ...sesion.actor, permisosPropios: ["agenda.ver"] };
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Nuevo rol" }));
    abrirDominio("Agenda");
    fireEvent.click(within(editor()).getByLabelText(/Ver la agenda/));
    const alcance = within(editor()).getByRole("radiogroup", { name: "Alcance de Ver la agenda" });
    expect(within(alcance).getByRole("radio", { name: "Sólo lo suyo" })).toHaveAttribute("aria-checked", "true");
    expect(within(alcance).getByRole("radio", { name: "General" })).toBeDisabled();
  });

  it("un nombre repetido lo dice en palabras (409 NOMBRE_REPETIDO)", async () => {
    vi.mocked(apiRoles.crear).mockRejectedValue(new ApiError("Conflict", 409, { codigo: "NOMBRE_REPETIDO" }));
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Nuevo rol" }));
    fireEvent.change(within(editor()).getByLabelText(/^Nombre/), { target: { value: "Cajero" } });
    await act(async () => {
      fireEvent.click(within(editor()).getByRole("button", { name: "Guardar" }));
    });
    expect(within(editor()).getByText("Ya hay un rol con ese nombre.")).toBeInTheDocument();
  });
});

describe("editar un rol", () => {
  it("renombrar manda sólo el nombre (la bitácora distingue renombrar de cambiar permisos)", async () => {
    vi.mocked(apiRoles.editar).mockResolvedValue({ ...CAJERO, nombre: "Caja" });
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Ver el rol Cajero" }));
    fireEvent.change(within(editor()).getByLabelText(/^Nombre/), { target: { value: "Caja" } });
    await act(async () => {
      fireEvent.click(within(editor()).getByRole("button", { name: "Guardar" }));
    });
    expect(apiRoles.editar).toHaveBeenCalledWith(3, { nombre: "Caja" });
  });

  it("cambiar permisos manda la lista completa, sin el nombre", async () => {
    vi.mocked(apiRoles.editar).mockResolvedValue(CAJERO);
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Ver el rol Cajero" }));
    abrirDominio("Ventas");
    expect(within(editor()).getByLabelText(/^Vender/)).toBeChecked();
    fireEvent.click(within(editor()).getByLabelText(/Anular ventas/));
    await act(async () => {
      fireEvent.click(within(editor()).getByRole("button", { name: "Guardar" }));
    });
    expect(apiRoles.editar).toHaveBeenCalledWith(3, {
      permisos: [
        { codigo: "ventas.vender", alcance: "GENERAL" },
        { codigo: "gastos.gestionar", alcance: "GENERAL" },
        { codigo: "ventas.anular", alcance: "GENERAL" },
      ],
    });
  });

  it("un permiso que el rol trae y quien edita no tiene se puede sacar, pero no volver a dar", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Ver el rol Cajero" }));
    abrirDominio("Reportes");
    const gastos = within(editor()).getByLabelText(/^Gastos/);
    expect(gastos).toBeChecked();
    expect(gastos).toBeEnabled();
    fireEvent.click(gastos);
    expect(gastos).not.toBeChecked();
    expect(gastos).toBeDisabled();
  });

  it("sin cambios, guardar no llama al backend", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Ver el rol Cajero" }));
    await act(async () => {
      fireEvent.click(within(editor()).getByRole("button", { name: "Guardar" }));
    });
    expect(apiRoles.editar).not.toHaveBeenCalled();
  });

  it("el Administrador se ve en sólo lectura, con el candado", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Ver el rol Administrador" }));
    expect(within(editor()).getByText(/El Administrador es el rol del dueño/)).toBeInTheDocument();
    expect(within(editor()).queryByRole("button", { name: "Guardar" })).toBeNull();
    expect(within(editor()).queryByRole("button", { name: "Borrar" })).toBeNull();
    abrirDominio("Ventas");
    expect(within(editor()).getByLabelText(/^Vender/)).toBeChecked();
    expect(within(editor()).getByLabelText(/^Vender/)).toBeDisabled();
  });

  it("muestra el historial del rol", async () => {
    const evento: EventoRol = {
      id: 1,
      fecha: "2026-10-07T15:00:00.000Z",
      accion: "PERMISOS",
      rolId: 3,
      rolNombre: "Cajero",
      detalle: "+ Anular ventas",
      autor: { id: 1, nombre: "Omar" },
      porSoporte: false,
    };
    vi.mocked(apiRoles.bitacoraDe).mockResolvedValue([evento]);
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Ver el rol Cajero" }));
    await act(async () => {
      fireEvent.click(within(editor()).getByRole("button", { name: "Historial de cambios" }));
    });
    expect(apiRoles.bitacoraDe).toHaveBeenCalledWith(3);
    expect(within(editor()).getByText("+ Anular ventas")).toBeInTheDocument();
  });
});

describe("borrar un rol", () => {
  async function borrar(nombre: string) {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: `Ver el rol ${nombre}` }));
    fireEvent.click(within(editor()).getByRole("button", { name: "Borrar" }));
  }

  it("con gente, hay que elegir a qué rol pasan (nunca al Administrador)", async () => {
    vi.mocked(apiRoles.borrar).mockResolvedValue({});
    await borrar("Cajero");
    const dialogo = screen.getByRole("dialog", { name: 'Borrar "Cajero"' });
    expect(dialogo).toHaveTextContent("Lo tienen 2 usuarios · 1 en personal");
    const destino = within(dialogo).getByLabelText("Pasan a");
    expect(within(destino).getAllByRole("option").map((o) => o.textContent)).toEqual(["Elegí un rol…", "Ayudante"]);
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Borrar rol" }));
    });
    expect(apiRoles.borrar).not.toHaveBeenCalled();
    expect(within(dialogo).getByText("Elegí a qué rol pasan.")).toBeInTheDocument();
    fireEvent.change(destino, { target: { value: "7" } });
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Borrar rol" }));
    });
    expect(apiRoles.borrar).toHaveBeenCalledWith(3, 7);
    expect(screen.getByText('Rol "Cajero" borrado. Su gente pasó a "Ayudante".')).toBeInTheDocument();
  });

  it("sin gente se borra directo", async () => {
    vi.mocked(apiRoles.borrar).mockResolvedValue({});
    await borrar("Ayudante");
    const dialogo = screen.getByRole("dialog", { name: 'Borrar "Ayudante"' });
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Borrar rol" }));
    });
    expect(apiRoles.borrar).toHaveBeenCalledWith(7, undefined);
  });

  it("si mientras tanto alguien le asignó el rol (409), pide el destino", async () => {
    vi.mocked(apiRoles.borrar).mockRejectedValue(new ApiError("Conflict", 409, { codigo: "REASIGNAR_REQUERIDO" }));
    await borrar("Ayudante");
    const dialogo = screen.getByRole("dialog", { name: 'Borrar "Ayudante"' });
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Borrar rol" }));
    });
    expect(within(dialogo).getByText("El rol tiene gente: elegí a qué rol pasarla.")).toBeInTheDocument();
    expect(within(dialogo).getByLabelText("Pasan a")).toBeInTheDocument();
  });
});

describe("la bitácora", () => {
  it("dice quién cambió qué, y lo que hizo el soporte", async () => {
    vi.mocked(apiRoles.bitacora).mockResolvedValue([
      { id: 2, fecha: "2026-10-07T16:00:00.000Z", accion: "RENOMBRAR", rolId: 3, rolNombre: "Caja", detalle: "Cajero → Caja", autor: { id: 1, nombre: "Omar" }, porSoporte: false },
      { id: 1, fecha: "2026-10-07T15:00:00.000Z", accion: "RESTABLECER", rolId: 3, rolNombre: "Cajero", detalle: "Motivo: pedido del dueño", autor: null, porSoporte: true },
    ]);
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Bitácora" }));
    await act(async () => {});
    const lista = screen.getByRole("list", { name: "Bitácora de roles" });
    expect(lista).toHaveTextContent("Omar renombró Caja");
    expect(lista).toHaveTextContent("Soporte de BamarDev restableció Cajero");
    expect(lista).toHaveTextContent("Motivo: pedido del dueño");
  });
});
