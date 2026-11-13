import { act, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CenasReporteApi } from "../../api";
import { ContextoReporte, type DatosReporte } from "../../contexto";

/**
 * Cenas del personal con «Todas las sucursales» (PLAN-SUCURSAL-TOTAL §9.6): el
 * backend ya las consolida de todos los locales, así que NO lleva la nota de
 * «sólo la principal» de los demás reportes del billar, y con 2+ locales trae
 * su cuadro por local.
 */

vi.mock("../../api", async (original) => ({
  ...(await original<typeof import("../../api")>()),
  apiReportes: { cenas: vi.fn() },
}));

vi.mock("../../../../lib/useSucursales", () => ({
  useSucursales: () => ({ elegir: true, sucursales: [{ id: 1, nombre: "Centro", esPrincipal: true }] }),
}));

import { apiReportes } from "../../api";
import Cenas from "./Cenas";

const registrarExportacion = vi.fn();

const contexto: DatosReporte = {
  periodo: { preset: "semana", desde: "2026-10-02", hasta: "2026-10-08" },
  comparacion: { desde: "2026-09-25", hasta: "2026-10-01", contra: "la semana anterior", leyenda: "Semana anterior" },
  rango: { desde: "2026-10-02", hasta: "2026-10-08" },
  rangoAnterior: { desde: "2026-09-25", hasta: "2026-10-01" },
  sucursalNombre: "",
  sucursalArchivo: { nombre: "Todas las sucursales", rotulo: "Sucursal" },
  registrarExportacion,
  veReporte: () => true,
};

const base: CenasReporteApi = {
  sucursal: null,
  porSucursal: null,
  desde: "2026-10-02",
  hasta: "2026-10-08",
  dias: 7,
  total: 150,
  nochesAbiertas: 7,
  nochesConCena: 5,
  promedio: 30,
  maxima: 40,
  porNoche: [{ cajaId: 1, dia: "2026-10-02", cajera: "Ana", monto: 40, registro: "Miguel", abierta: false }],
  porDia: [{ dia: "2026-10-02", monto: 40 }],
  porCajera: [{ nombre: "Ana", monto: 150, noches: 5 }],
  anterior: null,
};

async function montar() {
  render(
    <MemoryRouter>
      <ContextoReporte.Provider value={contexto}>
        <Cenas />
      </ContextoReporte.Provider>
    </MemoryRouter>,
  );
  await act(async () => {});
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("cenas del personal con «Todas»", () => {
  it("ya no dice que es la principal sola: las cenas son de todos los locales", async () => {
    vi.mocked(apiReportes.cenas).mockResolvedValue(base);
    await montar();
    expect(screen.getByText("Gastado en cenas")).toBeInTheDocument();
    expect(screen.queryByText(/El billar se mira de a un local/)).toBeNull();
  });

  it("con 2+ locales muestra lo de cada uno y su Excel suma la hoja", async () => {
    vi.mocked(apiReportes.cenas).mockResolvedValue({
      ...base,
      porSucursal: [
        { sucursal: { id: 1, nombre: "Centro" }, total: 100, nochesAbiertas: 7, nochesConCena: 4, promedio: 25 },
        { sucursal: { id: 2, nombre: "Norte" }, total: 50, nochesAbiertas: 6, nochesConCena: 1, promedio: 50 },
      ],
    });
    await montar();
    const bloque = screen.getByText("Por sucursal").parentElement!;
    expect(within(bloque).getByText("Centro")).toBeInTheDocument();
    expect(within(bloque).getByText("4 de 7 noches con cena · Bs 25,00 en promedio")).toBeInTheDocument();
    expect(within(bloque).getByText("Norte")).toBeInTheDocument();
    const exportacion = registrarExportacion.mock.calls.map((c) => c[0]).filter(Boolean).pop();
    const hojas: { nombre: string; filas: unknown[][] }[] = exportacion.hojas();
    expect(hojas.map((h) => h.nombre)).toEqual(["Por noche", "Por sucursal", "Por cajera"]);
    expect(hojas[1].filas.map((f) => f[0])).toEqual(["Sucursal", "Centro", "Norte"]);
  });

  it("con un local (o uno elegido) no hay cuadro por sucursal", async () => {
    vi.mocked(apiReportes.cenas).mockResolvedValue(base);
    await montar();
    expect(screen.queryByText("Por sucursal")).toBeNull();
    const exportacion = registrarExportacion.mock.calls.map((c) => c[0]).filter(Boolean).pop();
    expect(exportacion.hojas().map((h: { nombre: string }) => h.nombre)).toEqual(["Por noche", "Por cajera"]);
  });
});
