import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PermisoDeRolVista, RolNegocio, SesionUsuario, Usuario } from "../types";

/**
 * Usuarios con los roles del negocio (PLAN-ROLES-NEGOCIO): las tarjetas, los
 * filtros, el combo de rol, el detalle y el PIN salen de la lista de roles y
 * de los permisos, nunca de un nombre de rol escrito en la pantalla. El API de
 * roles se mockea con el contrato de §8.
 */

const sesion = vi.hoisted(() => ({
  /** Quién está mirando la pantalla. */
  actor: null as unknown as SesionUsuario,
  /** ¿El plan incluye la autorización con PIN? */
  conPin: true,
}));

vi.mock("../store/AuthContext", () => ({
  useAuth: () => ({
    usuario: sesion.actor,
    negocio: { id: 1, nombre: "Pollos", tipoNegocio: "RESTAURANTE" },
    incluye: (c: string) => c !== "autorizacion_pin" || sesion.conPin,
    puede: () => true,
  }),
}));

vi.mock("../lib/api", () => ({
  api: {
    getUsuarios: vi.fn(),
    getAlmacenes: vi.fn(async () => []),
    actualizarUsuario: vi.fn(),
    crearUsuario: vi.fn(),
    quitarPin: vi.fn(async () => ({ mensaje: "PIN quitado" })),
    cambiarEstadoUsuario: vi.fn(),
  },
}));

vi.mock("../lib/roles", async (importOriginal) => {
  const real = await importOriginal<typeof import("../lib/roles")>();
  return { ...real, apiRoles: { listar: vi.fn(), asignables: vi.fn(), catalogo: vi.fn() } };
});

import { api } from "../lib/api";
import { apiRoles } from "../lib/roles";
import { usuarioDe } from "../test/sesiones";
import Usuarios from "./Usuarios";

/** Nombre y dominio de cada permiso, como los manda `GET /roles` (§8). */
const NOMBRES: Record<string, [string, string]> = {
  "ventas.vender": ["Vender", "Ventas"],
  "caja.operar": ["Operar su caja", "Caja"],
};

const p = (codigo: string, alcance: PermisoDeRolVista["alcance"] = "GENERAL"): PermisoDeRolVista => ({
  codigo,
  alcance,
  nombre: NOMBRES[codigo]?.[0] ?? codigo,
  dominio: NOMBRES[codigo]?.[1] ?? null,
});

function rol(id: number, nombre: string, permisos: PermisoDeRolVista[], extra: Partial<RolNegocio> = {}): RolNegocio {
  return { id, nombre, descripcion: null, esAdministrador: false, plantilla: null, usuarios: 0, personal: 0, permisos, ...extra };
}

const ADMINISTRADOR = rol(1, "Administrador", [], { esAdministrador: true, plantilla: "ADMIN" });
const ENCARGADO = rol(2, "Encargado", [p("ventas.vender"), p("autorizar.pin"), p("usuarios.administrar")], {
  plantilla: "SUPERVISOR",
  descripcion: "Vende, cobra y autoriza con PIN.",
});
const CAJERO = rol(3, "Cajero", [p("ventas.vender"), p("caja.operar")], { plantilla: "CAJERO" });
const MESERO = rol(4, "Mesero", [p("salon.atender", "PROPIO")], { plantilla: "MESERO" });
const REPARTIDOR = rol(5, "Repartidor", [p("entregas.realizar", "PROPIO")], { plantilla: "REPARTIDOR" });
/** Uno que creó el negocio: no nace de ninguna plantilla. */
const LAVAPLATOS = rol(6, "Lavaplatos", []);
const ROLES = [ADMINISTRADOR, ENCARGADO, CAJERO, MESERO, REPARTIDOR];

function cuenta(datos: Partial<Usuario>): Usuario {
  return {
    id: 1,
    nombre: "Omar",
    usuario: "omar",
    rol: "ADMIN",
    rolId: 1,
    rolNombre: "Administrador",
    esAdministrador: true,
    activo: true,
    email: null,
    telefono: null,
    notas: null,
    zona: null,
    vehiculo: null,
    creado: "2026-09-06T23:59:00.000Z",
    ultimoLogin: null,
    sucursalId: null,
    sucursal: null,
    sucursalDesde: null,
    tienePin: false,
    ...datos,
  };
}

