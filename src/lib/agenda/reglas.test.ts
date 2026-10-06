import { describe, expect, it } from "vitest";
import {
  cambiosReglas,
  erroresReglas,
  fmtValorRegla,
  motivoAnticipo,
  textoOrigen,
  valoresDe,
} from "./reglas";
import type { Reglas } from "./tiposConfigAgenda";

const REGLAS_DEFECTO: Reglas = {
  granularidadMin: 15,
  bufferGeneralMin: 0,
  profesionalPuedeAgendar: false,
  profesionalPuedeBloquear: false,
  profesionalVeTelefono: false,
  profesionalVePrecios: true,
  modoConfirmacion: "MANUAL",
  anticipacionMinHoras: 2,
  anticipacionMaxDias: 30,
  ventanaCancelacionHoras: 4,
  vencimientoSolicitudHoras: 12,
  citasActivasPorTelefono: 2,
  citasPorTelefonoPorDia: 1,
  noShowsParaBloquear: 3,
  mostrarPreciosOnline: true,
  anticipoPct: 30,
  anticipoPlazoMin: 15,
  origen: {},
};

describe("reglas del negocio", () => {
  it("sólo viaja lo que cambió: lo demás sigue heredando", () => {
    const original = valoresDe(REGLAS_DEFECTO);
    const editado = { ...original, granularidadMin: 10, profesionalVeTelefono: true };
    expect(cambiosReglas(original, editado)).toEqual({
      granularidadMin: 10,
      profesionalVeTelefono: true,
    });
    expect(cambiosReglas(original, original)).toEqual({});
  });

  it("los valores no llevan el origen ni campos desconocidos", () => {
    const v = valoresDe({ ...REGLAS_DEFECTO, origen: { granularidadMin: "NEGOCIO" } });
    expect("origen" in v).toBe(false);
  });

  it("avisa los números fuera de rango o no enteros", () => {
    const v = valoresDe(REGLAS_DEFECTO);
    expect(erroresReglas(v)).toEqual({});
    const e = erroresReglas({ ...v, granularidadMin: 0, anticipacionMaxDias: Number.NaN, bufferGeneralMin: 2.5 });
    expect(Object.keys(e).sort()).toEqual(["anticipacionMaxDias", "bufferGeneralMin", "granularidadMin"]);
  });

  it("el origen se cuenta distinto según se mire el negocio o una sucursal", () => {
    expect(textoOrigen("DEFECTO", "NEGOCIO")).toBe("Valor sugerido del rubro");
    expect(textoOrigen("NEGOCIO", "NEGOCIO")).toBeNull();
    expect(textoOrigen("NEGOCIO", "SUCURSAL")).toBe("Heredado de todo el negocio");
    expect(textoOrigen("SUCURSAL", "SUCURSAL")).toBe("Propio de esta sucursal");
  });

  it("el motivo del anticipo (D20) sale de las features", () => {
    expect(motivoAnticipo(["agenda"])).toBe("Disponible en el plan Profesional.");
    expect(motivoAnticipo(["agenda", "sena_online"])).toMatch(/QR automático de tu banco/);
  });

  it("la bitácora se lee en palabras", () => {
    expect(fmtValorRegla("modoConfirmacion", "AUTOMATICA")).toBe(
      "Queda lista cuando el cliente la confirma",
    );
    expect(fmtValorRegla("profesionalVeTelefono", true)).toBe("Sí");
    expect(fmtValorRegla("granularidadMin", 10)).toBe("10 min");
    expect(fmtValorRegla("campoNuevo", "x")).toBe("x");
  });
});
