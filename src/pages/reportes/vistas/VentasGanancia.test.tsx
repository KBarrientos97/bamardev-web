import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TopProductoApi, VendedorApi } from "../api";
import { ContextoReporte, type DatosReporte } from "../contexto";
import VentasGanancia from "./VentasGanancia";

vi.setConfig({ testTimeout: 60_000 });

/**
 * Ventas y ganancia en la web (6-nov): la pantalla de la app, con el filtro de
 * cajero al lado del período y los pollos cuando los artículos tienen sus
 * presas.
 */

const reporte = vi.hoisted(() => vi.fn());

vi.mock("../../../lib/api", async (original) => {
  const real = await original<typeof import("../../../lib/api")>();
  return { ...real, api: { ...real.api, reporte: (...a: unknown[]) => reporte(...a) } };
});

vi.mock("../../../store/AuthContext", () => ({
  useAuth: () => ({
    rubro: "RESTAURANTE",
    usuario: { id: 1, username: "kevin", permisos: ["reportes.operacion", "reportes.rentabilidad"] },
    negocio: { alias: "polleria", nombre: "Pollos Don Omar", features: [] },
  }),
}));

const prod = (nombre: string, categoria: string, ingresos: number, utilidad: number, unidades: number, presas?: number): TopProductoApi => ({
  nombre,
  categoria,
  ingresos,
  utilidad,
  unidades,
  margenPct: 0,
  ...(presas ? { presas } : {}),
});

const TODOS: TopProductoApi[] = [
  prod("Brasa entero", "POLLOS", 560, 185, 5, 8),
  prod("Brasa económico", "POLLOS", 180, 50, 10, 1),
  prod("Coca Cola 1.5L", "BEBIDAS", 30, 16, 2),
];
const DE_ANA: TopProductoApi[] = [prod("Brasa económico", "POLLOS", 36, 10, 2, 1)];
const CAJEROS: VendedorApi[] = [
  { id: 7, nombre: "Ana" },
  { id: 9, nombre: "Beto" },
];

function responder(top: (usuarioId?: number) => TopProductoApi[], cajeros = CAJEROS) {
  reporte.mockImplementation((nombre: string, _rango: unknown, extra: { usuarioId?: number } = {}) => {
    if (nombre === "vendedores") return Promise.resolve(cajeros);
    if (nombre === "top-productos") return Promise.resolve(top(extra.usuarioId));
    return Promise.reject(new Error(`no esperado: ${JSON.stringify([nombre, _rango, extra])}`));
  });
}

function mostrar() {
  const datos: DatosReporte = {
    periodo: { preset: "mes", desde: "2026-11-01", hasta: "2026-11-05" },
    comparacion: { desde: "2026-10-01", hasta: "2026-10-05", contra: "", leyenda: "" },
    rango: { desde: "2026-11-01", hasta: "2026-11-05" },
    rangoAnterior: { desde: "2026-10-01", hasta: "2026-10-05" },
    sucursalNombre: "",
    registrarExportacion: () => {},
    veReporte: () => false,
  };
  return render(
    <MemoryRouter>
      <ContextoReporte.Provider value={datos}>
        <VentasGanancia />
      </ContextoReporte.Provider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  reporte.mockReset();
});
afterEach(cleanup);

describe("Ventas y ganancia (web)", () => {
  it("muestra la tabla por categoría con el total y los tres números de arriba", async () => {
    responder(() => TODOS);
    mostrar();
    const tabla = await screen.findByRole("table");
    expect(within(tabla).getByText("POLLOS")).toBeTruthy();
    expect(within(tabla).getByText("Brasa económico")).toBeTruthy();
    expect(within(tabla).getByText("TOTAL")).toBeTruthy();
    expect(screen.getByText("Vendido")).toBeTruthy();
    expect(screen.getAllByText("Ganancia").length).toBeGreaterThan(0);
  });

  it("cuenta los pollos: 5 enteros y 10 presas son 6 pollos y 2 presas", async () => {
    responder(() => TODOS);
    mostrar();
    expect(await screen.findByText("6 pollos y 2 presas")).toBeTruthy();
    const tabla = screen.getByRole("table");
    expect(within(tabla).getByRole("columnheader", { name: "Pollos" })).toBeTruthy();
    // El económico: 10 presas = 1 pollo y 2 presas (el ejemplo de Kevin).
    expect(within(tabla).getByText("1 y 2 pr.")).toBeTruthy();
  });

  it("sin presas cargadas no hay columna ni tarjeta de pollos", async () => {
    responder(() => TODOS.map(({ presas: _p, ...r }) => r));
    mostrar();
    const tabla = await screen.findByRole("table");
    expect(within(tabla).queryByRole("columnheader", { name: "Pollos" })).toBeNull();
    expect(screen.queryByText(/pollos? y/)).toBeNull();
  });

  it("elegir un cajero vuelve a pedir el reporte con lo que cobró él", async () => {
    responder((usuarioId) => (usuarioId === 7 ? DE_ANA : TODOS));
    mostrar();
    await screen.findByText("Coca Cola 1.5L");
    fireEvent.change(await screen.findByRole("combobox", { name: "Cajero" }), { target: { value: "7" } });
    await waitFor(() => expect(screen.queryByText("Coca Cola 1.5L")).toBeNull());
    expect(reporte).toHaveBeenCalledWith("top-productos", expect.anything(), { usuarioId: 7 });
    // Sin cajero el pedido va sin usuarioId, como lo leen Top productos y Categorías.
    expect(reporte.mock.calls.find((c) => c[0] === "top-productos")?.[2]).toEqual({});
  });

  it("un cajero que no vendió dice su nombre, no «sin ventas» a secas", async () => {
    responder((usuarioId) => (usuarioId === 9 ? [] : TODOS));
    mostrar();
    fireEvent.change(await screen.findByRole("combobox", { name: "Cajero" }), { target: { value: "9" } });
    expect(await screen.findByText("Beto no vendió en este período")).toBeTruthy();
  });

  it("con un solo cajero no hay nada que filtrar y el desplegable no está", async () => {
    responder(() => TODOS, [{ id: 7, nombre: "Ana" }]);
    mostrar();
    await screen.findByRole("table");
    expect(screen.queryByRole("combobox", { name: "Cajero" })).toBeNull();
  });
});
