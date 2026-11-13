import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CitaSolicitud } from "../../lib/agenda/apiReservaOnline";
import type { AvisoAgenda } from "../../lib/agenda/tiposAgenda";
import { cita } from "../../test/agendaFixtures";

/**
 * Sucursal en la agenda (PLAN-SUCURSAL-TOTAL §1): con 2+ locales la
 * organización elige y ve de qué local es cada solicitud y cada aviso; quien
 * está atado a uno no ve selector, sólo su sede; con un local no cambia nada.
 */

const sesion = vi.hoisted(() => ({
  /** null = organización; un número = atado a esa sede. */
  sucursalId: null as number | null,
  sucursal: null as string | null,
  /** Cuántas sucursales activas dice la sesión. */
  locales: 2,
}));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    usuario: {
      id: 3,
      username: "dueno",
      rol: "ADMIN",
      sucursalId: sesion.sucursalId,
      sucursal: sesion.sucursal,
      permisos: ["agenda.ver", "reservas.aprobar"],
    },
    negocio: {
      id: 1,
      nombre: "Salón Bella Vista",
      tipoNegocio: "PELUQUERIA",
      features: ["agenda", "reserva_online"],
      sucursalesActivas: sesion.locales,
    },
    cupo: undefined,
    actualizarCupo: vi.fn(),
    refrescarCupo: vi.fn(async () => {}),
  }),
}));

vi.mock("../../lib/api", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/api")>();
  return {
    ...real,
    api: {
      ...real.api,
      // La organización pide la lista: con `locales: 1` sólo hay una.
      getSucursales: vi.fn(async () =>
        [
          { id: 1, nombre: "Central", activo: true, tipo: "SUCURSAL", esPrincipal: true },
          { id: 2, nombre: "Norte", activo: true, tipo: "SUCURSAL", esPrincipal: false },
        ].slice(0, sesion.locales),
      ),
    },
  };
});

vi.mock("../../lib/agenda/apiReservaOnline", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/agenda/apiReservaOnline")>();
  return { ...real, apiReservaOnline: { bandeja: vi.fn(), aprobar: vi.fn(), rechazar: vi.fn(), revisar: vi.fn() } };
});

vi.mock("../../lib/agenda/apiAgenda", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/agenda/apiAgenda")>();
  return { ...real, apiAgenda: { avisos: vi.fn(), cita: vi.fn() } };
});

import { apiAgenda } from "../../lib/agenda/apiAgenda";
import { apiReservaOnline } from "../../lib/agenda/apiReservaOnline";
import CampanaAvisos from "./CampanaAvisos";
import Solicitudes from "./Solicitudes";

const solicitud = (id: number, sucursalId: number, sucursal: string, nombre: string): CitaSolicitud => ({
  ...cita({
    id,
    estado: "SOLICITADA",
    origen: "ONLINE",
    sucursalId,
    sucursal,
    cliente: { id: id + 50, nombre, telefono: null, noShows: 0, nuevo: true, alergias: null },
  }),
  venceEn: null,
});

const montarSolicitudes = async () => {
  render(
    <MemoryRouter>
      <Solicitudes />
    </MemoryRouter>,
  );
  await act(async () => {});
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sesion.sucursalId = null;
  sesion.sucursal = null;
  sesion.locales = 2;
});

