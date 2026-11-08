import { describe, expect, it } from "vitest";
import { DIAS_GRACIA_NOTAS, grupoConNotasAbiertas, notasHasta } from "./plazoNotas";

/**
 * Revisión del 08-nov: un grupo TERMINADO sigue en Notas mientras el plazo de
 * su último módulo esté abierto (5 días después del fin, como el backend).
 */
describe("el plazo de notas del grupo", () => {
  it("usa el `notasHasta` del backend; sin él, el fin del grupo más los días de gracia", () => {
    expect(DIAS_GRACIA_NOTAS).toBe(5);
    expect(notasHasta({ fechaFin: "2026-11-30", notasHasta: "2026-12-05" })).toBe("2026-12-05");
    expect(notasHasta({ fechaFin: "2026-11-30" })).toBe("2026-12-05");
    expect(notasHasta({ fechaFin: "2026-12-29", notasHasta: null })).toBe("2027-01-03");
  });

  it("los que no terminaron salen siempre; los terminados, hasta el último día del plazo incluido", () => {
    const terminado = { estado: "TERMINADO" as const, fechaFin: "2026-11-03", notasHasta: "2026-11-08" };
    expect(grupoConNotasAbiertas({ ...terminado, estado: "EN_CURSO" }, "2026-12-01")).toBe(true);
    expect(grupoConNotasAbiertas({ ...terminado, estado: "POR_EMPEZAR" }, "2026-12-01")).toBe(true);
    expect(grupoConNotasAbiertas(terminado, "2026-11-04")).toBe(true);
    expect(grupoConNotasAbiertas(terminado, "2026-11-08")).toBe(true);
    expect(grupoConNotasAbiertas(terminado, "2026-11-09")).toBe(false);
    // Backend anterior: la misma regla con el fin del grupo.
    expect(grupoConNotasAbiertas({ estado: "TERMINADO", fechaFin: "2026-11-03" }, "2026-11-08")).toBe(true);
    expect(grupoConNotasAbiertas({ estado: "TERMINADO", fechaFin: "2026-11-03" }, "2026-11-09")).toBe(false);
  });
});
