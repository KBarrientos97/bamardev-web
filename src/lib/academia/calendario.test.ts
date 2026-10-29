import { describe, expect, it } from "vitest";
import {
  diaAnterior,
  duracionFranja,
  franjaSiguiente,
  franjasDe,
  inicioDelMes,
  mesDe,
  nombreMes,
  problemasFranjas,
  proximoInicio,
  sumarMeses,
  tituloMes,
} from "./calendario";

describe("meses del calendario", () => {
  it("suma meses cruzando el año", () => {
    expect(sumarMeses("2026-10", 3)).toBe("2027-01");
    expect(sumarMeses("2026-01", -1)).toBe("2025-12");
    expect(sumarMeses("2026-10", 0)).toBe("2026-10");
  });

  it("nombra el mes con su nombre, y el año sólo si cambia", () => {
    expect(nombreMes("2026-10")).toBe("octubre");
    expect(nombreMes("2027-01", "2026-10")).toBe("enero 2027");
    expect(tituloMes("2026-10")).toBe("Octubre 2026");
  });

  it("el mes de una fecha local", () => {
    expect(mesDe(new Date(2026, 9, 18))).toBe("2026-10");
  });

  it("el próximo día de inicio: este mes si todavía no pasó, si no el siguiente", () => {
    expect(proximoInicio(10, new Date(2026, 9, 8))).toBe("2026-10-10");
    expect(proximoInicio(10, new Date(2026, 9, 10))).toBe("2026-10-10");
    expect(proximoInicio(10, new Date(2026, 9, 18))).toBe("2026-11-10");
    expect(proximoInicio(10, new Date(2026, 11, 18))).toBe("2027-01-10");
    expect(inicioDelMes("2026-11", 5)).toBe("2026-11-05");
  });
});

describe("franjas horarias", () => {
  const central = [
    { almacenId: 1, inicio: "09:00", fin: "11:00" },
    { almacenId: 1, inicio: "07:00", fin: "09:00" },
    { almacenId: null, inicio: "19:00", fin: "21:00" },
  ];

  it("las de una sede, en orden", () => {
    expect(franjasDe(central, 1).map((f) => f.inicio)).toEqual(["07:00", "09:00"]);
    expect(franjasDe(central, null).map((f) => f.inicio)).toEqual(["19:00"]);
  });

  it("la duración en horas", () => {
    expect(duracionFranja({ inicio: "07:00", fin: "09:00" })).toBe("2 h");
    expect(duracionFranja({ inicio: "07:00", fin: "08:30" })).toBe("1,5 h");
    expect(duracionFranja({ inicio: "09:00", fin: "07:00" })).toBe("—");
  });

  it("avisa las que terminan antes de empezar y las que se pisan en la misma sede", () => {
    expect(problemasFranjas(central)).toEqual([]);
    expect(problemasFranjas([{ almacenId: 1, inicio: "09:00", fin: "08:00" }])[0]).toMatch(/termina antes/);
    const pisadas = [
      { almacenId: 1, inicio: "07:00", fin: "09:30" },
      { almacenId: 1, inicio: "09:00", fin: "11:00" },
    ];
    expect(problemasFranjas(pisadas)[0]).toMatch(/se pisan/);
    // En sedes distintas no se pisan.
    expect(problemasFranjas([pisadas[0], { ...pisadas[1], almacenId: 2 }])).toEqual([]);
  });

  it("la siguiente arranca donde termina la última y dura 2 horas", () => {
    expect(franjaSiguiente(franjasDe(central, 1), 1)).toEqual({ almacenId: 1, inicio: "11:00", fin: "13:00" });
    expect(franjaSiguiente([], null)).toEqual({ almacenId: null, inicio: "07:00", fin: "09:00" });
  });
});

describe("diaAnterior", () => {
  it("el fin de un módulo es el día antes del inicio del siguiente, también entre meses y años", () => {
    expect(diaAnterior("2026-12-10")).toBe("2026-12-09");
    expect(diaAnterior("2027-01-01")).toBe("2026-12-31");
    expect(diaAnterior("2026-03-01")).toBe("2026-02-28");
  });
});
