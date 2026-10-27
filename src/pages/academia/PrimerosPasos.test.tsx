import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ajustesDePrueba } from "../../test/academiaFixtures";

/**
 * C1 · «Primeros pasos»: se marca sola, desaparece al completarse, se oculta
 * con «Ya lo sé» (en este navegador) y sólo la ve quien configura el instituto.
 */

const sesion = vi.hoisted(() => ({ rol: "admin" as "admin" | "secretaria" | "docente" }));

vi.mock("../../store/AuthContext", async () => {
  const { SESION_ADMIN, SESION_SECRETARIA, SESION_DOCENTE } = await import("../../test/academiaFixtures");
  return {
    useAuth: () => ({
      ...(sesion.rol === "secretaria" ? SESION_SECRETARIA : sesion.rol === "docente" ? SESION_DOCENTE : SESION_ADMIN),
      puede: () => true,
    }),
  };
});

vi.mock("../../lib/api", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/api")>();
  return { ...real, api: { ...real.api, getAlmacenes: vi.fn() } };
});

vi.mock("../../lib/academia/apiAcademia", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/academia/apiAcademia")>();
  return { ...real, apiAcademia: { ajustes: vi.fn(), carreras: vi.fn(), docentes: vi.fn(), grupos: vi.fn() } };
});

import { apiAcademia } from "../../lib/academia/apiAcademia";
import { api } from "../../lib/api";
import PrimerosPasos from "./PrimerosPasos";

const CLAVE = "bamardev_primeros_pasos_20";

const curso = { id: 1, nombre: "Barbería", activa: true, precioModulo: 500, planes: [], materias: [{ id: 1, activa: true }] };

function cargarTodoHecho() {
  vi.mocked(api.getAlmacenes).mockResolvedValue([{ id: 1, nombre: "Central", activo: true, tipo: "SUCURSAL", direccion: "Av. Blanco 123" }] as never);
  vi.mocked(apiAcademia.ajustes).mockResolvedValue(ajustesDePrueba({ paginaPublicada: true }));
  vi.mocked(apiAcademia.carreras).mockResolvedValue([curso] as never);
  vi.mocked(apiAcademia.docentes).mockResolvedValue([{ personalId: 1, nombre: "Marco", sedes: [], pctDocente: null, retencionPct: null, tieneLogin: true }]);
  vi.mocked(apiAcademia.grupos).mockResolvedValue({ items: [{ id: 1, cancelado: false, estado: "EN_CURSO" }], total: 1, page: 1, pageSize: 100 } as never);
}

/** Un instituto recién dado de alta: la sede "Central" sin dirección y nada más. */
function cargarVacio() {
  cargarTodoHecho();
  vi.mocked(api.getAlmacenes).mockResolvedValue([{ id: 1, nombre: "Central", activo: true, tipo: "SUCURSAL", direccion: null }] as never);
  vi.mocked(apiAcademia.ajustes).mockResolvedValue(ajustesDePrueba({ franjas: [], paginaPublicada: false }));
  vi.mocked(apiAcademia.carreras).mockResolvedValue([]);
  vi.mocked(apiAcademia.docentes).mockResolvedValue([]);
  vi.mocked(apiAcademia.grupos).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 100 });
}

