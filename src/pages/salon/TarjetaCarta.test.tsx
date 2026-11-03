import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Producto } from "../../types";
import TarjetaCarta from "./TarjetaCarta";

/**
 * La tarjeta de la carta del mesero. El stock que trae es el de `salon/carta`:
 * lo que queda descontando lo que otras mesas ya pidieron y no se cobró.
 */

function producto(over: Partial<Producto> = {}): Producto {
  return {
    id: 1,
    nombre: "Coca-Cola 2L",
    descripcion: null,
    codBarra: null,
    tipoProducto: "ALMACENABLE",
    precio: 18,
    costo: 12,
    stockMinimo: 2,
    habilitado: true,
    icono: null,
    categoria: null,
    unidadMedida: null,
    stockTotal: 6,
    componentes: [],
    principioActivo: null,
    concentracion: null,
    formaFarmaceutica: null,
    laboratorio: null,
    registroSanitario: null,
    condicionVenta: "LIBRE",
    manejaLote: false,
    controlado: false,
    ...over,
  };
}

const combo = (over: Partial<Producto> = {}) =>
  producto({ id: 9, nombre: "Combo familiar", tipoProducto: "COMPUESTO", stockTotal: 3, stockMinimo: 0, ...over });

function montar(p: Producto, cantidad = 0) {
  const onAgregar = vi.fn();
  const onQuitar = vi.fn();
  render(
    <ul>
      <TarjetaCarta producto={p} cantidad={cantidad} onAgregar={onAgregar} onQuitar={onQuitar} />
    </ul>,
  );
  return { onAgregar, onQuitar };
}

const cuerpo = (nombre: string) => screen.getByText(nombre).closest("button")!;

describe("POS-2 en la carta del mesero: el combo tiene su propio stock", () => {
  // La carta trataba al combo como un elaborado: lo ofrecía siempre, sin decir
  // cuántos quedaban, y como cobrar la mesa deja pasar el negativo, el stock
  // del combo quedaba en rojo sin que nadie lo viera venir.
  it("dice cuántos combos quedan", () => {
    montar(combo());
    expect(screen.getByText("3 disp.")).toBeInTheDocument();
  });

  it("un combo sin stock dice «Sin stock» y la tarjeta no se toca", () => {
    const { onAgregar } = montar(combo({ stockTotal: 0 }));
    expect(screen.getByText("Sin stock")).toBeInTheDocument();
    expect(cuerpo("Combo familiar")).toBeDisabled();
    fireEvent.click(cuerpo("Combo familiar"));
    expect(onAgregar).not.toHaveBeenCalled();
  });

  it("si otras mesas ya se llevaron todo (stock en negativo), también dice «Sin stock»", () => {
    montar(combo({ stockTotal: -1 }));
    expect(screen.getByText("Sin stock")).toBeInTheDocument();
  });

  it("el «+» se apaga al llegar a lo que queda, pero no es un freno", () => {
    // Como en la app, que usa la misma tarjeta del POS. Cobrar la mesa deja
    // pasar el negativo a propósito (lo servido no vuelve a la heladera), así
    // que tocar la tarjeta sigue sumando.
    const { onAgregar } = montar(combo(), 3);
    expect(screen.getByRole("button", { name: "Uno más" })).toBeDisabled();
    fireEvent.click(cuerpo("Combo familiar"));
    expect(onAgregar).toHaveBeenCalledTimes(1);
  });

  it("con lugar todavía, el «+» suma", () => {
    const { onAgregar } = montar(combo(), 2);
    fireEvent.click(screen.getByRole("button", { name: "Uno más" }));
    expect(onAgregar).toHaveBeenCalledTimes(1);
  });
});

describe("la carta dice cuántos quedan de todo lo que lleva stock", () => {
  it("un producto lo dice aunque no esté bajo el mínimo", () => {
    // Antes el número aparecía recién bajo el mínimo, y el mesero no sabía qué
    // podía prometer hasta que se agotaba. El POS ya lo decía siempre.
    montar(producto({ stockTotal: 6, stockMinimo: 2 }));
    expect(screen.getByText("6 disp.")).toBeInTheDocument();
  });

  it("el elaborado no dice stock, no se agota y su «+» nunca se apaga", () => {
    // Guarda: el SERVICIO se prepara al momento; con stock 0 se sigue pidiendo.
    const sopa = producto({ id: 4, nombre: "Sopa del día", tipoProducto: "SERVICIO", stockTotal: 0 });
    const { onAgregar } = montar(sopa, 12);
    expect(screen.queryByText(/disp\./)).not.toBeInTheDocument();
    expect(screen.queryByText("Sin stock")).not.toBeInTheDocument();
    expect(cuerpo("Sopa del día")).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Uno más" }));
    expect(onAgregar).toHaveBeenCalledTimes(1);
  });
});
