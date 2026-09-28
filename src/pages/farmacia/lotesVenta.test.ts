import { describe, expect, it } from "vitest";
import type { LoteParaVender } from "../../types";
import { repartirLotes } from "./lotesVenta";

/**
 * El reparto del carrito tiene que ser el mismo que hace la venta en el
 * servidor (`repartirFefo`): si el renglón dice "sale del lote A" y la venta
 * descuenta del B, quien atiende entregó la caja equivocada.
 */

const lote = (codigo: string, cantidad: number): LoteParaVender => ({
  codigo,
  vencimiento: "2027-01-31",
  dias: 120,
  tramo: "LEJOS",
  cantidad,
});

const pronto = lote("AMX-PRONTO", 5);
const lejos = lote("AMX-LEJOS", 20);

describe("repartirLotes", () => {
  it("lo que entra en el primer lote sale del primero", () => {
    const { reparto, sinLote } = repartirLotes([pronto, lejos], 3);
    expect(reparto).toEqual([{ lote: pronto, cantidad: 3 }]);
    expect(sinLote).toBe(0);
  });

  it("lo que pasa el primero sigue en el siguiente, en el orden en que llegan", () => {
    const { reparto } = repartirLotes([pronto, lejos], 12);
    expect(reparto).toEqual([
      { lote: pronto, cantidad: 5 },
      { lote: lejos, cantidad: 7 },
    ]);
  });

  it("lo que los lotes no cubren queda sin lote, sin frenar la venta", () => {
    const { reparto, sinLote } = repartirLotes([pronto], 8);
    expect(reparto).toEqual([{ lote: pronto, cantidad: 5 }]);
    expect(sinLote).toBe(3);
  });

  it("sin lotes, todo queda sin lote", () => {
    expect(repartirLotes([], 4)).toEqual({ reparto: [], sinLote: 4 });
  });
});
