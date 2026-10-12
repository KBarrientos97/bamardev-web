import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { SelectorColor } from "./SelectorColor";

function Prueba(props: Partial<Parameters<typeof SelectorColor>[0]> & { inicial?: string | null }) {
  const [valor, setValor] = useState<string | null>(props.inicial ?? null);
  return (
    <SelectorColor
      etiqueta="Color"
      {...props}
      valor={valor}
      onCambio={(h) => {
        setValor(h);
        props.onCambio?.(h);
      }}
      vistaPrevia={(hex) => <span data-testid="previa">{hex ?? "ninguno"}</span>}
    />
  );
}

const grilla = () => screen.getByRole("radiogroup", { name: "Color" });

describe("el selector de color del sistema", () => {
  it("cerrado muestra sólo lo elegido; abierto, la misma grilla de 40 en todos lados", () => {
    render(<Prueba inicial="#7357b8" />);
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    const fila = screen.getByRole("button", { name: "Color: Lavanda. Cambiar" });
    expect(fila).toHaveTextContent("Violeta, tono vivo");
    fireEvent.click(fila);
    expect(within(grilla()).getAllByRole("radio")).toHaveLength(40);
    expect(within(grilla()).getByRole("radio", { name: "Lavanda" })).toHaveAttribute("aria-checked", "true");
  });

  it("la vista previa muestra el color bajo el mouse antes de elegirlo, y vuelve al elegido", () => {
    const onCambio = vi.fn();
    render(<Prueba inicial="#7357B8" onCambio={onCambio} />);
    fireEvent.click(screen.getByRole("button", { name: /^Color:/ }));
    expect(screen.getByTestId("previa")).toHaveTextContent("#7357B8");
    fireEvent.mouseEnter(within(grilla()).getByRole("radio", { name: "Marino" }));
    expect(screen.getByTestId("previa")).toHaveTextContent("#1E3A8A");
    expect(screen.getByText(/Marino · Azul, tono profundo/)).toBeInTheDocument();
    expect(onCambio).not.toHaveBeenCalled();
    fireEvent.mouseLeave(grilla());
    expect(screen.getByTestId("previa")).toHaveTextContent("#7357B8");

    fireEvent.click(within(grilla()).getByRole("radio", { name: "Marino" }));
    expect(onCambio).toHaveBeenLastCalledWith("#1E3A8A");
    // Elegir no cierra: se sigue viendo la vista previa hasta "Listo".
    fireEvent.click(screen.getByRole("button", { name: "Color: Marino. Listo" }));
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
  });

  it("sin color libre no hay 'Otro color'; con libre, se teclea el hex y se ve como propio", () => {
    const { unmount } = render(<Prueba inicial="#0C7A55" />);
    fireEvent.click(screen.getByRole("button", { name: /^Color:/ }));
    expect(screen.queryByLabelText("Color en hex")).not.toBeInTheDocument();
    unmount();

    const onCambio = vi.fn();
    render(<Prueba inicial="#0C7A55" libre onCambio={onCambio} />);
    fireEvent.click(screen.getByRole("button", { name: /^Color:/ }));
    fireEvent.change(screen.getByLabelText("Color en hex"), { target: { value: "12ab3" } });
    expect(onCambio).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Color en hex"), { target: { value: "12ab34" } });
    expect(onCambio).toHaveBeenLastCalledWith("#12AB34");
    expect(screen.getByRole("button", { name: "Color: Color propio #12AB34. Listo" })).toBeInTheDocument();
    expect(within(grilla()).queryByRole("radio", { checked: true })).not.toBeInTheDocument();
  });

  it("'Automático' y 'Sin color' son null, y sólo aparecen donde el dato los admite", () => {
    const onCambio = vi.fn();
    const { unmount } = render(<Prueba inicial="#0C7A55" automatico={{ hex: "#FFFBEB" }} onCambio={onCambio} />);
    fireEvent.click(screen.getByRole("button", { name: /^Color:/ }));
    expect(screen.queryByRole("radio", { name: "Color: sin color" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Color: automático" }));
    expect(onCambio).toHaveBeenLastCalledWith(null);
    // En automático, la vista previa pinta lo que se usaría.
    expect(screen.getByTestId("previa")).toHaveTextContent("ninguno");
    expect(screen.getByText("Automático (#FFFBEB)")).toBeInTheDocument();
    unmount();

    render(<Prueba sinColor />);
    expect(screen.getByRole("button", { name: "Color: Sin color. Cambiar" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Color:/ }));
    expect(screen.getByRole("radio", { name: "Color: sin color" })).toHaveAttribute("aria-checked", "true");
  });

  it("los sugeridos van arriba, con su nombre, y eligen igual que la grilla", () => {
    const onCambio = vi.fn();
    render(<Prueba inicial="#0C7A55" sugeridos={[{ titulo: "De tu logo", hexes: ["#C0262D"] }, { titulo: "Vacío", hexes: [] }]} onCambio={onCambio} />);
    fireEvent.click(screen.getByRole("button", { name: /^Color:/ }));
    expect(screen.queryByText("Vacío")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "De tu logo: Rojo" }));
    expect(onCambio).toHaveBeenLastCalledWith("#C0262D");
    expect(within(grilla()).getByRole("radio", { name: "Rojo" })).toHaveAttribute("aria-checked", "true");
  });
});
