import { describe, expect, it } from "vitest";
import { fmtHora } from "../../lib/format";
import { turnoDeCaja } from "./turnoDeCaja";

/** En la hora de este equipo, como la muestra la pantalla. */
const local = (mes: number, dia: number, h: number, min: number) => new Date(2026, mes - 1, dia, h, min).toISOString();

describe("turnoDeCaja: el turno fechado en las dos puntas (CAJA-4)", () => {
  it("un turno que cruza la medianoche lleva las dos fechas y el aviso", () => {
    // "Turno de 12:04 a 03:17" se leía como si hubiera ido para atrás.
    const a = local(10, 28, 12, 4);
    const c = local(10, 29, 3, 17);
    const t = turnoDeCaja(a, c)!;
    expect(t.resumen).toBe(`Turno del 28/10 ${fmtHora(a)} al 29/10 ${fmtHora(c)}`);
    expect(t.abrio).toBe(`mié 28/10 · ${fmtHora(a)}`);
    expect(t.cerro).toBe(`jue 29/10 · ${fmtHora(c)}`);
    expect(t.duracion).toBe("15 h 13");
    expect(t.avisoDias).toBe("Este turno cruzó la medianoche: abrió un día y cerró al siguiente.");
  });

  it("del mismo día, la fecha una sola vez y sin aviso", () => {
    const a = local(10, 28, 8, 0);
    const c = local(10, 28, 16, 30);
    const t = turnoDeCaja(a, c)!;
    expect(t.resumen).toBe(`Turno del 28/10, de ${fmtHora(a)} a ${fmtHora(c)}`);
    expect(t.duracion).toBe("8 h 30");
    expect(t.avisoDias).toBeNull();
  });

  it("de 23:50 a 00:10 también cruzó la medianoche, aunque sean 20 minutos", () => {
    const t = turnoDeCaja(local(10, 28, 23, 50), local(10, 29, 0, 10))!;
    expect(t.duracion).toBe("20 min");
    expect(t.avisoDias).toContain("cruzó la medianoche");
  });

  it("una caja que nadie cerró en días lo dice con las fechas", () => {
    const t = turnoDeCaja(local(10, 26, 12, 0), local(10, 29, 1, 0))!;
    expect(t.avisoDias).toBe("Esta caja estuvo abierta 4 días: abrió el 26/10 y cerró el 29/10.");
  });

  it("sin alguna de las dos fechas (o ilegible) no inventa nada", () => {
    expect(turnoDeCaja(local(10, 28, 12, 0), null)).toBeNull();
    expect(turnoDeCaja(undefined, local(10, 28, 12, 0))).toBeNull();
    expect(turnoDeCaja("no es fecha", local(10, 28, 12, 0))).toBeNull();
  });
});
