import { describe, expect, it } from "vitest";
import { pinAlAzar, pinFacil } from "./pinFacil";

describe("los PIN fáciles, igual que en el backend", () => {
  it("deja afuera los mismos 887 que el backend", () => {
    // Si este número cambia, cambió una de las dos copias (pin-facil.ts del
    // backend y ésta): tienen que ser iguales.
    let facil = 0;
    for (let n = 0; n < 10_000; n++) if (pinFacil(String(n).padStart(4, "0"))) facil++;
    expect(facil).toBe(887);
  });

  it("dice por qué", () => {
    expect(pinFacil("1234")).toBe("ESCALERA");
    expect(pinFacil("0000")).toBe("REPETIDO");
    expect(pinFacil("2512")).toBe("FECHA");
    expect(pinFacil("4831")).toBeNull();
  });

  it("el PIN al azar nunca es uno fácil", () => {
    // Un azar que primero propone fáciles (1234, 0000) y después uno bueno.
    const propuestas = [1234, 0, 4831];
    let i = 0;
    expect(pinAlAzar(() => propuestas[i++])).toBe("4831");
    for (let k = 0; k < 50; k++) expect(pinFacil(pinAlAzar())).toBeNull();
  });
});
