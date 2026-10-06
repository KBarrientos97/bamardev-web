import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Persona } from "../lib/personal";

/**
 * Personal (PLAN-ROLES §9.4): la lista con y sin acceso, el alta de alguien
 * sin login, "Darle acceso" (con el rol ofrecido del rubro) y "Quitar acceso".
 */

const sesion = vi.hoisted(() => ({
  usuario: { id: 1, rol: "ADMIN", sucursalId: null, permisos: ["personal.gestionar", "comisiones.liquidar"] },
}));

vi.mock("../store/AuthContext", () => ({
  useAuth: () => ({
    usuario: sesion.usuario,
    negocio: { id: 15, nombre: "Barbería", tipoNegocio: "BARBERIA", features: ["agenda"] },
    puede: () => true,
  }),
}));

vi.mock("../lib/api", () => ({
  api: {
    getSucursales: vi.fn(async () => [{ id: 1, nombre: "Centro", activo: true, tipo: "SUCURSAL" }]),
    getRolesOfrecidos: vi.fn(async () => [
      { codigo: "CAJERO", etiqueta: "Recepción", descripcion: null, nivel: 50, arquetipo: "CAJERO", permisos: [] },
      { codigo: "PROFESIONAL", etiqueta: "Barbero", descripcion: null, nivel: 40, arquetipo: "PROFESIONAL", permisos: [] },
    ]),
    getUsuarios: vi.fn(async () => []),
  },
}));

vi.mock("../lib/personal", () => ({
  apiPersonal: {
    listar: vi.fn(),
    cargos: vi.fn(async () => ({ sugeridos: ["Barbero", "Recepción"] })),
    crear: vi.fn(),
    editar: vi.fn(),
    darAcceso: vi.fn(),
    quitarAcceso: vi.fn(),
    vincular: vi.fn(),
  },
}));

import { apiPersonal } from "../lib/personal";
import Personal from "./Personal";

const base: Persona = {
  id: 1,
  nombre: "Dueño",
  cargo: null,
  activo: true,
  color: null,
  sucursalIds: [],
  usuarioId: 10,
  conAcceso: true,
  recursoId: null,
  profesional: null,
  telefono: null,
  ci: null,
  fechaIngreso: "2026-10-01",
  comisionPct: null,
  notas: null,
  zona: null,
  vehiculo: null,
  acceso: { usuarioId: 10, username: "admin", rol: "ADMIN", activo: true, ultimoLogin: null },
};
const LUCHO: Persona = {
  ...base,
  id: 2,
  nombre: "Lucho",
  cargo: "Barbero",
  sucursalIds: [1],
  usuarioId: null,
  conAcceso: false,
  recursoId: 30,
  profesional: { recursoId: 30, nombre: "Lucho", activo: true },
  acceso: null,
};
const ANA: Persona = {
  ...base,
  id: 3,
  nombre: "Ana",
  cargo: "Recepción",
  sucursalIds: [1],
  usuarioId: 11,
  acceso: { usuarioId: 11, username: "ana", rol: "CAJERO", activo: true, ultimoLogin: null },
};

async function montar() {
  render(
    <MemoryRouter>
      <Personal />
    </MemoryRouter>,
  );
  await act(async () => {});
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiPersonal.listar).mockResolvedValue([base, LUCHO, ANA]);
});

