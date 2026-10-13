import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RentabilidadServicios } from "../../../../lib/belleza/apiExtras";
import { ContextoReporte, type DatosReporte } from "../../contexto";

/**
 * Costo y margen por servicio, ya dentro de Reportes: mira el período de
 * arriba (antes tenía sus propias fechas, sin tope) y se baja a Excel.
 */

vi.mock("../../../../lib/belleza/apiExtras", () => ({
  apiExtras: { rentabilidadServicios: vi.fn() },
}));

import { apiExtras } from "../../../../lib/belleza/apiExtras";
import MargenServicios from "./MargenServicios";

const registrarExportacion = vi.fn();

const contexto: DatosReporte = {
  periodo: { preset: "dias90", desde: "2026-07-16", hasta: "2026-10-13" },
  comparacion: { desde: "2026-04-17", hasta: "2026-07-15", contra: "los 3 meses anteriores", leyenda: "3 meses anteriores" },
  rango: { desde: "2026-07-16", hasta: "2026-10-13" },
  rangoAnterior: { desde: "2026-04-17", hasta: "2026-07-15" },
  sucursalNombre: "",
  registrarExportacion,
  veReporte: () => true,
};

const fila = (extra: Partial<RentabilidadServicios["servicios"][number]> = {}) => ({
  servicioId: 100,
  servicio: "Tinte raíz",
  cantidad: 1,
  ingreso: 150,
  costoInsumos: 46.5,
  costoPorServicio: 46.5,
  margen: 103.5,
  margenPct: 69,
  ...extra,
});

async function montar() {
  render(
    <MemoryRouter>
      <ContextoReporte.Provider value={contexto}>
        <MargenServicios />
      </ContextoReporte.Provider>
    </MemoryRouter>,
  );
  await act(async () => {});
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("costo y margen por servicio", () => {
  it("pide el período de arriba, en días, y muestra el margen de cada servicio", async () => {
    vi.mocked(apiExtras.rentabilidadServicios).mockResolvedValue({
      desde: "2026-07-16",
      hasta: "2026-10-13",
      ingreso: 150,
      costoInsumos: 46.5,
      margen: 103.5,
      servicios: [fila()],
    });
    await montar();
    expect(apiExtras.rentabilidadServicios).toHaveBeenCalledWith({ desde: "2026-07-16", hasta: "2026-10-13" });
    const renglon = screen.getByRole("row", { name: /Tinte raíz/ });
    expect(renglon).toHaveTextContent("103,50");
    expect(renglon).toHaveTextContent("69%");
    // Con datos, se puede bajar a Excel.
    expect(registrarExportacion).toHaveBeenLastCalledWith(expect.objectContaining({ nombre: "costo-y-margen-por-servicio" }));
  });

  it("QA S2SEG-04: sin costos.ver el backend no manda costos y se ve una raya", async () => {
    vi.mocked(apiExtras.rentabilidadServicios).mockResolvedValue({
      desde: "2026-07-16",
      hasta: "2026-10-13",
      ingreso: 150,
      costoInsumos: null,
      margen: null,
      servicios: [fila({ costoInsumos: null, costoPorServicio: null, margen: null, margenPct: null })],
    });
    await montar();
    const renglon = screen.getByRole("row", { name: /Tinte raíz/ });
    expect(renglon).toHaveTextContent("150,00");
    expect(renglon).toHaveTextContent("—");
    expect(renglon).not.toHaveTextContent("0,00 c/u");
  });

  it("sin servicios cobrados lo dice, y no ofrece un Excel vacío", async () => {
    vi.mocked(apiExtras.rentabilidadServicios).mockResolvedValue({
      desde: "2026-07-16",
      hasta: "2026-10-13",
      ingreso: 0,
      costoInsumos: 0,
      margen: 0,
      servicios: [],
    });
    await montar();
    expect(screen.getByText("Sin servicios cobrados en este período")).toBeInTheDocument();
    expect(registrarExportacion).not.toHaveBeenCalledWith(expect.objectContaining({ nombre: "costo-y-margen-por-servicio" }));
  });
});
