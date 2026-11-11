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

// El stock va en el mismo renglón del precio: "Bs 18,00 · quedan 3".
const quedan = (n: number) => screen.getByText(new RegExp(`quedan ${n}$`));

describe("POS-2 en la carta del mesero: el combo tiene su propio stock", () => {
  // La carta trataba al combo como un elaborado: lo ofrecía siempre, sin decir
  // cuántos quedaban, y como cobrar la mesa deja pasar el negativo, el stock
  // del combo quedaba en rojo sin que nadie lo viera venir.
  it("dice cuántos combos quedan", () => {
    montar(combo());
    expect(quedan(3)).toBeInTheDocument();
  });

  it("un combo sin stock dice «Sin stock» y la tarjeta no se toca", () => {
    const { onAgregar } = montar(combo({ stockTotal: 0 }));
    expect(screen.getByText(/Sin stock/)).toBeInTheDocument();
    expect(cuerpo("Combo familiar")).toBeDisabled();
    fireEvent.click(cuerpo("Combo familiar"));
    expect(onAgregar).not.toHaveBeenCalled();
  });

  it("si otras mesas ya se llevaron todo (stock en negativo), también dice «Sin stock»", () => {
    montar(combo({ stockTotal: -1 }));
    expect(screen.getByText(/Sin stock/)).toBeInTheDocument();
  });

  it("al llegar a lo que queda avisa, pero no es un freno", () => {
    // Cobrar la mesa deja pasar el negativo a propósito (lo servido no vuelve
    // a la heladera), así que tocar la tarjeta sigue sumando.
    const { onAgregar } = montar(combo(), 3);
    expect(quedan(0)).toBeInTheDocument();
    expect(cuerpo("Combo familiar")).toHaveAttribute("title", "No quedan más en la carta");
    fireEvent.click(cuerpo("Combo familiar"));
    expect(onAgregar).toHaveBeenCalledTimes(1);
  });
});

describe("la carta dice cuántos quedan de todo lo que lleva stock", () => {
  it("un producto lo dice aunque no esté bajo el mínimo", () => {
    // Antes el número aparecía recién bajo el mínimo, y el mesero no sabía qué
    // podía prometer hasta que se agotaba. El POS ya lo decía siempre.
    montar(producto({ stockTotal: 6, stockMinimo: 2 }));
    expect(quedan(6)).toBeInTheDocument();
  });

  it("descuenta lo que ya está en este pedido (UX-MESEROS §2)", () => {
    // Con 2 Paceñas en el carrito seguía diciendo "4 disp.".
    montar(producto({ stockTotal: 6, stockMinimo: 2 }), 2);
    expect(quedan(4)).toBeInTheDocument();
  });

  it("el elaborado no dice stock y no se agota", () => {
    // Guarda: el SERVICIO se prepara al momento; con stock 0 se sigue pidiendo.
    const sopa = producto({ id: 4, nombre: "Sopa del día", tipoProducto: "SERVICIO", stockTotal: 0 });
    const { onAgregar } = montar(sopa, 12);
    expect(screen.queryByText(/quedan/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Sin stock/)).not.toBeInTheDocument();
    expect(cuerpo("Sopa del día")).toBeEnabled();
    fireEvent.click(cuerpo("Sopa del día"));
    expect(onAgregar).toHaveBeenCalledTimes(1);
  });
});

describe("la tarjeta del mesero (UX-MESEROS §2)", () => {
  it("tocarla suma uno, y el «−» aparece sólo sobre lo ya pedido", () => {
    const { onAgregar } = montar(producto());
    expect(screen.queryByRole("button", { name: /Uno menos|Quitar del pedido/ })).not.toBeInTheDocument();
    fireEvent.click(cuerpo("Coca-Cola 2L"));
    expect(onAgregar).toHaveBeenCalledTimes(1);
  });

  it("con lo pedido muestra la cantidad, y en la última unidad el «−» quita", () => {
    const { onQuitar } = montar(producto(), 1);
    expect(screen.getByText("1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Quitar del pedido" }));
    expect(onQuitar).toHaveBeenCalledTimes(1);
  });

  it("con más de una, el «−» baja de a una", () => {
    const { onQuitar } = montar(producto(), 3);
    fireEvent.click(screen.getByRole("button", { name: "Uno menos" }));
    expect(onQuitar).toHaveBeenCalledTimes(1);
  });
});