const OMAR = cuenta({});
const de = (r: RolNegocio, datos: Partial<Usuario>) =>
  cuenta({ rolId: r.id, rolNombre: r.nombre, esAdministrador: r.esAdministrador, rol: r.plantilla ?? "CAJERO", ...datos });
const ANA = de(CAJERO, { id: 2, nombre: "Ana", usuario: "ana" });
const LUIS = de(MESERO, { id: 3, nombre: "Luis", usuario: "luis" });
const BETO = de(CAJERO, { id: 4, nombre: "Beto", usuario: "beto", activo: false });
const ELSA = de(ENCARGADO, { id: 5, nombre: "Elsa", usuario: "elsa", tienePin: true });

async function montar(lista: Usuario[], roles: RolNegocio[] = ROLES) {
  vi.mocked(api.getUsuarios).mockResolvedValue(lista);
  vi.mocked(apiRoles.listar).mockResolvedValue(roles);
  render(<Usuarios />);
  await act(async () => {});
}

/** El número de una tarjeta de arriba. */
function kpi(etiqueta: string) {
  return within(screen.getByLabelText("Cuentas por rol"))
    .getByText(etiqueta, { selector: "span.uppercase" })
    .closest(".card")!
    .querySelector("p")!.textContent;
}

function rolesDelCombo() {
  return within(screen.getByRole("combobox")).getAllByRole("option").map((o) => o.textContent);
}

