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
    expect(rolesOfrecidos()).toEqual(["Supervisor", "Recepción", "Repartidor", "Barbero"]);
  });

  it("el supervisor también lo puede asignar", async () => {
    sesion.conSalon = false;
    sesion.negocio = BARBERIA;
    sesion.actor = { id: 3, rol: "SUPERVISOR" };
    await montar([ADMIN]);
    fireEvent.click(screen.getByRole("button", { name: "Nuevo" }));
    expect(rolesOfrecidos()).toEqual(["Recepción", "Repartidor", "Barbero"]);
  });

  it("su ficha dice qué va a poder hacer", async () => {
    sesion.conSalon = false;
    sesion.negocio = BARBERIA;
    await montar([ADMIN, BARBERO]);
    fireEvent.click(screen.getByRole("button", { name: /@juan\b/ }));
    expect(screen.getByText("Ve su agenda (llega con la agenda)")).toBeInTheDocument();
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
