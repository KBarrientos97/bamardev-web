import { describe, expect, it } from "vitest";
import { efectivoDelCobro } from "./useCobro";

describe("el efectivo de un cobro", () => {
  it("sin escribir lo recibido no se puede cobrar ni hay cambio", () => {
    // QA del dueño, 17-oct: el total en gris adentro del campo parecía
    // escrito y "Cobrar" cobraba como si le hubieran dado justo.
    expect(efectivoDelCobro(85, "")).toEqual({ escrito: false, recibido: 0, falta: 0, cambio: 0 });
    expect(efectivoDelCobro(85, "   ").escrito).toBe(false);
  });

  it("lo justo cubre y no da cambio", () => {
    expect(efectivoDelCobro(85, "85")).toEqual({ escrito: true, recibido: 85, falta: 0, cambio: 0 });
  });

  it("de más da el cambio y de menos dice cuánto falta", () => {
    expect(efectivoDelCobro(85, "100")).toMatchObject({ falta: 0, cambio: 15 });
    expect(efectivoDelCobro(85, "50")).toMatchObject({ falta: 35, cambio: 0 });
  });

  it("algo que no es un monto cuenta como cero, no como justo", () => {
    expect(efectivoDelCobro(85, "abc")).toMatchObject({ escrito: true, recibido: 0, falta: 85 });
  });
});
