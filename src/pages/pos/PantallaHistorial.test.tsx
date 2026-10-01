import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Caja, Venta } from "../../types";

/**
 * El detalle de una venta en "Ventas del turno".
 *
 * En bamardev-restaurant cada renglón dice si fue para la mesa o para llevar,
 * como siempre. En una farmacia no hay mesas: la venta se guarda como de local
 * y cada medicamento salía marcado "Mesa".
 */

const sesion = vi.hoisted(() => ({ rubro: "RESTAURANTE" as string | undefined }));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    rubro: sesion.rubro,
    usuario: { rol: "ADMIN" },
    puede: () => false,
    incluye: () => true,
  }),
}));

vi.mock("../../lib/api", () => ({
  api: {
    getVentas: vi.fn(),
    getVenta: vi.fn(),
    getPedidosPendientes: vi.fn(),
    getCreditos: vi.fn(),
  },
}));

import { api } from "../../lib/api";
import PantallaHistorial from "./PantallaHistorial";

const venta = {
  id: 7,
  comprobante: "T-0007",
  estado: "APROBADO",
  fecha: "2026-09-30T19:00:00",
  total: 80,
  items: 2,
  detalles: [
    {
      productoId: 1,
      producto: "Pollo entero",
      cantidad: 1,
      precio: 60,
      subtotal: 60,
      nota: "sin cebolla",
      consumo: "MESA",
    },
    {
      productoId: 2,
      producto: "Gaseosa 2L",
      cantidad: 1,
      precio: 20,
      subtotal: 20,
      nota: null,
      consumo: "LLEVAR",
    },
  ],
  pagos: [{ formaPago: "Efectivo", monto: 80 }],
  formasPago: ["Efectivo"],
  tipoPedido: "LOCAL",
  estadoEntrega: null,
  prepagado: false,
  clienteNombre: null,
  clienteDireccion: null,
  clienteTelefono: null,
  tarifaEnvio: 0,
  minutosEstimados: null,
  notaPedido: null,
  entregadoEn: null,
} as unknown as Venta;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getVentas).mockResolvedValue([venta]);
  vi.mocked(api.getVenta).mockResolvedValue(venta);
  vi.mocked(api.getPedidosPendientes).mockResolvedValue([]);
  vi.mocked(api.getCreditos).mockResolvedValue([]);
});

async function abrirDetalle() {
  render(
    <MemoryRouter>
      <PantallaHistorial
        caja={{ id: 1 } as Caja}
        onAtras={() => {}}
        onCierre={() => {}}
        onVerComprobante={() => {}}
      />
    </MemoryRouter>,
  );
  fireEvent.click(await screen.findByRole("button", { name: /T-0007/ }));
  await screen.findByText("Pollo entero");
}

describe("bamardev-restaurant: cada renglón dice mesa o llevar", () => {
  it("como siempre", async () => {
    sesion.rubro = "RESTAURANTE";
    await abrirDetalle();
    expect(screen.getByText("Mesa")).toBeInTheDocument();
    expect(screen.getByText("Llevar")).toBeInTheDocument();
    expect(screen.getByText("sin cebolla")).toBeInTheDocument();
  });
});

describe("farmacia: no hay mesas", () => {
  it("los renglones no dicen Mesa ni Llevar, y la nota sigue", async () => {
    sesion.rubro = "FARMACIA";
    await abrirDetalle();
    expect(screen.queryByText("Mesa")).not.toBeInTheDocument();
    expect(screen.queryByText("Llevar")).not.toBeInTheDocument();
    expect(screen.getByText("sin cebolla")).toBeInTheDocument();
  });
});
