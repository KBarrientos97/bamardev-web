import { describe, expect, it } from "vitest";
import { rangoParaApi, sinJornada } from "./rangoApi";

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

describe("el rango de un billar va por jornadas", () => {
  it("cada día va de la hora del corte a la misma hora del día siguiente", () => {
    // Un billar cierra a las 2 a. m.: el 13 va del 13 a las 6:00 al 14 a las 6:00.
    const r = rangoParaApi({ desde: "2026-10-13", hasta: "2026-10-13", corteMin: 360, sucursalId: 2 });
    expect(new Date(r.desde!).getTime()).toBe(new Date(2026, 9, 13, 6, 0).getTime());
    expect(new Date(r.hasta!).getTime()).toBe(new Date(2026, 9, 14, 6, 0).getTime());
    expect(r.desde).toMatch(/^2026-10-13T06:00:00[+-]\d{2}:\d{2}$/);
    // El corte no viaja: el backend tiene el suyo.
    expect(r).not.toHaveProperty("corteMin");
    expect(r.sucursalId).toBe(2);
  });

  it("con corte 0 es exactamente el rango de siempre", () => {
    const r = { desde: "2026-09-19", hasta: "2026-09-25" };
    expect(rangoParaApi({ ...r, corteMin: 0 })).toEqual(rangoParaApi(r));
  });

  it("los gastos van por día del calendario: sinJornada le saca el corte", () => {
    // Un gasto lleva fecha y no hora: el del 1 de octubre es de octubre.
    const r = rangoParaApi(sinJornada({ desde: "2026-10-01", hasta: "2026-10-31", corteMin: 360 }));
    expect(new Date(r.desde!).getTime()).toBe(new Date(2026, 9, 1).getTime());
    expect(new Date(r.hasta!).getTime()).toBe(new Date(2026, 10, 1).getTime());
  });
});
