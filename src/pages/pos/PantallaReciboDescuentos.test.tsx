import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Venta } from "../../types";

/**
 * El ticket con cupones y promociones (PLAN-CRM-Y-PROMOCIONES §6.1): el
 * subtotal bruto, cada descuento con su nombre y el total cobrado. Una venta
 * sin descuento no gana ni un renglón.
 */

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({ negocio: { nombre: "Pollería" }, rubro: "RESTAURANTE", incluye: () => true }),
}));

import PantallaRecibo from "./PantallaRecibo";

function venta(datos: Partial<Venta> = {}): Venta {
  return {
    id: 1,
    comprobante: "V-000001",
    estado: "APROBADO",
    fecha: "2026-10-06T12:00:00",
    total: 100,
    detalles: [
      { productoId: 1, producto: "Pollo entero", cantidad: 2, precio: 50, subtotal: 100, nota: null, consumo: "LLEVAR" },
    ],
    pagos: [],
    formasPago: [],
    tipoPedido: "LOCAL",
    estadoEntrega: null,
    prepagado: true,
    clienteNombre: null,
    clienteDireccion: null,
    clienteTelefono: null,
    tarifaEnvio: 0,
    minutosEstimados: null,
    notaPedido: null,
    entregadoEn: null,
    ...datos,
  } as Venta;
}

const dibujar = (v: Venta) =>
  render(<PantallaRecibo venta={v} onNuevaVenta={() => {}} onHistorial={() => {}} />);

describe("ticket con descuentos", () => {
  it("sin descuento, el ticket de siempre", () => {
    dibujar(venta());
    expect(screen.queryByText(/2x1/)).not.toBeInTheDocument();
    expect(screen.queryByText(/−/)).not.toBeInTheDocument();
  });

  it("con cupón: el renglón con su nombre y código, y el total neto", () => {
    dibujar(
      venta({
        total: 90,
        subtotal: 100,
        descuentoTotal: 10,
        descuentos: [{ nombre: "10 % en pollos", codigo: "POLLO10", monto: 10 }],
        detalles: [
          {
            productoId: 1,
            producto: "Pollo entero",
            cantidad: 2,
            precio: 50,
            subtotal: 100,
            nota: null,
            consumo: "LLEVAR",
            descuento: 10,
            descuentoNombre: "10 % en pollos",
          },
        ],
      }),
    );
    expect(screen.getByText("10 % en pollos (POLLO10)")).toBeInTheDocument();
    expect(screen.getAllByText(/− Bs\s?10/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Bs\s?90/).length).toBeGreaterThanOrEqual(1);
  });

  it("QA N2-12: con vale y propinas, el ticket dice cuánto pagó el vale, cuánto le queda y las propinas", () => {
    dibujar(
      venta({
        total: 35,
        giftCards: [{ codigo: "DDX2-2YX9", usado: 24, saldo: 76 }],
        propinas: [{ recursoId: 2, recurso: "Marco", monto: 10, formaPago: "Efectivo" }],
      }),
    );
    expect(screen.getByText("Vale DDX2-2YX9")).toBeInTheDocument();
    expect(screen.getByText(/Le quedan Bs\s?76,00/)).toBeInTheDocument();
    expect(screen.getByText("Para Marco (Efectivo)")).toBeInTheDocument();
  });

  it("una venta de siempre no gana renglones de vales ni propinas", () => {
    dibujar(venta());
    expect(screen.queryByText(/Vale /)).not.toBeInTheDocument();
    expect(screen.queryByText("PROPINAS")).not.toBeInTheDocument();
  });
});
