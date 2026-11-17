import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Venta } from "../../types";
import ComandaCocina from "./ComandaCocina";

const venta = {
  id: 7,
  comprobante: "V-7",
  fecha: "2026-11-13T15:00:00.000Z",
  detalles: [{ productoId: 1, producto: "Brasa cuarto", cantidad: 2, precio: 26, subtotal: 52, nota: null, consumo: "MESA" }],
} as unknown as Venta;

describe("la comanda de cocina con varios locales (PLAN-SUCURSAL-TOTAL, etapa 3)", () => {
  it("dice de cuál es, bajo el nombre del negocio", () => {
    render(<ComandaCocina venta={venta} numero={72} negocio="Pollos Don Omar" sede="Sucursal Sur" />);
    expect(screen.getByText("Sucursal Sur")).toBeInTheDocument();
  });

  it("con un solo local la comanda es la de siempre, carácter por carácter", () => {
    const sin = render(<ComandaCocina venta={venta} numero={72} negocio="Pollos Don Omar" />).container.innerHTML;
    const nula = render(<ComandaCocina venta={venta} numero={72} negocio="Pollos Don Omar" sede={null} />).container.innerHTML;
    expect(nula).toBe(sin);
    expect(sin).not.toContain("Sucursal");
  });
});

describe("la comanda de un pedido que se cambió después de cobrado (15-nov)", () => {
  const cambiada = {
    ...venta,
    vecesModificada: 1,
    modificadaEn: "2026-11-13T15:10:00.000Z",
    detalles: [{ productoId: 2, producto: "Broaster cuarto", cantidad: 2, precio: 28, subtotal: 56, nota: null, consumo: "MESA" }],
    modificaciones: [
      {
        id: 1,
        fecha: "2026-11-13T15:10:00.000Z",
        usuario: "Cata",
        autorizadoPor: "Ana",
        motivo: "El cliente cambió de idea",
        totalAntes: 52,
        totalDespues: 56,
        diferencia: 4,
        pagos: [],
        antes: [{ productoId: 1, producto: "Brasa cuarto", cantidad: 2, precio: 26, subtotal: 52, consumo: "MESA", nota: null }],
        despues: [{ productoId: 2, producto: "Broaster cuarto", cantidad: 2, precio: 28, subtotal: 56, consumo: "MESA", nota: null }],
      },
    ],
  } as unknown as Venta;

  it("avisa que es un CAMBIO y qué ya no va, para que la cocina no prepare los dos", () => {
    render(<ComandaCocina venta={cambiada} numero={72} negocio="Pollos Don Omar" />);
    expect(screen.getByText(/^PEDIDO CAMBIADO/)).toBeInTheDocument();
    expect(screen.getByText("YA NO VA: 2× Brasa cuarto")).toBeInTheDocument();
    // Abajo, el pedido como quedó.
    expect(screen.getByText("Broaster cuarto")).toBeInTheDocument();
  });

  it("si sólo se agregó algo, no hay «ya no va»", () => {
    const soloSuma = {
      ...cambiada,
      modificaciones: [{ ...cambiada.modificaciones![0], antes: [], despues: cambiada.modificaciones![0].despues }],
    } as unknown as Venta;
    render(<ComandaCocina venta={soloSuma} numero={72} negocio="Pollos Don Omar" />);
    expect(screen.getByText(/^PEDIDO CAMBIADO/)).toBeInTheDocument();
    expect(screen.queryByText(/YA NO VA/)).not.toBeInTheDocument();
  });

  it("una venta que nunca se modificó no dice nada", () => {
    render(<ComandaCocina venta={venta} numero={72} negocio="Pollos Don Omar" />);
    expect(screen.queryByText(/PEDIDO CAMBIADO/)).not.toBeInTheDocument();
  });
});

describe("la comanda de un vaso con toppings (PLAN-AGREGADOS §7.3)", () => {
  const conToppings = {
    ...venta,
    detalles: [
      { id: 501, lineaPadreId: null, productoId: 12, producto: "Arroz con leche M", cantidad: 1, precio: 20, subtotal: 20, nota: null, consumo: "LLEVAR" },
      { id: 502, lineaPadreId: 501, incluido: true, productoId: 32, producto: "Oreo", cantidad: 2, precio: 0, subtotal: 0, nota: null, consumo: "LLEVAR" },
      { id: 503, lineaPadreId: 501, incluido: false, productoId: 33, producto: "Canela", cantidad: 1, precio: 5, subtotal: 5, nota: null, consumo: "LLEVAR" },
    ],
  } as unknown as Venta;

  it("la cocina lee los toppings debajo del vaso y «productos» cuenta sólo vasos", () => {
    render(<ComandaCocina venta={conToppings} numero={72} negocio="El Ganadero" />);
    expect(screen.getByText("Arroz con leche M")).toBeInTheDocument();
    expect(screen.getByText("2 × Oreo")).toBeInTheDocument();
    expect(screen.getByText("Canela")).toBeInTheDocument();
    expect(screen.getByText("1 producto")).toBeInTheDocument();
  });
});
