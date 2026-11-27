import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Producto, RecetaPlatoPos } from "../../types";
import HojaReceta from "./HojaReceta";

/**
 * La hoja del plato con receta (CONTRATO-recetas-plato §4.2): la presa del
 * pollo y lo que el cliente quita de la guarnición. En un alta, tocar la presa
 * ya agrega el plato (dos toques por venta); al editar, sólo la marca.
 */

const cuarto = { id: 12, nombre: "Broaster cuarto", precio: 28 } as Producto;
const receta: RecetaPlatoPos = {
  presas: 2,
  partes: "POLLO_8",
  guarnicion: [
    { insumoId: 7, nombre: "Arroz", puro: true },
    { insumoId: 8, nombre: "Papa", puro: true },
    { insumoId: 9, nombre: "Fideo", puro: true },
  ],
  alcanza: 0,
};

function montar(over: Partial<React.ComponentProps<typeof HojaReceta>> = {}) {
  const onConfirmar = vi.fn();
  const onClose = vi.fn();
  render(
    <HojaReceta
      producto={cuarto}
      receta={receta}
      elegirPresa
      puroDoble
      onConfirmar={onConfirmar}
      onClose={onClose}
      {...over}
    />,
  );
  return { onConfirmar, onClose, hoja: screen.getByRole("dialog", { name: "Broaster cuarto" }) };
}

const boton = (nombre: string | RegExp) => screen.getByRole("button", { name: nombre });
const estado = () => screen.getByTestId("estado-guarnicion");

describe("HojaReceta · un alta", () => {
  it("dice el precio y que tocar la presa la agrega; la guarnición va completa", () => {
    montar();
    expect(screen.getByText(/Bs\s28,00 · tocá la presa y se agrega/)).toBeInTheDocument();
    expect(estado()).toHaveTextContent("Va completa: arroz, papa y fideo.");
    expect(screen.getByText("Tocá una y se agrega al pedido")).toBeInTheDocument();
    expect(screen.getByText("Sólo si el cliente quita algo")).toBeInTheDocument();
    expect(screen.getByTestId("total-hoja")).toHaveTextContent(/Bs\s28,00/);
    // Sin botón de agregar: el segundo toque es la presa.
    expect(screen.queryByRole("button", { name: "Agregar al pedido" })).not.toBeInTheDocument();
  });

  it("tocar la presa agrega el plato y la hoja no pregunta nada más", () => {
    const { onConfirmar } = montar();
    fireEvent.click(boton("Ala (pecho y ala)"));
    expect(onConfirmar).toHaveBeenCalledWith({ piezas: { ala: 1, pecho: 1 } });
  });

  it("lo quitado se marca antes de tocar la presa y viaja con ella", () => {
    const { onConfirmar } = montar();
    fireEvent.click(boton("Fideo"));
    expect(boton("Fideo")).toHaveAttribute("aria-pressed", "false");
    expect(estado()).toHaveTextContent("Sin fideo");
    fireEvent.click(boton("Pierna (pierna y contra)"));
    expect(onConfirmar).toHaveBeenCalledWith({ piezas: { pierna: 1, contra: 1 }, sin: [9] });
  });

  it("«Pura papa»: las otras salen, la papa va doble; tocarla otra vez vuelve a completa", () => {
    montar();
    fireEvent.click(boton("Pura papa"));
    expect(estado()).toHaveTextContent("Pura papa");
    expect(boton("Papa × 2")).toHaveAttribute("aria-pressed", "true");
    expect(boton("Arroz")).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(boton("Pura papa"));
    expect(estado()).toHaveTextContent("Va completa: arroz, papa y fideo.");
  });

  it("sin «puro» doble el botón no dice «× 2»; volver a poner una que podía ir puro saca el «puro»", () => {
    montar({ puroDoble: false });
    fireEvent.click(boton("Puro arroz"));
    expect(boton("Arroz")).toBeInTheDocument();
    fireEvent.click(boton("Papa"));
    expect(screen.getByRole("button", { name: "Puro arroz" })).toHaveAttribute("aria-pressed", "false");
    expect(estado()).toHaveTextContent("Sin fideo");
  });

  it("otra combinación: se arman las presas una por una y recién con las dos se agrega", () => {
    const { onConfirmar } = montar();
    fireEvent.click(boton("Otra combinación (ej. contra y ala)"));
    expect(screen.getByText("0 de 2 presas")).toBeInTheDocument();
    const agregar = boton("Agregar al pedido");
    expect(agregar).toBeDisabled();
    fireEvent.click(boton("Más contra"));
    fireEvent.click(boton("Más ala"));
    expect(screen.getByText("2 de 2 presas")).toBeInTheDocument();
    // Con las dos puestas no se suma una tercera.
    expect(boton("Más pierna")).toBeDisabled();
    expect(agregar).toBeEnabled();
    fireEvent.click(agregar);
    expect(onConfirmar).toHaveBeenCalledWith({ piezas: { ala: 1, contra: 1 } });
  });

  it("con una presa, las cuatro; nunca dice «Agotado» aunque no alcance", () => {
    const { onConfirmar } = montar({ receta: { ...receta, presas: 1 } });
    expect(screen.queryByText(/Agotad/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Otra combinación/)).not.toBeInTheDocument();
    for (const n of ["Ala", "Pecho", "Pierna", "Contra"]) expect(boton(n)).toBeEnabled();
    fireEvent.click(boton("Contra"));
    expect(onConfirmar).toHaveBeenCalledWith({ piezas: { contra: 1 } });
  });

  it("Cancelar cierra sin agregar nada", () => {
    const { onConfirmar, onClose } = montar();
    fireEvent.click(boton("Cancelar"));
    expect(onClose).toHaveBeenCalled();
    expect(onConfirmar).not.toHaveBeenCalled();
  });

  it("los botones de la hoja tienen 48 px de alto como mínimo", () => {
    const { hoja } = montar();
    const botones = within(hoja)
      .getAllByRole("button")
      .filter((b) => b.getAttribute("aria-label") !== "Cerrar");
    for (const b of botones) expect(b.className).toMatch(/min-h-1[26]|h-12/);
  });
});

