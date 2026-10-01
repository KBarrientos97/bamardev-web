import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SesionNegocio, SesionUsuario } from "./types";

/**
 * Quien entra después de un cierre de sesión arranca en SU pantalla, no en la
 * del que salió. Pasó en QA: el mesero cerró sesión en /salon, entró el
 * administrador y cayó en el panel del mesero, sin la barra lateral para volver
 * a lo suyo. Parecía que el login lo había vuelto a entrar como mesero.
 */

vi.mock("./lib/api", async (importOriginal) => {
  const real = await importOriginal<typeof import("./lib/api")>();
  // La licencia queda pendiente para siempre: acá no importa y así no pinta
  // nada después de que el test terminó.
  return { ...real, api: { login: vi.fn(), licencia: vi.fn(() => new Promise(() => {})) } };
});

// Las pantallas no importan, sólo cuál se abre.
vi.mock("./components/Layout", async () => {
  const { Outlet } = await import("react-router-dom");
  return { default: () => <Outlet /> };
});
vi.mock("./pages/inventario/Dashboard", () => ({
  default: () => <p>Inicio del administrador</p>,
}));
vi.mock("./pages/salon/PanelMesero", async () => {
  const { useAuth } = await import("./store/AuthContext");
  return {
    default: function PanelMesero() {
      const { logout } = useAuth();
      return <button onClick={logout}>Cerrar sesión del panel</button>;
    },
  };
});

import App from "./App";
import { NEGOCIO_KEY, USER_KEY, api, tokenStore } from "./lib/api";

const RESTAURANTE: SesionNegocio = { id: 1, nombre: "Restaurante", alias: "resto", tipoNegocio: "RESTAURANTE" };
const MESERO: SesionUsuario = { id: 7, username: "mesero", nombre: "Mesero", rol: "MESERO", modulos: [] };
const ADMIN: SesionUsuario = { id: 1, username: "admin", nombre: "Administrador", rol: "ADMIN", modulos: [] };

function abrir(ruta: string) {
  window.history.replaceState(null, "", ruta);
  render(<App />);
}

async function entrarComo(usuario: SesionUsuario) {
  vi.mocked(api.login).mockResolvedValue({
    accessToken: `token-${usuario.username}`,
    usuario,
    negocio: RESTAURANTE,
  });
  fireEvent.change(screen.getByPlaceholderText("cafeteriakevin"), { target: { value: "resto" } });
  fireEvent.change(screen.getByPlaceholderText("Tu nombre de usuario"), {
    target: { value: usuario.username },
  });
  fireEvent.change(screen.getByPlaceholderText("Tu contraseña"), { target: { value: "x" } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Iniciar sesión" }));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("cerrar sesión y que entre otro", () => {
  it("el administrador que entra después del mesero cae en su inicio, no en el salón", async () => {
    tokenStore.set("token-mesero");
    localStorage.setItem(USER_KEY, JSON.stringify(MESERO));
    localStorage.setItem(NEGOCIO_KEY, JSON.stringify(RESTAURANTE));
    abrir("/salon");

    fireEvent.click(screen.getByRole("button", { name: "Cerrar sesión del panel" }));
    expect(screen.getByRole("button", { name: "Iniciar sesión" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/");

    await entrarComo(ADMIN);
    expect(screen.getByText("Inicio del administrador")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/inventario");
  });

  it("un link abierto sin sesión sigue llevando a donde apuntaba", async () => {
    // A propósito: lo que se resetea es lo que dejó el que salió, no la
    // dirección que alguien abrió.
    abrir("/salon");
    await entrarComo(ADMIN);
    expect(screen.getByRole("button", { name: "Cerrar sesión del panel" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/salon");
  });
});
