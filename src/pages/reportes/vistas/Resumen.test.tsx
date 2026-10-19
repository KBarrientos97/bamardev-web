import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fmtMoney } from "../../../lib/format";
import type { ResumenApi } from "../api";
import { ContextoReporte, type DatosReporte, type Exportacion } from "../contexto";
import Resumen from "./Resumen";

/**
 * El Resumen con los pedidos por cobrar (C2, 16-oct): desde que el backend los
 * saca del total de ventas, la pantalla los muestra aparte y dice que no
 * están incluidos. Sin el campo (backend anterior) todo queda como siempre.
 */

const reporte = vi.fn();

vi.mock("../../../lib/api", () => ({
  api: {
    reporte: (...a: unknown[]) => reporte(...a),
    getGastos: vi.fn(async () => []),
  },
  qs: () => "",
  request: vi.fn(async () => null),
}));

vi.mock("../../../store/AuthContext", () => ({
  // Sin rentabilidad ni operación: el Resumen sólo pide el resumen.
  useAuth: () => ({
    rubro: "RESTAURANTE",
    negocio: { features: [] },
    usuario: { permisos: ["reportes.ver"] },
    puede: () => false,
    incluye: () => false,
  }),
}));

const RANGO = { desde: "2026-10-01", hasta: "2026-10-31" };

function resumen(p: Partial<ResumenApi> = {}): ResumenApi {
  return {
    ventas: 1000,
    ventasDeltaPct: null,
    ventasPeriodoAnterior: 0,
    finanzas: { ingresosBrutos: 1000, descuentos: 0, ingresosNetos: 1000, costoVenta: 400, utilidadBruta: 600, margenPct: 60, deltaUtilidadPct: null },
    tickets: { valor: 10, deltaPct: null },
    ticketPromedio: { valor: 100, deltaPct: null },
    unidades: { valor: 20, deltaPct: null },
    tendencia: [],
    ...p,
  };
}

let exportacion: Exportacion | null = null;

function mostrar() {
  const datos: DatosReporte = {
    periodo: { preset: "rango", ...RANGO },
    comparacion: { desde: "2026-09-01", hasta: "2026-09-30", contra: "septiembre", leyenda: "Período anterior" },
    rango: RANGO,
    rangoAnterior: { desde: "2026-09-01", hasta: "2026-09-30" },
    sucursalNombre: "",
    registrarExportacion: (e) => {
      exportacion = e;
    },
    veReporte: () => false,
  } as DatosReporte;
  return render(
    <MemoryRouter>
      <ContextoReporte.Provider value={datos}>
        <Resumen />
      </ContextoReporte.Provider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  reporte.mockReset();
  exportacion = null;
});

describe("Resumen: los pedidos por cobrar", () => {
  it("con pedidos pendientes, una tarjeta aparte que dice que no están en las ventas", async () => {
    reporte.mockResolvedValue(resumen({ porCobrar: { cantidad: 3, total: 145.5 } }));
    mostrar();
    const tarjeta = await screen.findByRole("region", { name: "Por cobrar" });
    expect(tarjeta).toHaveTextContent("3 pedidos sin cobrar todavía");
    expect(tarjeta).toHaveTextContent("No están incluidos en las ventas");
    expect(within(tarjeta).getByText(fmtMoney(145.5))).toBeInTheDocument();
    // El Excel también los lleva (se registra en un efecto: se espera).
    await waitFor(() => expect(exportacion).not.toBeNull());
    const hojas = exportacion!.hojas();
    expect(hojas[0].filas).toContainEqual(["Pedidos por cobrar (no suman en Ventas)", 3]);
  });

  it("uno solo, en singular", async () => {
    reporte.mockResolvedValue(resumen({ porCobrar: { cantidad: 1, total: 40 } }));
    mostrar();
    expect(await screen.findByRole("region", { name: "Por cobrar" })).toHaveTextContent(
      "1 pedido sin cobrar todavía. No está incluido en las ventas",
    );
  });

  it("sin pedidos pendientes, o sin el campo, no hay tarjeta", async () => {
    reporte.mockResolvedValue(resumen({ porCobrar: { cantidad: 0, total: 0 } }));
    mostrar();
    await screen.findByText("Ticket prom.");
    expect(screen.queryByRole("region", { name: "Por cobrar" })).not.toBeInTheDocument();
  });

  it("un período sin ventas pero con pedidos pendientes no se da por vacío", async () => {
    reporte.mockResolvedValue(
      resumen({ ventas: 0, tickets: { valor: 0, deltaPct: null }, porCobrar: { cantidad: 2, total: 90 } }),
    );
    mostrar();
    expect(await screen.findByRole("region", { name: "Por cobrar" })).toBeInTheDocument();
    expect(screen.queryByText("Sin ventas en este período")).not.toBeInTheDocument();
  });
});
