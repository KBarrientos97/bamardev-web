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
