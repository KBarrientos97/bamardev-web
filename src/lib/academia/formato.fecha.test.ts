import { describe, expect, it } from "vitest";
import { conBarrasDeFecha, fechaConDia, isoDeFechaEscrita } from "./formato";

describe("fecha de nacimiento escrita a mano", () => {
  it("pone las barras mientras se teclea y deja borrar", () => {
    expect(conBarrasDeFecha("0")).toBe("0");
    expect(conBarrasDeFecha("050")).toBe("05/0");
    expect(conBarrasDeFecha("05031999")).toBe("05/03/1999");
    expect(conBarrasDeFecha("05/03/19999")).toBe("05/03/1999");
    expect(conBarrasDeFecha("05/")).toBe("05");
  });

  it("entiende el día y el mes de una cifra y la fecha autocompletada", () => {
    expect(conBarrasDeFecha("5/")).toBe("05");
    expect(conBarrasDeFecha("05/3/1999")).toBe("05/03/1999");
    expect(conBarrasDeFecha("1999-03-05")).toBe("05/03/1999");
  });

  it("sólo una fecha completa que existe", () => {
    expect(isoDeFechaEscrita("05/03/1999")).toBe("1999-03-05");
    expect(isoDeFechaEscrita("29/02/2000")).toBe("2000-02-29");
    expect(isoDeFechaEscrita("29/02/2001")).toBe("");
    expect(isoDeFechaEscrita("12/13/1999")).toBe("");
    expect(isoDeFechaEscrita("05/03/19")).toBe("");
  });

  it("la fecha de un inicio, con el año sólo si es otro", () => {
    const hoy = new Date(2026, 10, 28);
    expect(fechaConDia("2026-12-19", hoy)).toBe("sábado 19 de diciembre");
    expect(fechaConDia("2027-01-11", hoy)).toBe("lunes 11 de enero de 2027");
  });
});
