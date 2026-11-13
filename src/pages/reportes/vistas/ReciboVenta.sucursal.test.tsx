import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Venta } from "../../../types";

/**
 * El mensaje que sale con «Compartir» en el recibo de Reportes: con 2+ locales
 * dice de qué sucursal es la venta; con uno es el texto de siempre
 * (PLAN-SUCURSAL-TOTAL §1).
 */

const sesion = vi.hoisted(() => ({ locales: undefined as number | undefined }));
const getVenta = vi.hoisted(() => vi.fn());
const compartirComoImagen = vi.hoisted(() => vi.fn(async () => ({ ok: true })));

vi.mock("../../../lib/api", async (original) => {
  const real = await original<typeof import("../../../lib/api")>();
  return { ...real, api: { ...real.api, getVenta: (...a: unknown[]) => getVenta(...a) } };
});

vi.mock("../../../lib/compartirTicket", () => ({
  compartirComoImagen: (...a: unknown[]) => compartirComoImagen(...(a as [])),
}));

vi.mock("../../../store/AuthContext", () => ({
  useAuth: () => ({
    rubro: "RESTAURANTE",
    usuario: { id: 1, permisos: ["ventas.historial"] },
    negocio: { id: 1, nombre: "Pollos Omar", features: ["multi_almacen"], sucursalesActivas: sesion.locales },
    incluye: () => true,
  }),
}));

import { ModalReciboVenta } from "./ReciboVenta";

const VENTA = {
  id: 5,
  comprobante: "V-000005",
  estado: "APROBADO",
  fecha: "2026-10-25T03:11:00.000Z",
  cajero: "Flavia",
  total: 160,
  almacen: { id: 2, nombre: "Norte" },
  detalles: [{ productoId: 1, producto: "Brasa cuarto", cantidad: 4, precio: 40, subtotal: 160, nota: null, consumo: "MESA" }],
  pagos: [{ formaPagoId: 1, formaPago: "Efectivo", monto: 160, recibido: 160, entregado: 0 }],
  tipoPedido: "LOCAL",
  tarifaEnvio: 0,
} as unknown as Venta;

async function compartir(): Promise<string> {
  getVenta.mockResolvedValue(VENTA);
  render(<ModalReciboVenta fila={{ id: 5, comprobante: "V-000005", estado: "APROBADO" }} onClose={() => {}} />);
  await act(async () => {});
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Compartir" }));
  });
  return String((compartirComoImagen.mock.calls[0] as unknown[])[2] ?? "");
}

beforeEach(() => {
  sesion.locales = undefined;
  compartirComoImagen.mockClear();
});

describe("Reportes › recibo de una venta: el mensaje al compartir", () => {
  it("con 2+ locales, dice la sucursal", async () => {
    sesion.locales = 2;
    expect(await compartir()).toContain("Sucursal: Norte");
  });

  it("con un solo local, no la nombra, aunque la venta traiga su almacén", async () => {
    sesion.locales = 1;
    expect(await compartir()).not.toContain("Sucursal");
  });
});
