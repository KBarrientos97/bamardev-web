import { describe, expect, it } from "vitest";
import { errorPaquete, leerTiempoPaquete, paquetesQueNoConvienen } from "./borrador";

/**
 * El tiempo de un paquete (27-oct): Miguel, el administrador del billar, pidió
 * paquetes de 30 min y que el sistema se diera cuenta solo de si escribió
 * minutos u horas.
 */
describe("leerTiempoPaquete: minutos u horas, sin que lo digan", () => {
  it("hasta 24 son horas y desde 30 son minutos", () => {
    expect(leerTiempoPaquete("2")).toEqual({ min: 120, unidad: "h" });
    expect(leerTiempoPaquete("30")).toEqual({ min: 30, unidad: "min" });
    expect(leerTiempoPaquete("90")).toEqual({ min: 90, unidad: "min" });
  });

  it("una hora y media se escribe como se dice", () => {
    for (const texto of ["1,5", "1.5", "1:30", "90", "1,5 h", "90 min"]) {
      expect(leerTiempoPaquete(texto)).toMatchObject({ min: 90 });
    }
  });

  it("con la unidad escrita no se adivina: «24 min» no son 24 horas", () => {
    expect(leerTiempoPaquete("2 h")).toEqual({ min: 120, unidad: "h" });
    expect(leerTiempoPaquete("24 min")).toEqual({ error: "Los paquetes van de 30 min a 24 h." });
  });

  it("entre 24 y 30 no se adivina", () => {
    expect(leerTiempoPaquete("25")).toEqual({ error: "¿Horas o minutos? Hasta 24 son horas y desde 30, minutos." });
  });

  it("de media en media hora", () => {
    expect(leerTiempoPaquete("45")).toEqual({ error: "De media en media hora: 30 min, 1 h, 1 h 30 min…" });
    expect(leerTiempoPaquete("1,25")).toEqual({ error: "De media en media hora: 30 min, 1 h, 1 h 30 min…" });
  });

  it("vacío no es un error todavía; lo que no es un tiempo, sí", () => {
    expect(leerTiempoPaquete("  ")).toBeNull();
    expect(leerTiempoPaquete("media")).toMatchObject({ error: expect.stringContaining("Escribí el tiempo") });
  });
});

describe("errorPaquete", () => {
  it("no deja dos paquetes del mismo tiempo, aunque se escriban distinto", () => {
    expect(errorPaquete("1,5", "25", [{ min: 90, precio: 28 }])).toBe("Ya hay un paquete de 1 h 30 min: quitalo primero.");
  });

  it("un paquete de 30 min con precio pasa", () => {
    expect(errorPaquete("30", "10", [{ min: 60, precio: 20 }])).toBeNull();
  });

  it("sin precio, lo pide", () => {
    expect(errorPaquete("30", "", [])).toBe("Poné el precio del paquete.");
  });
});

describe("paquetesQueNoConvienen", () => {
  it("avisa del de 1 h 30 si tres de 30 min salen menos", () => {
    expect(paquetesQueNoConvienen(20, [{ min: 30, precio: 8 }, { min: 90, precio: 25 }])).toEqual([{ min: 90, mejor: 24 }]);
  });
});
