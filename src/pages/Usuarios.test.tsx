import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SesionNegocio, Usuario } from "../types";

/**
 * Usuarios con el rol MESERO. La pantalla nació antes que el mesero y no lo
 * conocía: editarlo dejaba la página en blanco (pasó en QA, en el negocio de
 * prueba del restaurante), las tarjetas no lo contaban y no se lo podía crear.
 * Donde no hay salón (una farmacia) no aparece nada del mesero.
 */

const sesion = vi.hoisted(() => ({
  conSalon: true,
  /** Quién está mirando la pantalla. */
  actor: { id: 1, rol: "ADMIN" },
  /** El negocio de la sesión; null = un backend que no manda perfil. */
  negocio: null as SesionNegocio | null,
}));

vi.mock("../store/AuthContext", () => ({
  useAuth: () => ({
    usuario: { ...sesion.actor, sucursalId: null },
    negocio: sesion.negocio,
    incluye: () => true,
    puede: (s: string) => s === "salon" && sesion.conSalon,
  }),
}));

vi.mock("../lib/api", () => ({
  api: {
    getUsuarios: vi.fn(),
    // Por defecto, un backend sin el endpoint: la pantalla usa su lista.
    getRolesOfrecidos: vi.fn(),
    getAlmacenes: vi.fn(async () => []),
    actualizarUsuario: vi.fn(),
    crearUsuario: vi.fn(),
    quitarPin: vi.fn(async () => ({ mensaje: "PIN quitado" })),
  },
}));

import { api } from "../lib/api";
import Usuarios from "./Usuarios";

function cuenta(datos: Partial<Usuario>): Usuario {
  return {
    id: 1,
    nombre: "Administrador",
    usuario: "admin",
    rol: "ADMIN",
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

const ADMIN = cuenta({});
const MESERO = cuenta({ id: 7, nombre: "Mesero Auditoria", usuario: "mesero", rol: "MESERO" });

async function montar(lista: Usuario[]) {
  vi.mocked(api.getUsuarios).mockResolvedValue(lista);
  render(<Usuarios />);
  await act(async () => {});
}

/** El número de una tarjeta de arriba. */
function kpi(etiqueta: string) {
  return screen
    .getByText(etiqueta, { selector: "span.uppercase" })
    .closest(".card")!
    .querySelector("p")!.textContent;
}

function rolesOfrecidos() {
  return within(screen.getByRole("combobox"))
    .getAllByRole("option")
    .map((o) => o.textContent);
}

async function editarAlMesero() {
  fireEvent.click(screen.getByRole("button", { name: /@mesero\b/ }));
  fireEvent.click(screen.getByRole("button", { name: "Editar" }));
  vi.mocked(api.actualizarUsuario).mockResolvedValue(MESERO);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getRolesOfrecidos).mockRejectedValue(new Error("404"));
  sesion.conSalon = true;
  sesion.actor = { id: 1, rol: "ADMIN" };
  sesion.negocio = null;
});

describe("el mesero en Usuarios", () => {
  it("editarlo abre el formulario con su rol y guardar lo deja mesero", async () => {
    await montar([ADMIN, MESERO]);
    await editarAlMesero();

    expect(screen.getByRole("combobox")).toHaveValue("MESERO");
    expect(
      screen.getByText("Salón y mesas · Tomar pedidos · Mandar la cuenta a caja · No maneja dinero"),
    ).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    });
    expect(api.actualizarUsuario).toHaveBeenCalledWith(7, expect.objectContaining({ rol: "MESERO" }));
  });

  it("con salón se cuenta, se filtra y se puede crear", async () => {
    const deBaja = cuenta({ id: 8, nombre: "Mesero viejo", usuario: "mesero2", rol: "MESERO", activo: false });
    await montar([ADMIN, MESERO, deBaja]);

    // Cuenta sólo los activos, como las demás tarjetas.
    expect(kpi("Meseros")).toBe("1");
    fireEvent.click(screen.getByRole("button", { name: "Meseros" }));
    expect(screen.getByRole("button", { name: /@mesero\b/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /@admin\b/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Nuevo" }));
    expect(rolesOfrecidos()).toEqual(["Supervisor", "Cajero", "Mesero", "Repartidor"]);
  });

  it("sin salón (una farmacia) no aparece y las tarjetas quedan como antes", async () => {
    sesion.conSalon = false;
    await montar([ADMIN]);

    expect(screen.queryByText("Meseros")).not.toBeInTheDocument();
    expect(screen.getByText("Administradores", { selector: "span.uppercase" }).closest(".grid")).toHaveClass(
      "xl:grid-cols-5",
    );
    fireEvent.click(screen.getByRole("button", { name: "Nuevo" }));
    expect(rolesOfrecidos()).toEqual(["Supervisor", "Cajero", "Repartidor"]);
  });

  it("un mesero que quedó en un negocio sin salón se puede editar igual, sin perder el rol", async () => {
    sesion.conSalon = false;
    await montar([ADMIN, MESERO]);
    await editarAlMesero();

    expect(screen.getByRole("combobox")).toHaveValue("MESERO");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    });
    expect(api.actualizarUsuario).toHaveBeenCalledWith(7, expect.objectContaining({ rol: "MESERO" }));
  });
});