describe("HojaReceta · editar una línea del carrito", () => {
  it("trae lo que tenía; tocar otra presa sólo la marca y se guarda con «Guardar cambios»", () => {
    const { onConfirmar } = montar({ inicial: { piezas: { pierna: 1, contra: 1 }, sin: [9] } });
    expect(screen.getByText(/Bs\s28,00 · marcá lo que cambió/)).toBeInTheDocument();
    expect(screen.getByText("Tocá otra para cambiarla")).toBeInTheDocument();
    expect(boton("Pierna (pierna y contra)")).toHaveAttribute("aria-pressed", "true");
    expect(boton("Fideo")).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(boton("Ala (pecho y ala)"));
    expect(onConfirmar).not.toHaveBeenCalled();
    expect(boton("Ala (pecho y ala)")).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(boton("Fideo"));
    fireEvent.click(boton("Guardar cambios"));
    expect(onConfirmar).toHaveBeenCalledWith({ piezas: { ala: 1, pecho: 1 } });
  });

  it("una combinación que no es de las de siempre abre «Otra combinación» con lo suyo", () => {
    montar({ inicial: { piezas: { ala: 1, contra: 1 } } });
    expect(screen.getByText("2 de 2 presas")).toBeInTheDocument();
    expect(screen.getByLabelText("ala: 1")).toBeInTheDocument();
    expect(screen.getByLabelText("contra: 1")).toBeInTheDocument();
    expect(boton("Guardar cambios")).toBeEnabled();
  });

  it("sin la presa para elegir, sólo la guarnición; dejarla completa guarda el plato de siempre", () => {
    const { onConfirmar } = montar({ elegirPresa: false, inicial: { sin: [8] } });
    expect(screen.queryByRole("region", { name: "Presa" })).not.toBeInTheDocument();
    expect(screen.queryByText("Presa")).not.toBeInTheDocument();
    expect(estado()).toHaveTextContent("Sin papa");
    fireEvent.click(boton("Papa"));
    fireEvent.click(boton("Guardar cambios"));
    expect(onConfirmar).toHaveBeenCalledWith(undefined);
  });

  it("sin presa para elegir conserva la que ya tenía la línea", () => {
    const { onConfirmar } = montar({ elegirPresa: false, inicial: { piezas: { pierna: 1, contra: 1 } } });
    fireEvent.click(boton("Arroz"));
    fireEvent.click(boton("Guardar cambios"));
    expect(onConfirmar).toHaveBeenCalledWith({ piezas: { pierna: 1, contra: 1 }, sin: [7] });
  });
});
