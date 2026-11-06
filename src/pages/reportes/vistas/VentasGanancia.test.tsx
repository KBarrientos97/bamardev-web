import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TopProductoApi, VendedorApi } from "../api";
import { ContextoReporte, type DatosReporte } from "../contexto";
import VentasGanancia from "./VentasGanancia";

vi.setConfig({ testTimeout: 60_000 });

/**
 * Ventas y ganancia en la web (6-nov): la pantalla de la app, con el filtro de
 * cajero al lado del período.
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

const prod = (nombre: string, categoria: string, ingresos: number, utilidad: number, unidades: number): TopProductoApi => ({
  nombre,
  categoria,
  ingresos,
  utilidad,
  unidades,
  margenPct: 0,
});

const TODOS: TopProductoApi[] = [
  prod("Brasa entero", "POLLOS", 560, 185, 5),
  prod("Brasa económico", "POLLOS", 180, 50, 10),
  prod("Coca Cola 1.5L", "BEBIDAS", 30, 16, 2),
];
const DE_ANA: TopProductoApi[] = [prod("Brasa económico", "POLLOS", 36, 10, 2)];
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

  it("la tabla lleva las cuatro columnas del cuaderno, sin la de pollos", async () => {
    // Las presas se sacaron el 6-nov (Kevin: "quitá todo lo de las presas").
    responder(() => TODOS);
    mostrar();
    const tabla = await screen.findByRole("table");
    expect(within(tabla).getAllByRole("columnheader").map((c) => c.textContent)).toEqual([
      "Producto",
      "Cant.",
      "Total",
      "Costo",
      "Ganancia",
    ]);
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
