import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProductoInput } from "../../types";

vi.mock("../../lib/api", () => ({
  api: { actualizarProducto: vi.fn(async () => ({})) },
}));

import { api } from "../../lib/api";
import { actualizarConCombo } from "./edicionCombo";

const actualizar = vi.mocked(api.actualizarProducto);

const combo: ProductoInput = {
  nombre: "Combo familiar",
  tipoProducto: "COMPUESTO",
  precio: 120,
  componentes: [{ ingredienteId: 3, cantidad: 2 }],
  stockInicial: 5,
} as ProductoInput;

beforeEach(() => actualizar.mockClear());

describe("editar un artículo y pasarlo a combo", () => {
  it("se guarda dos veces para que la cantidad a ofrecer quede", async () => {
    // El backend toma la cantidad sólo si ya era combo antes del PATCH: con un
    // solo guardado el combo quedaba en 0 y no se podía vender (15-oct).
    await actualizarConCombo({ id: 7, tipoProducto: "ALMACENABLE" }, combo);
    expect(actualizar).toHaveBeenCalledTimes(2);
    expect(actualizar).toHaveBeenLastCalledWith(7, combo);
  });

  it("un combo que ya lo era se guarda una sola vez", async () => {
    await actualizarConCombo({ id: 7, tipoProducto: "COMPUESTO" }, combo);
    expect(actualizar).toHaveBeenCalledTimes(1);
  });

  it("sin cantidad a ofrecer no hay nada que repetir", async () => {
    const { stockInicial: _, ...sinCantidad } = combo;
    await actualizarConCombo({ id: 7, tipoProducto: "ALMACENABLE" }, sinCantidad as ProductoInput);
    expect(actualizar).toHaveBeenCalledTimes(1);
  });
});
