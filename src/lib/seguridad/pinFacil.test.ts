import { describe, expect, it } from "vitest";
import { pinAlAzar, pinFacil } from "./pinFacil";

/**
 * El PIN que se asigna es LIBRE (21-oct): estas funciones ya no rechazan nada,
 * sólo sirven para que "Generar uno al azar" no proponga 1234 o una fecha.
 */
describe("el PIN al azar", () => {
  it("reconoce los de siempre para no proponerlos", () => {
    expect(pinFacil("1234")).toBe("ESCALERA");
    expect(pinFacil("0000")).toBe("REPETIDO");
    expect(pinFacil("2512")).toBe("FECHA");
    expect(pinFacil("4831")).toBeNull();
    // Lo que no es de 4 dígitos no se juzga.
    expect(pinFacil("12")).toBeNull();
  });

  it("nunca es uno de esos: si el azar propone 1234 o 0000, pide otro", () => {
    const propuestas = [1234, 0, 4831];
    let i = 0;
    expect(pinAlAzar(() => propuestas[i++])).toBe("4831");
    for (let k = 0; k < 50; k++) {
      const pin = pinAlAzar();
      expect(pin).toMatch(/^\d{4}$/);
      expect(pinFacil(pin)).toBeNull();
    }
  });
});
