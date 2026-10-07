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
  return { ...real, api: { login: vi.fn(), me: vi.fn(), licencia: vi.fn(() => new Promise(() => {})) } };
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

// La reserva pública no toca la API de la app: tiene su propio cliente.
vi.mock("./publico/apiReserva", async (importOriginal) => {
  const real = await importOriginal<typeof import("./publico/apiReserva")>();
  return {
    ...real,
    apiReserva: {
      ...real.apiReserva,
      negocio: vi.fn(async () => ({
        negocio: { nombre: "Salón Bella Vista", subdominio: "bellavista", rubro: "PELUQUERIA", telefono: null, direccion: null, tema: null },
        privacidadVersion: "v0.1",
        sucursales: [],
      })),
    },
  };
});

import App from "./App";
import { NEGOCIO_KEY, USER_KEY, api, tokenStore } from "./lib/api";
import { permisosDe, usuarioDe } from "./test/sesiones";

const RESTAURANTE: SesionNegocio = { id: 1, nombre: "Restaurante", alias: "resto", tipoNegocio: "RESTAURANTE" };
// Con los permisos de sus plantillas: la web decide sólo por ellos.
const MESERO: SesionUsuario = usuarioDe("MESERO", { id: 7, username: "mesero", nombre: "Mesero" });
const ADMIN: SesionUsuario = usuarioDe("ADMIN", { id: 1, username: "admin", nombre: "Administrador" });

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

