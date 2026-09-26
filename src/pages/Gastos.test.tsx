import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Gasto, PlantillaGasto, ResumenGastos } from "../types";

/**
 * Las dos pantallas de gastos de bamardev-restaurant (y de todo rubro que no
 * sea farmacia): con margen como el resto de la app, cada gasto en su tarjeta,
 * lo vencido en rojo, y Gastos automáticos con su botón para volver.
 *
 * Antes usaban `bg-fondo-1` y `text-rojo`, dos clases que no existen: las
 * filas no tenían fondo y "Venció hace 8 días" salía gris.
 */

vi.mock("../store/AuthContext", () => ({
  useAuth: () => ({ usuario: { rol: "ADMIN", sucursalId: null } }),
}));

vi.mock("../lib/api", () => ({
  api: {
    getResumenGastos: vi.fn(),
    getGastos: vi.fn(),
    getCategoriasGasto: vi.fn(async () => []),
    getSucursales: vi.fn(async () => []),
    getPlantillasGasto: vi.fn(),
  },
}));

import { api } from "../lib/api";
import Gastos from "./Gastos";
import GastosFijos from "./GastosFijos";

const luz: Gasto = {
  id: 2,
  concepto: "Luz · DELAPAZ",
  categoria: "LUZ",
  categoriaNombre: "Luz",
  tipoCosto: "FIJO",
  monto: 420,
  pagado: 0,
  saldo: 420,
  estado: "PENDIENTE",
  fecha: "2026-09-12",
  fechaVencimiento: "2026-09-18",
  vencido: true,
  diasAtraso: 8,
  diasParaVencer: 0,
  metodoPago: null,
  beneficiario: null,
  nota: null,
  sucursalId: null,
  sucursal: null,
  recurrente: false,
  numeroFactura: null,
  nit: null,
};

const resumen: ResumenGastos = {
  total: 420,
  pagado: 0,
  pendiente: 420,
  vencido: 420,
  cantidad: 1,
  cantidadPendientes: 1,
  cantidadVencidos: 1,
  cantidadPagados: 0,
  ventasPeriodo: 8575,
};

const alquiler: PlantillaGasto = {
  id: 1,
  concepto: "Alquiler del local",
  categoria: "ALQUILER",
  categoriaNombre: "Alquiler",
  frecuencia: "MENSUAL",
  diaDelMes: 1,
  monto: 3500,
  activa: true,
  motivoPausa: null,
  beneficiario: null,
  nota: null,
  sucursalId: null,
  sucursal: null,
  proximaCarga: "2026-10-01",
  ultimaCarga: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getResumenGastos).mockResolvedValue(resumen);
  vi.mocked(api.getGastos).mockResolvedValue([luz]);
  vi.mocked(api.getPlantillasGasto).mockResolvedValue([alquiler]);
});

function abrir(pantalla: React.ReactNode) {
  const { container } = render(<MemoryRouter>{pantalla}</MemoryRouter>);
  return container.firstElementChild as HTMLElement;
}

describe("Gastos operativos", () => {
  it("tiene margen, cada gasto es una tarjeta y lo vencido sale en rojo", async () => {
    const raiz = abrir(<Gastos />);
    expect(raiz.className).toMatch(/\bp-4\b/);
    const vence = await screen.findByText(/Venció hace 8 días/);
    expect(vence.className).toContain("text-danger-text");
    expect(vence.closest("li")!.className).toMatch(/(^| )card( |$)/);
  });
});

/** Una fecha a `dias` de hoy, en `yyyy-MM-dd`: el aviso mira desde hoy. */
function enDias(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

describe("el aviso de los gastos automáticos", () => {
  it("dice lo que se va a cargar solo, aunque todavía no sea un gasto", async () => {
    vi.mocked(api.getPlantillasGasto).mockResolvedValue([
      { ...alquiler, proximaCarga: enDias(5) },
      { ...alquiler, id: 2, concepto: "Luz", monto: null, proximaCarga: enDias(10) },
      { ...alquiler, id: 3, concepto: "Seguro", activa: false, proximaCarga: null },
    ]);
    abrir(<Gastos />);
    const aviso = await screen.findByRole("region", { name: "Próximos gastos automáticos" });
    expect(aviso).toHaveTextContent("Alquiler del local");
    expect(aviso).toHaveTextContent(/Bs 3.?500,00/);
    expect(aviso).toHaveTextContent("A confirmar");
    // La pausada no se va a cargar: no se anuncia.
    expect(aviso).not.toHaveTextContent("Seguro");
    // Es un aviso, no un gasto: la lista sigue teniendo sólo la luz vencida.
    expect(screen.getAllByRole("listitem").filter((li) => li.closest("section") == null)).toHaveLength(1);
  });

  it("sin nada que se venga, no aparece", async () => {
    vi.mocked(api.getPlantillasGasto).mockResolvedValue([]);
    abrir(<Gastos />);
    await screen.findByText(/Venció hace 8 días/);
    expect(screen.queryByRole("region", { name: "Próximos gastos automáticos" })).not.toBeInTheDocument();
  });
});

describe("Gastos automáticos", () => {
  it("tiene margen y un botón para volver a Gastos operativos", async () => {
    const raiz = abrir(<GastosFijos />);
    expect(raiz.className).toMatch(/\bp-4\b/);
    expect(screen.getByRole("link", { name: "Volver a Gastos operativos" })).toHaveAttribute(
      "href",
      "/gastos",
    );
    const fila = (await screen.findByText("Alquiler del local")).closest("li")!;
    expect(fila.className).toMatch(/(^| )card( |$)/);
  });
});