async function montar() {
  render(
    <MemoryRouter>
      <PrimerosPasos />
    </MemoryRouter>,
  );
  await act(async () => {});
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sesion.rol = "admin";
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

describe("C1 · Primeros pasos", () => {
  it("incompleta: las seis casillas, las pendientes con su botón a la pantalla donde se hacen", async () => {
    cargarVacio();
    await montar();
    const tarjeta = screen.getByRole("region", { name: "Primeros pasos" });
    expect(within(tarjeta).getAllByRole("listitem")).toHaveLength(6);
    expect(within(tarjeta).getByText(/0 de 6 listos/)).toBeInTheDocument();
    expect(within(tarjeta).getByRole("progressbar", { name: "Primeros pasos" })).toHaveAttribute("aria-valuenow", "0");
    expect(within(tarjeta).getByRole("link", { name: /Ir a Sedes/ })).toHaveAttribute("href", "/inventario/almacenes");
    expect(within(tarjeta).getByRole("link", { name: /Cargar franjas/ })).toHaveAttribute("href", "/configuracion/academia#s-franjas");
    expect(within(tarjeta).getByRole("link", { name: /Crear un curso/ })).toHaveAttribute("href", "/configuracion/carreras");
    expect(within(tarjeta).getByRole("link", { name: /Ir a Personal/ })).toHaveAttribute("href", "/personal");
    expect(within(tarjeta).getByRole("link", { name: /Abrir un grupo/ })).toHaveAttribute("href", "/academia/calendario");
    expect(within(tarjeta).getByRole("link", { name: /Ir a Mi página/ })).toHaveAttribute("href", "/mi-pagina");
  });

  it("parcial: lo hecho se marca solo y ya no pide botón; el resto sigue", async () => {
    cargarVacio();
    vi.mocked(apiAcademia.carreras).mockResolvedValue([curso] as never);
    await montar();
    const tarjeta = screen.getByRole("region", { name: "Primeros pasos" });
    expect(within(tarjeta).getByText(/1 de 6 listos/)).toBeInTheDocument();
    expect(within(tarjeta).getByText("Un curso con módulos y precio").parentElement).toHaveTextContent(/^Listo: /);
    expect(within(tarjeta).queryByRole("link", { name: /Crear un curso/ })).not.toBeInTheDocument();
    expect(within(tarjeta).getByRole("link", { name: /Ir a Sedes/ })).toBeInTheDocument();
  });

  it("completa: desaparece sola y lo recuerda, sin volver a pedir datos la próxima vez", async () => {
    cargarTodoHecho();
    await montar();
    expect(screen.queryByRole("region", { name: "Primeros pasos" })).not.toBeInTheDocument();
    expect(localStorage.getItem(CLAVE)).toBe("completo");
    // Al volver a entrar ni siquiera se consulta.
    cleanup();
    vi.mocked(apiAcademia.ajustes).mockClear();
    await montar();
    expect(screen.queryByRole("region", { name: "Primeros pasos" })).not.toBeInTheDocument();
    expect(apiAcademia.ajustes).not.toHaveBeenCalled();
  });

  it("«Ya lo sé» la oculta y la preferencia queda guardada", async () => {
    cargarVacio();
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Ya lo sé" }));
    expect(screen.queryByRole("region", { name: "Primeros pasos" })).not.toBeInTheDocument();
    expect(localStorage.getItem(CLAVE)).toBe("oculto");
    cleanup();
    await montar();
    expect(screen.queryByRole("region", { name: "Primeros pasos" })).not.toBeInTheDocument();
  });

  it("si el navegador no deja guardar (modo privado), «Ya lo sé» igual la oculta ahora y no rompe", async () => {
    cargarVacio();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    await montar();
    expect(screen.getByRole("region", { name: "Primeros pasos" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ya lo sé" }));
    expect(screen.queryByRole("region", { name: "Primeros pasos" })).not.toBeInTheDocument();
  });

  it("la recepción y el docente no la ven, ni se piden los datos", async () => {
    cargarVacio();
    for (const rol of ["secretaria", "docente"] as const) {
      sesion.rol = rol;
      await montar();
      expect(screen.queryByRole("region", { name: "Primeros pasos" })).not.toBeInTheDocument();
      cleanup();
    }
    expect(apiAcademia.ajustes).not.toHaveBeenCalled();
    expect(api.getAlmacenes).not.toHaveBeenCalled();
  });

  it("un paso que no se pudo saber (un permiso que falta) no se muestra ni se da por hecho", async () => {
    cargarVacio();
    vi.mocked(apiAcademia.docentes).mockRejectedValue(new Error("Sin permiso"));
    vi.mocked(api.getAlmacenes).mockRejectedValue(new Error("Sin permiso"));
    await montar();
    const tarjeta = screen.getByRole("region", { name: "Primeros pasos" });
    expect(within(tarjeta).getAllByRole("listitem")).toHaveLength(4);
    expect(within(tarjeta).queryByText(/con acceso/)).not.toBeInTheDocument();
  });

  it("completa con un paso sin saber: se esconde, pero no se la da por terminada para siempre", async () => {
    cargarTodoHecho();
    vi.mocked(apiAcademia.docentes).mockRejectedValue(new Error("Sin permiso"));
    await montar();
    expect(screen.queryByRole("region", { name: "Primeros pasos" })).not.toBeInTheDocument();
    expect(localStorage.getItem(CLAVE)).toBeNull();
  });
});
