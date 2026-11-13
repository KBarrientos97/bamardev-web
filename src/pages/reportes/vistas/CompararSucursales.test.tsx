import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FilaPorSucursal, PorSucursalApi } from "../api";
import { ContextoReporte, type DatosReporte, type Exportacion } from "../contexto";
import CompararSucursales from "./CompararSucursales";

/**
 * «Comparar sucursales»: una tabla lado a lado con una fila por local, la de
 * gastos generales y el total. Junta todos los locales aunque arriba haya uno
 * elegido (no manda `sucursalId`) y su Excel lo dice.
 */

const reporte = vi.fn();

vi.mock("../../../lib/api", () => ({
  api: { reporte: (...a: unknown[]) => reporte(...a) },
  qs: () => "",
  request: () => Promise.resolve(null),
}));

vi.mock("../../../store/AuthContext", () => ({
  useAuth: () => ({ rubro: "RESTAURANTE", vocabulario: null, negocio: { features: [] } }),
}));

vi.mock("../../../lib/useSucursales", () => ({
  useSucursales: () => ({ elegir: true, sucursales: [], sucursalId: null, todas: "Todas las sucursales" }),
}));

const fila = (p: Partial<FilaPorSucursal>): FilaPorSucursal => ({
  sucursalId: 1,
  nombre: "Centro",
  general: false,
  tipo: "SUCURSAL",
  activa: true,
  esPrincipal: false,
  ventas: 0,
  tickets: 0,
  costoVentas: 0,
  utilidadBruta: 0,
  margenBrutoPct: null,
  ventasSinCosto: 0,
  mermas: 0,
  gastosOperativos: 0,
  bajoLaLinea: 0,
  utilidadOperativa: 0,
  ...p,
});

const DOS_LOCALES: PorSucursalApi = {
  desde: "2026-11-01T04:00:00.000Z",
  hasta: "2026-12-01T04:00:00.000Z",
  alcance: "organizacion",
  filas: [
    fila({ sucursalId: 1, nombre: "Sucursal A", esPrincipal: true, ventas: 180, tickets: 3, costoVentas: 90, utilidadBruta: 90, margenBrutoPct: 50, gastosOperativos: 200, utilidadOperativa: -110 }),
    fila({ sucursalId: 2, nombre: "Sucursal B", ventas: 70, tickets: 2, costoVentas: 24, utilidadBruta: 46, margenBrutoPct: 65.71, gastosOperativos: 50, utilidadOperativa: -4 }),
    fila({ sucursalId: null, nombre: "General del negocio", general: true, tipo: null, gastosOperativos: 80, utilidadOperativa: -80 }),
  ],
  total: fila({ sucursalId: null, nombre: "Total", ventas: 250, tickets: 5, costoVentas: 114, utilidadBruta: 136, margenBrutoPct: 54.4, gastosOperativos: 330, utilidadOperativa: -194 }),
};

let exportacion: Exportacion | null = null;

function mostrar(sucursalId?: number) {
  const datos: DatosReporte = {
    periodo: { preset: "mes", desde: "2026-11-01", hasta: "2026-11-30" },
    comparacion: { desde: "2026-10-02", hasta: "2026-10-31", contra: "del 02/10 al 31/10/2026", leyenda: "Período anterior" },
    rango: { desde: "2026-11-01", hasta: "2026-11-30", ...(sucursalId != null ? { sucursalId } : {}) },
    rangoAnterior: { desde: "2026-10-02", hasta: "2026-10-31" },
    sucursalNombre: sucursalId != null ? "Sucursal A" : "",
    registrarExportacion: (e) => {
      exportacion = e;
    },
    veReporte: () => true,
  };
  return render(
    <MemoryRouter>
      <ContextoReporte.Provider value={datos}>
        <CompararSucursales />
      </ContextoReporte.Provider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  reporte.mockReset();
  exportacion = null;
});

describe("comparar sucursales", () => {
  it("muestra cada local, los gastos generales y el total", async () => {
    reporte.mockResolvedValue(DOS_LOCALES);
    mostrar();
    // La tabla (desde tablet) y la lista del celular existen a la vez en el DOM: se mira la tabla.
    const tabla = await screen.findByRole("table");
    const filas = within(tabla).getAllByRole("row");
    // Títulos + 2 locales + general + total.
    expect(filas).toHaveLength(5);
    expect(within(filas[1]).getByText("Sucursal A")).toBeInTheDocument();
    expect(within(filas[1]).getByText("Principal")).toBeInTheDocument();
    expect(within(filas[2]).getByText("Sucursal B")).toBeInTheDocument();
    expect(within(filas[3]).getByText("General del negocio")).toBeInTheDocument();
    expect(within(filas[3]).getByText(/ningún local/)).toBeInTheDocument();
    expect(within(filas[4]).getByText("Total")).toBeInTheDocument();
    // Las pérdidas con su signo tipográfico.
    expect(within(filas[1]).getByText(/−Bs\s110,00/)).toBeInTheDocument();
    expect(within(filas[4]).getByText(/−Bs\s194,00/)).toBeInTheDocument();
  });

  it("pide el comparativo sin la sucursal del filtro, y avisa que no se aplica", async () => {
    reporte.mockResolvedValue(DOS_LOCALES);
    mostrar(1);
    await screen.findByRole("table");
    expect(reporte).toHaveBeenCalledWith("por-sucursal", expect.objectContaining({ desde: "2026-11-01", hasta: "2026-11-30", sucursalId: undefined }));
    expect(screen.getByText(/el filtro de arriba no se aplica acá/)).toBeInTheDocument();
  });

  it("sin filtro no dice nada del filtro", async () => {
    reporte.mockResolvedValue(DOS_LOCALES);
    mostrar();
    await screen.findByRole("table");
    expect(screen.queryByText(/el filtro de arriba/)).toBeNull();
  });

  it("su Excel lleva siempre «Todas las sucursales», aunque arriba haya una elegida", async () => {
    reporte.mockResolvedValue(DOS_LOCALES);
    mostrar(2);
    await screen.findByRole("table");
    await waitFor(() => expect(exportacion).not.toBeNull());
    expect(exportacion?.nombre).toBe("comparar-sucursales");
    expect(exportacion?.sucursal).toEqual({ nombre: "Todas las sucursales", rotulo: "Sucursal" });
    expect(exportacion?.hojas()[0].filas.map((f) => f[0])).toEqual(["Sucursal", "Sucursal A", "Sucursal B", "General del negocio", "Total"]);
  });

  it("con un solo local no hay nada que comparar y no ofrece Excel", async () => {
    reporte.mockResolvedValue({ ...DOS_LOCALES, filas: [DOS_LOCALES.filas[0], DOS_LOCALES.filas[2]] });
    mostrar();
    expect(await screen.findByText("No hay nada que comparar")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
    expect(exportacion).toBeNull();
  });
});