function abrir(usuario: string) {
  fireEvent.click(screen.getByRole("button", { name: new RegExp(`@${usuario}(?![a-z0-9])`) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  sesion.actor = usuarioDe("ADMIN", { id: 1, username: "omar" }, { extra: ["roles.gestionar", "usuarios.asignar_pin", "sucursales.todas"] });
  sesion.conPin = true;
  vi.mocked(apiRoles.asignables).mockResolvedValue([ENCARGADO, CAJERO, MESERO, REPARTIDOR]);
});

describe("tarjetas y filtros, uno por rol del negocio", () => {
  it("una tarjeta por rol con sus cuentas activas, más Inactivos", async () => {
    await montar([OMAR, ANA, LUIS, BETO]);
    expect(kpi("Administrador")).toBe("1");
    expect(kpi("Cajero")).toBe("1");
    expect(kpi("Mesero")).toBe("1");
    expect(kpi("Repartidor")).toBe("0");
    expect(kpi("Inactivos")).toBe("1");
  });

  it("un rol creado por el negocio tiene su tarjeta y su filtro", async () => {
    const pedro = de(LAVAPLATOS, { id: 7, nombre: "Pedro", usuario: "pedro" });
    await montar([OMAR, pedro], [...ROLES, LAVAPLATOS]);
    expect(kpi("Lavaplatos")).toBe("1");
    fireEvent.click(screen.getByRole("button", { name: "Lavaplatos" }));
    expect(screen.getByRole("button", { name: /@pedro\b/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /@omar\b/ })).not.toBeInTheDocument();
  });

  it("el filtro de un rol muestra sólo sus cuentas; Inactivos, las de baja", async () => {
    await montar([OMAR, ANA, LUIS, BETO]);
    fireEvent.click(screen.getByRole("button", { name: "Cajero" }));
    expect(screen.getByRole("button", { name: /@ana\b/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /@beto\b/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /@luis\b/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Inactivos" }));
    expect(screen.getByRole("button", { name: /@beto\b/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /@ana\b/ })).not.toBeInTheDocument();
  });

  it("con cuatro roles son cinco tarjetas: entran en una fila", async () => {
    await montar([OMAR], [ADMINISTRADOR, ENCARGADO, CAJERO, REPARTIDOR]);
    expect(screen.getByLabelText("Cuentas por rol")).toHaveClass("xl:grid-cols-5");
  });

  it("la tarjeta dice el nombre que el negocio le puso al rol", async () => {
    await montar([OMAR, de(CAJERO, { id: 2, usuario: "ana", rolNombre: "Cajera de la tarde" })]);
    const tarjeta = screen.getByRole("button", { name: /@ana\b/ });
    expect(within(tarjeta).getByText("Cajera de la tarde")).toBeInTheDocument();
  });
});

describe("crear y editar con los roles asignables", () => {
  async function llenarAlta() {
    fireEvent.click(screen.getByRole("button", { name: "Nuevo" }));
    await act(async () => {});
    fireEvent.change(screen.getByLabelText(/^Nombre/), { target: { value: "Carla Méndez" } });
    fireEvent.change(screen.getByLabelText(/^Usuario/), { target: { value: "carla" } });
    fireEvent.change(screen.getByLabelText(/^Contraseña/), { target: { value: "secreta1" } });
    vi.mocked(api.crearUsuario).mockResolvedValue(cuenta({ id: 20, usuario: "carla" }));
  }

  it("el combo ofrece lo que devuelve /roles/asignables y manda el rolId", async () => {
    await montar([OMAR]);
    await llenarAlta();
    expect(rolesDelCombo()).toEqual(["Encargado", "Cajero", "Mesero", "Repartidor"]);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "3" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    });
    expect(api.crearUsuario).toHaveBeenCalledWith(expect.objectContaining({ rolId: 3, username: "carla" }));
    expect(vi.mocked(api.crearUsuario).mock.calls[0][0]).not.toHaveProperty("rol");
  });

  it("al crear arranca en el primero que se puede asignar, y su ayuda es la del rol", async () => {
    await montar([OMAR]);
    await llenarAlta();
    expect(screen.getByRole("combobox")).toHaveValue("2");
    expect(screen.getByText("Vende, cobra y autoriza con PIN.")).toBeInTheDocument();
  });

  it("A-01: el alta sin email no manda el campo; con email lo manda limpio", async () => {
    await montar([OMAR]);
    await llenarAlta();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    });
    expect(vi.mocked(api.crearUsuario).mock.calls[0][0]).not.toHaveProperty("email");
  });

  it("al editar, el rol que ya tiene se ofrece aunque no sea asignable, y guardar no lo manda", async () => {
    // Un encargado le edita el teléfono al dueño: no puede asignar
    // Administrador, pero tampoco se lo puede cambiar sin querer.
    await montar([OMAR]);
    abrir("omar");
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    await act(async () => {});
    expect(screen.getByRole("combobox")).toHaveValue("1");
    expect(rolesDelCombo()).toEqual(["Encargado", "Cajero", "Mesero", "Repartidor", "Administrador"]);
    vi.mocked(api.actualizarUsuario).mockResolvedValue(OMAR);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    });
    expect(vi.mocked(api.actualizarUsuario).mock.calls[0][1]).not.toHaveProperty("rolId");
  });

  it("cambiarle el rol manda el rolId nuevo", async () => {
    await montar([OMAR, ANA]);
    abrir("ana");
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    await act(async () => {});
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "4" } });
    vi.mocked(api.actualizarUsuario).mockResolvedValue(ANA);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    });
    expect(api.actualizarUsuario).toHaveBeenCalledWith(2, expect.objectContaining({ rolId: 4 }));
  });

  it("zona y vehículo aparecen con un rol que entrega pedidos, se llame como se llame", async () => {
    await montar([OMAR]);
    await llenarAlta();
    expect(screen.queryByLabelText(/^Zona/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "5" } });
    expect(screen.getByLabelText(/^Zona/)).toBeInTheDocument();
  });
});

describe("el detalle muestra los permisos reales del rol", () => {
  it("con los nombres que trae el rol, agrupados por dominio", async () => {
    await montar([OMAR, ANA]);
    abrir("ana");
    expect(screen.getByText("Ventas:")).toBeInTheDocument();
    expect(screen.getByText("Vender")).toBeInTheDocument();
    expect(screen.getByText("Operar su caja")).toBeInTheDocument();
  });

  it("el Administrador: todos los permisos del plan", async () => {
    await montar([OMAR]);
    abrir("omar");
    expect(screen.getByText("Todos los permisos que incluye el plan del negocio.")).toBeInTheDocument();
  });

  it("no pide el catálogo: los nombres llegan en /roles, también para quien no edita roles", async () => {
    sesion.actor = usuarioDe("SUPERVISOR", { id: 5, username: "elsa" });
    await montar([OMAR, ANA]);
    abrir("ana");
    expect(screen.getByText("Vender")).toBeInTheDocument();
    expect(apiRoles.catalogo).not.toHaveBeenCalled();
  });

  it("un permiso sin nombre (el backend no lo conoce) se muestra por su código", async () => {
    await montar([OMAR, ANA], [ADMINISTRADOR, rol(3, "Cajero", [p("ventas.vender"), p("otro.permiso")])]);
    abrir("ana");
    expect(screen.getByText("Otros:").parentElement).toHaveTextContent("Otros: otro.permiso");
  });
});

