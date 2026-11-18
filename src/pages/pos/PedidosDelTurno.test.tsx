import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PedidoPlataforma } from "../../lib/pedidosPlataforma/tipos";

/**
 * Reimprimir el ticket de un pedido de Yango/PedidosYa desde «Ventas del
 * turno» (CONTRATO-DELIVERY-FULL-18NOV §9): sólo con «Imprimir el pedido al
 * registrarlo» prendido. Apagado, el detalle queda como siempre.
 */

const sesion = vi.hoisted(() => ({ pos: null as Record<string, unknown> | null }));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    negocio: { id: 1, nombre: "Nombre del negocio", tipoNegocio: "RESTAURANTE", features: ["pos", "pedidos_yango"], pos: sesion.pos },
    usuario: { id: 1, rol: "CAJERO" },
  }),
}));

import { DetallePedidoDelTurno } from "./PedidosDelTurno";

const PEDIDO: PedidoPlataforma = {
  id: 12,
  clienteRequestId: "uuid",
  plataforma: "YANGO",
  codigoExterno: "12345",
  fecha: "2026-11-18T04:41:00.000Z",
  almacen: { id: 3, nombre: "Principal" },
  usuario: { id: 1, nombre: "Admin Demo" },
  total: 248,
  sinStock: false,
  anuladoEn: null,
  motivoAnulacion: null,
  detalles: [
    { id: 1, lineaPadreId: null, productoId: 7, nombre: "Brasa entero", cantidad: 2, precio: 112, subtotal: 224 },
    { id: 2, lineaPadreId: 1, productoId: 9, nombre: "Arroz (porción)", cantidad: 1, precio: 6, subtotal: 6 },
    { id: 3, lineaPadreId: null, productoId: 8, nombre: "Coca Cola 2L", cantidad: 1, precio: 18, subtotal: 18 },
  ],
};

beforeEach(() => {
  sesion.pos = null;
  window.print = vi.fn();
});

describe("reimprimir desde «Ventas del turno»", () => {
  it("apagado (lo de fábrica): el detalle de siempre, sin «Imprimir»", () => {
    render(<DetallePedidoDelTurno p={PEDIDO} onClose={() => {}} />);
    expect(screen.queryByRole("button", { name: "Imprimir" })).not.toBeInTheDocument();
  });

  it("prendido: «Imprimir» saca el ticket del pedido", () => {
    sesion.pos = { imprimirPlataformas: true };
    render(<DetallePedidoDelTurno p={PEDIDO} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Imprimir" }));
    expect(window.print).toHaveBeenCalledTimes(1);
    const texto = document.getElementById("area-impresion")!.textContent!;
    expect(texto).toContain("PEDIDO YANGO\nN° de la app: 12345\n");
    expect(texto).toContain("Atendió: Admin Demo");
    expect(texto).toContain("  + Arroz (porción)         6.00");
    expect(texto).toContain("TOTAL                  Bs 248.00\n3 unidades");
  });

  it("un pedido anulado no se reimprime: no va a la cocina", () => {
    sesion.pos = { imprimirPlataformas: true };
    render(<DetallePedidoDelTurno p={{ ...PEDIDO, anuladoEn: "2026-11-18T05:00:00.000Z" }} onClose={() => {}} />);
    expect(screen.queryByRole("button", { name: "Imprimir" })).not.toBeInTheDocument();
  });
});
