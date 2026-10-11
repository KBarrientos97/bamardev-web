import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { LoteParaVender } from "../../types";
import { CantidadVenta, LoteEnLaVenta } from "./RenglonVenta";

/**
 * El renglón de la venta de farmacia: de qué lote sale (como en la maqueta,
 * "FEFO · lote · vence") y una cantidad que se puede escribir, porque todo se
 * vende por unidad y una caja de 30 no se carga tocando "+" treinta veces.
 */

const lote = (over: Partial<LoteParaVender>): LoteParaVender => ({
  codigo: "AMX-2601",
  vencimiento: "2028-04-30T00:00:00.000Z",
  dias: 580,
  tramo: "LEJOS",
  cantidad: 20,
  ...over,
});

describe("de qué lote sale", () => {
  it("un solo lote: el código y cuándo vence", () => {
    render(<LoteEnLaVenta lotes={[lote({})]} cantidad={3} />);
    expect(screen.getByText(/FEFO/).closest("li")).toHaveTextContent("FEFO · AMX-2601 · vence 04/2028");
  });

  it("si no alcanza, dice cuánto sale de cada lote", () => {
    render(
      <LoteEnLaVenta
        lotes={[lote({ cantidad: 5 }), lote({ codigo: "AMX-2702", vencimiento: "2029-02-28" })]}
        cantidad={12}
      />,
    );
    const renglones = screen.getAllByRole("listitem");
    expect(renglones[0]).toHaveTextContent("FEFO · 5 del AMX-2601 · vence 04/2028");
    expect(renglones[1]).toHaveTextContent("+ 7 del AMX-2702 · vence 02/2029");
  });

  it("lo que los lotes no cubren se dice", () => {
    render(<LoteEnLaVenta lotes={[lote({ cantidad: 2 })]} cantidad={5} />);
    expect(screen.getByText(/sin lote asignado/)).toHaveTextContent("+ 3 sin lote asignado");
  });

  it("sin lotes con saldo en la sucursal", () => {
    render(<LoteEnLaVenta lotes={[]} cantidad={1} />);
    expect(screen.getByText("FEFO · sin lote asignado")).toBeInTheDocument();
  });

  it("un lote vencido avisa que esa caja no se entrega", () => {
    render(
      <LoteEnLaVenta
        lotes={[lote({ codigo: "DF-2404", vencimiento: "2026-08-31", dias: -28, tramo: "VENCIDO" })]}
        cantidad={1}
      />,
    );
    expect(screen.getByText(/FEFO/).closest("li")).toHaveTextContent("DF-2404 · venció 08/2026");
    expect(screen.getByText(/está vencido/)).toHaveTextContent(
      "El lote DF-2404 está vencido: no lo entregues",
    );
  });

  it("avisa las cajas vencidas que siguen en el estante, aunque no salgan de ahí", () => {
    // Desde el 1-oct-2026 los vencidos no vienen en la lista (la venta no los
    // toca), pero siguen en el estante: quien atiende tiene que apartarlos.
    render(<LoteEnLaVenta lotes={[lote({})]} vencidas={4} cantidad={1} />);
    expect(screen.getByText(/FEFO/).closest("li")).toHaveTextContent("FEFO · AMX-2601");
    expect(screen.getByText(/vencidas de este/)).toHaveTextContent(
      "Hay 4 vencidas de este en el estante: no se venden",
    );
  });

  it("si sólo hay vencidas, lo dice igual aunque no haya lote del que salga", () => {
    render(<LoteEnLaVenta lotes={[]} vencidas={2} cantidad={1} />);
    expect(screen.getByText("FEFO · sin lote asignado")).toBeInTheDocument();
    expect(screen.getByText(/vencidas de este/)).toBeInTheDocument();
  });

  it("mientras no se sabe, no dibuja nada", () => {
    const { container } = render(<LoteEnLaVenta lotes={undefined} cantidad={1} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("la cantidad se escribe", () => {
  /** El carrito de verdad deja la cantidad en lo que se fija. */
  function Con({ inicial = 1, fijar }: { inicial?: number; fijar: (n: number) => void }) {
    const [cantidad, setCantidad] = useState(inicial);
    return (
      <CantidadVenta
        nombre="Amoxicilina 500 mg"
        cantidad={cantidad}
        fijar={(n) => {
          fijar(n);
          setCantidad(n);
        }}
      />
    );
  }

  const campo = () => screen.getByRole("textbox", { name: "Cantidad de Amoxicilina 500 mg" });

  it("una caja de 30: se escribe 30", () => {
    const fijar = vi.fn();
    render(<Con fijar={fijar} />);
    fireEvent.focus(campo());
    fireEvent.change(campo(), { target: { value: "30" } });
    expect(fijar).toHaveBeenLastCalledWith(30);
    fireEvent.blur(campo());
    expect(campo()).toHaveValue("30");
  });

  it("más de lo que hay: se ve al instante lo que quedó, no lo escrito", () => {
    // El carrito de verdad no pasa del stock (y el aviso dice por qué).
    function ConTope() {
      const [cantidad, setCantidad] = useState(1);
      return (
        <CantidadVenta
          nombre="Amoxicilina 500 mg"
          cantidad={cantidad}
          fijar={(n) => setCantidad(Math.min(n, 140))}
        />
      );
    }
    render(<ConTope />);
    fireEvent.focus(campo());
    fireEvent.change(campo(), { target: { value: "999" } });
    expect(campo()).toHaveValue("140");
  });

  it("sólo números: ni letras, ni coma, ni menos", () => {
    const fijar = vi.fn();
    render(<Con fijar={fijar} />);
    fireEvent.focus(campo());
    fireEvent.change(campo(), { target: { value: "-1,5x" } });
    expect(fijar).toHaveBeenLastCalledWith(15);
  });

  it("borrarlo no saca el renglón: al salir vuelve a lo que valía", () => {
    const fijar = vi.fn();
    render(<Con inicial={4} fijar={fijar} />);
    fireEvent.focus(campo());
    fireEvent.change(campo(), { target: { value: "" } });
    fireEvent.change(campo(), { target: { value: "0" } });
    expect(fijar).not.toHaveBeenCalled();
    fireEvent.blur(campo());
    expect(campo()).toHaveValue("4");
  });

  it("los botones siguen: + suma uno, y en 1 el − es el tacho", () => {
    const fijar = vi.fn();
    render(<Con inicial={1} fijar={fijar} />);
    fireEvent.click(screen.getByRole("button", { name: "Agregar una unidad" }));
    expect(fijar).toHaveBeenLastCalledWith(2);
    fireEvent.click(screen.getByRole("button", { name: "Quitar una unidad" }));
    expect(fijar).toHaveBeenLastCalledWith(1);
    fireEvent.click(screen.getByRole("button", { name: "Quitar de la venta" }));
    expect(fijar).toHaveBeenLastCalledWith(0);
  });
});
