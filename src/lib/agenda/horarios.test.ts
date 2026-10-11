import { describe, expect, it } from "vitest";
import {
  copiarDia,
  erroresTramos,
  fmtRangoNegocio,
  hoyNegocio,
  instanteNegocio,
  nombreDia,
  partesNegocio,
  reemplazarSucursal,
  resumenTramos,
  semanaDeSucursal,
  sumarDias,
} from "./horarios";
import type { TramoHorario } from "./tiposConfigAgenda";

describe("erroresTramos", () => {
  it("un día partido por el almuerzo vale", () => {
    expect(
      erroresTramos([
        { desde: "09:00", hasta: "13:00" },
        { desde: "14:00", hasta: "19:00" },
      ]),
    ).toEqual([]);
  });

  it("dos tramos que se tocan valen: es un día corrido partido en dos", () => {
    expect(
      erroresTramos([
        { desde: "13:00", hasta: "19:00" },
        { desde: "09:00", hasta: "13:00" },
      ]),
    ).toEqual([]);
  });

  it("el fin tiene que ser posterior al inicio", () => {
    expect(erroresTramos([{ desde: "13:00", hasta: "09:00" }])[0]).toMatch(/termina antes de empezar/);
    expect(erroresTramos([{ desde: "09:00", hasta: "09:00" }])).toHaveLength(1);
  });

  it("dos tramos del mismo día que se pisan, aunque vengan desordenados", () => {
    const e = erroresTramos([
      { desde: "12:00", hasta: "15:00" },
      { desde: "09:00", hasta: "13:00" },
    ]);
    expect(e).toEqual(["Los tramos 09:00-13:00 y 12:00-15:00 se pisan."]);
  });

  it("una hora a medio cargar no pasa", () => {
    expect(erroresTramos([{ desde: "09:00", hasta: "" }])).toHaveLength(1);
    expect(erroresTramos([{ desde: "9", hasta: "13:00" }])).toHaveLength(1);
  });
});

describe("la semana tipo de una sucursal", () => {
  const todos: TramoHorario[] = [
    { sucursalId: 1, dia: 1, desde: "14:00", hasta: "19:00" },
    { sucursalId: 1, dia: 1, desde: "09:00", hasta: "13:00" },
    { sucursalId: 2, dia: 2, desde: "09:00", hasta: "18:00" },
  ];

  it("arma la semana de la sucursal, ordenada, y deja afuera las otras", () => {
    const s = semanaDeSucursal(todos, 1);
    expect(resumenTramos(s[1])).toBe("09:00-13:00 · 14:00-19:00");
    expect(s[2]).toEqual([]);
  });

  it("al guardar una sucursal no se pierde lo de la otra (el PUT reemplaza todo)", () => {
    const semana = semanaDeSucursal(todos, 1);
    semana[1] = [{ desde: "10:00", hasta: "18:00" }];
    const enviar = reemplazarSucursal(todos, 1, semana);
    expect(enviar).toContainEqual({ sucursalId: 2, dia: 2, desde: "09:00", hasta: "18:00" });
    expect(enviar.filter((t) => t.sucursalId === 1)).toEqual([
      { sucursalId: 1, dia: 1, desde: "10:00", hasta: "18:00" },
    ]);
  });

  it("copiar un día a otros pisa lo que tenían, sin compartir los objetos", () => {
    const s = semanaDeSucursal(todos, 1);
    s[3] = [{ desde: "08:00", hasta: "10:00" }];
    const c = copiarDia(s, 1, [2, 3, 1]);
    expect(c[2]).toEqual(s[1]);
    expect(c[3]).toEqual(s[1]);
    expect(c[2][0]).not.toBe(s[1][0]);
    expect(c[1]).toBe(s[1]);
  });
});

describe("hora del negocio (La Paz, UTC−4)", () => {
  it("una hora del salón va a la API en UTC y vuelve igual", () => {
    const iso = instanteNegocio("2026-10-21", "09:00");
    expect(iso).toBe("2026-10-21T13:00:00.000Z");
    expect(partesNegocio(iso)).toEqual({ fecha: "2026-10-21", hora: "09:00" });
  });

  it("las 22:00 del salón son el día siguiente en UTC, pero el mismo día en pantalla", () => {
    const iso = instanteNegocio("2026-10-21", "22:00");
    expect(iso.startsWith("2026-10-22")).toBe(true);
    expect(partesNegocio(iso).fecha).toBe("2026-10-21");
  });

  it("hoy es el de La Paz, no el de UTC", () => {
    expect(hoyNegocio(new Date("2026-10-22T02:00:00Z"))).toBe("2026-10-21");
  });

  it("fechas y rangos en palabras", () => {
    expect(sumarDias("2026-10-31", 1)).toBe("2026-11-01");
    expect(nombreDia("2026-10-21")).toBe("Miércoles");
    expect(
      fmtRangoNegocio(instanteNegocio("2026-10-21", "09:00"), instanteNegocio("2026-10-21", "13:00")),
    ).toBe("21/10/2026 09:00 a 13:00");
  });
});