describe("el profesional (belleza, sin agenda todavía)", () => {
  const TOKENS_PROPIOS = {
    primary: "#123456", primary600: "#123456", primary700: "#123456",
    primary50: "#F4F4F4", primary100: "#E6E5E5", primary200: "#CCCBCB",
    boton: "#123456", botonHover: "#0F2B45", botonActivo: "#0C2236",
    barra: "#123456", barraActivo: "#2A4A69", barraTexto2: "#CFCECE",
    marca: ["#123456", "#0F2B45"] as [string, string],
  };
  const BARBERIA: SesionNegocio = {
    id: 2,
    nombre: "Barbería QA",
    alias: "barberiaqa",
    tipoNegocio: "BARBERIA",
    tema: { clave: "PROPIA", tokens: TOKENS_PROPIOS },
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
  const PROFESIONAL: SesionUsuario = usuarioDe("PROFESIONAL", {
    id: 8,
    username: "barbero",
    nombre: "Juan",
    // El nombre del rol lo eligió el negocio: es el que se muestra.
    rolNombre: "Barbero",
  });

  it("al entrar cae en el aviso de su agenda, con el color del negocio", async () => {
    abrir("/");
    vi.mocked(api.login).mockResolvedValue({
      accessToken: "token-barbero",
      usuario: PROFESIONAL,
      negocio: BARBERIA,
    });
    fireEvent.change(screen.getByPlaceholderText("cafeteriakevin"), {
      target: { value: "barberiaqa" },
    });
    fireEvent.change(screen.getByPlaceholderText("Tu nombre de usuario"), {
      target: { value: "barbero" },
    });
    fireEvent.change(screen.getByPlaceholderText("Tu contraseña"), { target: { value: "x" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Iniciar sesión" }));
    });

    expect(screen.getByText("Tu agenda llega pronto")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/mi-agenda");
    expect(screen.getByText("Barbería QA · Barbero")).toBeInTheDocument();
    expect(
      document.documentElement.style.getPropertyValue("--color-primary").toLowerCase(),
    ).toBe("#123456");
    // La sesión guarda el tema y el perfil: un F5 no vuelve al color del rubro.
    const guardado = JSON.parse(localStorage.getItem(NEGOCIO_KEY) ?? "{}");
    expect(guardado.tema.clave).toBe("PROPIA");
    expect(guardado.perfil.etiquetasRol.PROFESIONAL).toBe("Barbero");
  });

  it("una ruta de otra sección lo devuelve a su aviso", () => {
    tokenStore.set("token-barbero");
    localStorage.setItem(USER_KEY, JSON.stringify(PROFESIONAL));
    localStorage.setItem(NEGOCIO_KEY, JSON.stringify(BARBERIA));
    abrir("/pos");
    expect(screen.getByText("Tu agenda llega pronto")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/mi-agenda");
  });

  it("cerrar sesión desde el aviso vuelve al login", () => {
    tokenStore.set("token-barbero");
    localStorage.setItem(USER_KEY, JSON.stringify(PROFESIONAL));
    localStorage.setItem(NEGOCIO_KEY, JSON.stringify(BARBERIA));
    abrir("/mi-agenda");
    fireEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    expect(screen.getByRole("button", { name: "Iniciar sesión" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/");
  });

  it("quien ve sólo su agenda entra ahí aunque su rol se llame de otra forma", () => {
    // Un rol creado por el negocio ("Ayudante con agenda"), con código legado
    // de cajero: manda el permiso, no el nombre ni el código.
    tokenStore.set("token-x");
    localStorage.setItem(
      USER_KEY,
      JSON.stringify({ ...PROFESIONAL, rol: "CAJERO", rolNombre: "Ayudante con agenda" }),
    );
    localStorage.setItem(NEGOCIO_KEY, JSON.stringify(BARBERIA));
    abrir("/");
    expect(screen.getByText("Tu agenda llega pronto")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/mi-agenda");
  });

  it("otro rol que abre /mi-agenda va a su inicio", () => {
    tokenStore.set("token-admin");
    localStorage.setItem(USER_KEY, JSON.stringify(ADMIN));
    localStorage.setItem(NEGOCIO_KEY, JSON.stringify(RESTAURANTE));
    abrir("/mi-agenda");
    expect(screen.getByText("Inicio del administrador")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/inventario");
  });
});

describe("una sesión guardada sin permisos", () => {
  // Se guardó antes de que el login los mandara: no hay con qué decidir, y no
  // hay respaldo por nombre de rol. Se piden a /auth/me.
  const VIEJA = { id: 1, username: "admin", nombre: "Administrador", rol: "ADMIN" } as SesionUsuario;

  it("los pide a /auth/me y entra a su inicio con lo que vuelve (también el nombre del rol)", async () => {
    vi.mocked(api.me).mockResolvedValue({
      id: 1,
      username: "admin",
      rol: "ADMIN",
      rolId: 1,
      rolNombre: "Administrador",
      esAdministrador: true,
      negocioId: 1,
      esPlataforma: false,
      ...permisosDe("ADMIN"),
      permisosVersion: "v1",
    });
    tokenStore.set("token-admin");
    localStorage.setItem(USER_KEY, JSON.stringify(VIEJA));
    localStorage.setItem(NEGOCIO_KEY, JSON.stringify(RESTAURANTE));
    abrir("/");
    expect(await screen.findByText("Inicio del administrador")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/inventario");
    const guardado = JSON.parse(localStorage.getItem(USER_KEY) ?? "{}");
    expect(guardado.rolNombre).toBe("Administrador");
    expect(guardado.permisos).toContain("dashboard.ver");
  });

  it("si /auth/me tampoco los trae, queda sin acceso: nada por el nombre del rol", async () => {
    vi.mocked(api.me).mockResolvedValue({
      id: 1,
      username: "admin",
      rol: "ADMIN",
      negocioId: 1,
      esPlataforma: false,
    });
    tokenStore.set("token-admin");
    localStorage.setItem(USER_KEY, JSON.stringify(VIEJA));
    localStorage.setItem(NEGOCIO_KEY, JSON.stringify(RESTAURANTE));
    abrir("/");
    expect(await screen.findByText("Tu cuenta no tiene secciones")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/sin-acceso");
    expect(screen.queryByText("Inicio del administrador")).toBeNull();
  });
});

describe("la reserva pública (/r/…)", () => {
  it("se abre sin sesión: ni login ni redirección, aunque haya un token viejo", async () => {
    tokenStore.set("token-viejo");
    localStorage.setItem(USER_KEY, JSON.stringify(ADMIN));
    localStorage.setItem(NEGOCIO_KEY, JSON.stringify(RESTAURANTE));
    abrir("/r/bellavista");
    expect(await screen.findByText("Salón Bella Vista")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Iniciar sesión" })).toBeNull();
    expect(window.location.pathname).toBe("/r/bellavista");
    expect(api.licencia).not.toHaveBeenCalled();
  });
});
