import { describe, expect, it } from "vitest";
import { componerAgua, fmtLitros, leerAgua, normalizarAgua, vasosDe } from "./agua";
import { fichaAInput, fichaVacia, hayCambios } from "./formulario";

describe("agua: números", () => {
  it("fmtLitros usa coma y no deja «,0»", () => {
    expect([0.25, 1, 1.5, 2.75, 4].map(fmtLitros)).toEqual(["0,25", "1", "1,5", "2,75", "4"]);
  });
  it("un vaso son 250 ml", () => {
    expect([0.25, 1.5, 4].map(vasosDe)).toEqual([1, 6, 16]);
  });
});

describe("agua: ida y vuelta de las formas canónicas", () => {
  const formas = ["1,5 L", "1,5 L: con limón", "No toma agua", "No toma agua: sólo café", "2 L", "con limón", "Poca, prefiere gaseosa", ""];
  for (const f of formas) {
    it(`«${f}»`, () => expect(componerAgua(leerAgua(f))).toBe(f));
  }
});

describe("agua: leer", () => {
  it("lo viejo de los atajos", () => {
    expect(leerAgua("2 L")).toEqual({ cantidad: { tipo: "litros", litros: 2 }, nota: "" });
    expect(leerAgua("2 L: con limón")).toEqual({ cantidad: { tipo: "litros", litros: 2 }, nota: "con limón" });
  });
  it("«2 litros», «2 lts», «2 l» y «1.5 L» son litros", () => {
    for (const t of ["2 litros", "2 lts", "2 l", "2 L"]) expect(leerAgua(t).cantidad).toEqual({ tipo: "litros", litros: 2 });
    expect(leerAgua("1.5 L").cantidad).toEqual({ tipo: "litros", litros: 1.5 });
    expect(leerAgua("1,5 L").cantidad).toEqual({ tipo: "litros", litros: 1.5 });
  });
  it("el separador antes de la nota: «:», «,», «;», «.» y « - »", () => {
    for (const t of ["2 L: con limón", "2 L, con limón", "2 L; con limón", "2 L. con limón", "2 L - con limón"]) {
      expect(leerAgua(t)).toEqual({ cantidad: { tipo: "litros", litros: 2 }, nota: "con limón" });
    }
  });
  it("«1 L y medio» y lo que no se reconoce queda todo como nota", () => {
    expect(leerAgua("1 L y medio")).toEqual({ cantidad: null, nota: "1 L y medio" });
    expect(leerAgua("Poca, prefiere gaseosa")).toEqual({ cantidad: null, nota: "Poca, prefiere gaseosa" });
    expect(leerAgua(null)).toEqual({ cantidad: null, nota: "" });
  });
  it("«no toma» y «No toma agua»", () => {
    expect(leerAgua("no toma").cantidad).toEqual({ tipo: "no_toma" });
    expect(leerAgua("No toma agua").cantidad).toEqual({ tipo: "no_toma" });
    expect(leerAgua("No toma agua: café")).toEqual({ cantidad: { tipo: "no_toma" }, nota: "café" });
  });
  it("litros fuera de la regla se leen igual", () => {
    expect(leerAgua("5 L").cantidad).toEqual({ tipo: "litros", litros: 5 });
    expect(leerAgua("2,25 L").cantidad).toEqual({ tipo: "litros", litros: 2.25 });
  });
  it("mientras se escribe no se recorta la nota", () => {
    expect(leerAgua("1 L:  ").nota).toBe(" ");
    expect(componerAgua({ cantidad: { tipo: "litros", litros: 1 }, nota: "hola " })).toBe("1 L: hola ");
  });
});

describe("agua: normalizar (al guardar)", () => {
  it("la cantidad con su escritura de siempre y la nota recortada", () => {
    expect(normalizarAgua("2 l")).toBe("2 L");
    expect(normalizarAgua("2 litros")).toBe("2 L");
    expect(normalizarAgua("1.5 litros:  con limón ")).toBe("1,5 L: con limón");
    expect(normalizarAgua("no toma")).toBe("No toma agua");
    expect(normalizarAgua("No toma agua:  ")).toBe("No toma agua");
    expect(normalizarAgua(" 1 L y medio ")).toBe("1 L y medio");
    expect(normalizarAgua("   ")).toBe("");
    expect(normalizarAgua("")).toBe("");
    expect(normalizarAgua(null)).toBe("");
  });
  it("normalizar lo normalizado no cambia nada", () => {
    for (const t of ["2 l", "1.5 litros: x ", "no toma", "1 L y medio", "", "  ", "Poca"]) {
      const una = normalizarAgua(t);
      expect(normalizarAgua(una)).toBe(una);
    }
  });
  it("lo que se guarda: «2 l» → «2 L» y un «2 l» viejo no es un cambio", () => {
    const f = { ...fichaVacia(), nombre: "Lucía", consumoAgua: "2 l" };
    expect(fichaAInput(f).consumoAgua).toBe("2 L");
    expect(fichaAInput({ ...f, consumoAgua: "  " }).consumoAgua).toBeNull();
    expect(hayCambios(fichaAInput(f), fichaAInput({ ...f, consumoAgua: "2 L" }))).toBe(false);
    expect(hayCambios(fichaAInput(f), fichaAInput({ ...f, consumoAgua: "2 L: con limón" }))).toBe(true);
  });
});