describe("el PIN de autorización", () => {
  /** Los botones del PIN; la tarjeta de atrás también dice "PIN" por su marca. */
  const ACCION_PIN = /^(Asignar|Cambiar|Quitar) PIN$/;

  it("a un rol sin `autorizar.pin` no se le ofrece PIN ni se le marca", async () => {
    const conPinViejo = de(CAJERO, { id: 9, usuario: "cajera", tienePin: true });
    await montar([OMAR, LUIS, conPinViejo]);
    expect(within(screen.getByRole("button", { name: /@cajera\b/ })).queryByText("PIN")).not.toBeInTheDocument();
    abrir("luis");
    expect(screen.queryByRole("button", { name: ACCION_PIN })).not.toBeInTheDocument();
  });

  it("quien asigna PIN se lo quita a quien autoriza, y queda sin autorización", async () => {
    await montar([OMAR, ELSA]);
    abrir("elsa");
    expect(screen.getByRole("button", { name: "Cambiar PIN" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Quitar PIN" }));
    const botones = screen.getAllByRole("button", { name: "Quitar PIN" });
    await act(async () => {
      fireEvent.click(botones[botones.length - 1]);
    });
    expect(api.quitarPin).toHaveBeenCalledWith(5);
    expect(screen.getByRole("button", { name: "Asignar PIN" })).toBeInTheDocument();
  });

  it("al Administrador se le cambia, pero no se le quita", async () => {
    await montar([cuenta({ tienePin: true }), ELSA]);
    abrir("omar");
    expect(screen.getByRole("button", { name: "Cambiar PIN" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Quitar PIN" })).not.toBeInTheDocument();
  });

  it("sin `usuarios.asignar_pin` no se ofrece: a la propia cuenta se le dice a quién pedírselo", async () => {
    sesion.actor = usuarioDe("SUPERVISOR", { id: 5, username: "elsa" });
    await montar([ELSA]);
    abrir("elsa");
    expect(screen.queryByRole("button", { name: ACCION_PIN })).not.toBeInTheDocument();
    expect(screen.getByText("Tu PIN de autorización te lo asigna el administrador.")).toBeInTheDocument();
  });

  it("decide el permiso del rol, no su nombre: un 'Cajero' que autoriza lleva PIN", async () => {
    const cajeroQueAutoriza = rol(3, "Cajero", [p("ventas.vender"), p("autorizar.pin")]);
    await montar([OMAR, ANA], [ADMINISTRADOR, cajeroQueAutoriza]);
    abrir("ana");
    expect(screen.getByRole("button", { name: "Asignar PIN" })).toBeInTheDocument();
  });

  it("sin la autorización con PIN en el plan no hay PIN para nadie", async () => {
    sesion.conPin = false;
    await montar([OMAR, ELSA]);
    abrir("elsa");
    expect(screen.queryByRole("button", { name: ACCION_PIN })).not.toBeInTheDocument();
  });
});

describe("la sucursal", () => {
  const DOS = [
    { id: 1, nombre: "Centro", activo: true, tipo: "SUCURSAL", esPrincipal: true },
    { id: 2, nombre: "Norte", activo: true, tipo: "SUCURSAL", esPrincipal: false },
  ];

  it("se pregunta con dos locales, salvo al rol que ve todas las sucursales", async () => {
    vi.mocked(api.getAlmacenes).mockResolvedValue(DOS as never);
    const supervisorGeneral = rol(2, "Encargado", [p("ventas.vender"), p("sucursales.todas")]);
    vi.mocked(apiRoles.asignables).mockResolvedValue([supervisorGeneral, CAJERO]);
    await montar([OMAR]);
    fireEvent.click(screen.getByRole("button", { name: "Nuevo" }));
    await act(async () => {});
    expect(screen.queryByText("Sucursal")).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "3" } });
    expect(screen.getByText("Sucursal")).toBeInTheDocument();
  });
});
