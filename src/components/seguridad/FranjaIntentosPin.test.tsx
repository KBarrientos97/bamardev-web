import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * La franja de los PIN mal escritos (18-oct): sólo para quien administra los
 * PIN, roja sin "Ya lo vi" con una alarma, gris con "Ya lo vi".
 */

const sesion = vi.hoisted(() => ({ permisos: ["usuarios.asignar_pin"] as string[] }));
vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({ usuario: { id: 1, permisos: sesion.permisos } }),
}));

const api = vi.hoisted(() => ({
  intentos: vi.fn(),
  marcarVistos: vi.fn(async () => ({ marcados: 1 })),
  habilitar: vi.fn(),
}));
vi.mock("../../lib/seguridad/apiSeguridad", () => ({ apiSeguridad: api }));

import FranjaIntentosPin from "./FranjaIntentosPin";

const ahora = new Date().toISOString();
const haceUnRato = new Date(Date.now() - 5 * 60_000).toISOString();
const fila = (p: Record<string, unknown>) => ({
  id: 10,
  tipo: "FALLO",
  creadoEn: haceUnRato,
  operador: { id: 5, nombre: "Ana" },
  propio: false,
  tecleado: "admin",
  autorizador: { id: 2, nombre: "Pedro" },
  motivo: "PIN_INCORRECTO",
  accion: "BILLAR_PAUSAR",
  descripcion: "Pausar la Mesa 3",
  sucursalId: null,
  seguidos: 1,
  delDia: 1,
  alarma: null,
  bloqueadoHasta: null,
  avisado: false,
  visto: false,
  vistoPor: null,
  ...p,
});

async function montar() {
  render(<FranjaIntentosPin />);
  await act(async () => {});
}

beforeEach(() => {
  vi.clearAllMocks();
  sesion.permisos = ["usuarios.asignar_pin"];
});

describe("la franja de los PIN mal escritos", () => {
  it("sin el permiso de administrar PIN no consulta ni dibuja nada", async () => {
    sesion.permisos = ["ventas.vender"];
    await montar();
    expect(api.intentos).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("con una alarma va en rojo y no se cierra desde acá", async () => {
    api.intentos.mockResolvedValue({ ahora, hayMas: false, frenados: [], intentos: [fila({ seguidos: 3, alarma: "TRES_SEGUIDOS" })] });
    await montar();
    expect(screen.getByRole("alert")).toHaveTextContent("se escribió mal 3 veces seguidas el PIN de Pedro");
    expect(screen.getByRole("button", { name: "Ver qué pasó" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ya lo vi" })).not.toBeInTheDocument();
  });

  it("un fallo suelto va en gris y \"Ya lo vi\" marca hasta lo mostrado", async () => {
    api.intentos.mockResolvedValue({ ahora, hayMas: false, frenados: [], intentos: [fila({})] });
    await montar();
    expect(screen.getByRole("status")).toHaveTextContent("Desde el usuario de Ana se escribió mal el PIN de Pedro");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Ya lo vi" }));
    });
    expect(api.marcarVistos).toHaveBeenCalledWith(10);
    expect(api.intentos).toHaveBeenCalledTimes(2);
  });
});
