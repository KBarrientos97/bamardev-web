import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ArticuloMovimiento } from "../../types";

/**
 * El buscador de artículos de Movimientos, en el renglón de cada uno.
 *
 * En el restaurante el stock de un insumo no baja nunca (vender un plato no lo
 * descuenta: no hay recetas), así que el renglón de un insumo va sin stock
 * (Kevin, 28-oct). Las bebidas sí lo muestran, y los demás rubros quedan
 * exactamente igual.
 */

const sesion = vi.hoisted(() => ({ rubro: "RESTAURANTE" as string | undefined }));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({ rubro: sesion.rubro }),
}));

import ElegirArticulo from "./ElegirArticulo";

const ARTICULOS: ArticuloMovimiento[] = [
  { id: 1, nombre: "Aceite Vegetal", esInsumo: true, costo: 16, precio: 0, stock: 340, unidad: "Litro" },
  { id: 2, nombre: "Coca Cola 2L", esInsumo: false, costo: 9, precio: 15, stock: 48, unidad: "Unidad" },
];

beforeEach(() => {
  sesion.rubro = "RESTAURANTE";
});

/** Abre la lista entera y devuelve el renglón de cada artículo. */
function renglones() {
  render(<ElegirArticulo articulos={ARTICULOS} onElegir={() => {}} />);
  fireEvent.click(screen.getByRole("combobox", { name: "Buscar artículo" }));
  const opciones = within(screen.getByRole("listbox", { name: "Artículos" })).getAllByRole("option");
  return { aceite: opciones[0], coca: opciones[1] };
}

describe("el renglón del insumo, según el rubro", () => {
  it("en el restaurante el insumo va sin stock, con su unidad; la bebida con su stock", () => {
    // "340 Litro" a la derecha se leía como el aceite que había en la cocina, y
    // era la suma de todas las compras desde siempre.
    const { aceite, coca } = renglones();
    expect(aceite).toHaveTextContent("Aceite Vegetal");
    expect(aceite).toHaveTextContent("insumo");
    expect(aceite).toHaveTextContent("Litro");
    expect(aceite).not.toHaveTextContent("340");
    expect(coca).toHaveTextContent("48 Unidad");
  });

  it("fuera del restaurante el insumo muestra su stock como siempre", () => {
    // A propósito, belleza incluida: ahí el insumo se gasta con cada servicio
    // y su stock sí baja.
    for (const rubro of ["PELUQUERIA", "BILLAR", "MINIMARKET", undefined]) {
      sesion.rubro = rubro;
      const { aceite, coca } = renglones();
      expect(aceite).toHaveTextContent("340 Litro");
      expect(coca).toHaveTextContent("48 Unidad");
      cleanup();
    }
  });

  it("elegir un insumo en el restaurante sigue devolviendo el artículo entero", () => {
    // Lo que se esconde es el número en pantalla: el formulario sigue
    // recibiendo el stock para validar una salida, como el backend.
    sesion.rubro = "RESTAURANTE";
    const onElegir = vi.fn();
    render(<ElegirArticulo articulos={ARTICULOS} onElegir={onElegir} />);
    const buscador = screen.getByRole("combobox", { name: "Buscar artículo" });
    fireEvent.change(buscador, { target: { value: "aceite" } });
    fireEvent.keyDown(buscador, { key: "Enter" });
    expect(onElegir).toHaveBeenCalledWith(ARTICULOS[0]);
  });
});
