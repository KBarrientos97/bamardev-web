import { describe, expect, it } from "vitest";
import { atajosDeEfectivo, BILLETES_BOLIVIA, MONEDAS_BOLIVIA } from "./billetes";

describe("los billetes y monedas de Bolivia", () => {
  it("son los que circulan: ningún billete de 300 ni de 500", () => {
    expect([...BILLETES_BOLIVIA]).toEqual([10, 20, 50, 100, 200]);
    expect([...MONEDAS_BOLIVIA]).toEqual([5, 2, 1, 0.5, 0.2, 0.1]);
  });
});

describe("atajosDeEfectivo", () => {
  it("con un monto chico, los billetes que lo cubren", () => {
    expect(atajosDeEfectivo(30)).toEqual([50, 100, 200]);
    expect(atajosDeEfectivo(7)).toEqual([10, 20, 50]);
    expect(atajosDeEfectivo(15)).toEqual([20, 50, 100]);
  });

  it("Bs 80 (el caso del dueño): el de 100 y el de 200, sin inventar uno de 300", () => {
    expect(atajosDeEfectivo(80)).toEqual([100, 200]);
  });

  it("la moneda de 5 cuenta para un monto chico", () => {
    expect(atajosDeEfectivo(3.5)).toEqual([5, 10, 20]);
    expect(atajosDeEfectivo(0.8)).toEqual([1, 2, 5]);
  });

  it("siempre por encima del total: el justo va aparte", () => {
    expect(atajosDeEfectivo(50)).toEqual([100, 200]);
    expect(atajosDeEfectivo(100)).toEqual([200]);
    expect(atajosDeEfectivo(0)).toEqual([]);
    expect(atajosDeEfectivo(-5)).toEqual([]);
  });

  it("con centavos el siguiente billete los cubre", () => {
    expect(atajosDeEfectivo(25.5)).toEqual([50, 100, 200]);
  });

  it("de Bs 200 para arriba ningún billete alcanza solo: no hay atajo", () => {
    expect(atajosDeEfectivo(200)).toEqual([]);
    expect(atajosDeEfectivo(260)).toEqual([]);
    expect(atajosDeEfectivo(120)).toEqual([200]);
  });

  it("nunca ofrece algo que no sea un billete o una moneda", () => {
    const validos = new Set<number>([...BILLETES_BOLIVIA, ...MONEDAS_BOLIVIA]);
    for (let total = 0.1; total < 400; total += 0.37) {
      for (const a of atajosDeEfectivo(total, 10)) expect(validos.has(a)).toBe(true);
    }
  });
});
