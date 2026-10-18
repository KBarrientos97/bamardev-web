import { describe, expect, it } from "vitest";
import { segundosEnMesa } from "./calculo";
import { conInicioCorregido, inicioCorregido } from "./ModalesMesa.datos";

/** Hoy a las hh:mm, en la hora del navegador (la del local). */
const hoy = (h: number, min: number) => new Date(2026, 9, 16, h, min).getTime();

describe("inicioCorregido: la hora nueva de una mesa", () => {
  it("una hora que ya pasó es de hoy", () => {
    expect(inicioCorregido("20:50", hoy(21, 10))).toEqual({ inicio: hoy(20, 50), deAyer: false });
  });

  it("una hora que todavía no llegó es de ayer si la mesa arrancó antes de la medianoche", () => {
    // 00:40 y empezaron a las 23:15: quedan 1 h 25 min jugadas.
    const r = inicioCorregido("23:15", new Date(2026, 9, 17, 0, 40).getTime());
    expect(r).toEqual({ inicio: hoy(23, 15), deAyer: true });
  });

  it("una hora que no llegó y queda a más de 12 h es un error de tipeo, no una mesa de ayer", () => {
    // Revisión del 16-oct: a las 21:10 se tocaron sólo los minutos y quedó
    // 21:50. Se tomaba como ayer: 23 h jugadas y Bs 470 en vez del mínimo.
    expect(inicioCorregido("21:50", hoy(21, 10))).toMatchObject({ error: "noLlego" });
  });

  it("una hora de hoy que pasó hace más de 12 h no dice que todavía no llegó", () => {
    // Prueba profunda del 18-oct: a las 21:00, las 08:00 salían con "todavía
    // no llegaron", y ya habían pasado.
    expect(inicioCorregido("08:00", hoy(21, 0))).toEqual({ error: "muyAtras", cuando: hoy(8, 0) });
  });

  it("sin una hora válida no hay inicio", () => {
    expect(inicioCorregido("", hoy(21, 10))).toEqual({ error: "formato" });
    expect(inicioCorregido("9", hoy(21, 10))).toEqual({ error: "formato" });
  });
});

describe("conInicioCorregido: cuánto queda jugado con la hora nueva", () => {
  const h = (hh: number, mm: number) => new Date(2026, 9, 18, hh, mm).getTime();
  // Abierta a las 20:00 y pausada de 20:10 a 20:40.
  const s = { start: h(20, 0), pausedAt: null, pausedTotal: 30 * 60, pausas: [{ desde: h(20, 10), hasta: h(20, 40) }] };

  it("correrla a las 21:00 deja de descontar la pausa de antes", () => {
    // Prueba profunda del 18-oct: decía 0:30 jugadas y el backend cobraba 1:00.
    expect(segundosEnMesa(conInicioCorregido(s, h(21, 0)), h(22, 0))).toBe(60 * 60);
  });

  it("llevarla más temprano no toca las pausas que ya se descontaban", () => {
    expect(conInicioCorregido(s, h(19, 30))).toEqual({ start: h(19, 30), pausedAt: null, pausedTotal: 30 * 60 });
  });

  it("ida y vuelta: corrida a las 21:00 por error y vuelta a las 20:00, la pausa se descuenta otra vez", () => {
    // Revisión del arreglo (18-oct): la vuelta no devolvía la pausa sacada y
    // se cobraban 2 h en vez de 1:30 (Bs 40 en vez de 30).
    const corrida = { ...s, ...conInicioCorregido(s, h(21, 0)) };
    expect(corrida.pausedTotal).toBe(0);
    const vuelta = conInicioCorregido(corrida, h(20, 0));
    expect(vuelta.pausedTotal).toBe(30 * 60);
    expect(segundosEnMesa(vuelta, h(22, 0))).toBe(90 * 60);
  });

  it("sin las pausas del backend, como antes", () => {
    expect(conInicioCorregido({ ...s, pausas: undefined }, h(21, 0)).pausedTotal).toBe(30 * 60);
  });

  it("si está pausada desde antes de la hora nueva, la pausa cuenta desde ahí", () => {
    const pausada = { start: h(20, 0), pausedAt: h(20, 50), pausedTotal: 0, pausas: [] };
    expect(conInicioCorregido(pausada, h(21, 0)).pausedAt).toBe(h(21, 0));
  });

  it("ida y vuelta con la mesa en pausa: la pausa en curso vuelve a contar desde que se pausó", () => {
    // Revisión del 18-oct: la vuelta con la mesa pausada no tenía prueba, y si
    // alguien la simplificaba se volvía a cobrar de más. En pausa desde las
    // 20:50: corrida a las 21:00 cuenta desde ahí, y vuelta a las 20:00 otra
    // vez desde las 20:50, con 50 min jugados.
    const pausada = { start: h(20, 0), pausedAt: h(20, 50), pausaDesde: h(20, 50), pausedTotal: 0, pausas: [] };
    const corrida = { ...pausada, ...conInicioCorregido(pausada, h(21, 0)) };
    expect(corrida.pausedAt).toBe(h(21, 0));
    const vuelta = conInicioCorregido(corrida, h(20, 0));
    expect(vuelta.pausedAt).toBe(h(20, 50));
    expect(segundosEnMesa(vuelta, h(22, 0))).toBe(50 * 60);
    // Vuelta a una hora de después del PAUSAR: la pausa cuenta desde el inicio.
    expect(conInicioCorregido(corrida, h(20, 55)).pausedAt).toBe(h(20, 55));
  });
});

describe("inicioCorregido: los bordes de las 12 h", () => {
  // Revisión del 18-oct: a las 09:00:00 las 21:00 de ayer entran justo; 30 s
  // después ya no, y el aviso tiene que decir las dos cosas.
  const ayer21 = new Date(2026, 9, 15, 21, 0).getTime();
  it("12 h justas de ayer se aceptan; 30 s más, no, con la hora descartada", () => {
    expect(inicioCorregido("21:00", hoy(9, 0))).toEqual({ inicio: ayer21, deAyer: true });
    expect(inicioCorregido("21:00", hoy(9, 0) + 30_000)).toEqual({ error: "noLlego", cuando: ayer21 });
  });

  it("pasada la medianoche, una hora de hace 10 minutos es de hoy", () => {
    const madrugada = new Date(2026, 9, 17, 0, 30).getTime();
    expect(inicioCorregido("00:20", madrugada)).toEqual({ inicio: new Date(2026, 9, 17, 0, 20).getTime(), deAyer: false });
  });
});
