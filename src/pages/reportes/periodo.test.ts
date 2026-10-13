import { describe, expect, it } from "vitest";
import {
  comparacionDe,
  diasDe,
  excedeTope,
  MAX_DIAS_REPORTE,
  diasDelPeriodo,
  enElPeriodo,
  esMesEnCurso,
  NOMBRE_PRESET,
  periodoDe,
  rangoElegido,
  textoRango,
  type Preset,
} from "./periodo";

// Jueves 8 de octubre de 2026, 23:40: la hora no tiene que correr el día.
const HOY = new Date(2026, 9, 8, 23, 40);

describe("los presets del período", () => {
  it("la semana son los siete días que terminan hoy", () => {
    expect(periodoDe("semana", HOY)).toMatchObject({ desde: "2026-10-02", hasta: "2026-10-08" });
  });

  it("el mes va del 1 a hoy, y el mes pasado entero", () => {
    expect(periodoDe("mes", HOY)).toMatchObject({ desde: "2026-10-01", hasta: "2026-10-08" });
    expect(periodoDe("mesPasado", HOY)).toMatchObject({ desde: "2026-09-01", hasta: "2026-09-30" });
  });

  it("el mes pasado de enero es diciembre del año anterior", () => {
    expect(periodoDe("mesPasado", new Date(2026, 0, 15))).toMatchObject({ desde: "2025-12-01", hasta: "2025-12-31" });
  });

  it("un rango elegido al revés se acomoda", () => {
    expect(rangoElegido("2026-10-10", "2026-10-03")).toMatchObject({ desde: "2026-10-03", hasta: "2026-10-10" });
  });
});

describe("contra qué se compara", () => {
  it("la semana, contra los siete días anteriores", () => {
    const c = comparacionDe(periodoDe("semana", HOY));
    expect(c).toMatchObject({ desde: "2026-09-25", hasta: "2026-10-01", contra: "la semana anterior" });
  });

  it("el mes en curso, contra el mismo tramo del mes anterior y no contra los días de justo antes", () => {
    // Del 1 al 8 de octubre contra del 1 al 8 de septiembre: compararlo con
    // del 23 al 30 de septiembre mezclaría un fin de mes con un principio.
    const c = comparacionDe(periodoDe("mes", HOY));
    expect(c).toMatchObject({ desde: "2026-09-01", hasta: "2026-09-08", contra: "1–8 de septiembre" });
  });

  it("el 31 de marzo compara contra el febrero entero, no contra un 31 de febrero", () => {
    const c = comparacionDe(periodoDe("mes", new Date(2026, 2, 31)));
    expect(c).toMatchObject({ desde: "2026-02-01", hasta: "2026-02-28" });
  });

  it("el mes pasado, contra el mes de antes, por su nombre", () => {
    const c = comparacionDe(periodoDe("mesPasado", HOY));
    expect(c).toMatchObject({ desde: "2026-08-01", hasta: "2026-08-31", contra: "agosto", leyenda: "Agosto" });
  });

  it("los últimos 3 meses, contra los 90 días de antes", () => {
    const p = periodoDe("dias90", HOY);
    expect(p).toMatchObject({ desde: "2026-07-11", hasta: "2026-10-08" });
    expect(diasDe(p.desde, p.hasta)).toBe(90);
    const c = comparacionDe(p);
    expect(c).toMatchObject({ desde: "2026-04-12", hasta: "2026-07-10", contra: "los 3 meses anteriores" });
    expect(diasDe(c.desde, c.hasta)).toBe(90);
  });

  it("hoy contra ayer, y un rango a mano contra el mismo largo justo antes", () => {
    expect(comparacionDe(periodoDe("hoy", HOY))).toMatchObject({ desde: "2026-10-07", contra: "ayer" });
    const c = comparacionDe(rangoElegido("2026-10-05", "2026-10-08"));
    expect(c).toMatchObject({ desde: "2026-10-01", hasta: "2026-10-04", contra: "del 01/10 al 04/10/2026" });
  });
});

describe("los textos del período", () => {
  it("el rango se lee corto, y con los dos años si cruza el año", () => {
    expect(textoRango("2026-10-02", "2026-10-08")).toBe("02/10 – 08/10/2026");
    expect(textoRango("2026-10-08", "2026-10-08")).toBe("08/10/2026");
    expect(textoRango("2025-12-28", "2026-01-03")).toBe("28/12/2025 – 03/01/2026");
  });

  it("lo que va después de Ventas nombra el período", () => {
    expect(enElPeriodo(periodoDe("semana", HOY))).toBe("en la semana");
    expect(enElPeriodo(periodoDe("mesPasado", HOY))).toBe("en septiembre");
    expect(enElPeriodo(periodoDe("hoy", HOY))).toBe("de hoy");
  });

  it("los días cuentan los dos extremos", () => {
    expect(diasDe("2026-10-02", "2026-10-08")).toBe(7);
    expect(diasDelPeriodo("2026-09-29", "2026-10-02")).toEqual(["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"]);
  });

  it("el mes en curso es sólo el mes que corre hasta hoy", () => {
    expect(esMesEnCurso(periodoDe("mes", HOY), HOY)).toBe(true);
    expect(esMesEnCurso(periodoDe("mesPasado", HOY), HOY)).toBe(false);
    expect(esMesEnCurso(rangoElegido("2026-10-01", "2026-10-08"), HOY)).toBe(false);
  });
});

describe("el tope de 3 meses", () => {
  it("son 92 días: el trimestre más largo entra entero", () => {
    expect(MAX_DIAS_REPORTE).toBe(92);
    expect(excedeTope("2026-07-01", "2026-09-30")).toBe(false); // jul–sep, 92 días
    expect(excedeTope("2026-11-01", "2027-01-31")).toBe(false); // nov–ene, 92 días
    expect(excedeTope("2026-07-01", "2026-10-01")).toBe(true); // 93 días
    expect(excedeTope("2026-01-01", "2026-12-31")).toBe(true);
  });

  it("ningún preset ni su comparación pasa del tope (ya no hay \"Año\")", () => {
    const presets = (Object.keys(NOMBRE_PRESET) as Preset[]).filter((p): p is Exclude<Preset, "rango"> => p !== "rango");
    expect(presets).not.toContain("anio");
    // Todos los días de un año: el último del mes, un 29 de febrero, un 1 de enero.
    for (let d = new Date(2028, 0, 1); d.getFullYear() === 2028; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
      for (const preset of presets) {
        const p = periodoDe(preset, d);
        const c = comparacionDe(p);
        expect(excedeTope(p.desde, p.hasta), `${preset} ${p.desde}`).toBe(false);
        expect(excedeTope(c.desde, c.hasta), `${preset} comparado ${c.desde}`).toBe(false);
      }
    }
  });

  it("un rango a mano de 92 días compara contra 92 días: los dos entran", () => {
    const c = comparacionDe(rangoElegido("2026-07-01", "2026-09-30"));
    expect(diasDe(c.desde, c.hasta)).toBe(92);
    expect(excedeTope(c.desde, c.hasta)).toBe(false);
  });

  it("el eje del gráfico no arma más días que el tope, aunque llegue un rango viejo", () => {
    expect(diasDelPeriodo("2025-01-01", "2026-12-31")).toHaveLength(MAX_DIAS_REPORTE);
  });
});
