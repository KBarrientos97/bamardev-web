import { describe, expect, it } from "vitest";
import { barrasPorDia, etiquetaDia, nochesConCenaTexto, nochesSinCena, proyeccionDelMes } from "./Cenas.datos";

describe("etiquetaDia", () => {
  it("dice el día de la semana y la fecha", () => {
    expect(etiquetaDia("2026-10-23")).toBe("Vie 23/10");
    expect(etiquetaDia("2026-10-04")).toBe("Dom 04/10");
  });
  it("deja pasar lo que no entiende", () => {
    expect(etiquetaDia("hoy")).toBe("hoy");
  });
});

describe("barrasPorDia", () => {
  it("arma una barra por día del período, con cero en los que no hubo cena", () => {
    const b = barrasPorDia({
      desde: "2026-10-21",
      hasta: "2026-10-24",
      porDia: [
        { dia: "2026-10-21", monto: 30 },
        { dia: "2026-10-23", monto: 20 },
      ],
    });
    expect(b.map((x) => [x.etiqueta, x.valor])).toEqual([
      ["21", 30],
      ["22", 0],
      ["23", 20],
      ["24", 0],
    ]);
    expect(b[0].detalle).toBe("Mié 21/10");
  });

  it("con más de 45 días no dibuja el gráfico", () => {
    expect(barrasPorDia({ desde: "2026-08-01", hasta: "2026-10-23", porDia: [] })).toEqual([]);
  });
});

describe("proyeccionDelMes", () => {
  it("lleva lo de hoy al mes entero", () => {
    expect(proyeccionDelMes(420, 23, 31)).toBe(566);
  });
  it("sin nada gastado o sin días, nada", () => {
    expect(proyeccionDelMes(0, 23, 31)).toBeNull();
    expect(proyeccionDelMes(100, 0, 31)).toBeNull();
  });
});

describe("noches", () => {
  it("cuenta las noches con cena y las sin cena", () => {
    expect(nochesConCenaTexto({ nochesConCena: 20, nochesAbiertas: 23 })).toBe("20 de 23");
    expect(
      nochesSinCena({
        porNoche: [
          { cajaId: 1, dia: "2026-10-22", cajera: "A", monto: 20, registro: "M", abierta: false },
          { cajaId: 2, dia: "2026-10-23", cajera: "A", monto: 0, registro: "", abierta: false },
        ],
      }),
    ).toBe(1);
  });
});
