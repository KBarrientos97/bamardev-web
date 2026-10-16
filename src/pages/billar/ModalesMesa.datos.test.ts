import { describe, expect, it } from "vitest";
import { inicioCorregido } from "./ModalesMesa.datos";

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
    expect(inicioCorregido("21:50", hoy(21, 10))).toEqual({ error: "noLlego" });
  });

  it("sin una hora válida no hay inicio", () => {
    expect(inicioCorregido("", hoy(21, 10))).toEqual({ error: "formato" });
    expect(inicioCorregido("9", hoy(21, 10))).toEqual({ error: "formato" });
  });
});
