import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SesionNegocio, SesionUsuario } from "../../types";

/**
 * A dónde entra cada uno cuando el salón tiene la agenda prendida, pasando por
 * las rutas de verdad (`App`): el profesional a "Mi agenda" (y sin la feature,
 * al aviso de siempre), recepción a "Hoy", el dueño a la "Agenda".
 */

vi.mock("../../lib/api", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/api")>();
  return {
    ...real,
    api: {
      login: vi.fn(),
      licencia: vi.fn(() => new Promise(() => {})),
      getSucursales: vi.fn(async () => []),
    },
  };
});

vi.mock("../../lib/agenda/apiAgenda", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/agenda/apiAgenda")>();
  return {
    ...real,
    apiAgenda: {
      miAgenda: vi.fn(async () => ({ recursos: [], citas: [] })),
      reglas: vi.fn(async () => null),
      hoy: vi.fn(async () => ({
        citas: [],
        cola: [],
        contadores: { porConfirmar: 0, enEspera: 0, enAtencion: 0, porCobrar: 0, noShowSugeridos: 0 },
      })),
      dia: vi.fn(async () => ({ fecha: "2026-10-21", sucursalId: 1, recursos: [], citas: [], bloqueos: [], cola: [] })),
    },
  };
});

// El POS de verdad pide caja, catálogo…: acá sólo importa que se abra.
vi.mock("../pos/Pos", () => ({ default: () => <p>Punto de venta</p> }));

vi.mock("../../components/Layout", async () => {
  const { Outlet } = await import("react-router-dom");
  return { default: () => <Outlet /> };
});

import App from "../../App";
import { NEGOCIO_KEY, USER_KEY, tokenStore } from "../../lib/api";
import { usuarioDe } from "../../test/sesiones";

const SALON = (features: string[]): SesionNegocio => ({
  id: 2,
  nombre: "Salón QA",
  alias: "salonqa",
  tipoNegocio: "PELUQUERIA",
  features,
});

function entrar(usuario: SesionUsuario, negocio: SesionNegocio) {
  tokenStore.set("token");
  localStorage.setItem(USER_KEY, JSON.stringify(usuario));
  localStorage.setItem(NEGOCIO_KEY, JSON.stringify(negocio));
  window.history.replaceState(null, "", "/");
  render(<App />);
}

// Con los permisos de sus plantillas, cruzados con el plan como lo hace el
// backend en el login.
const PROFESIONAL = (features: string[]): SesionUsuario =>
  usuarioDe("PROFESIONAL", { id: 8, username: "carla", nombre: "Carla" }, { features });
const RECEPCION: SesionUsuario = usuarioDe("CAJERO", { id: 3, username: "lucia", sucursalId: 1 });
const DUENO: SesionUsuario = usuarioDe("ADMIN", { id: 1, username: "dueno", sucursalId: 1 });

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("rutas de la agenda", () => {
  it("el profesional entra a Mi agenda si el negocio tiene la feature", async () => {
    entrar(PROFESIONAL(["pos", "agenda"]), SALON(["pos", "agenda"]));
    await act(async () => {});
    expect(window.location.pathname).toBe("/mi-agenda");
    expect(screen.getByRole("heading", { name: "Mi agenda" })).toBeInTheDocument();
    expect(screen.queryByText("Tu agenda llega pronto")).not.toBeInTheDocument();
  });

  it("sin la feature sigue viendo el aviso de que llega pronto", async () => {
    // El backend no le manda los permisos de la agenda: no ve ninguna
    // sección, y en un salón sin agenda eso es "llega pronto", no una cuenta
    // mal configurada.
    entrar(PROFESIONAL(["pos"]), SALON(["pos"]));
    await act(async () => {});
    expect(screen.getByText("Tu agenda llega pronto")).toBeInTheDocument();
    expect(screen.queryByText("Tu cuenta no tiene secciones")).not.toBeInTheDocument();
  });

  it("si el login sí le trae la agenda propia, entra a Mi agenda aunque falte la feature", async () => {
    entrar(PROFESIONAL([]), SALON(["pos"]));
    await act(async () => {});
    expect(window.location.pathname).toBe("/mi-agenda");
    expect(screen.getByText("Tu agenda llega pronto")).toBeInTheDocument();
  });

  it("recepción entra a Hoy", async () => {
    entrar(RECEPCION, SALON(["pos", "caja", "agenda"]));
    await act(async () => {});
    expect(window.location.pathname).toBe("/hoy");
    expect(screen.getByRole("heading", { name: "Hoy" })).toBeInTheDocument();
  });

  it("el dueño entra a la Agenda", async () => {
    entrar(DUENO, SALON(["pos", "inventario", "agenda"]));
    await act(async () => {});
    expect(window.location.pathname).toBe("/agenda");
    expect(screen.getByRole("heading", { name: "Agenda" })).toBeInTheDocument();
  });

  it("un cajero de restaurante que abre /hoy vuelve a su POS", async () => {
    tokenStore.set("token");
    localStorage.setItem(USER_KEY, JSON.stringify(RECEPCION));
    localStorage.setItem(
      NEGOCIO_KEY,
      JSON.stringify({ id: 1, nombre: "Pollos", tipoNegocio: "RESTAURANTE", features: ["pos", "caja", "agenda"] }),
    );
    window.history.replaceState(null, "", "/hoy");
    render(<App />);
    await act(async () => {});
    expect(window.location.pathname).toBe("/pos");
    expect(screen.getByText("Punto de venta")).toBeInTheDocument();
  });
});
