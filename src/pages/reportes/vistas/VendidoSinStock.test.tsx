import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SugerenciaApi, VendidoSinStockApi } from "../api";
import { ContextoReporte, type DatosReporte } from "../contexto";
import StockCritico from "./StockCritico";
import VendidoSinStock from "./VendidoSinStock";
import { lineaVenta, pieVenta } from "./VendidoSinStock.datos";

/**
 * Vendido sin stock (09-nov) y lo que cambia en Stock crítico.
 *
 * El restaurante que vende sin control de stock ve acá lo que salió sin estar
 * cargado, por artículo y venta por venta. Stock crítico, en ese modo, no dice
 * "Nada por reponer" (que se leía como la heladera llena): dice por qué está
 * vacío.
 */

const reporte = vi.fn();
const request = vi.fn();
let permisos: string[] = [];
let secciones: string[] = [];

vi.mock("../../../lib/api", () => ({
  api: { reporte: (...a: unknown[]) => reporte(...a) },
  qs: () => "",
  request: (...a: unknown[]) => request(...a),
}));

vi.mock("../../../store/AuthContext", () => ({
  useAuth: () => ({
    rubro: "RESTAURANTE",
    negocio: { features: [] },
    usuario: { permisos },
    puede: (s: string) => secciones.includes(s),
    incluye: () => true,
  }),
}));

const SIN_CONTROL: VendidoSinStockApi = {
  controlaStock: false,
  resumen: { unidades: 7, articulos: 2, ventas: 3, monto: 70 },
  items: [
    { productoId: 1, nombre: "Coca Cola 2L", categoria: "Bebidas", unidad: "u", unidades: 6, ventas: 2, monto: 60, ultima: "2026-11-09T18:32:00.000Z" },
    { productoId: 2, nombre: "Fanta 2L", categoria: "Bebidas", unidad: "u", unidades: 1, ventas: 1, monto: 10, ultima: "2026-11-09T16:00:00.000Z" },
  ],
  ultimas: [
    { lineaId: 9, ventaId: 41, comprobante: "V-000004", fecha: "2026-11-09T18:32:00.000Z", productoId: 1, producto: "Coca Cola 2L", unidad: "u", unidades: 3, cantidad: 5, usuario: "Carla" },
    { lineaId: 8, ventaId: 40, comprobante: "V-000003", fecha: "2026-11-09T16:00:00.000Z", productoId: 2, producto: "Fanta 2L", unidad: "u", unidades: 1, cantidad: 1, usuario: "Carla" },
  ],
  recortado: false,
};

function mostrar(vista: ReactNode) {
  const datos: DatosReporte = {
    periodo: { preset: "rango", desde: "2026-11-01", hasta: "2026-11-09" },
    comparacion: { desde: "2026-10-23", hasta: "2026-10-31", contra: "del 23/10 al 31/10/2026", leyenda: "Período anterior" },
    rango: { desde: "2026-11-01", hasta: "2026-11-09" },
    rangoAnterior: { desde: "2026-10-23", hasta: "2026-10-31" },
    sucursalNombre: "",
    registrarExportacion: () => {},
    veReporte: () => true,
  };
  return render(
    <MemoryRouter>
      <ContextoReporte.Provider value={datos}>{vista}</ContextoReporte.Provider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  reporte.mockReset();
  request.mockReset();
  permisos = ["reportes.ver"];
  secciones = ["reportes", "config_inventario"];
});

