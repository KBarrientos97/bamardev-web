import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TopProductoApi } from "../api";
import { ContextoReporte, type DatosReporte, type SucursalDeArchivo } from "../contexto";
import VentasGanancia from "./VentasGanancia";

vi.setConfig({ testTimeout: 60_000 });

/**
 * Ventas y ganancia con sucursales (PLAN-SUCURSAL-TOTAL §3 etapa 6): el PDF
 * lleva la sucursal en el nombre y en el subtítulo, y los cajeros del
 * desplegable son los del local que se mira. Con un solo local, todo igual.
 */

const reporte = vi.hoisted(() => vi.fn());
const bajarPdf = vi.hoisted(() => vi.fn(async () => "descargado"));

vi.mock("../../../lib/api", async (original) => {
  const real = await original<typeof import("../../../lib/api")>();
  return { ...real, api: { ...real.api, reporte: (...a: unknown[]) => reporte(...a) } };
});

vi.mock("../../../lib/pdf/tablaPdf", async (original) => ({
  ...(await original<typeof import("../../../lib/pdf/tablaPdf")>()),
  bajarPdf,
}));

vi.mock("../../../store/AuthContext", () => ({
  useAuth: () => ({
    rubro: "RESTAURANTE",
    usuario: { id: 1, username: "kevin", permisos: ["reportes.operacion", "reportes.rentabilidad"] },
    negocio: { alias: "polleria", nombre: "Pollos Don Omar", features: [] },
  }),
}));

const TOP: TopProductoApi[] = [{ nombre: "Brasa entero", categoria: "POLLOS", ingresos: 560, utilidad: 185, unidades: 5, margenPct: 0 }];

function datos(sucursalId: number | undefined, sucursalArchivo: SucursalDeArchivo | null): DatosReporte {
  return {
    periodo: { preset: "mes", desde: "2026-11-01", hasta: "2026-11-05" },
    comparacion: { desde: "2026-10-01", hasta: "2026-10-05", contra: "", leyenda: "" },
    rango: { desde: "2026-11-01", hasta: "2026-11-05", ...(sucursalId != null ? { sucursalId } : {}) },
    rangoAnterior: { desde: "2026-10-01", hasta: "2026-10-05" },
    sucursalNombre: sucursalArchivo?.nombre ?? "",
    sucursalArchivo,
    registrarExportacion: () => {},
    veReporte: () => false,
  };
}

function vista(d: DatosReporte) {
  return (
    <MemoryRouter>
      <ContextoReporte.Provider value={d}>
        <VentasGanancia />
      </ContextoReporte.Provider>
    </MemoryRouter>
  );
}

async function exportarPdf() {
  fireEvent.click(await screen.findByRole("button", { name: /Exportar PDF/ }));
  await waitFor(() => expect(bajarPdf).toHaveBeenCalled());
  const [nombre, doc] = bajarPdf.mock.calls[0] as unknown as [string, { subtitulo?: string; subtitle?: string }];
  return { nombre, doc: JSON.stringify(doc) };
}

beforeEach(() => {
  reporte.mockReset();
  bajarPdf.mockClear();
  reporte.mockImplementation((nombre: string) => Promise.resolve(nombre === "vendedores" ? [] : TOP));
});
afterEach(cleanup);

describe("el PDF de Ventas y ganancia", () => {
  it("con una sucursal elegida la lleva en el nombre del archivo y en el subtítulo", async () => {
    render(vista(datos(3, { nombre: "Centro", rotulo: "Sucursal" })));
    const { nombre, doc } = await exportarPdf();
    expect(nombre).toMatch(/^ventas-y-ganancia-centro-\d{4}-\d{2}-\d{2}\.pdf$/);
    expect(doc).toContain("Centro");
  });

  it("el consolidado de una organización con 2+ locales dice «Todas las sucursales»", async () => {
    render(vista(datos(undefined, { nombre: "Todas las sucursales", rotulo: "Sucursal" })));
    const { nombre, doc } = await exportarPdf();
    expect(nombre).toMatch(/^ventas-y-ganancia-todas-las-sucursales-\d{4}-\d{2}-\d{2}\.pdf$/);
    expect(doc).toContain("Todas las sucursales");
  });

  it("con un solo local es el archivo de siempre", async () => {
    render(vista(datos(undefined, null)));
    const { nombre, doc } = await exportarPdf();
    expect(nombre).toMatch(/^ventas-y-ganancia-\d{4}-\d{2}-\d{2}\.pdf$/);
    expect(doc).not.toContain("sucursal");
  });
});

describe("los cajeros del desplegable", () => {
  it("se piden de nuevo cuando cambia la sucursal que se mira", async () => {
    const { rerender } = render(vista(datos(undefined, { nombre: "Todas las sucursales", rotulo: "Sucursal" })));
    await screen.findByText("Brasa entero");
    const pedidos = () => reporte.mock.calls.filter((c) => c[0] === "vendedores");
    expect(pedidos()).toHaveLength(1);
    rerender(vista(datos(3, { nombre: "Centro", rotulo: "Sucursal" })));
    await waitFor(() => expect(pedidos()).toHaveLength(2));
    expect(pedidos()[1][1]).toMatchObject({ sucursalId: 3 });
  });
});
