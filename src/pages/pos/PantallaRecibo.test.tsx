import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Venta } from "../../types";
import PantallaRecibo from "./PantallaRecibo";

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({ negocio: { nombre: "Pollos Don Omar" }, incluye: () => true }),
}));

function venta(extra: Partial<Venta> = {}): Venta {
  return {
    id: 9,
    comprobante: "V-000009",
    estado: "APROBADO",
    fecha: "2026-09-25T20:25:00.000Z",
    cajero: "Administrador",
    total: 59,
    detalles: [
      { productoId: 1, producto: "Brasa cuarto", cantidad: 1, precio: 26, subtotal: 26, consumo: "MESA" },
    ],
    pagos: [],
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
    ...extra,
  } as Venta;
}

describe("ticket del POS (web)", () => {
  it("cobrando una mesa dice la mesa y quién la atendió", () => {
    // Visto en QA: la caja cobraba M3 y el ticket salía como uno de
    // mostrador, sin mesa ni mesero.
    render(
      <PantallaRecibo
        venta={venta({ mesa: "M3", mesaNombre: "Mesa M3", mesero: "Mesero Auditoria" })}
        onNuevaVenta={() => {}}
        onHistorial={() => {}}
      />,
    );
    expect(screen.getByText("Mesa:")).toBeInTheDocument();
    expect(screen.getByText("M3")).toBeInTheDocument();
    expect(screen.getByText("Atendió:")).toBeInTheDocument();
    expect(screen.getByText("Mesero Auditoria")).toBeInTheDocument();
    // El que cobró sigue siendo otro dato.
    expect(screen.getByText("Administrador")).toBeInTheDocument();
  });

  it("una venta de mostrador no inventa mesa ni mesero", () => {
    render(<PantallaRecibo venta={venta()} onNuevaVenta={() => {}} onHistorial={() => {}} />);
    expect(screen.queryByText("Mesa:")).not.toBeInTheDocument();
    expect(screen.queryByText("Atendió:")).not.toBeInTheDocument();
  });
});
