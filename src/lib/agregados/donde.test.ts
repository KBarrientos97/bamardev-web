import { describe, expect, it } from "vitest";
import { agregadosEnPos } from "./donde";

/** Si la caja ofrece la hoja de toppings (PLAN-AGREGADOS §8). */
describe("toppings en el punto de venta", () => {
  it("con el interruptor general apagado la caja no los usa", () => {
    expect(agregadosEnPos({ usaAgregados: false, agregadosEnPos: true })).toBe(false);
    expect(agregadosEnPos(null)).toBe(false);
    expect(agregadosEnPos(undefined)).toBe(false);
  });

  it("la casilla de la caja decide, aparte de la de la página", () => {
    expect(agregadosEnPos({ usaAgregados: true, agregadosEnPos: false, agregadosEnPagina: true })).toBe(false);
    expect(agregadosEnPos({ usaAgregados: true, agregadosEnPos: true, agregadosEnPagina: false })).toBe(true);
  });

  it("un backend anterior no manda agregadosEnPos: la caja toma el interruptor general", () => {
    expect(agregadosEnPos({ usaAgregados: true })).toBe(true);
  });
});