describe("Personal", () => {
  it("lista a la gente con y sin acceso, y cuenta los accesos", async () => {
    await montar();
    expect(apiPersonal.listar).toHaveBeenCalledWith({ incluirInactivos: true });
    expect(screen.getByText("3 personas · 2 con acceso al sistema")).toBeInTheDocument();
    const lista = screen.getByRole("list", { name: "Personal" });
    const lucho = within(lista).getByRole("button", { name: "Ver Lucho" });
    expect(lucho).toHaveTextContent("Sin acceso");
    expect(lucho).toHaveTextContent("En la agenda");
    expect(within(lista).getByRole("button", { name: "Ver Ana" })).toHaveTextContent("Con acceso");

    fireEvent.click(screen.getByRole("button", { name: "Sin acceso" }));
    expect(within(screen.getByRole("list", { name: "Personal" })).getAllByRole("button")).toHaveLength(1);
  });

  it("da de alta a alguien sin login", async () => {
    vi.mocked(apiPersonal.crear).mockResolvedValue({ ...LUCHO, id: 4, nombre: "Nico", recursoId: null, profesional: null });
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Nueva persona" }));
    const dialogo = screen.getByRole("dialog", { name: "Nueva persona" });
    fireEvent.change(within(dialogo).getByLabelText("Nombre"), { target: { value: "Nico" } });
    fireEvent.change(within(dialogo).getByLabelText(/Cargo/), { target: { value: "Barbero" } });
    fireEvent.change(within(dialogo).getByLabelText(/Comisión base/), { target: { value: "40" } });
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    });
    expect(apiPersonal.crear).toHaveBeenCalledWith(
      expect.objectContaining({ nombre: "Nico", cargo: "Barbero", comisionPct: 40, sucursalIds: [1] }),
    );
    expect(screen.getByText('"Nico" quedó guardado.')).toBeInTheDocument();
  });

  it("le da acceso a un profesional sin login, con el rol ofrecido del rubro", async () => {
    vi.mocked(apiPersonal.darAcceso).mockResolvedValue({
      ...LUCHO,
      usuarioId: 12,
      conAcceso: true,
      acceso: { usuarioId: 12, username: "lucho", rol: "PROFESIONAL", activo: true, ultimoLogin: null },
    });
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Ver Lucho" }));
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Darle acceso" }));
    await act(async () => {});
    const dialogo = screen.getByRole("dialog", { name: "Darle acceso" });
    // El rol por defecto es el del profesional, con la etiqueta del rubro.
    expect(within(dialogo).getByLabelText("Rol")).toHaveValue("PROFESIONAL");
    expect(within(dialogo).getByRole("option", { name: "Barbero" })).toBeInTheDocument();
    fireEvent.change(within(dialogo).getByLabelText("Usuario"), { target: { value: "Lucho" } });
    fireEvent.change(within(dialogo).getByLabelText("Contraseña"), { target: { value: "secreto1" } });
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Darle acceso" }));
    });
    expect(apiPersonal.darAcceso).toHaveBeenCalledWith(2, {
      username: "lucho",
      password: "secreto1",
      rol: "PROFESIONAL",
    });
    expect(screen.getByText('"Lucho" ya puede entrar como @lucho.')).toBeInTheDocument();
  });

  it("muestra el error del cupo que devuelve el backend", async () => {
    vi.mocked(apiPersonal.darAcceso).mockRejectedValue(
      new Error("Tu plan permite 4 usuarios activos. Desactivá uno o contratá usuarios extra."),
    );
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Ver Lucho" }));
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Darle acceso" }));
    await act(async () => {});
    const dialogo = screen.getByRole("dialog", { name: "Darle acceso" });
    fireEvent.change(within(dialogo).getByLabelText("Usuario"), { target: { value: "lucho" } });
    fireEvent.change(within(dialogo).getByLabelText("Contraseña"), { target: { value: "secreto1" } });
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Darle acceso" }));
    });
    expect(within(dialogo).getByText(/Tu plan permite 4 usuarios activos/)).toBeInTheDocument();
  });

  it("quitar acceso pide confirmación y la persona sigue", async () => {
    vi.mocked(apiPersonal.quitarAcceso).mockResolvedValue({
      ...ANA,
      conAcceso: false,
      acceso: { ...ANA.acceso!, activo: false },
    });
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Ver Ana" }));
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Quitar acceso" }));
    const confirmar = screen.getByRole("dialog", { name: "Quitar acceso" });
    expect(confirmar).toHaveTextContent("Sigue en Personal");
    await act(async () => {
      fireEvent.click(within(confirmar).getByRole("button", { name: "Quitar acceso" }));
    });
    expect(apiPersonal.quitarAcceso).toHaveBeenCalledWith(3);
    expect(screen.getByText('"Ana" ya no entra al sistema.')).toBeInTheDocument();
  });
});
