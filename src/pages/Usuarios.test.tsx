import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "../types";

/**
 * Usuarios con el rol MESERO. La pantalla nació antes que el mesero y no lo
 * conocía: editarlo dejaba la página en blanco (pasó en QA, en el negocio de
 * prueba del restaurante), las tarjetas no lo contaban y no se lo podía crear.
 * Donde no hay salón (una farmacia) no aparece nada del mesero.
 */

const sesion = vi.hoisted(() => ({ conSalon: true }));

vi.mock("../store/AuthContext", () => ({
  useAuth: () => ({
    usuario: { id: 1, rol: "ADMIN", sucursalId: null },
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
