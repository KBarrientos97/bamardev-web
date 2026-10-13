import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Gasto } from "../../../types";
import { ContextoReporte, type DatosReporte } from "../contexto";
import PuntoEquilibrio from "./PuntoEquilibrio";

/**
 * Las garantías que tenía el punto de equilibrio viejo (ResultadoPeriodo), en
 * la pantalla nueva: el reporte compuesto falla entero, no inventa una meta y
 * pide los gastos con el mismo corte que las ventas.
 */

const reporte = vi.fn();
const getGastos = vi.fn();

vi.mock("../../../lib/api", () => ({
  api: {
    reporte: (...a: unknown[]) => reporte(...a),
    getGastos: (...a: unknown[]) => getGastos(...a),
  },
  qs: () => "",
  request: () => Promise.reject(new Error("sin billar en este test")),
}));

vi.mock("../../../store/AuthContext", () => ({
  useAuth: () => ({ rubro: "RESTAURANTE", puede: () => true }),
}));

const RANGO = { desde: "2026-09-01", hasta: "2026-09-30" };

function gasto(monto: number, categoria: string, tipoCosto: "FIJO" | "VARIABLE" = "FIJO"): Gasto {
  return { id: 1, concepto: categoria, categoria, categoriaNombre: categoria, tipoCosto, monto, pagado: monto } as Gasto;
}

/** El financiero que contesta `api.reporte`; el resumen trae el ticket para la línea de ventas por día. */
function financiero(fin: Record<string, number>) {
  reporte.mockImplementation((nombre: string) =>
    nombre === "financiero"
      ? Promise.resolve(fin)
      : Promise.resolve({ ticketPromedio: { valor: 50, deltaPct: null } }),
  );
}

function mostrar() {
  const datos: DatosReporte = {
    periodo: { preset: "rango", ...RANGO },
    comparacion: { desde: "2026-08-02", hasta: "2026-08-31", contra: "del 02/08 al 31/08/2026", leyenda: "Período anterior" },
    rango: RANGO,
    rangoAnterior: { desde: "2026-08-02", hasta: "2026-08-31" },
    sucursalNombre: "",
    registrarExportacion: () => {},
    veReporte: () => true,
  };
  return render(
    <MemoryRouter>
      <ContextoReporte.Provider value={datos}>
        <PuntoEquilibrio />
      </ContextoReporte.Provider>
    </MemoryRouter>,
  );
}

describe("punto de equilibrio (reporte nuevo)", () => {
  beforeEach(() => {
    reporte.mockReset();
    getGastos.mockReset();
  });

  it("si fallan los gastos, falla el reporte entero y no muestra una meta a medias", async () => {
    // Invariante 6: sin los gastos fijos la meta daría cero y se leería como
    // "ya está todo cubierto".
    financiero({ ventas: 10_000, costoVentas: 4_000, utilidadBruta: 6_000 });
    getGastos.mockRejectedValue(new Error("No se pudieron cargar los gastos"));
    mostrar();

    expect(await screen.findByText("No se pudieron cargar los gastos")).toBeInTheDocument();
    expect(screen.queryByText(/necesitás vender/i)).not.toBeInTheDocument();
  });

  it("si cada venta pierde plata no inventa una meta", async () => {
    financiero({ ventas: 10_000, costoVentas: 11_000, utilidadBruta: -1_000 });
    getGastos.mockResolvedValue([gasto(500, "ALQUILER")]);
    mostrar();

    expect(await screen.findByText("No hay punto de equilibrio")).toBeInTheDocument();
    expect(screen.getByText(/Cada venta cuesta más de lo que deja/)).toBeInTheDocument();
    expect(screen.queryByText(/necesitás vender/i)).not.toBeInTheDocument();
  });

  it("si el margen se lo llevan los gastos variables, lo dice aparte: piden otro consejo", async () => {
    financiero({ ventas: 10_000, costoVentas: 4_000, utilidadBruta: 6_000 });
    getGastos.mockResolvedValue([gasto(7_000, "COMISION_DELIVERY", "VARIABLE"), gasto(500, "ALQUILER")]);
    mostrar();

    expect(await screen.findByText(/los gastos variables del período se la llevan entera/)).toBeInTheDocument();
  });

  it("con margen muestra la meta por día y lo que sobró, con su nombre", async () => {
    financiero({ ventas: 20_662, costoVentas: 13_473.27, utilidadBruta: 7_188.73 });
    getGastos.mockResolvedValue([gasto(600, "LUZ")]);
    mostrar();

    expect(await screen.findByText(/necesitás vender/i)).toBeInTheDocument();
    expect(screen.getByText("por día")).toBeInTheDocument();
    expect(screen.getByText("Te sobró")).toBeInTheDocument();
    expect(screen.queryByText("Te faltan")).not.toBeInTheDocument();
  });

  it("sin gastos fijos avisa que una meta en cero no dice nada", async () => {
    financiero({ ventas: 5_000, costoVentas: 2_000, utilidadBruta: 3_000 });
    getGastos.mockResolvedValue([]);
    mostrar();

    expect(await screen.findByText(/No hay gastos fijos cargados en el período/)).toBeInTheDocument();
    expect(screen.queryByText("Te sobró")).not.toBeInTheDocument();
  });

  it("los gastos se piden sin filtro y con el mismo corte que las ventas", async () => {
    // En QA el reporte entero fallaba: se mandaba filtro=TODOS y el backend
    // sólo acepta PENDIENTES, VENCIDOS o PAGADOS.
    financiero({ ventas: 1_000, costoVentas: 400, utilidadBruta: 600 });
    getGastos.mockResolvedValue([gasto(100, "ALQUILER")]);
    mostrar();
    await screen.findByText(/necesitás vender/i);

    const pedido = getGastos.mock.calls[0][0];
    expect(pedido.filtro).toBeUndefined();
    // El último día entra: hasta es la medianoche local del día siguiente.
    expect(new Date(pedido.hasta).getTime()).toBe(new Date(2026, 9, 1).getTime());
    expect(new Date(pedido.desde).getTime()).toBe(new Date(2026, 8, 1).getTime());
  });
});