describe("Vendido sin stock", () => {
  it("muestra lo vendido sin stock por artículo y venta por venta, con quién cobró", async () => {
    reporte.mockResolvedValue(SIN_CONTROL);
    mostrar(<VendidoSinStock />);

    expect(await screen.findByText("Por artículo")).toBeInTheDocument();
    expect(reporte).toHaveBeenCalledWith("vendido-sin-stock", expect.anything());
    // Los totales: 7 unidades, Bs 70, 2 artículos, 3 ventas.
    expect(screen.getByText("Vendido sin stock").closest(".card")).toHaveTextContent("7unidades");
    expect(screen.getByText("Cobrado por eso").closest(".card")).toHaveTextContent("70");
    expect(screen.getAllByText("Coca Cola 2L")).toHaveLength(2);
    expect(screen.getByText("6 u")).toBeInTheDocument();
    // Faltó una parte de la línea: dice de cuánto.
    expect(screen.getByText("de 5 u vendidas")).toBeInTheDocument();
    expect(screen.getByText(/Venta #41 · V-000004 · .* · Carla/)).toBeInTheDocument();
  });

  it("vendiendo sin control, el dueño tiene a mano cómo prenderlo", async () => {
    reporte.mockResolvedValue(SIN_CONTROL);
    mostrar(<VendidoSinStock />);
    expect(await screen.findByText(/Estás vendiendo sin control de stock/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "prendé el control de stock" })).toHaveAttribute("href", "/configuracion/inventario");
  });

  it("quien no configura el negocio lee el reporte sin el enlace", async () => {
    secciones = ["reportes"];
    reporte.mockResolvedValue(SIN_CONTROL);
    mostrar(<VendidoSinStock />);
    expect(await screen.findByText(/Estás vendiendo sin control de stock/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "prendé el control de stock" })).not.toBeInTheDocument();
  });

  it("con el control prendido y nada sin stock, lo dice así y no como error", async () => {
    reporte.mockResolvedValue({
      ...SIN_CONTROL,
      controlaStock: true,
      resumen: { unidades: 0, articulos: 0, ventas: 0, monto: 0 },
      items: [],
      ultimas: [],
    });
    mostrar(<VendidoSinStock />);
    expect(await screen.findByText("Nada vendido sin stock")).toBeInTheDocument();
    expect(screen.getByText("En este período todo lo que se vendió tenía stock.")).toBeInTheDocument();
    expect(screen.getByText(/El control de stock está prendido/)).toBeInTheDocument();
  });

  it("si el reporte falla no muestra los totales en cero", async () => {
    reporte.mockRejectedValue(new Error("Sin conexión"));
    mostrar(<VendidoSinStock />);
    expect(await screen.findByText("Sin conexión")).toBeInTheDocument();
    expect(screen.queryByText("Cobrado por eso")).not.toBeInTheDocument();
  });
});

describe("los textos de cada venta", () => {
  it("nombran la venta por su número interno además del comprobante, que reinicia por turno", () => {
    expect(lineaVenta({ ventaId: 41, comprobante: "V-000004", fecha: "2026-11-09T18:32:00.000Z", usuario: "Carla" })).toMatch(
      /^Venta #41 · V-000004 · \d\d\/\d\d .+ · Carla$/,
    );
    // Sin comprobante ni cajero no quedan separadores sueltos.
    expect(lineaVenta({ ventaId: 7, comprobante: null, fecha: "2026-11-09T18:32:00.000Z", usuario: null })).toMatch(/^Venta #7 · \d\d\/\d\d [^·]+$/);
  });

  it("dicen si faltó toda la línea o una parte", () => {
    expect(pieVenta({ unidades: 1, cantidad: 1, unidad: "u" })).toBe("sin stock");
    expect(pieVenta({ unidades: 3, cantidad: 5, unidad: "u" })).toBe("de 5 u vendidas");
    expect(pieVenta({ unidades: 0.5, cantidad: 1.5, unidad: null })).toBe("de 1,5 vendidas");
  });
});

describe("Stock crítico vendiendo sin control de stock", () => {
  const VACIA: SugerenciaApi = {
    dias: 30,
    cobertura: 15,
    controlaStock: false,
    items: [],
    resumen: { articulos: 0, unidades: 0, inversion: 0, agotados: 0 },
  };

  it("explica por qué no hay nada que reponer y lleva al reporte de lo vendido sin stock", async () => {
    request.mockResolvedValue(VACIA);
    mostrar(<StockCritico />);
    const aviso = await screen.findByRole("status");
    expect(aviso).toHaveTextContent("Estás vendiendo sin control de stock");
    expect(within(aviso).getByRole("link", { name: "Vendido sin stock" })).toHaveAttribute("href", "/reportes/vendido-sin-stock");
    // No el vacío de siempre, que se leía como la heladera llena.
    expect(screen.queryByText("Nada por reponer")).not.toBeInTheDocument();
  });

  it("con el control prendido y nada por reponer, sigue diciendo lo de siempre", async () => {
    const { controlaStock: _, ...prendido } = VACIA;
    request.mockResolvedValue(prendido);
    mostrar(<StockCritico />);
    expect(await screen.findByText("Nada por reponer")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("sin permiso para ver las ventas, el aviso no enlaza un reporte que no puede abrir", async () => {
    permisos = [];
    request.mockResolvedValue(VACIA);
    mostrar(<StockCritico />);
    const aviso = await screen.findByRole("status");
    expect(within(aviso).queryByRole("link", { name: "Vendido sin stock" })).not.toBeInTheDocument();
  });
});
