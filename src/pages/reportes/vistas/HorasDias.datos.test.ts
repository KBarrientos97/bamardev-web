import { describe, expect, it } from "vitest";
import { etiquetaHora, horaLarga, horaPico, mejorDia, tramoJornada, vecesDelDia, vecesPorDia } from "./HorasDias.datos";

/** 24 montos en cero salvo las horas indicadas. */
function horas(con: Record<number, number>): number[] {
  return Array.from({ length: 24 }, (_, h) => con[h] ?? 0);
}

describe("las horas", () => {
  it("se escriben 4p, 12a (medianoche) y 12p (mediodía)", () => {
    expect(etiquetaHora(16)).toBe("4p");
    expect(etiquetaHora(0)).toBe("12a");
    expect(etiquetaHora(12)).toBe("12p");
    expect(horaLarga(22)).toBe("10 p. m.");
    expect(horaLarga(0)).toBe("12 a. m.");
  });

  it("el tramo va de la primera a la última hora con ventas, con los huecos del medio", () => {
    // Un bajón a media tarde es un dato: la hora sin ventas se dibuja en cero.
    expect(tramoJornada(horas({ 8: 10, 9: 20, 10: 5, 12: 30, 13: 15 }))).toEqual([8, 9, 10, 11, 12, 13]);
  });

  it("una jornada que cruza la medianoche arranca después del hueco más largo", () => {
    // Un billar de 4 p. m. a 2 a. m. se lee "4p … 1a", no con la madrugada
    // partida en los dos extremos del gráfico.
    const billar = horas({ 16: 1, 17: 1, 18: 1, 19: 1, 20: 1, 21: 1, 22: 1, 23: 1, 0: 1, 1: 1 });
    expect(tramoJornada(billar)).toEqual([16, 17, 18, 19, 20, 21, 22, 23, 0, 1]);
  });

  it("abierto las 24 horas va en el orden del reloj", () => {
    expect(tramoJornada(horas(Object.fromEntries(Array.from({ length: 24 }, (_, h) => [h, 5]))))).toEqual(
      Array.from({ length: 24 }, (_, h) => h),
    );
  });

  it("sin ventas no hay tramo, y con una sola hora es esa hora", () => {
    expect(tramoJornada(horas({}))).toEqual([]);
    expect(tramoJornada(horas({ 22: 50 }))).toEqual([22]);
    // Medio centavo no es una venta.
    expect(tramoJornada(horas({ 3: 0.004, 22: 50 }))).toEqual([22]);
  });

  it("la hora pico es la que más vendió, y sin ventas no se inventa", () => {
    expect(horaPico(horas({ 21: 1500, 22: 1909, 23: 1700 }))).toEqual({ hora: 22, monto: 1909 });
    expect(horaPico(horas({}))).toBeNull();
  });
});

describe("los días de la semana", () => {
  it("cuenta cuántas veces cae cada día en el período", () => {
    // Del jueves 1 al lunes 12 de octubre de 2026: dos sábados y un solo
    // martes. Sumados, el sábado gana aunque se venda lo mismo cada día.
    expect(vecesPorDia("2026-10-01", "2026-10-12")).toEqual([2, 1, 1, 2, 2, 2, 2]);
    expect(vecesPorDia("2026-10-06", "2026-10-12")).toEqual([1, 1, 1, 1, 1, 1, 1]);
    // Un solo día: el lunes 12.
    expect(vecesPorDia("2026-10-12", "2026-10-12")).toEqual([1, 0, 0, 0, 0, 0, 0]);
  });

  it("dice las veces en palabras", () => {
    expect(vecesDelDia(5, 2)).toBe("2 sábados");
    expect(vecesDelDia(1, 1)).toBe("1 martes");
    expect(vecesDelDia(6, 0)).toBe("ningún domingo");
  });

  it("el mejor día es el que más sumó, el primero si empatan, y sin ventas no hay", () => {
    const dias = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
    const porDia = (montos: number[]) => dias.map((etiqueta, i) => ({ etiqueta, monto: montos[i] }));
    expect(mejorDia(porDia([10, 20, 5, 20, 0, 2527, 30]))).toEqual({ indice: 5, monto: 2527 });
    expect(mejorDia(porDia([10, 20, 5, 20, 0, 0, 0]))).toEqual({ indice: 1, monto: 20 });
    expect(mejorDia(porDia([0, 0, 0, 0, 0, 0, 0]))).toBeNull();
  });
});
