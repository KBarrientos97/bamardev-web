import { describe, expect, it } from "vitest";
import { mismasRecetas, recetasActivas, recetasDe, sesionRecetas } from "./donde";

/**
 * Las recetas del plato valen sólo en el restaurante y con el ajuste prendido.
 * Todo lo demás —otro rubro, el ajuste apagado (de fábrica), una sesión o un
 * backend que no mandan el dato— se lee como apagado: las pantallas quedan como
 * siempre.
 */

const PRENDIDAS = { activas: true, elegirPresa: false, puroDoble: true };

describe("recetasActivas", () => {
  it("sólo el restaurante con el ajuste prendido", () => {
    expect(recetasActivas({ tipoNegocio: "RESTAURANTE", recetas: PRENDIDAS })).toBe(true);
  });

  it("apagadas, sin el dato o sin sesión: no", () => {
    expect(recetasActivas({ tipoNegocio: "RESTAURANTE", recetas: { ...PRENDIDAS, activas: false } })).toBe(false);
    expect(recetasActivas({ tipoNegocio: "RESTAURANTE" })).toBe(false);
    expect(recetasActivas(null)).toBe(false);
    expect(recetasActivas(undefined)).toBe(false);
  });

  it("en otro rubro no, aunque viniera prendido", () => {
    for (const rubro of ["PELUQUERIA", "FARMACIA", "MINIMARKET", "BILLAR", undefined]) {
      expect(recetasActivas({ tipoNegocio: rubro, recetas: PRENDIDAS })).toBe(false);
    }
  });
});

describe("recetasDe", () => {
  it("lo que hay en la sesión, o null", () => {
    expect(recetasDe({ recetas: PRENDIDAS })).toEqual(PRENDIDAS);
    expect(recetasDe({})).toBeNull();
    expect(recetasDe(null)).toBeNull();
  });
});

describe("sesionRecetas: lo que llega, completo para guardarlo", () => {
  it("lo que falta queda como lo de fábrica del backend: apagadas, sin elegir la presa, «puro» doble", () => {
    expect(sesionRecetas({})).toEqual({ activas: false, elegirPresa: false, puroDoble: true });
    expect(sesionRecetas(null)).toEqual({ activas: false, elegirPresa: false, puroDoble: true });
    expect(sesionRecetas("basura")).toEqual({ activas: false, elegirPresa: false, puroDoble: true });
  });

  it("respeta lo que viene", () => {
    expect(sesionRecetas({ activas: true, elegirPresa: true, puroDoble: false })).toEqual({
      activas: true,
      elegirPresa: true,
      puroDoble: false,
    });
  });

  it("mismasRecetas compara por contenido", () => {
    expect(mismasRecetas(sesionRecetas(PRENDIDAS), { ...PRENDIDAS })).toBe(true);
    expect(mismasRecetas(sesionRecetas(PRENDIDAS), { ...PRENDIDAS, elegirPresa: true })).toBe(false);
  });
});
