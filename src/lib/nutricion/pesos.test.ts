import { describe, expect, it } from "vitest";
import { control, paciente } from "../../test/nutricionFixtures";
import { hayDeLosDos, pesoAnteriorDeLaSerie, puntosDeLaSerie, resumenDeLaSerie, ultimoImcDeLaSerie } from "./pesos";
import type { PesoDelPaciente } from "./tipos";

/**
 * El peso de cada semana también en la Evaluación (CONTRATO-nutricion-seguimiento-23nov
 * §4.4): una sola serie que arma el servidor; si la respuesta no la trae, todo
 * sale de los controles, como en la etapa 1.
 */

const deControl = (fecha: string, pesoKg: number, controlId: number, imc: number | null = null): PesoDelPaciente => ({
  fecha,
  pesoKg,
  imc,
  imcGrado: imc ? "OBESIDAD_2" : null,
  origen: "CONTROL",
  controlId,
  registroId: null,
  semana: null,
});
const deSemana = (fecha: string, pesoKg: number, semana: number, imc: number | null = null): PesoDelPaciente => ({
  fecha,
  pesoKg,
  imc,
  imcGrado: imc ? "OBESIDAD_2" : null,
  origen: "SEGUIMIENTO",
  controlId: null,
  registroId: 100 + semana,
  semana,
});

const c1 = control({ id: 77, fecha: "2026-11-21", inicial: true, pesoKg: 129, imc: 39.8, imcGrado: "OBESIDAD_2" });
const c2 = control({ id: 78, fecha: "2026-12-21", pesoKg: 121, imc: 37.3, imcGrado: "OBESIDAD_2" });
const pesos = [deControl("2026-11-21", 129, 77, 39.8), deSemana("2026-11-30", 127.6, 1, 39.4), deSemana("2026-12-14", 121.8, 3, 37.6), deControl("2026-12-21", 121, 78, 37.3)];

describe("la serie de pesos al día", () => {
  it("sin la serie, todo como en la etapa 1: los controles", () => {
    const p = paciente({ controles: [c1, c2] });
    expect(puntosDeLaSerie(p, "pesoKg").map((x) => [x.fecha, x.valor, x.delSeguimiento])).toEqual([
      ["2026-11-21", 129, false],
      ["2026-12-21", 121, false],
    ]);
    expect(pesoAnteriorDeLaSerie(undefined, null)).toBeUndefined();
    expect(ultimoImcDeLaSerie(undefined)).toBeNull();
  });

  it("con la serie: todos los puntos, los del seguimiento marcados", () => {
    const p = paciente({ controles: [c1, c2], pesos });
    const puntos = puntosDeLaSerie(p, "pesoKg");
    expect(puntos.map((x) => [x.valor, x.delSeguimiento])).toEqual([
      [129, false],
      [127.6, true],
      [121.8, true],
      [121, false],
    ]);
    expect(hayDeLosDos(puntos)).toBe(true);
    expect(puntosDeLaSerie(p, "imc").map((x) => x.valor)).toEqual([39.8, 39.4, 37.6, 37.3]);
  });

  it("la tarjeta: el último de la serie y lo que cambió desde el primero y el anterior", () => {
    const p = paciente({ controles: [c1], pesos: pesos.slice(0, 3) });
    expect(resumenDeLaSerie(puntosDeLaSerie(p, "pesoKg"))).toEqual({
      actual: 121.8,
      fecha: "2026-12-14",
      delSeguimiento: true,
      desdeInicio: -7.2,
      desdeAnterior: -5.8,
    });
    expect(resumenDeLaSerie([])).toBeNull();
  });

  it("el medidor: el último IMC de la serie (sin talla, un peso semanal no tiene IMC y se saltea)", () => {
    expect(ultimoImcDeLaSerie(pesos)?.imc).toBe(37.3);
    expect(ultimoImcDeLaSerie([pesos[0], deSemana("2026-11-30", 127.6, 1, null)])?.imc).toBe(39.8);
  });

  it("el «anterior:» de la hoja de control: el último de la serie, o el de justo antes del control que se corrige", () => {
    expect(pesoAnteriorDeLaSerie(pesos, null)?.pesoKg).toBe(121);
    expect(pesoAnteriorDeLaSerie(pesos, c2)?.pesoKg).toBe(121.8);
    expect(pesoAnteriorDeLaSerie(pesos, c2)?.origen).toBe("SEGUIMIENTO");
    expect(pesoAnteriorDeLaSerie(pesos, c1)).toBeNull();
    // Un control sin peso no está en la serie: el último hasta su fecha.
    expect(pesoAnteriorDeLaSerie(pesos, { id: 99, fecha: "2026-12-15" })?.pesoKg).toBe(121.8);
  });
});
