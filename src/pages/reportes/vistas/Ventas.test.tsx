import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContextoReporte, type DatosReporte } from "../contexto";
import type { ReporteVentas } from "./Ventas.datos";
import Ventas from "./Ventas";

vi.setConfig({ testTimeout: 60_000 });

/**
 * Reportes › Ventas (26-oct): en un billar, el administrador toca una venta y
 * ve su "Detalle de venta" (el tiempo de mesa, los productos y cómo se pagó).
 * Una venta pagada parte y parte dice cuánto fue por cada medio. Los demás
 * rubros, y quien no administra el billar, ven la lista de siempre.
 */

const sesion = vi.hoisted(() => ({ rubro: "BILLAR" as string, permisos: ["billar.admin"] as string[] }));
const reporteVentas = vi.hoisted(() => vi.fn());
const request = vi.hoisted(() => vi.fn());

vi.mock("../../../lib/api", async (original) => {
  const real = await original<typeof import("../../../lib/api")>();
  return { ...real, request, api: { ...real.api, reporteVentas: (...a: unknown[]) => reporteVentas(...a) } };
});

vi.mock("../../../store/AuthContext", () => ({
  useAuth: () => ({
    rubro: sesion.rubro,
    usuario: { id: 1, permisos: sesion.permisos },
    negocio: { alias: "billar-ventas", nombre: "Billar", features: [] },
  }),
}));

const RANGO = { desde: "2026-10-01", hasta: "2026-10-26" };

const respuesta = (): ReporteVentas => ({
  totales: { ventas: 1, ingresos: 160, ticketPromedio: 160, anuladas: 0, pendientes: 0 },
  vendedores: [{ id: 1, nombre: "Flavia Suarez" }],
  items: [
    {
      id: 5,
      comprobante: "V-000005",
      fecha: "2026-10-25T03:11:00.000Z",
      cliente: "Consumidor final",
      vendedor: "Flavia Suarez",
      estado: "APROBADO",
      metodoPago: "Mixto",
      articulos: 2,
      sucursal: null,
      total: 160,
      origen: "Mesa 1",
      billar: true,
      partes: [
        { medio: "Efectivo", monto: 80 },
        { medio: "QR", monto: 80 },
      ],
    },
  ],
  pagina: { page: 1, limite: 50, total: 1, totalPaginas: 1 },
});

const VENTA = {
  id: 5,
  codigo: "V-000005",
  hora: new Date(2026, 9, 24, 23, 11).getTime(),
  cajero: "Flavia Suarez",
  origen: "mesa",
  mesaId: 1,
  tipoMesa: "pool",
  tipoNombre: "Pool",
  tiempoMin: 120,
  tiempoBs: 130,
  items: [{ productoId: 1, nombre: "Paceña", precio: 15, cant: 2 }],
  consumosBs: 30,
  total: 160,
  pagos: [
    { id: "1", hora: new Date(2026, 9, 24, 23, 11).getTime(), metodo: "QR", monto: 80, previo: { hora: new Date(2026, 9, 24, 21, 30).getTime(), concepto: "ADELANTO", por: "Flavia Suarez" } },
    { id: "2", hora: new Date(2026, 9, 24, 23, 11).getTime(), metodo: "Efectivo", monto: 80 },
  ],
};

function mostrar() {
  const datos: DatosReporte = {
    periodo: { preset: "mes", ...RANGO },
    comparacion: { desde: "2026-09-01", hasta: "2026-09-26", contra: "1–26 de septiembre", leyenda: "1–26 de septiembre" },
    rango: RANGO,
    rangoAnterior: { desde: "2026-09-01", hasta: "2026-09-26" },
    sucursalNombre: "",
    registrarExportacion: () => {},
    veReporte: () => false,
  };
  return render(
    <MemoryRouter>
      <ContextoReporte.Provider value={datos}>
        <Ventas />
      </ContextoReporte.Provider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  sesion.rubro = "BILLAR";
  sesion.permisos = ["billar.admin"];
  reporteVentas.mockReset().mockResolvedValue(respuesta());
  request.mockReset().mockImplementation(async (url: string) => {
    if (url.startsWith("/billar/supervision/detalle")) return { abierta: false, sesionId: 900, venta: VENTA, historial: [] };
    throw new Error(`No esperado: ${url}`);
  });
});

describe("Reportes › Ventas en un billar", () => {
  it("la venta pagada parte y parte dice cuánto fue por cada medio", async () => {
    mostrar();
    expect(await screen.findByText("V-000005")).toBeInTheDocument();
    expect(screen.getByText(/Mixto \(Efectivo Bs\s80,00 \+ QR Bs\s80,00\)/)).toBeInTheDocument();
  });

  it("el administrador toca la venta y ve su detalle: cómo se pagó, con la hora del adelanto", async () => {
    mostrar();
    const fila = await screen.findByRole("button", { name: /V-000005/ });
    await act(async () => {
      fireEvent.click(fila);
    });
    const d = await screen.findByRole("dialog", { name: "Detalle de venta" });
    expect(request).toHaveBeenCalledWith("/billar/supervision/detalle?venta=5");
    expect(await within(d).findByText("V-000005 · Mesa 1 · Pool")).toBeInTheDocument();
    expect(within(d).getByText("Cómo se pagó")).toBeInTheDocument();
    expect(within(d).getByText(/^Adelanto · .*21:30 · cobró Flavia Suarez$/)).toBeInTheDocument();
    expect(within(d).getByText("2 × Paceña")).toBeInTheDocument();
  });

  it("sin el permiso de administrar el billar, la fila no se toca", async () => {
    sesion.permisos = ["reportes.operacion"];
    mostrar();
    expect(await screen.findByText("V-000005")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /V-000005/ })).toBeNull();
  });
});

describe("Reportes › Ventas en otro rubro", () => {
  it("la fila no es un botón y el método se lee como siempre", async () => {
    sesion.rubro = "RESTAURANTE";
    mostrar();
    expect(await screen.findByText("V-000005")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /V-000005/ })).toBeNull();
    expect(screen.queryByText(/Mixto \(/)).toBeNull();
    expect(screen.getByText(/· Mixto ·/)).toBeInTheDocument();
  });
});
