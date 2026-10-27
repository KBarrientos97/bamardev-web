import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CobroEnLaCompu } from "./CobroEnLaCompu";

/**
 * El cobro del Punto de venta en la computadora (27-oct): lo que se cobra a
 * la izquierda y el cobro en una tarjeta al lado. Kevin lo vio raro cobrando
 * en el billar: el total arriba a un costado, el efectivo al otro y
 * "Confirmar" pegado al borde de abajo, sin decir qué se estaba cobrando.
 */

function pantalla(ancha: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((q: string) => ({
      matches: ancha,
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const LINEAS = [
  { clave: 1, nombre: "Cerveza Paceña 620 ml", cantidad: 1, precio: 15 },
  { clave: 2, nombre: "Coca Cola 500 ml", cantidad: 2, precio: 8 },
];

describe("CobroEnLaCompu", () => {
  it("en la computadora dice qué se cobra, renglón por renglón, con el total", () => {
    pantalla(true);
    render(
      <CobroEnLaCompu lineas={LINEAS} total={31}>
        <p>el cobro</p>
      </CobroEnLaCompu>,
    );
    const detalle = screen.getByRole("region", { name: "Lo que se cobra" });
    expect(within(detalle).getByText("Cerveza Paceña 620 ml")).toBeInTheDocument();
    expect(within(detalle).getByText(/2 × Bs\s8,00/)).toBeInTheDocument();
    expect(within(detalle).getByText(/· 3 ítems/)).toBeInTheDocument();
    expect(within(detalle).getByText("Total").nextSibling).toHaveTextContent(/Bs\s31,00/);
    // Sin descuento no hay renglones de subtotal.
    expect(within(detalle).queryByText("Descuentos")).not.toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Cobro" })).toHaveTextContent("el cobro");
  });

  it("si el total es menos que los renglones, la diferencia se dice como descuento", () => {
    pantalla(true);
    render(
      <CobroEnLaCompu lineas={LINEAS} total={28}>
        <p>el cobro</p>
      </CobroEnLaCompu>,
    );
    const detalle = screen.getByRole("region", { name: "Lo que se cobra" });
    expect(within(detalle).getByText("Subtotal").nextSibling).toHaveTextContent(/Bs\s31,00/);
    expect(within(detalle).getByText("Descuentos").nextSibling).toHaveTextContent(/Bs\s3,00/);
  });

  it("en el celular, el cobro de siempre y nada más", () => {
    pantalla(false);
    render(
      <CobroEnLaCompu lineas={LINEAS} total={31}>
        <p>el cobro</p>
      </CobroEnLaCompu>,
    );
    expect(screen.queryByRole("region", { name: "Lo que se cobra" })).not.toBeInTheDocument();
    expect(screen.getByText("el cobro")).toBeInTheDocument();
  });
});
