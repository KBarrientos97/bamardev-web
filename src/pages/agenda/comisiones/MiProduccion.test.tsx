import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A10 · "Mi producción" (fase 2): el profesional ve su producción y su
 * comisión en Mi agenda, sólo si el negocio tiene comisiones y su permiso lo
 * deja (alcance PROPIO: el backend ya le manda sólo lo suyo).
 */

const auth = vi.hoisted(() => ({
  ve: true,
}));

vi.mock("../../../store/AuthContext", () => ({
  useAuth: () => ({
    usuario: { id: 8, username: "carla", nombre: "Carla", rol: "PROFESIONAL", sucursalId: null, modulos: [] },
    negocio: { id: 1, nombre: "Salón Bella Vista", tipoNegocio: "PELUQUERIA" },
    logout: vi.fn(),
    puede: (s: string) => s === "mi_produccion" && auth.ve,
  }),
}));

vi.mock("../../../lib/agenda/apiAgenda", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../lib/agenda/apiAgenda")>();
  return {
    ...real,
    apiAgenda: {
      miAgenda: vi.fn(async () => ({
        recursos: [
          {
            id: 1,
            tipo: "PROFESIONAL",
            nombre: "Carla",
            nombrePublico: null,
            color: "#7357B8",
            telefono: null,
            comisionPct: 40,
            usuarioId: 8,
            usuario: null,
            publicadoOnline: false,
            activo: true,
            orden: 0,
            sucursalIds: [1],
            servicioIds: [],
          },
        ],
        citas: [],
      })),
      reglas: vi.fn(async () => null),
      avisos: vi.fn(async () => ({ avisos: [], hasta: new Date().toISOString() })),
    },
  };
});

vi.mock("../../../lib/agenda/apiComisiones", () => ({
  apiComisiones: { resumen: vi.fn() },
}));

import { apiComisiones } from "../../../lib/agenda/apiComisiones";
import MiAgenda from "../MiAgenda";

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-21T13:00:00.000Z"));
  auth.ve = true;
  vi.mocked(apiComisiones.resumen).mockResolvedValue({
    desde: "2026-10-19",
    hasta: "2026-10-25",
    sucursalId: null,
    profesionales: [
      {
        recursoId: 1,
        nombre: "Carla",
        color: "#7357B8",
        activo: true,
        produccion: 300,
        produccionServicios: 300,
        produccionProductos: 0,
        servicios: 4,
        comision: 120,
        porLiquidar: 120,
        adelantosPendientes: 50,
      },
    ],
    totales: { produccion: 300, comision: 120, porLiquidar: 120 },
  });
});

afterEach(() => {
  vi.useRealTimers();
});

async function montar() {
  render(
    <MemoryRouter>
      <MiAgenda />
    </MemoryRouter>,
  );
  await act(async () => {});
}

describe("A10 · mi producción", () => {
  it("muestra su producción, su comisión y los adelantos de la semana", async () => {
    await montar();
    const tarjeta = screen.getByRole("region", { name: "Mi producción" });
    expect(apiComisiones.resumen).toHaveBeenCalledWith({ desde: "2026-10-19", hasta: "2026-10-25" });
    expect(tarjeta).toHaveTextContent("300,00");
    expect(tarjeta).toHaveTextContent("4 servicios");
    expect(tarjeta).toHaveTextContent("120,00");
    expect(tarjeta).toHaveTextContent("50,00");

    fireEvent.click(screen.getByRole("button", { name: "Mes" }));
    await act(async () => {});
    expect(apiComisiones.resumen).toHaveBeenLastCalledWith({ desde: "2026-10-01", hasta: "2026-10-31" });
  });

  it("sin comisiones (o sin permiso) no aparece ni se pide", async () => {
    auth.ve = false;
    await montar();
    expect(screen.queryByRole("region", { name: "Mi producción" })).not.toBeInTheDocument();
    expect(apiComisiones.resumen).not.toHaveBeenCalled();
  });
});
