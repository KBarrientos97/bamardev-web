import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

vi.mock("../../../lib/useSucursales", async (original) => ({
  // Las funciones puras (`hayVariasEntre`) son las de verdad; sólo el hook es de mentira.
  ...(await original<typeof import("../../../lib/useSucursales")>()),
  useSucursales: () => ({ elegir: true, sucursales: [], sucursalId: null }),
}));

const GASTOS = [{ id: 1, concepto: "Alquiler del local", categoria: "ALQUILER", categoriaNombre: "Alquiler", monto: 200, pagado: 0, fecha: "2026-09-01" } as Gasto];

function mostrar(vista: "resultado" | "equilibrio", sucursalId?: number, variasSucursales?: boolean) {
  const datos: DatosReporte = {
    periodo: { preset: "rango", desde: "2026-09-01", hasta: "2026-09-30" },
    comparacion: { desde: "2026-08-02", hasta: "2026-08-31", contra: "del 02/08 al 31/08/2026", leyenda: "Período anterior" },
    rango: { desde: "2026-09-01", hasta: "2026-09-30", ...(sucursalId != null ? { sucursalId } : {}) },
    rangoAnterior: { desde: "2026-08-02", hasta: "2026-08-31" },
    sucursalNombre: sucursalId != null ? "Norte" : "",
    variasSucursales,
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

describe("el detalle de los gastos en el consolidado", () => {
  const gasto = (id: number, concepto: string, sucursalId: number | null, sucursal: string | null) =>
    ({ id, concepto, categoria: "ALQUILER", categoriaNombre: "Alquiler", monto: 100, pagado: 0, fecha: "2026-09-01", sucursalId, sucursal }) as Gasto;

  async function abrirGastosDelLocal(varias: boolean) {
    getGastos.mockResolvedValue([gasto(1, "Alquiler Centro", 1, "Centro"), gasto(2, "Alquiler Norte", 2, "Norte"), gasto(3, "Alquiler oficina", null, null)]);
    mostrar("resultado", undefined, varias);
    const paso = (await screen.findAllByRole("button", { name: /Gastos del local/ }))[0];
    fireEvent.click(paso);
    return await screen.findByRole("dialog");
  }

  it("dice de qué local es cada gasto, y que el de la oficina es general", async () => {
    const detalle = await abrirGastosDelLocal(true);
    expect(within(detalle).getByText(/· Centro$/)).toBeInTheDocument();
    expect(within(detalle).getByText(/· Norte$/)).toBeInTheDocument();
    expect(within(detalle).getByText(/· General del negocio$/)).toBeInTheDocument();
  });

  it("con un solo local, o asignado a una sede, la lista es la de siempre", async () => {
    const detalle = await abrirGastosDelLocal(false);
    expect(within(detalle).getByText("Alquiler Centro")).toBeInTheDocument();
    expect(within(detalle).queryByText(/General del negocio/)).toBeNull();
    expect(within(detalle).queryByText(/· Norte$/)).toBeNull();
  });
});
