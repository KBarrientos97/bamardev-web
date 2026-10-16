import { describe, expect, it } from "vitest";
import { fechaDeJornada, horaDeCorte } from "./jornada";

/**
 * La jornada de un billar (corte a las 6:00, como el "closeoutHour" de Toast).
 * Las horas son locales: los tests pasan igual en Bolivia y en el CI (UTC).
 */
describe("la fecha de jornada", () => {
  it("la 1:30 a. m. del 14 es la jornada del 13: el billar todavía no cerró", () => {
    expect(fechaDeJornada(new Date(2026, 9, 14, 1, 30), 360)).toBe("2026-10-13");
  });

  it("a las 7 a. m. ya es la del 14; el corte es el primer minuto del día nuevo", () => {
    expect(fechaDeJornada(new Date(2026, 9, 14, 7, 0), 360)).toBe("2026-10-14");
    expect(fechaDeJornada(new Date(2026, 9, 14, 5, 59), 360)).toBe("2026-10-13");
    expect(fechaDeJornada(new Date(2026, 9, 14, 6, 0), 360)).toBe("2026-10-14");
  });

  it("la madrugada del 1 de noviembre es el 31 de octubre, y la del 1 de enero, del año anterior", () => {
    expect(fechaDeJornada(new Date(2026, 10, 1, 2, 0), 360)).toBe("2026-10-31");
    expect(fechaDeJornada(new Date(2027, 0, 1, 3, 0), 360)).toBe("2026-12-31");
  });

  it("con corte 0 es el día del calendario, como siempre", () => {
    expect(fechaDeJornada(new Date(2026, 9, 14, 0, 0), 0)).toBe("2026-10-14");
    expect(fechaDeJornada(new Date(2026, 9, 14, 1, 30))).toBe("2026-10-14");
  });
});

describe("la hora del corte, como se lee", () => {
  it("con a. m. y p. m., como las horas del billar", () => {
    expect(horaDeCorte(360)).toBe("6:00 a. m.");
    expect(horaDeCorte(90)).toBe("1:30 a. m.");
    expect(horaDeCorte(30)).toBe("12:30 a. m.");
    expect(horaDeCorte(720)).toBe("12:00 p. m.");
  });
});
