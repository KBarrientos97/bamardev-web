import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PedidoPlataformaEncolado, VentaEncolada } from "../../lib/offline/cola";

/**
 * Los rechazados de la cola (sin internet) en el aviso del POS: el mensaje del
 * servidor se pega con la frase siguiente con UN punto en el medio, venga o no
 * con punto final (QA de plataformas, ronda 2).
 */

const cola = vi.hoisted(() => ({
  ventas: [] as unknown[],
  pedidos: [] as unknown[],
  descartarPedido: vi.fn(),
}));

vi.mock("../../lib/offline/cola", async (original) => ({
  ...(await original<typeof import("../../lib/offline/cola")>()),
  useColaOffline: () => cola.ventas,
  usePedidosEncolados: () => cola.pedidos,
  sinSenal: () => false,
  descartarPedido: cola.descartarPedido,
}));
vi.mock("../../lib/offline/modo", () => ({ ventaSinInternet: () => true }));
vi.mock("../../lib/offline/motor", () => ({ sincronizarAhora: vi.fn() }));

import AvisoSinSubir from "./AvisoSinSubir";

const pedido = (extra: Partial<PedidoPlataformaEncolado> = {}) =>
  ({
    tipo: "PEDIDO_PLATAFORMA",
    id: "p1",
    estado: "RECHAZADA",
    resumen: { plataforma: "YANGO", total: 27.35, lineas: 1 },
    ultimoError: null,
    ...extra,
  }) as unknown as PedidoPlataformaEncolado;

const venta = (extra: Record<string, unknown> = {}) =>
  ({ id: "v1", estado: "RECHAZADA", recibo: { total: 10 }, ...extra }) as unknown as VentaEncolada;

beforeEach(() => {
  cola.ventas = [];
  cola.pedidos = [];
  cola.descartarPedido.mockReset();
});

describe("pedido de plataforma rechazado", () => {
  it("un mensaje del servidor SIN punto final lleva uno antes de «Volvé a cargarlo a mano.»", () => {
    cola.pedidos = [pedido({ ultimoError: 'El producto "R2-Prod2" no está habilitado' })];
    render(<AvisoSinSubir />);
    const aviso = screen.getByRole("alert");
    expect(aviso.textContent).toContain('El producto "R2-Prod2" no está habilitado. Volvé a cargarlo a mano.');
  });

  it("uno CON punto final no lo duplica", () => {
    cola.pedidos = [pedido({ ultimoError: "El producto no existe." })];
    render(<AvisoSinSubir />);
    const texto = screen.getByRole("alert").textContent ?? "";
    expect(texto).toContain("El producto no existe. Volvé a cargarlo a mano.");
    expect(texto).not.toContain("..");
  });

  it("sin mensaje, dice que el servidor no lo aceptó", () => {
    cola.pedidos = [pedido()];
    render(<AvisoSinSubir />);
    expect(screen.getByRole("alert").textContent).toContain("el servidor no lo aceptó. Volvé a cargarlo a mano.");
  });

  it("«Ya lo cargué» lo saca de la lista", () => {
    cola.pedidos = [pedido({ ultimoError: "No" })];
    render(<AvisoSinSubir />);
    fireEvent.click(screen.getByRole("button", { name: "Ya lo cargué" }));
    expect(cola.descartarPedido).toHaveBeenCalledWith("p1");
  });
});

describe("venta rechazada en Ventas del turno", () => {
  it("el mismo cuidado con el punto en VentasSinSubir", async () => {
    cola.ventas = [venta({ ultimoError: "Stock insuficiente", cuerpo: { fechaCliente: "2026-11-15T16:00:00.000Z" } })];
    const { default: VentasSinSubir } = await import("./VentasSinSubir");
    render(<VentasSinSubir onVerTicket={() => {}} />);
    expect(screen.getByText(/Stock insuficiente\. Volvé a cargarla a mano\./)).toBeInTheDocument();
  });
});
