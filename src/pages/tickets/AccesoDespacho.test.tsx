import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccesoDespacho as Acceso } from "../../lib/apiAccesosDespacho";

/**
 * Despacho en otro equipo, en Tickets y pedidos (Kevin, 29-oct): se crea con
 * usuario y contraseña, el QR abre el login con el negocio y el usuario
 * puestos, se le cambia la contraseña y se apaga, sin ocupar lugar de
 * usuario. Uno por local: con un solo local, creado el primero no se ofrece
 * otro.
 */

const accesos = vi.hoisted(() => ({
  listar: vi.fn(),
  crear: vi.fn(),
  cambiarPassword: vi.fn(),
  cambiarEstado: vi.fn(),
}));
vi.mock("../../lib/apiAccesosDespacho", () => ({ apiAccesosDespacho: accesos }));

const almacenes = vi.hoisted(() => ({ lista: [] as { id: number; nombre: string; tipo: string; activo: boolean }[] }));
vi.mock("../../lib/api", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/api")>();
  return { ...real, api: { getAlmacenes: vi.fn(async () => almacenes.lista) } };
});

vi.mock("../../lib/pagina/qr", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/pagina/qr")>();
  return { ...real, svgDeQr: vi.fn(async () => "<svg></svg>") };
});

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({ usuario: { id: 1, sucursalId: null }, negocio: { id: 1, alias: "pollos" } }),
}));

import AccesoDespacho from "./AccesoDespacho";

const acceso = (datos: Partial<Acceso> = {}): Acceso => ({
  id: 9,
  usuario: "despacho",
  activo: true,
  ultimoLogin: null,
  creadoEn: "2026-10-29T20:00:00Z",
  sucursalId: 1,
  sucursal: "Principal",
  ...datos,
});

const llenarClaves = (clave: string, repetida = clave) => {
  const claves = document.querySelectorAll<HTMLInputElement>('input[autocomplete="new-password"]');
  fireEvent.change(claves[0], { target: { value: clave } });
  fireEvent.change(claves[1], { target: { value: repetida } });
};

beforeEach(() => {
  vi.clearAllMocks();
  almacenes.lista = [{ id: 1, nombre: "Principal", tipo: "SUCURSAL", activo: true }];
});

describe("Despacho en otro equipo", () => {
  it("sin acceso, se crea con usuario y contraseña, y dice que no ocupa lugar", async () => {
    accesos.listar.mockResolvedValueOnce([]).mockResolvedValue([acceso()]);
    accesos.crear.mockResolvedValue(acceso());
    render(<AccesoDespacho />);
    expect(screen.getByText("No ocupa lugar de usuario.")).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: /Crear acceso/ }));
    // Viene sugerido "despacho"; con un solo local no se pregunta cuál.
    expect(screen.getByDisplayValue("despacho")).toBeInTheDocument();
    expect(screen.queryByText("Local")).not.toBeInTheDocument();
    llenarClaves("cocina123");
    fireEvent.click(screen.getByRole("button", { name: "Crear" }));

    await waitFor(() =>
      expect(accesos.crear).toHaveBeenCalledWith({ username: "despacho", password: "cocina123" }),
    );
    expect(await screen.findByText("@despacho")).toBeInTheDocument();
    // Uno por local: con un solo local no se ofrece otro.
    expect(screen.queryByRole("button", { name: /Crear acceso|Para otro local/ })).not.toBeInTheDocument();
  });

  it("el QR abre Despacho con el negocio y el usuario: en la tablet sólo falta la contraseña", async () => {
    accesos.listar.mockResolvedValue([acceso()]);
    render(<AccesoDespacho />);
    expect(await screen.findByText(/\/despacho\?negocio=pollos&usuario=despacho$/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "QR para entrar a Despacho" })).toBeInTheDocument();
  });

  it("las contraseñas que no coinciden no se mandan", async () => {
    accesos.listar.mockResolvedValue([]);
    render(<AccesoDespacho />);
    fireEvent.click(await screen.findByRole("button", { name: /Crear acceso/ }));
    llenarClaves("cocina123", "cocina124");
    fireEvent.click(screen.getByRole("button", { name: "Crear" }));
    expect(await screen.findByText("Las dos contraseñas no coinciden.")).toBeInTheDocument();
    expect(accesos.crear).not.toHaveBeenCalled();
  });

  it("se le cambia la contraseña y avisa que los equipos adentro salen", async () => {
    accesos.listar.mockResolvedValue([acceso({ ultimoLogin: new Date().toISOString() })]);
    accesos.cambiarPassword.mockResolvedValue({ mensaje: "ok" });
    render(<AccesoDespacho />);
    fireEvent.click(await screen.findByRole("button", { name: /Contraseña/ }));
    llenarClaves("nueva1234");
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(accesos.cambiarPassword).toHaveBeenCalledWith(9, "nueva1234"));
    expect(await screen.findByText(/los equipos que estaban adentro tienen que entrar con la nueva/)).toBeInTheDocument();
  });

  it("apagar pide confirmar; apagado se prende de un toque", async () => {
    accesos.listar.mockResolvedValueOnce([acceso()]).mockResolvedValue([acceso({ activo: false })]);
    accesos.cambiarEstado.mockResolvedValue(acceso({ activo: false }));
    render(<AccesoDespacho />);
    fireEvent.click(await screen.findByRole("button", { name: "Apagar el acceso" }));
    expect(accesos.cambiarEstado).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Apagar" }));
    await waitFor(() => expect(accesos.cambiarEstado).toHaveBeenCalledWith(9, false));
    expect(await screen.findByText("Apagado")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Prender el acceso" }));
    await waitFor(() => expect(accesos.cambiarEstado).toHaveBeenCalledWith(9, true));
  });

  it("con varios locales, el que falta ya viene elegido", async () => {
    almacenes.lista = [
      { id: 1, nombre: "Principal", tipo: "SUCURSAL", activo: true },
      { id: 2, nombre: "Norte", tipo: "SUCURSAL", activo: true },
      { id: 3, nombre: "Depósito", tipo: "DEPOSITO", activo: true },
    ];
    accesos.listar.mockResolvedValue([acceso()]);
    accesos.crear.mockResolvedValue(acceso({ id: 10, usuario: "despacho-norte", sucursalId: 2, sucursal: "Norte" }));
    render(<AccesoDespacho />);
    fireEvent.click(await screen.findByRole("button", { name: /Para otro local/ }));
    // Queda uno solo sin acceso (el depósito no despacha): sin preguntar.
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    fireEvent.change(screen.getByDisplayValue("despacho"), { target: { value: "despacho-norte" } });
    llenarClaves("cocina123");
    fireEvent.click(screen.getByRole("button", { name: "Crear" }));
    await waitFor(() =>
      expect(accesos.crear).toHaveBeenCalledWith({ username: "despacho-norte", password: "cocina123", sucursalId: 2 }),
    );
  });
});
