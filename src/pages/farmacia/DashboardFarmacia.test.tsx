import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Dashboard, Vencimientos } from "../../types";

/**
 * El Dashboard de la farmacia muestra lo que el plan compró, y cada bloque
 * lleva a donde se actúa.
 *
 * Una farmacia BASICO no tiene `lotes`: no puede ver un semáforo que el
 * backend le contestaría con 403, y en su lugar vuelve el "Bajo stock". Quien
 * no tiene reportes no ve lo más vendido. Y tocar un tramo del semáforo abre
 * Vencimientos filtrado en ese tramo.
 */

const plan = vi.hoisted(() => ({ lotes: true, reportes: true }));
const navegado = vi.hoisted(() => ({ a: "", con: null as unknown }));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    usuario: { rol: "ADMIN", sucursalId: null },
    puede: (s: string) => (s === "reportes" ? plan.reportes : true),
    incluye: (c: string) => (c === "lotes" ? plan.lotes : true),
  }),
}));

vi.mock("react-router-dom", async () => {
  const real = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...real,
    useNavigate: () => (a: string, opciones?: { state?: unknown }) => {
      navegado.a = a;
      navegado.con = opciones?.state ?? null;
    },
  };
});

vi.mock("../../lib/api", () => ({
  api: {
    getDashboard: vi.fn(),
    getSucursales: vi.fn(async () => []),
    vencimientos: vi.fn(),
    reporte: vi.fn(),
  },
}));

import { api } from "../../lib/api";
import DashboardFarmacia from "./DashboardFarmacia";

const resumen: Dashboard = {
  articulos: 36,
  almacenes: 2,
  totalInventario: 11868.4,
  bajoStock: 3,
  // En el orden del catálogo, que no es el de la urgencia.
  stockCritico: [
    { id: 1, nombre: "Paracetamol 500 mg", stock: 30, stockMinimo: 50, laboratorio: "IFA" },
    { id: 2, nombre: "Ranitidina 150 mg", stock: 0, stockMinimo: 30, laboratorio: "IFA" },
    { id: 3, nombre: "Agua 2L", stock: 2, stockMinimo: 10, laboratorio: null },
  ],
  movimientos: [],
};

const tramo = (lotes: number, valor: number) => ({ lotes, unidades: lotes * 10, valor });
const semaforo: Vencimientos = {
  vencidos: tramo(4, 522.5),
  hasta30: tramo(5, 462.15),
  hasta60: tramo(3, 772),
  hasta90: tramo(3, 1654.5),
  valorEnRiesgo: 3411.15,
  detalle: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  plan.lotes = true;
  plan.reportes = true;
  navegado.a = "";
  navegado.con = null;
  vi.mocked(api.getDashboard).mockResolvedValue(resumen);
  vi.mocked(api.vencimientos).mockResolvedValue(semaforo);
  vi.mocked(api.reporte).mockResolvedValue([
    { nombre: "Ibuprofeno 400 mg", unidades: 61 },
    { nombre: "Paracetamol 500 mg", unidades: 86 },
  ]);
});

async function abrir() {
  render(
    <MemoryRouter>
      <DashboardFarmacia />
    </MemoryRouter>,
  );
  expect(await screen.findByText("Medicamentos")).toBeInTheDocument();
}

describe("con el plan completo", () => {
  it("muestra el semáforo, lo que está por vencer y lo más vendido", async () => {
    await abrir();
    expect(await screen.findByText("Semáforo de vencimientos")).toBeInTheDocument();
    // 4 + 5 + 3 + 3: lo vencido también está "por vencer" de la góndola.
    const porVencer = screen.getByText("Por vencer").closest("a")!;
    expect(within(porVencer).getByText("15")).toBeInTheDocument();
    expect(porVencer).toHaveAttribute("href", "/vencimientos");
    expect(await screen.findByText("86 u.")).toBeInTheDocument();
  });

  it("lo más vendido va por unidades, no por plata", async () => {
    // El reporte las manda ordenadas por ingresos; el Ibuprofeno llega primero.
    await abrir();
    await screen.findByText("86 u.");
    const vendidos = screen
      .getAllByRole("listitem")
      .map((li) => li.textContent ?? "")
      .filter((t) => t.endsWith(" u."));
    expect(vendidos[0]).toContain("Paracetamol 500 mg");
    expect(vendidos[1]).toContain("Ibuprofeno 400 mg");
  });

  it("tocar un tramo abre Vencimientos filtrado en ese tramo", async () => {
    await abrir();
    await screen.findByText("≤ 30 días");
    await act(async () => {
      fireEvent.click(screen.getByText("≤ 30 días"));
    });
    expect(navegado.a).toBe("/vencimientos");
    expect(navegado.con).toEqual({ tramo: "HASTA_30" });
  });

  it("el stock crítico va por urgencia y dice el laboratorio", async () => {
    await abrir();
    const filas = screen
      .getAllByRole("listitem")
      .map((li) => li.textContent ?? "")
      .filter((t) => t.includes("Mínimo"));
    // Primero lo que ya no hay, después el que está más lejos de su mínimo.
    expect(filas[0]).toContain("Ranitidina 150 mg");
    expect(filas[1]).toContain("Agua 2L");
    expect(filas[2]).toContain("Paracetamol 500 mg");
    expect(screen.getAllByText("Mínimo: 30 · IFA")).toHaveLength(1);
    // Sin laboratorio no queda un "·" colgando.
    expect(screen.getByText("Mínimo: 10")).toBeInTheDocument();
  });
});

describe("una farmacia sin `lotes` (plan BASICO)", () => {
  it("no pide los vencimientos ni dibuja el semáforo; vuelve el bajo stock", async () => {
    plan.lotes = false;
    await abrir();
    expect(api.vencimientos).not.toHaveBeenCalled();
    expect(screen.queryByText("Semáforo de vencimientos")).not.toBeInTheDocument();
    expect(screen.queryByText("Por vencer")).not.toBeInTheDocument();
    expect(screen.getByText("Bajo stock")).toBeInTheDocument();
  });
});

describe("sin reportes", () => {
  it("no pide lo más vendido y el stock crítico ocupa el ancho", async () => {
    plan.reportes = false;
    await abrir();
    expect(api.reporte).not.toHaveBeenCalled();
    expect(screen.queryByText("Más vendidos hoy")).not.toBeInTheDocument();
    expect(screen.getByText("Stock crítico")).toBeInTheDocument();
  });
});
