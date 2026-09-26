import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MesasPorCobrar from "./MesasPorCobrar";

const mesasPorCobrar = vi.fn();

vi.mock("../../lib/api", () => ({
  api: { mesasPorCobrar: (...a: unknown[]) => mesasPorCobrar(...a) },
}));

describe("mesas por cobrar (web)", () => {
  beforeEach(() => {
    mesasPorCobrar.mockReset();
  });

  it("mientras carga no dice que ninguna mesa pidió la cuenta", () => {
    // Visto en QA: la cajera entraba desde el banner "1 mesa esperando cobro"
    // y lo primero que leía era "Ninguna mesa pidió la cuenta".
    mesasPorCobrar.mockReturnValue(new Promise(() => {}));
    render(<MesasPorCobrar onAtras={() => {}} onCobrar={() => {}} />);
    expect(screen.queryByText(/Ninguna mesa pidió la cuenta/)).not.toBeInTheDocument();
  });

  it("si falla muestra el error, no una lista vacía", async () => {
    mesasPorCobrar.mockRejectedValue(new Error("Sin conexión"));
    render(<MesasPorCobrar onAtras={() => {}} onCobrar={() => {}} />);
    expect(await screen.findByText("Sin conexión")).toBeInTheDocument();
    expect(screen.queryByText(/Ninguna mesa pidió la cuenta/)).not.toBeInTheDocument();
  });

  it("con la respuesta vacía sí lo dice", async () => {
    mesasPorCobrar.mockResolvedValue([]);
    render(<MesasPorCobrar onAtras={() => {}} onCobrar={() => {}} />);
    expect(await screen.findByText("Ninguna mesa pidió la cuenta.")).toBeInTheDocument();
  });
});
