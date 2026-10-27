import { describe, expect, it } from "vitest";
import { efectivoDelCobro, montoCorto, sugerencias } from "./useCobro";

describe("los billetes que se ofrecen para lo recibido", () => {
  it("con un monto chico son los billetes que lo cubren", () => {
    // El dueño, 19-oct: por Bs 30 salía Bs 40, que no es un billete.
    expect(sugerencias(30)).toEqual([50, 100, 200]);
    expect(sugerencias(7)).toEqual([10, 20, 50]);
    expect(sugerencias(15)).toEqual([20, 50, 100]);
  });

  it("sólo billetes que existen: Bs 80 ofrece el de 100 y el de 200, nunca uno de 300", () => {
    // QA de Kevin, 25-oct: "no tenemos billete de 300".
    expect(sugerencias(80)).toEqual([100, 200]);
    expect(sugerencias(120)).toEqual([200]);
  });

  it("de Bs 200 para arriba ningún billete alcanza solo: sin atajos, queda el justo", () => {
    expect(sugerencias(260)).toEqual([]);
    expect(sugerencias(200)).toEqual([]);
  });

  it("siempre por encima de lo que se paga: lo justo va aparte", () => {
    expect(sugerencias(50)).toEqual([100, 200]);
    expect(sugerencias(0)).toEqual([]);
  });

  it("con centavos el siguiente billete los cubre", () => {
    expect(sugerencias(25.5)).toEqual([50, 100, 200]);
  });

  it("el justo dice cuánto, sin decimales si no hacen falta", () => {
    expect(montoCorto(30)).toBe("Bs 30");
    expect(montoCorto(25.5)).toBe("Bs 25,50");
  });
});

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
