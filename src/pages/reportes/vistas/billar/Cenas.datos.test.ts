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
        porDia: [
          { dia: "2026-10-22", monto: 20 },
          { dia: "2026-10-23", monto: 0 },
        ],
      }),
    ).toBe(1);
  });

  it("dos cajas la misma noche son una noche: si en una hubo cena, no es una noche sin cena", () => {
    // La cajera con su cena y el dueño con su propia caja, sin cena: el reporte
    // decía a la vez "Noches con cena 1 de 1" y "1 noche sin cena".
    const r = {
      nochesConCena: 1,
      nochesAbiertas: 1,
      porNoche: [
        { cajaId: 7, dia: "2026-10-24", cajera: "Pepe", monto: 20, registro: "Kevin", abierta: false },
        { cajaId: 8, dia: "2026-10-24", cajera: "Kevin", monto: 0, registro: "", abierta: false },
      ],
      porDia: [{ dia: "2026-10-24", monto: 20 }],
    };
    expect(nochesConCenaTexto(r)).toBe("1 de 1");
    expect(nochesSinCena(r)).toBe(0);
  });

  it("las noches sin cena son las abiertas menos las con cena", () => {
    const r = {
      nochesConCena: 2,
      nochesAbiertas: 4,
      porDia: [
        { dia: "2026-10-21", monto: 30 },
        { dia: "2026-10-22", monto: 0 },
        { dia: "2026-10-23", monto: 0 },
        { dia: "2026-10-24", monto: 15 },
      ],
    };
    expect(nochesSinCena(r)).toBe(r.nochesAbiertas - r.nochesConCena);
  });
});
