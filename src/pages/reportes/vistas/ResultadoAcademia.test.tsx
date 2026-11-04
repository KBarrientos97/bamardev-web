import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResultadoAcademiaApi } from "../api";
import { catalogo } from "../catalogo";
import { ContextoReporte, type DatosReporte } from "../contexto";
import ResultadoAcademia from "./ResultadoAcademia";
import { hojaResultado } from "./ResultadoAcademia.datos";

/**
 * Resultado de la academia (Derick, 04-nov): lo cobrado por clases menos los
 * gastos del período, para el socio de la academia. Es un reporte aparte del
 * Estado de resultado y sólo existe en el rubro educativo.
 */

const request = vi.fn();

vi.mock("../../../lib/api", () => ({
  api: {},
  qs: (o: Record<string, unknown>) => `?${new URLSearchParams(Object.entries(o).filter(([, v]) => v != null) as [string, string][])}`,
  request: (...a: unknown[]) => request(...a),
}));

vi.mock("../../../store/AuthContext", () => ({
  useAuth: () => ({ rubro: "ACADEMIA" }),
}));

const DATOS: ResultadoAcademiaApi = {
  desde: "2026-10-01",
  hasta: "2026-10-31",
  sede: null,
  ingresos: 5000,
  gastos: 3200,
  categorias: [
    { codigo: "SUELDOS", nombre: "Sueldos", monto: 2000, cantidad: 3 },
    { codigo: "ALQUILER", nombre: "Alquiler", monto: 1200, cantidad: 1 },
  ],
  resultado: 1800,
};

function mostrar() {
  const datos: DatosReporte = {
    periodo: { preset: "rango", desde: "2026-10-01", hasta: "2026-10-31" },
    comparacion: { desde: "2026-09-01", hasta: "2026-09-30", contra: "del 01/09 al 30/09/2026", leyenda: "Período anterior" },
    rango: { desde: "2026-10-01", hasta: "2026-10-31" },
    rangoAnterior: { desde: "2026-09-01", hasta: "2026-09-30" },
    sucursalNombre: "",
    registrarExportacion: () => {},
    veReporte: () => true,
  };
  return render(
    <MemoryRouter>
      <ContextoReporte.Provider value={datos}>
        <ResultadoAcademia />
      </ContextoReporte.Provider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  request.mockReset();
  request.mockResolvedValue(DATOS);
});

describe("Resultado de la academia", () => {
  it("lo cobrado por clases, los gastos por categoría y la ganancia", async () => {
    mostrar();
    expect(await screen.findByText("Ganancia")).toBeInTheDocument();
    expect(String(request.mock.calls[0][0])).toMatch(/^\/academia\/reportes\/resultado\?/);
    expect(screen.getByText("Cobrado por clases")).toBeInTheDocument();
    expect(screen.getByText("Sueldos")).toBeInTheDocument();
    expect(screen.getByText("Alquiler")).toBeInTheDocument();
    expect(screen.getByText(/lo que se vende en la tienda no cuenta/)).toBeInTheDocument();
  });

  it("con más gastos que clases dice pérdida", async () => {
    request.mockResolvedValue({ ...DATOS, ingresos: 1000, resultado: -2200 });
    mostrar();
    expect(await screen.findByText("Pérdida")).toBeInTheDocument();
  });

  it("el Excel trae las clases, cada gasto restando y el resultado", () => {
    const h = hojaResultado(DATOS);
    expect(h.filas).toEqual([
      ["Concepto", "Monto (Bs)"],
      ["Cobrado por clases", 5000],
      ["Gasto · Sueldos", -2000],
      ["Gasto · Alquiler", -1200],
      ["Resultado de la academia", 1800],
    ]);
  });

  it("sólo existe en el rubro educativo", () => {
    const ficha = (r: string) => catalogo(r).find((f) => f.id === "resultado-academia");
    expect(ficha("ACADEMIA")?.soloEnRubro?.("ACADEMIA")).toBe(true);
    expect(ficha("RESTAURANTE")?.soloEnRubro?.("RESTAURANTE")).toBe(false);
  });
});