/**
 * El PIN de autorización: lo llevan sólo el administrador y los supervisores, y
 * lo asigna, cambia o quita sólo el administrador. Quitárselo a un supervisor
 * es sacarle la autorización para anular y fiar de más.
 */
describe("el PIN de autorización", () => {
  const SUPERVISOR = cuenta({
    id: 5,
    nombre: "Encargada",
    usuario: "encargada",
    rol: "SUPERVISOR",
    tienePin: true,
  });

  /** Los botones del PIN; la tarjeta de atrás también dice "PIN" por su marca. */
  const ACCION_PIN = /^(Asignar|Cambiar|Quitar) PIN$/;

  function abrir(usuario: string) {
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`@${usuario}(?![a-z0-9])`) }));
  }

  it("a un mesero no se le ofrece PIN", async () => {
    // Pasó en QA: el detalle del mesero ofrecía "Asignar PIN".
    await montar([ADMIN, MESERO]);
    abrir("mesero");
    expect(screen.queryByRole("button", { name: ACCION_PIN })).not.toBeInTheDocument();
  });

  it("un cajero con un PIN viejo no muestra la marca: no autoriza nada", async () => {
    await montar([ADMIN, cuenta({ id: 9, nombre: "Cajera", usuario: "cajera", rol: "CAJERO", tienePin: true })]);
    const tarjeta = screen.getByRole("button", { name: /@cajera\b/ });
    expect(within(tarjeta).queryByText("PIN")).not.toBeInTheDocument();
  });

  it("el administrador se lo quita a un supervisor y queda sin autorización", async () => {
    await montar([ADMIN, SUPERVISOR]);
    abrir("encargada");
    expect(screen.getByRole("button", { name: "Cambiar PIN" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Quitar PIN" }));
    const botones = screen.getAllByRole("button", { name: "Quitar PIN" });
    await act(async () => {
      fireEvent.click(botones[botones.length - 1]);
    });

    expect(api.quitarPin).toHaveBeenCalledWith(5);
    // El detalle ya lo dice, sin cerrarlo y volverlo a abrir.
    expect(screen.getByRole("button", { name: "Asignar PIN" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Quitar PIN" })).not.toBeInTheDocument();
  });

  it("al administrador no se le ofrece quitarse el suyo", async () => {
    await montar([cuenta({ tienePin: true }), SUPERVISOR]);
    abrir("admin");
    expect(screen.getByRole("button", { name: "Cambiar PIN" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Quitar PIN" })).not.toBeInTheDocument();
  });

  it("el supervisor no se pone el PIN: se le dice que se lo asigna el administrador", async () => {
    sesion.actor = { id: 5, rol: "SUPERVISOR" };
    await montar([SUPERVISOR]);
    abrir("encargada");
    expect(screen.queryByRole("button", { name: ACCION_PIN })).not.toBeInTheDocument();
    expect(screen.getByText("Tu PIN de autorización te lo asigna el administrador.")).toBeInTheDocument();
  });
});

/**
 * Belleza (fase 0): el rol PROFESIONAL se ofrece sólo si el perfil del rubro lo
 * trae, con el nombre del oficio, y el cajero se llama "Recepción".
 */
describe("el profesional en Usuarios", () => {
  const BARBERIA: SesionNegocio = {
    id: 2,
    nombre: "Barbería QA",
    tipoNegocio: "BARBERIA",
    perfil: {
      rubro: "BARBERIA",
      nombre: "Barbería",
      vertical: "BELLEZA",
      estado: "EN_DESARROLLO",
      icono: "navaja",
      etiquetasRol: { CAJERO: "Recepción", PROFESIONAL: "Barbero" },
      config: { rolesOfrecidos: ["ADMIN", "SUPERVISOR", "CAJERO", "PROFESIONAL"] },
    },
  };
  const BARBERO = cuenta({ id: 9, nombre: "Juan Barbero", usuario: "juan", rol: "PROFESIONAL" });

  it("en una barbería con perfil se ofrece con su nombre y se cuenta", async () => {
    sesion.conSalon = false;
    sesion.negocio = BARBERIA;
    await montar([ADMIN, BARBERO]);

    expect(kpi("Barberos")).toBe("1");
    expect(kpi("Recepción")).toBe("0");
    fireEvent.click(screen.getByRole("button", { name: "Barberos" }));
    expect(screen.getByRole("button", { name: /@juan\b/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /@admin\b/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Nuevo" }));
    expect(rolesOfrecidos()).toEqual(["Supervisor", "Recepción", "Barbero"]);
  });

  it("el supervisor también lo puede asignar", async () => {
    sesion.conSalon = false;
    sesion.negocio = BARBERIA;
    sesion.actor = { id: 3, rol: "SUPERVISOR" };
    await montar([ADMIN]);
    fireEvent.click(screen.getByRole("button", { name: "Nuevo" }));
    expect(rolesOfrecidos()).toEqual(["Recepción", "Barbero"]);
  });

  it("su ficha dice qué va a poder hacer", async () => {
    sesion.conSalon = false;
    sesion.negocio = BARBERIA;
    await montar([ADMIN, BARBERO]);
    fireEvent.click(screen.getByRole("button", { name: /@juan\b/ }));
    expect(screen.getByText("Ve su agenda y sus clientes")).toBeInTheDocument();
  });

  it("sin perfil (backend de hoy) no aparece en ningún lado", async () => {
    sesion.conSalon = true;
    await montar([ADMIN]);
    expect(screen.queryByText("Profesionales")).not.toBeInTheDocument();
    expect(kpi("Cajeros")).toBe("0");
    fireEvent.click(screen.getByRole("button", { name: "Nuevo" }));
    expect(rolesOfrecidos()).toEqual(["Supervisor", "Cajero", "Mesero", "Repartidor"]);
  });
});

/**
 * Con el backend de PLAN-ROLES la lista sale de `GET /roles/ofrecidos`: la
 * etiqueta del rubro y lo que puede hacer cada rol vienen del backend. Para
 * un restaurante no cambia nada de lo que se ve.
 */
describe("los roles del backend (/roles/ofrecidos)", () => {
  const permiso = (codigo: string, nombre: string, dominio: string, alcance: "GENERAL" | "PROPIO" = "GENERAL") => ({
    codigo,
    nombre,
    dominio,
    alcance,
  });

  it("restaurante: las mismas opciones y la misma ayuda que siempre", async () => {
    vi.mocked(api.getRolesOfrecidos).mockResolvedValue([
      { codigo: "SUPERVISOR", etiqueta: "Supervisor", descripcion: "El encargado", nivel: 80, arquetipo: "SUPERVISOR", permisos: [] },
      { codigo: "CAJERO", etiqueta: "Cajero", descripcion: "Atiende", nivel: 50, arquetipo: "CAJERO", permisos: [permiso("ventas.vender", "Vender", "Ventas")] },
      { codigo: "MESERO", etiqueta: "Mesero", descripcion: "Mesas", nivel: 30, arquetipo: "MESERO", permisos: [] },
      { codigo: "REPARTIDOR", etiqueta: "Repartidor", descripcion: "Entrega", nivel: 30, arquetipo: "REPARTIDOR", permisos: [] },
    ]);
    await montar([ADMIN]);
    fireEvent.click(screen.getByRole("button", { name: "Nuevo" }));
    await act(async () => {});
    expect(rolesOfrecidos()).toEqual(["Supervisor", "Cajero", "Mesero", "Repartidor"]);
    expect(screen.getByText("Ventas · Caja propia")).toBeInTheDocument();
  });

  it("barbería: la etiqueta y los permisos del profesional salen del backend", async () => {
    sesion.conSalon = false;
    vi.mocked(api.getRolesOfrecidos).mockResolvedValue([
      { codigo: "SUPERVISOR", etiqueta: "Supervisor", descripcion: null, nivel: 80, arquetipo: "SUPERVISOR", permisos: [] },
      { codigo: "CAJERO", etiqueta: "Recepción", descripcion: null, nivel: 50, arquetipo: "CAJERO", permisos: [] },
      {
        codigo: "PROFESIONAL",
        etiqueta: "Barbero",
        descripcion: "Ve su agenda y sus clientes; no cobra.",
        nivel: 40,
        arquetipo: "PROFESIONAL",
        permisos: [
          permiso("agenda.ver", "Ver la agenda", "Agenda", "PROPIO"),
          permiso("cliente.ver_ficha", "Ver fichas", "Clientes", "PROPIO"),
        ],
      },
    ]);
    await montar([ADMIN]);
    fireEvent.click(screen.getByRole("button", { name: "Nuevo" }));
    await act(async () => {});
    expect(rolesOfrecidos()).toEqual(["Supervisor", "Recepción", "Barbero"]);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "PROFESIONAL" } });
    expect(screen.getByText("Ve su agenda y sus clientes; no cobra.")).toBeInTheDocument();
    expect(screen.getByText("Qué puede hacer barbero")).toBeInTheDocument();
    expect(screen.getByText(/Ver la agenda \(sólo lo suyo\)/)).toBeInTheDocument();
  });

  it("al editar, el rol que ya tiene se sigue ofreciendo aunque el backend no lo liste", async () => {
    vi.mocked(api.getRolesOfrecidos).mockResolvedValue([
      { codigo: "CAJERO", etiqueta: "Cajero", descripcion: null, nivel: 50, arquetipo: "CAJERO", permisos: [] },
    ]);
    await montar([ADMIN, MESERO]);
    await editarAlMesero();
    await act(async () => {});
    expect(screen.getByRole("combobox")).toHaveValue("MESERO");
    expect(rolesOfrecidos()).toEqual(["Cajero", "Mesero"]);
  });
});

/**
 * Ronda 1 de QA de la agenda (06-oct): el alta sin email, los roles que el
 * rubro no ofrece, el "Dueño" de un salón y el permiso negativo con tilde.
 */
describe("QA ronda 1 en Usuarios", () => {
  const PELUQUERIA: SesionNegocio = {
    id: 3,
    nombre: "Peluquería QA",
    tipoNegocio: "PELUQUERIA",
    perfil: {
      rubro: "PELUQUERIA",
      nombre: "Peluquería",
      vertical: "BELLEZA",
      estado: "EN_DESARROLLO",
      icono: "tijera",
      etiquetasRol: { CAJERO: "Recepción", PROFESIONAL: "Estilista" },
      config: { rolesOfrecidos: ["ADMIN", "SUPERVISOR", "CAJERO", "PROFESIONAL"] },
    },
  };
  const ESTILISTA = cuenta({ id: 4, nombre: "Carla Méndez", usuario: "estilista", rol: "PROFESIONAL" });

  async function llenarAlta() {
    fireEvent.click(screen.getByRole("button", { name: "Nuevo" }));
    fireEvent.change(screen.getByLabelText(/^Nombre/), { target: { value: "Carla Méndez" } });
    fireEvent.change(screen.getByLabelText(/^Usuario/), { target: { value: "carla" } });
    fireEvent.change(screen.getByLabelText(/^Contraseña/), { target: { value: "secreta1" } });
    vi.mocked(api.crearUsuario).mockResolvedValue(cuenta({ id: 20, usuario: "carla" }));
  }

  it("A-01: el alta sin email no manda el campo (el backend rechazaba \"\")", async () => {
    await montar([ADMIN]);
    await llenarAlta();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    });
    expect(api.crearUsuario).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.crearUsuario).mock.calls[0][0]).not.toHaveProperty("email");
  });

  it("A-01: con email lo manda limpio", async () => {
    await montar([ADMIN]);
    await llenarAlta();
    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: " carla@salon.bo " } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    });
    expect(api.crearUsuario).toHaveBeenCalledWith(expect.objectContaining({ email: "carla@salon.bo" }));
  });

  it("B-20: en peluquería no hay tarjeta ni filtro de repartidores", async () => {
    sesion.conSalon = false;
    sesion.negocio = PELUQUERIA;
    await montar([ADMIN, ESTILISTA]);
    expect(screen.queryByText("Repartidores")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Repartidores" })).not.toBeInTheDocument();
    expect(kpi("Estilistas")).toBe("1");
    // Cinco tarjetas: entran en una fila.
    expect(screen.getByText("Estilistas", { selector: "span.uppercase" }).closest(".grid")).toHaveClass(
      "xl:grid-cols-5",
    );
  });

  it("B-20: restaurante y farmacia siguen contando repartidores", async () => {
    await montar([ADMIN]);
    expect(kpi("Repartidores")).toBe("0");
    expect(screen.getByRole("button", { name: "Repartidores" })).toBeInTheDocument();
    expect(kpi("Administradores")).toBe("1");
  });

  it("B-19: en un salón el ADMIN se cuenta como Dueños", async () => {
    sesion.conSalon = false;
    sesion.negocio = PELUQUERIA;
    await montar([ADMIN]);
    expect(kpi("Dueños")).toBe("1");
    expect(screen.queryByText("Administradores")).not.toBeInTheDocument();
  });

  it("B-28: 'No cobra' no lleva la tilde verde", async () => {
    sesion.conSalon = false;
    sesion.negocio = PELUQUERIA;
    await montar([ADMIN, ESTILISTA]);
    fireEvent.click(screen.getByRole("button", { name: /@estilista\b/ }));
    const item = screen.getByText("No cobra").closest("li")!;
    expect(item.querySelector("svg")).not.toHaveAttribute("stroke", "#059669");
    const otro = screen.getByText("Ve su agenda y sus clientes").closest("li")!;
    expect(otro.querySelector("svg")).toHaveAttribute("stroke", "#059669");
  });
});