describe("Solicitudes con 2+ locales", () => {
  beforeEach(() => {
    vi.mocked(apiReservaOnline.bandeja).mockResolvedValue({
      solicitudes: [solicitud(7, 1, "Central", "María Flores"), solicitud(8, 2, "Norte", "Ana Paz")],
      nuevas: [],
      contador: { pendientes: 2, nuevas: 0 },
    });
  });

  it("la organización ve «Todas», el local en cada tarjeta, y al elegir uno pide ese local", async () => {
    await montarSolicitudes();
    expect(apiReservaOnline.bandeja).toHaveBeenLastCalledWith(null);
    expect(screen.getByRole("button", { name: "Todas las sucursales" })).toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "Solicitud de María Flores" })).getByText("Central")).toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "Solicitud de Ana Paz" })).getByText("Norte")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Norte" }));
    });
    expect(apiReservaOnline.bandeja).toHaveBeenLastCalledWith(2);
  });

  it("si la bandeja es de un solo local no repite el local en cada tarjeta", async () => {
    vi.mocked(apiReservaOnline.bandeja).mockResolvedValue({
      solicitudes: [solicitud(7, 1, "Central", "María Flores")],
      nuevas: [],
      contador: { pendientes: 1, nuevas: 0 },
    });
    await montarSolicitudes();
    expect(
      within(screen.getByRole("article", { name: "Solicitud de María Flores" })).queryByText("Central"),
    ).not.toBeInTheDocument();
  });

  it("quien está atado a un local no ve selector ni etiquetas por tarjeta, sólo su sede arriba", async () => {
    sesion.sucursalId = 2;
    sesion.sucursal = "Norte";
    vi.mocked(apiReservaOnline.bandeja).mockResolvedValue({
      solicitudes: [solicitud(8, 2, "Norte", "Ana Paz")],
      nuevas: [],
      contador: { pendientes: 1, nuevas: 0 },
    });
    await montarSolicitudes();
    expect(apiReservaOnline.bandeja).toHaveBeenLastCalledWith(2);
    expect(screen.queryByRole("button", { name: "Todas las sucursales" })).not.toBeInTheDocument();
    expect(screen.getByText(/Las reservas de tu página que esperan respuesta\. · Norte/)).toBeInTheDocument();
    expect(
      within(screen.getByRole("article", { name: "Solicitud de Ana Paz" })).queryByText("Norte"),
    ).not.toBeInTheDocument();
  });

  it("con un solo local no aparece nada nuevo", async () => {
    sesion.locales = 1;
    await montarSolicitudes();
    expect(screen.queryByRole("button", { name: "Todas las sucursales" })).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("article", { name: "Solicitud de María Flores" })).queryByText("Central"),
    ).not.toBeInTheDocument();
  });
});

describe("la campana por local", () => {
  const aviso = (clave: string, sucursalId: number, sucursal: string): AvisoAgenda => ({
    clave,
    tipo: "CITA_NUEVA",
    citaId: sucursalId,
    codigo: "K7M2QX",
    cliente: "Rosa Mamani",
    sucursalId,
    sucursal,
    inicio: "2026-10-21T14:00:00.000Z",
    recursos: ["Carla R."],
    usuario: "Lucía",
    en: "2026-10-21T14:58:00.000Z",
    texto: `Cita nueva en ${sucursal}`,
  });

  async function montar(sucursalId?: number | null) {
    vi.mocked(apiAgenda.avisos).mockResolvedValue({
      ahora: "2026-10-21T15:00:00.000Z",
      avisos: [aviso("a", 1, "Central"), aviso("b", 2, "Norte")],
    });
    render(<CampanaAvisos onAbrirCita={vi.fn()} sucursalId={sucursalId} />);
    await act(async () => {});
  }

  it("con un local elegido pide los avisos de ese local, y lo visto se guarda por local", async () => {
    await montar(2);
    expect(apiAgenda.avisos).toHaveBeenCalledWith(undefined, 2);
    fireEvent.click(screen.getByRole("button", { name: /Avisos/ }));
    expect(localStorage.getItem("bamar.avisos.vistoHasta.3.s2")).toBe("2026-10-21T15:00:00.000Z");
    expect(localStorage.getItem("bamar.avisos.vistoHasta.3")).toBeNull();
  });

  it("sin local elegido pide como siempre y guarda la clave de siempre", async () => {
    await montar(null);
    expect(apiAgenda.avisos).toHaveBeenCalledWith();
    fireEvent.click(screen.getByRole("button", { name: /Avisos/ }));
    expect(localStorage.getItem("bamar.avisos.vistoHasta.3")).toBe("2026-10-21T15:00:00.000Z");
  });

  it("si llegan avisos de 2+ locales, cada uno dice el suyo", async () => {
    await montar(null);
    fireEvent.click(screen.getByRole("button", { name: /Avisos/ }));
    expect(screen.getByRole("button", { name: /Cita nueva en Norte/ })).toHaveTextContent("Lucía · Norte");
  });
});
