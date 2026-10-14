import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MeserosApi } from "../api";
import { ContextoReporte, type DatosReporte } from "../contexto";

/** Ventas por mesero: lo del backend, sin promedios en cero donde no hay con qué dividir. */

vi.mock("../api", async (original) => ({
  ...(await original<typeof import("../api")>()),
  apiReportes: { meseros: vi.fn() },
}));

import { apiReportes } from "../api";
import Meseros from "./Meseros";

const contexto: DatosReporte = {
  periodo: { preset: "mes", desde: "2026-10-01", hasta: "2026-10-12" },
  comparacion: { desde: "2026-09-01", hasta: "2026-09-12", contra: "1–12 de septiembre", leyenda: "1–12 de septiembre" },
  rango: { desde: "2026-10-01", hasta: "2026-10-12", sucursalId: 3 },
  rangoAnterior: { desde: "2026-09-01", hasta: "2026-09-12", sucursalId: 3 },
  sucursalNombre: "Centro",
  registrarExportacion: vi.fn(),
  veReporte: () => true,
};

const respuesta: MeserosApi = {
  totales: { vendido: 2400, mesas: 16, comensales: 48, propinas: 120, ticketPromedio: 150, porComensal: 50, itemsAnulados: 3, montoAnulado: 45, meseros: 3 },
  items: [
    { meseroId: 1, mesero: "Ana", mesas: 10, comensales: 30, vendido: 1500, ticketPromedio: 150, porComensal: 50, propinas: 80, itemsAnulados: 0, montoAnulado: 0, minutosPromedio: 55 },
    { meseroId: 2, mesero: "Luis", mesas: 6, comensales: 18, vendido: 900, ticketPromedio: 150, porComensal: 50, propinas: 40, itemsAnulados: 0, montoAnulado: 0, minutosPromedio: 80 },
    { meseroId: 9, mesero: "Encargada", mesas: 0, comensales: 0, vendido: 0, ticketPromedio: 0, porComensal: 0, propinas: 0, itemsAnulados: 3, montoAnulado: 45, minutosPromedio: 0 },
  ],
};

async function montar() {
  render(
    <MemoryRouter>
      <ContextoReporte.Provider value={contexto}>
        <Meseros />
      </ContextoReporte.Provider>
    </MemoryRouter>,
  );
  await act(async () => {});
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiReportes.meseros).mockResolvedValue(respuesta);
});

describe("ventas por mesero", () => {
  it("pide el período y la sucursal de arriba, y muestra lo vendido, las mesas y las propinas aparte", async () => {
    await montar();
    expect(apiReportes.meseros).toHaveBeenCalledWith(contexto.rango);
    expect(screen.getByText("Vendido en salón")).toBeInTheDocument();
    expect(screen.getByText("2 meseros")).toBeInTheDocument();
    expect(screen.getByText("Bs 150 por mesa")).toBeInTheDocument();
    expect(screen.getByText("Aparte: no están en lo vendido")).toBeInTheDocument();
    expect(screen.getByText("Quién vendió más")).toBeInTheDocument();
  });

  it("quien sólo anuló aparece marcado y con sus anulaciones, sin 'Bs 0 por mesa'", async () => {
    await montar();
    expect(screen.getAllByText("Sólo anuló").length).toBeGreaterThan(0);
    expect(screen.getAllByText("3 ítems · −Bs 45,00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("1 h 20 min").length).toBeGreaterThan(0);
  });

  it("sin mesas en el período lo dice", async () => {
    vi.mocked(apiReportes.meseros).mockResolvedValue({ ...respuesta, items: [] });
    await montar();
    expect(screen.getByText("Sin ventas de salón en este período")).toBeInTheDocument();
  });
});
