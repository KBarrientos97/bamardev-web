import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { numerosDePagina } from "../lib/paginado";
import { Paginacion } from "./Paginacion";

/** La paginación desde 21 filas (PLAN-ACADEMIAS §5, versión limpia). */

const props = (extra: Partial<Parameters<typeof Paginacion>[0]> = {}) => ({
  total: 152,
  page: 1,
  pageSize: 20,
  mostrados: 20,
  onPage: vi.fn(),
  onPageSize: vi.fn(),
  onVerMas: vi.fn(),
  ...extra,
});

describe("Paginacion", () => {
  it("con 20 filas o menos no dibuja la barra", () => {
    render(<Paginacion {...props({ total: 20 })} />);
    expect(screen.queryByRole("navigation", { name: "Paginación" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Ver .* más/ })).not.toBeInTheDocument();
  });

  it("escritorio: «Mostrando 1–20 de N», páginas y filas por página", () => {
    const p = props();
    render(<Paginacion {...p} extra="M2 cobrado a 22" />);
    expect(screen.getByText(/Mostrando 1–20 de 152/)).toHaveTextContent("M2 cobrado a 22");
    expect(screen.getByRole("button", { name: "Página anterior" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "2" }));
    expect(p.onPage).toHaveBeenCalledWith(2);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "50" } });
    expect(p.onPageSize).toHaveBeenCalledWith(50);
  });

  it("celular: «Ver N más» suma la página siguiente", () => {
    const p = props({ total: 28 });
    render(<Paginacion {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "Ver 8 más" }));
    expect(p.onVerMas).toHaveBeenCalled();
  });

  it("las páginas: la primera, la última y dos alrededor de la actual", () => {
    expect(numerosDePagina(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(numerosDePagina(5, 10)).toEqual([1, null, 4, 5, 6, null, 10]);
    expect(numerosDePagina(1, 8)).toEqual([1, 2, null, 8]);
  });
});
