import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RECIBO_DE_FABRICA } from "../../types/menuDigital";
import { CabeceraNegocio } from "./PiezasRecibo";

/**
 * La cabecera del recibo: con 2+ locales, la dirección y el teléfono son los del
 * LOCAL de la venta (su ficha) y no los del negocio, que son de uno solo.
 */
const r = { ...RECIBO_DE_FABRICA, direccion: "Av. Central 1", telefono: "600 00000" };

describe("la cabecera del recibo", () => {
  it("sin local, la dirección y el teléfono del negocio, como siempre", () => {
    render(<CabeceraNegocio r={r} logo={null} nombre="Pollos" />);
    expect(screen.getByText("Av. Central 1 · Tel. 600 00000")).toBeInTheDocument();
  });

  it("con el local de la venta, los de ese local", () => {
    render(<CabeceraNegocio r={r} logo={null} nombre="Pollos" sede={{ direccion: "Av. Sur 12", telefono: "700 11111" }} />);
    expect(screen.getByText("Av. Sur 12 · Tel. 700 11111")).toBeInTheDocument();
  });

  it("lo que el local no cargó lo completa el negocio", () => {
    render(<CabeceraNegocio r={r} logo={null} nombre="Pollos" sede={{ direccion: "Av. Sur 12", telefono: null }} />);
    expect(screen.getByText("Av. Sur 12 · Tel. 600 00000")).toBeInTheDocument();
  });
});
