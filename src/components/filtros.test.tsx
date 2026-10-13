import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Chips, FilaFiltros } from "./filtros";

/**
 * En el celular, uno o dos grupos de filtros van en UNA fila que se desliza;
 * con más, detrás de un botón "Filtros" con su hoja (decisiones del dueño,
 * 13-oct). Desde md, como siempre. jsdom no mide, así que se prueba el armado.
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

const ORIGENES = [
  ["", "Todo el origen"],
  ["PROD", "Productos"],
  ["INS", "Insumos"],
] as const;

/** Movimientos en chico: tres grupos con estado de verdad. */
function TresGrupos() {
  const [tipo, setTipo] = useState<(typeof TIPOS)[number][0]>("");
  const [estado, setEstado] = useState<(typeof ESTADOS)[number][0]>("");
  const [origen, setOrigen] = useState<(typeof ORIGENES)[number][0]>("");
  return (
    <FilaFiltros>
      <Chips titulo="Tipo" valor={tipo} opciones={TIPOS} onChange={setTipo} />
      <Chips titulo="Estado" valor={estado} opciones={ESTADOS} onChange={setEstado} />
      <Chips titulo="Origen" valor={origen} opciones={ORIGENES} onChange={setOrigen} />
    </FilaFiltros>
  );
}

describe("FilaFiltros con más de dos grupos: botón Filtros en el celular", () => {
  it("en el celular, el botón; los renglones de siempre sólo desde md", () => {
    render(<TresGrupos />);
    const boton = screen.getByRole("button", { name: /Filtros/ });
    expect(boton.closest("div")!.className).toContain("md:hidden");
    // Los chips siguen en la página para la computadora, escondidos en el celular.
    const escritorio = screen.getByRole("button", { name: "Entradas" }).closest("div")!.parentElement!;
    expect(escritorio.className).toContain("hidden");
    expect(escritorio.className).toContain("md:block");
    expect(screen.getByText("Sin filtros")).toBeInTheDocument();
  });

  it("la hoja tiene cada grupo con su nombre y filtra al tocar", () => {
    render(<TresGrupos />);
    fireEvent.click(screen.getByRole("button", { name: /Filtros/ }));
    const hoja = screen.getByRole("dialog", { name: "Filtros" });
    for (const t of ["Tipo", "Estado", "Origen"]) expect(within(hoja).getByText(t)).toBeInTheDocument();

    fireEvent.click(within(hoja).getByRole("button", { name: "Salidas" }));
    fireEvent.click(within(hoja).getByRole("button", { name: "Insumos" }));
    // En la hoja los chips van en renglones, no en una fila deslizable.
    expect(within(hoja).getByRole("button", { name: "Salidas" }).parentElement!.className).not.toContain("overflow-x-auto");

    fireEvent.click(within(hoja).getByRole("button", { name: "Ver resultados" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    // El botón cuenta lo activo y al lado se lee qué se está filtrando.
    expect(screen.getByRole("button", { name: /Filtros\s*2/ })).toBeInTheDocument();
    expect(screen.getByText("Salidas · Insumos")).toBeInTheDocument();
  });

  it("Limpiar vuelve todo al primero de cada grupo", () => {
    render(<TresGrupos />);
    fireEvent.click(screen.getByRole("button", { name: /Filtros/ }));
    const hoja = screen.getByRole("dialog", { name: "Filtros" });
    fireEvent.click(within(hoja).getByRole("button", { name: "Pendientes" }));
    fireEvent.click(within(hoja).getByRole("button", { name: "Limpiar" }));
    fireEvent.click(within(hoja).getByRole("button", { name: "Ver resultados" }));
    expect(screen.getByText("Sin filtros")).toBeInTheDocument();
  });

  it("con dos grupos sigue la fila deslizable, sin botón", () => {
    render(
      <FilaFiltros>
        <Chips titulo="Tipo" valor="" opciones={TIPOS} onChange={() => {}} />
        <Chips titulo="Estado" valor="" opciones={ESTADOS} onChange={() => {}} />
      </FilaFiltros>,
    );
    expect(screen.queryByRole("button", { name: /Filtros/ })).toBeNull();
  });
});
