import { describe, expect, it } from "vitest";
import { correrPeriodo, periodoActual, periodoCerrado, periodoDe, terminaDespues, textoPeriodo } from "./periodos";

describe("períodos de liquidación", () => {
  it("la semana va de lunes a domingo", () => {
    // Miércoles 21-oct-2026.
    expect(periodoDe("SEMANA", "2026-10-21")).toEqual({ desde: "2026-10-19", hasta: "2026-10-25" });
    expect(periodoDe("SEMANA", "2026-10-25")).toEqual({ desde: "2026-10-19", hasta: "2026-10-25" });
  });

  it("la quincena es del 1 al 15 y del 16 a fin de mes", () => {
    expect(periodoDe("QUINCENA", "2026-10-15")).toEqual({ desde: "2026-10-01", hasta: "2026-10-15" });
    expect(periodoDe("QUINCENA", "2026-10-16")).toEqual({ desde: "2026-10-16", hasta: "2026-10-31" });
    expect(periodoDe("QUINCENA", "2026-02-20")).toEqual({ desde: "2026-02-16", hasta: "2026-02-28" });
  });

  it("el mes es el calendario", () => {
    expect(periodoDe("MES", "2028-02-10")).toEqual({ desde: "2028-02-01", hasta: "2028-02-29" });
  });

  it("anterior y siguiente, cruzando meses y años", () => {
    const q2 = periodoActual("QUINCENA", "2026-12-20");
    expect(correrPeriodo("QUINCENA", q2, 1)).toEqual({ desde: "2027-01-01", hasta: "2027-01-15" });
    expect(correrPeriodo("QUINCENA", q2, -1)).toEqual({ desde: "2026-12-01", hasta: "2026-12-15" });
    expect(correrPeriodo("QUINCENA", { desde: "2026-12-01" }, -1)).toEqual({
      desde: "2026-11-16",
      hasta: "2026-11-30",
    });
    expect(correrPeriodo("MES", { desde: "2026-01-01" }, 1)).toEqual({ desde: "2026-02-01", hasta: "2026-02-28" });
    expect(correrPeriodo("SEMANA", { desde: "2026-10-19" }, -1)).toEqual({
      desde: "2026-10-12",
      hasta: "2026-10-18",
    });
  });

  it("QA N2-08: el último período cerrado es el anterior al de hoy", () => {
    // Martes 06-oct-2026: la semana en curso (5 al 11) todavía no terminó.
    expect(terminaDespues(periodoActual("SEMANA", "2026-10-06"), "2026-10-06")).toBe(true);
    expect(periodoCerrado("SEMANA", "2026-10-06")).toEqual({ tipo: "SEMANA", desde: "2026-09-28", hasta: "2026-10-04" });
    expect(periodoCerrado("QUINCENA", "2026-10-06")).toEqual({ tipo: "QUINCENA", desde: "2026-09-16", hasta: "2026-09-30" });
    expect(periodoCerrado("MES", "2026-10-06")).toEqual({ tipo: "MES", desde: "2026-09-01", hasta: "2026-09-30" });
    expect(terminaDespues(periodoCerrado("SEMANA", "2026-10-06"), "2026-10-06")).toBe(false);
  });

  it("se lee en castellano", () => {
    expect(textoPeriodo("2026-10-19", "2026-10-25")).toBe("19 al 25 de oct.");
    expect(textoPeriodo("2026-09-28", "2026-10-04")).toBe("28 de sep. al 4 de oct.");
  });
});
