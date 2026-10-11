import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Input } from "./ui";

function Campo({ alCambiar }: { alCambiar: (v: string) => void }) {
  const [v, setV] = useState("");
  return (
    <Input
      type="number"
      aria-label="monto"
      value={v}
      onChange={(e) => {
        setV(e.target.value);
        alCambiar(e.target.value);
      }}
    />
  );
}

describe("campo numérico", () => {
  it("la coma decimal llega como punto, no se pierde", () => {
    // Con type="number" un navegador en inglés convertía "50,50" en 5050: un
    // abono de Bs 50,50 se registraba como Bs 5.050.
    const alCambiar = vi.fn();
    render(<Campo alCambiar={alCambiar} />);
    fireEvent.change(screen.getByLabelText("monto"), { target: { value: "50,50" } });
    expect(alCambiar).toHaveBeenLastCalledWith("50.50");
    expect(Number(alCambiar.mock.lastCall![0])).toBe(50.5);
  });

  it("no le deja la coma al navegador: se dibuja como texto con teclado numérico", () => {
    render(<Campo alCambiar={() => {}} />);
    const campo = screen.getByLabelText("monto");
    expect(campo).toHaveAttribute("type", "text");
    expect(campo).toHaveAttribute("inputmode", "decimal");
  });

  it("un campo de texto normal no se toca", () => {
    const alCambiar = vi.fn();
    render(<Input aria-label="nota" onChange={(e) => alCambiar(e.target.value)} />);
    fireEvent.change(screen.getByLabelText("nota"), { target: { value: "hola, qué tal" } });
    expect(alCambiar).toHaveBeenLastCalledWith("hola, qué tal");
  });
});
