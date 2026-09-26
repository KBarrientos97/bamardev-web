import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { diasDelRango } from "../../lib/resultado";
import type { Gasto } from "../../types";
import { EstadoResultadoVista, PuntoEquilibrioVista } from "./ResultadoPeriodo";

const reporte = vi.fn();
const getGastos = vi.fn();

vi.mock("../../lib/api", () => ({
  api: {
    reporte: (...a: unknown[]) => reporte(...a),
    getGastos: (...a: unknown[]) => getGastos(...a),
  },
}));

const RANGO = { desde: "2026-09-01", hasta: "2026-09-30" };

function gasto(monto: number, categoria: string, tipoCosto: "FIJO" | "VARIABLE" = "FIJO"): Gasto {
  return {
    id: 1,
    concepto: categoria,
    categoria,
    categoriaNombre: categoria,
    tipoCosto,
    monto,
    pagado: monto,
    saldo: 0,
    estado: "PAGADO",
    fecha: "2026-09-05",
    fechaVencimiento: null,
    vencido: false,
    diasAtraso: 0,
    diasParaVencer: 0,
    metodoPago: null,
    beneficiario: null,
    nota: null,
    sucursalId: null,
    sucursal: null,
    recurrente: false,
    numeroFactura: null,
    nit: null,
  } as Gasto;
}

describe("resultado del período (web)", () => {
  beforeEach(() => {
    reporte.mockReset();
    getGastos.mockReset();
  });

  it("si fallan los gastos, falla el reporte entero y no muestra números a medias", async () => {
    // Invariante 6: un resultado sin los gastos mostraría una utilidad inflada
    // como si fuera real.
    reporte.mockResolvedValue({ ventas: 10_000, costoVentas: 4_000, utilidadBruta: 6_000 });
    getGastos.mockRejectedValue(new Error("No se pudieron cargar los gastos"));
    render(<EstadoResultadoVista rango={RANGO} />);

    expect(await screen.findByText("No se pudieron cargar los gastos")).toBeInTheDocument();
    expect(screen.queryByText("Utilidad neta")).not.toBeInTheDocument();
  });

  it("con pérdida la etiqueta cambia y no dice utilidad", async () => {
    reporte.mockResolvedValue({ ventas: 1_000, costoVentas: 400, utilidadBruta: 600 });
    getGastos.mockResolvedValue([gasto(900, "SUELDOS")]);
    render(<EstadoResultadoVista rango={RANGO} />);

    expect((await screen.findAllByText("Pérdida del período")).length).toBeGreaterThan(0);
    expect(screen.queryByText("Utilidad neta")).not.toBeInTheDocument();
  });

  it("si cada venta pierde plata no inventa una meta", async () => {
    reporte.mockResolvedValue({ ventas: 10_000, costoVentas: 11_000, utilidadBruta: -1_000 });
    getGastos.mockResolvedValue([gasto(500, "ALQUILER")]);
    render(<PuntoEquilibrioVista rango={RANGO} />);

    expect(await screen.findByText("No hay punto de equilibrio")).toBeInTheDocument();
    expect(screen.queryByText("Hay que vender para no perder")).not.toBeInTheDocument();
  });

  it("con margen muestra la meta y la baja a un día", async () => {
    reporte.mockResolvedValue({ ventas: 20_662, costoVentas: 13_473.27, utilidadBruta: 7_188.73 });
    getGastos.mockResolvedValue([gasto(600, "LUZ")]);
    render(<PuntoEquilibrioVista rango={RANGO} />);

    expect(await screen.findByText("Hay que vender para no perder")).toBeInTheDocument();
    expect(screen.getByText(/por día/)).toBeInTheDocument();
  });

  it("el rango cuenta los dos extremos", () => {
    expect(diasDelRango("2026-09-01", "2026-09-30")).toBe(30);
    expect(diasDelRango("2026-09-24", "2026-09-24")).toBe(1);
    expect(diasDelRango(undefined, "2026-09-24")).toBe(0);
  });

  it("los gastos se piden sin filtro y con el mismo corte que las ventas", async () => {
    // En QA el reporte entero fallaba: se mandaba filtro=TODOS y el backend
    // sólo acepta PENDIENTES, VENCIDOS o PAGADOS. Los mocks de la API no lo
    // podían ver; lo encontró la prueba contra QA.
    reporte.mockResolvedValue({ ventas: 1_000, costoVentas: 400, utilidadBruta: 600 });
    getGastos.mockResolvedValue([]);
    render(<EstadoResultadoVista rango={RANGO} />);
    await screen.findAllByText("Utilidad neta");

    const pedido = getGastos.mock.calls[0][0];
    expect(pedido.filtro).toBeUndefined();
    // El último día entra: hasta es la medianoche local del día siguiente.
    expect(new Date(pedido.hasta).getTime()).toBe(new Date(2026, 9, 1).getTime());
    expect(new Date(pedido.desde).getTime()).toBe(new Date(2026, 8, 1).getTime());
  });
});
