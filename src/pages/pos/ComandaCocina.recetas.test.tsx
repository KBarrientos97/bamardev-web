import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Venta } from "../../types";
import ComandaCocina from "./ComandaCocina";

/**
 * La comanda con un plato con receta (CONTRATO-recetas-plato §4.2): la cocina
 * lee cómo se armó en el recuadro de la nota. Sin armado, la de siempre.
 */

const venta = (armadoTexto?: string | null) =>
  ({
    id: 7,
    comprobante: "V-7",
    fecha: "2026-11-27T15:00:00.000Z",
    detalles: [
      {
        productoId: 12,
        producto: "Broaster cuarto",
        cantidad: 1,
        precio: 28,
        subtotal: 28,
        nota: "bien dorado",
        consumo: "MESA",
        ...(armadoTexto !== undefined ? { armadoTexto } : {}),
      },
    ],
  }) as unknown as Venta;

describe("la comanda de un plato con receta", () => {
  it("dice la presa y lo que cambió de la guarnición, junto a la nota", () => {
    render(<ComandaCocina venta={venta("Pierna y contra · Sin fideo")} numero={5} negocio="Pollería" />);
    expect(screen.getByText("Pierna y contra · Sin fideo")).toBeInTheDocument();
    expect(screen.getByText("bien dorado")).toBeInTheDocument();
  });

  it("sin armado (null o ausente) es la comanda de siempre, carácter por carácter", () => {
    const sin = render(<ComandaCocina venta={venta()} numero={5} negocio="Pollería" />).container.innerHTML;
    const nulo = render(<ComandaCocina venta={venta(null)} numero={5} negocio="Pollería" />).container.innerHTML;
    expect(nulo).toBe(sin);
  });
});
