import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CierresVista, type CierreFila } from "./CierresVista";

vi.mock("../pos/PantallaCierre", () => ({
  ProductosDelTurno: () => <p>productos del turno</p>,
}));

function cierre(p: Partial<CierreFila>): CierreFila {
  return {
    id: 1,
    fecha: "24 sept 2026",
    fechaApertura: "2026-09-24T12:00:00.000Z",
    fechaCierre: "2026-09-25T03:00:00.000Z",
    cajero: "Administrador",
    duracion: "15h",
    totalDia: 500,
    apertura: 100,
    efectivo: 300,
    qr: 200,
    esperado: 400,
    conteo: 400,
    ...p,
  };
}

describe("cierres de caja (web)", () => {
  it("la diferencia se nombra: cuadró, sobrante o faltante", () => {
    render(
      <CierresVista
        historial={[
          cierre({ id: 1 }),
          cierre({ id: 2, conteo: 420 }),
          cierre({ id: 3, conteo: 380 }),
        ]}
      />,
    );
    expect(screen.getByText("Cuadró")).toBeInTheDocument();
    expect(screen.getByText(/Sobrante/)).toBeInTheDocument();
    expect(screen.getByText(/Faltante/)).toBeInTheDocument();
  });

  it("una diferencia de centavos cuenta como que cuadró", () => {
    render(<CierresVista historial={[cierre({ conteo: 400.004 })]} />);
    expect(screen.getByText("Cuadró")).toBeInTheDocument();
  });

  it("tocar un turno abre su arqueo, y de ahí lo que se vendió", () => {
    // Antes era una tabla plana: no se podía abrir un turno.
    render(<CierresVista historial={[cierre({})]} />);
    fireEvent.click(screen.getByText(/24 sept 2026 · Administrador/));
    expect(screen.getByText("Arqueo del turno")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Productos vendidos"));
    expect(screen.getByText("productos del turno")).toBeInTheDocument();
  });
});
