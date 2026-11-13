import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Gasto } from "../../../types";
import { ContextoReporte, type DatosReporte } from "../contexto";
import EstadoResultado from "./EstadoResultado";
import PuntoEquilibrio from "./PuntoEquilibrio";

/**
 * Con UNA sucursal elegida, el Estado de resultado y el Punto de equilibrio
 * avisan que no incluyen los gastos generales del negocio (alquiler de la
 * oficina, el contador: los que no son de ningún local). Con "Todas" ya están
 * en la cuenta, y con un solo local o un monto en cero no se dice nada.
 */

const reporte = vi.fn();
const getGastos = vi.fn();
const getResumenGastos = vi.fn();

vi.mock("../../../lib/api", () => ({
  api: {
    reporte: (...a: unknown[]) => reporte(...a),
    getGastos: (...a: unknown[]) => getGastos(...a),
    getResumenGastos: (...a: unknown[]) => getResumenGastos(...a),
  },
  qs: () => "",
  request: () => Promise.resolve(null),
}));

vi.mock("../../../store/AuthContext", () => ({
  useAuth: () => ({ rubro: "RESTAURANTE", negocio: { features: [] }, puede: () => true }),
}));

vi.mock("../../../lib/useSucursales", () => ({
  useSucursales: () => ({ elegir: true, sucursales: [], sucursalId: null }),
}));

const GASTOS = [{ id: 1, concepto: "Alquiler del local", categoria: "ALQUILER", categoriaNombre: "Alquiler", monto: 200, pagado: 0, fecha: "2026-09-01" } as Gasto];

function mostrar(vista: "resultado" | "equilibrio", sucursalId?: number) {
  const datos: DatosReporte = {
    periodo: { preset: "rango", desde: "2026-09-01", hasta: "2026-09-30" },
    comparacion: { desde: "2026-08-02", hasta: "2026-08-31", contra: "del 02/08 al 31/08/2026", leyenda: "Período anterior" },
    rango: { desde: "2026-09-01", hasta: "2026-09-30", ...(sucursalId != null ? { sucursalId } : {}) },
    rangoAnterior: { desde: "2026-08-02", hasta: "2026-08-31" },
    sucursalNombre: sucursalId != null ? "Norte" : "",
    registrarExportacion: () => {},
    veReporte: () => true,
  };
  return render(
    <MemoryRouter>
      <ContextoReporte.Provider value={datos}>{vista === "resultado" ? <EstadoResultado /> : <PuntoEquilibrio />}</ContextoReporte.Provider>
    </MemoryRouter>,
  );
}

const NOTA = /No incluye gastos generales del negocio \(Bs 80,00\)/;

beforeEach(() => {
  reporte.mockReset();
  getGastos.mockReset();
  getResumenGastos.mockReset();
  reporte.mockImplementation((nombre: string) =>
    nombre === "financiero"
      ? Promise.resolve({ ventas: 520, costoVentas: 140, utilidadBruta: 380, utilidadBrutaDeltaPct: null, ventasSinCosto: 0, mermas: 0, compras: { total: 0, insumos: 0, productos: 0 }, desglose: [] })
      : nombre === "resumen"
        ? Promise.resolve({ tickets: { valor: 8, deltaPct: null }, ticketPromedio: { valor: 65 } })
        : Promise.resolve(null),
  );
  getGastos.mockResolvedValue(GASTOS);
  getResumenGastos.mockResolvedValue({ total: 200, generales: { total: 80, cantidad: 1 } });
});

describe.each([["resultado" as const], ["equilibrio" as const]])("nota de gastos generales en %s", (vista) => {
  it("con una sucursal elegida dice cuánto de gastos generales no incluye", async () => {
    mostrar(vista, 3);
    expect(await screen.findByText(NOTA)).toBeInTheDocument();
    // Pidió el resumen de ESE local, no el de todos.
    expect(getResumenGastos).toHaveBeenCalledWith(expect.objectContaining({ sucursalId: 3 }));
  });

  it("con «Todas» no lo dice ni lo pide: los generales ya están en la cuenta", async () => {
    mostrar(vista);
    await waitFor(() => expect(getGastos).toHaveBeenCalled());
    expect(screen.queryByText(/gastos generales/)).toBeNull();
    expect(getResumenGastos).not.toHaveBeenCalled();
  });

  it("si no hay gastos generales, no dice nada", async () => {
    getResumenGastos.mockResolvedValue({ total: 200, generales: { total: 0, cantidad: 0 } });
    mostrar(vista, 3);
    await waitFor(() => expect(getResumenGastos).toHaveBeenCalled());
    await waitFor(() => expect(getGastos).toHaveBeenCalled());
    expect(screen.queryByText(/gastos generales/)).toBeNull();
  });

  it("un backend anterior que no manda el campo, o que falla, no tumba el reporte ni inventa la nota", async () => {
    getResumenGastos.mockRejectedValue(new Error("boom"));
    mostrar(vista, 3);
    await waitFor(() => expect(getResumenGastos).toHaveBeenCalled());
    await waitFor(() => expect(getGastos).toHaveBeenCalled());
    expect(screen.queryByText(/gastos generales/)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
