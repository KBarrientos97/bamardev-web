import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Chips, FilaFiltros } from "./filtros";

/**
 * En el celular los filtros van en UNA fila que se desliza (decisión del
 * dueño, 13-oct); desde md, como siempre. jsdom no mide, así que se prueba el
 * armado: qué clases quedan y quién es la fila.
 */

const TIPOS = [
  ["", "Todos los tipos"],
  ["E", "Entradas"],
  ["S", "Salidas"],
] as const;
const ESTADOS = [
  ["", "Todos los estados"],
  ["P", "Pendientes"],
] as const;

describe("Chips sueltos", () => {
  it("son su propia fila deslizable en el celular y renglones desde md", () => {
    const { container } = render(<Chips valor="" opciones={TIPOS} onChange={() => {}} />);
    const fila = container.firstElementChild!;
    expect(fila.className).toContain("flex-wrap");
    expect(fila.className).toContain("max-md:flex-nowrap");
    expect(fila.className).toContain("max-md:overflow-x-auto");
    // Un chip nunca se parte en dos renglones dentro de la fila.
    expect(screen.getByRole("button", { name: "Todos los tipos" }).className).toContain("whitespace-nowrap");
  });

  it("siguen filtrando igual", () => {
    const onChange = vi.fn();
    render(<Chips valor="" opciones={TIPOS} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Salidas" }));
    expect(onChange).toHaveBeenCalledWith("S");
  });
});

describe("FilaFiltros: varios grupos en una sola fila", () => {
  it("la fila es la del contenedor; cada grupo se disuelve en ella en el celular", () => {
    const { container } = render(
      <FilaFiltros>
        <Chips valor="" opciones={TIPOS} onChange={() => {}} />
        <Chips valor="" opciones={ESTADOS} onChange={() => {}} />
      </FilaFiltros>,
    );
    const fila = container.firstElementChild!;
    expect(fila.className).toContain("max-md:overflow-x-auto");
    // Desde md vuelve a los renglones de antes, con su separación.
    expect(fila.className).toContain("md:block");
    expect(fila.className).toContain("md:space-y-3");
    const grupos = screen.getAllByRole("button", { name: /Todos/ }).map((b) => b.parentElement!);
    for (const g of grupos) {
      expect(g.className).toContain("max-md:contents");
      expect(g.className).not.toContain("max-md:overflow-x-auto");
    }
  });

  it("una rayita entre grupo y grupo, y los grupos que no se muestran no cuentan", () => {
    const { container } = render(
      <FilaFiltros>
        {false}
        <Chips valor="" opciones={TIPOS} onChange={() => {}} />
        {null}
        <Chips valor="" opciones={ESTADOS} onChange={() => {}} />
      </FilaFiltros>,
    );
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(1);
  });

  it("la separación de escritorio se puede ajustar a la de la pantalla", () => {
    const { container } = render(
      <FilaFiltros separacion="md:space-y-5">
        <Chips valor="" opciones={TIPOS} onChange={() => {}} />
      </FilaFiltros>,
    );
    expect(container.firstElementChild!.className).toContain("md:space-y-5");
    expect(container.firstElementChild!.className).not.toContain("md:space-y-3");
  });
});
