import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SesionNegocio, SesionUsuario } from "../../types";

/**
 * El acceso de despacho (Kevin, 29-oct): la tablet de la cocina entra con su
 * usuario y ve Despacho y nada más, sin la barra lateral. Cualquier dirección
 * la trae a Despacho; sin el extra, lo dice en vez de mostrar errores.
 */

vi.mock("../../lib/api", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/api")>();
  return {
    ...real,
    api: {
      login: vi.fn(),
      licencia: vi.fn(() => new Promise(() => {})),
    },
  };
});

vi.mock("../../lib/apiTickets", () => ({
  apiTickets: {
    tablero: vi.fn(async () => ({ ahora: Date.now(), sucursalId: 1, siguiente: 1, tickets: [] })),
  },
}));

// Si la barra lateral apareciera, se vería este texto.
vi.mock("../../components/Layout", async () => {
  const { Outlet } = await import("react-router-dom");
  return {
    default: () => (
      <>
        <p>Barra lateral</p>
        <Outlet />
      </>
    ),
  };
});
vi.mock("../pos/Pos", () => ({ default: () => <p>Punto de venta</p> }));

import App from "../../App";
import "../../AppNegocio";
import { NEGOCIO_KEY, USER_KEY, tokenStore } from "../../lib/api";

// Lo que manda el login para el acceso de despacho: sin rol y con un permiso.
const DESPACHO = {
  id: 50,
  username: "despacho",
  rol: null,
  rolNombre: "Despacho",
  esAdministrador: false,
  sucursalId: 1,
  permisos: ["tickets.despachar"],
  permisosPropios: [],
  esDespacho: true,
} as unknown as SesionUsuario;

const POLLOS = (features: string[]): SesionNegocio => ({
  id: 1,
  nombre: "Pollos",
  alias: "pollos",
  tipoNegocio: "RESTAURANTE",
  features,
});

function entrar(negocio: SesionNegocio, ruta = "/") {
  tokenStore.set("token");
  localStorage.setItem(USER_KEY, JSON.stringify(DESPACHO));
  localStorage.setItem(NEGOCIO_KEY, JSON.stringify(negocio));
  window.history.replaceState(null, "", ruta);
  render(<App />);
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("el acceso de despacho", () => {
  it("entra directo a Despacho, sin la barra lateral y con su botón para salir", async () => {
    entrar(POLLOS(["pos", "caja", "tickets_pedido"]));
    await act(async () => {});
    expect(window.location.pathname).toBe("/despacho");
    // Despacho se baja aparte (lazy): se espera a que llegue.
    expect(await screen.findByRole("heading", { name: /Despacho · pedidos/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salir" })).toBeInTheDocument();
    expect(screen.queryByText("Barra lateral")).not.toBeInTheDocument();
  });

  it("cualquier otra dirección lo devuelve a Despacho", async () => {
    entrar(POLLOS(["pos", "caja", "tickets_pedido"]), "/pos");
    await act(async () => {});
    expect(window.location.pathname).toBe("/despacho");
    expect(screen.queryByText("Punto de venta")).not.toBeInTheDocument();
  });

  it("sin el extra de tickets dice que no está habilitado", async () => {
    entrar(POLLOS(["pos", "caja"]));
    await act(async () => {});
    expect(screen.getByText("El despacho no está habilitado")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cerrar sesión" })).toBeInTheDocument();
  });
});
