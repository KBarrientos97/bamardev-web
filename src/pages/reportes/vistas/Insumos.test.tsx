import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fmtMoney } from "../../../lib/format";
import type { InsumosApi } from "../api";
import { ContextoReporte, type DatosReporte } from "../contexto";
import Insumos from "./Insumos";

/**
 * El reporte de Insumos según el rubro (28-oct).
 *
 * En el restaurante es en esta lista, compra por compra, donde aparecen los
 * vasos y los envases cargados como insumo. Cargados así no restan nunca de la
 * ganancia (no están en el costo de ningún plato): la nota de abajo dice que
 * van en Gastos operativos, categoría Descartables, con la misma frase que el
 * alta de un insumo. Los demás rubros ven el reporte como siempre.
 */

const reporte = vi.fn();
let rubro: string | undefined = "RESTAURANTE";

vi.mock("../../../lib/api", () => ({
  api: { reporte: (...a: unknown[]) => reporte(...a) },
  qs: () => "",
  request: vi.fn(),
}));

vi.mock("../../../store/AuthContext", () => ({
  useAuth: () => ({ rubro }),
}));

const DATOS: InsumosApi = {
  ingresos: 5000,
  invertido: 1200,
  ganancia: 3800,
  invertidoDeltaPct: null,
  numCompras: 3,
  compras: [
    { nombre: "Pollo crudo", unidad: "kg", cantidad: 40, total: 1000, costoUnitario: 25 },
    { nombre: "Vasos descartables", unidad: "Unidad", cantidad: 200, total: 200, costoUnitario: 1 },
  ],
};

function mostrar() {
  const datos: DatosReporte = {
    periodo: { preset: "rango", desde: "2026-10-01", hasta: "2026-10-28" },
    comparacion: { desde: "2026-09-03", hasta: "2026-09-30", contra: "del 03/09 al 30/09/2026", leyenda: "Período anterior" },
    rango: { desde: "2026-10-01", hasta: "2026-10-28" },
    rangoAnterior: { desde: "2026-09-03", hasta: "2026-09-30" },
    sucursalNombre: "",
    registrarExportacion: () => {},
    veReporte: () => true,
  };
  return render(
    <MemoryRouter>
      <ContextoReporte.Provider value={datos}>
        <Insumos />
      </ContextoReporte.Provider>
    </MemoryRouter>,
  );
}

/** La nota de abajo, cuando el reporte ya llegó. */
async function nota() {
  return (await screen.findByText(/Es lo efectivamente comprado en insumos en el período/)).closest("div")!;
}

beforeEach(() => {
  reporte.mockReset();
  reporte.mockResolvedValue(DATOS);
  rubro = "RESTAURANTE";
});

describe("la nota de los descartables", () => {
  it("el restaurante lee dónde van los descartables, con la frase del alta de un insumo", async () => {
    mostrar();
    expect(await nota()).toHaveTextContent(
      "Los descartables (platos y vasos desechables, servilletas, bolsas, envases para llevar) no son insumos de un plato: van en Gastos operativos, categoría Descartables, para que resten de la ganancia.",
    );
    // Lo de siempre sigue: el total y la compra de cada insumo.
    expect(screen.getByText(fmtMoney(1200))).toBeInTheDocument();
    expect(screen.getByText("Vasos descartables")).toBeInTheDocument();
  });

  it.each(["MINIMARKET", "BILLAR", "PELUQUERIA", undefined])("%s ve la nota de siempre, sin los descartables", async (r) => {
    rubro = r;
    mostrar();
    const texto = await nota();
    expect(texto).toHaveTextContent(/puede haber sobre-stock o merma\.$/);
    expect(texto).not.toHaveTextContent(/Gastos operativos/);
  });
});
