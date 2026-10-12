import { describe, expect, it } from "vitest";
import { horaCorta, ordenJornada, textoPico } from "./datosReporte";

const horas = (...hs: number[]) => hs.map((hora) => ({ hora, ocupacion: 0.5 }));

describe("ordenJornada", () => {
  it("un billar que cierra de madrugada se lee desde que abre, no desde la medianoche", () => {
    // El backend las manda en el orden del reloj (0, 1, … 23).
    expect(ordenJornada(horas(0, 1, 16, 17, 22, 23)).map((h) => h.hora)).toEqual([16, 17, 22, 23, 0, 1]);
  });

  it("si no cruza la medianoche queda como está", () => {
    expect(ordenJornada(horas(18, 15, 20)).map((h) => h.hora)).toEqual([15, 18, 20]);
  });

  it("con una sola hora o ninguna no se rompe", () => {
    expect(ordenJornada(horas(21)).map((h) => h.hora)).toEqual([21]);
    expect(ordenJornada([])).toEqual([]);
  });
});

describe("textoPico", () => {
  it("las horas llenas seguidas, del orden de la jornada", () => {
    const porHora = [
      { hora: 22, ocupacion: 0.9 },
      { hora: 23, ocupacion: 0.85 },
      { hora: 0, ocupacion: 0.4 },
    ];
    expect(textoPico(porHora)).toBe(`Pico de ${horaCorta(22)} a ${horaCorta(0)} (más del 80 %).`);
  });

  it("sin juego no hay pico", () => {
    expect(textoPico([{ hora: 20, ocupacion: 0 }])).toBeNull();
  });
});
