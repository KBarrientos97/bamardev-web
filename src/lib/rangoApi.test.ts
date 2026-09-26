import { describe, expect, it } from "vitest";
import { rangoParaApi } from "./rangoApi";

/**
 * Los tests no suponen una zona horaria: comparan contra la medianoche local
 * que arma `Date`, así pasan igual en Bolivia, en UTC (el CI) o en cualquier
 * otro lado.
 */
describe("el rango que viaja a los reportes", () => {
  it("el último día entra: hasta es la medianoche del día siguiente", () => {
    // Con el día pelado, `new Date("2026-09-25")` dejaba el 25 afuera entero.
    const r = rangoParaApi({ desde: "2026-09-19", hasta: "2026-09-25" });
    expect(new Date(r.desde!).getTime()).toBe(new Date(2026, 8, 19).getTime());
    expect(new Date(r.hasta!).getTime()).toBe(new Date(2026, 8, 26).getTime());
  });

  it("hoy no es un rango vacío", () => {
    // "Hoy" mandaba desde = hasta = hoy: en la web siempre daba Bs 0.
    const r = rangoParaApi({ desde: "2026-09-25", hasta: "2026-09-25" });
    const ms = new Date(r.hasta!).getTime() - new Date(r.desde!).getTime();
    expect(ms).toBeGreaterThanOrEqual(23 * 3600 * 1000);
  });

  it("viaja con el offset local, como la app", () => {
    const r = rangoParaApi({ desde: "2026-09-19", hasta: "2026-09-25" });
    expect(r.desde).toMatch(/^2026-09-19T00:00:00[+-]\d{2}:\d{2}$/);
    expect(r.hasta).toMatch(/^2026-09-26T00:00:00[+-]\d{2}:\d{2}$/);
  });

  it("el fin de mes rueda al mes siguiente", () => {
    const r = rangoParaApi({ hasta: "2026-12-31" });
    expect(new Date(r.hasta!).getTime()).toBe(new Date(2027, 0, 1).getTime());
  });

  it("lo que ya trae hora pasa tal cual, y el resto del filtro también", () => {
    const r = rangoParaApi({
      desde: "2026-09-19T00:00:00-04:00",
      hasta: undefined,
      sucursalId: 3,
    });
    expect(r.desde).toBe("2026-09-19T00:00:00-04:00");
    expect(r.hasta).toBeUndefined();
    expect(r.sucursalId).toBe(3);
  });
});
