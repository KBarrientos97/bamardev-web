import { describe, expect, it } from "vitest";
import {
  contar,
  fmtSobreVentas,
  gastosSuperanVentas,
  proximosAutomaticos,
  sobreVentas,
} from "./gastos";
import type { PlantillaGasto } from "../types";

describe("gastos sobre las ventas", () => {
  it("un mes que gastó el triple de lo vendido dice 300%, no 100%", () => {
    // El bug: con el tope en 100 este mes decía "100.0%", y el dueño leía que
    // se había gastado lo vendido y nada más, justo el mes que perdía plata.
    expect(sobreVentas(3000, 1000)).toBeCloseTo(300);
    expect(gastosSuperanVentas(3000, 1000)).toBe(true);
  });

  it("un mes normal da la proporción de siempre y no es alarma", () => {
    expect(sobreVentas(420, 8575)).toBeCloseTo(4.898, 2);
    expect(gastosSuperanVentas(420, 8575)).toBe(false);
  });

  it("sin ventas no hay porcentaje, y un residuo de centavos no cuenta como venta", () => {
    expect(sobreVentas(500, 0)).toBeNull();
    expect(sobreVentas(500, 0.004)).toBeNull();
    expect(gastosSuperanVentas(500, 0)).toBe(false);
  });

  it("empatar con lo vendido por medio centavo no es superarlo", () => {
    expect(gastosSuperanVentas(1000.004, 1000)).toBe(false);
    expect(gastosSuperanVentas(1000.01, 1000)).toBe(true);
  });

  it("los conteos de las tarjetas van en singular cuando es uno solo", () => {
    expect(contar(1, "gasto", "gastos")).toBe("1 gasto");
    expect(contar(0, "pagado", "pagados")).toBe("0 pagados");
    expect(contar(3, "vencido", "vencidos")).toBe("3 vencidos");
  });

  it("se escribe con coma decimal y separador de miles", () => {
    expect(fmtSobreVentas(312.5)).toBe("312,5%");
    expect(fmtSobreVentas(1250)).toBe("1.250,0%");
  });
});

function regla(datos: Partial<PlantillaGasto>): PlantillaGasto {
  return {
    id: 1,
    concepto: "Alquiler del local",
    categoria: "ALQUILER",
    categoriaNombre: "Alquiler",
    frecuencia: "MENSUAL",
    diaDelMes: 1,
    monto: 3500,
    activa: true,
    motivoPausa: null,
    beneficiario: null,
    nota: null,
    sucursalId: null,
    sucursal: null,
    proximaCarga: "2026-10-01",
    ultimaCarga: null,
    ...datos,
  };
}

const HOY = "2026-09-26";

const alquiler = regla({});
const luz = regla({ id: 2, concepto: "Luz", diaDelMes: 18, monto: null, proximaCarga: "2026-10-18" });
const patente = regla({ id: 3, concepto: "Patente", frecuencia: "ANUAL", proximaCarga: "2027-03-03" });
const pausada = regla({ id: 4, concepto: "Seguro", activa: false, proximaCarga: null });
const sueldos = regla({ id: 5, concepto: "Sueldos", diaDelMes: 30, proximaCarga: "2026-09-30" });

describe("proximosAutomaticos", () => {
  it("en el mes de hoy muestra lo del próximo mes corrido, aunque caiga en el que viene", () => {
    // El 26 de septiembre, el alquiler del 1 de octubre es lo que se viene.
    expect(proximosAutomaticos([alquiler, luz, sueldos], "2026-09", HOY).map((p) => p.id)).toEqual([
      5, 1, 2,
    ]);
  });

  it("no anuncia lo que está lejos, ni lo pausado", () => {
    expect(proximosAutomaticos([patente, pausada], "2026-09", HOY)).toEqual([]);
  });

  it("toda regla mensual activa entra, aunque su día sea hoy y ya haya cargado", () => {
    // Cargó hoy 26/09: la próxima es el 26/10, 30 días después.
    const hoyMismo = regla({ diaDelMes: 26, proximaCarga: "2026-10-26" });
    expect(proximosAutomaticos([hoyMismo], "2026-09", HOY)).toHaveLength(1);
    // Y un 31 de enero, la del día 31 cae el 28 de febrero.
    const fin = regla({ diaDelMes: 31, proximaCarga: "2027-02-28" });
    expect(proximosAutomaticos([fin], "2027-01", "2027-01-31")).toHaveLength(1);
  });

  it("un mes que viene muestra las que caen en ese mes", () => {
    expect(proximosAutomaticos([alquiler, luz, sueldos], "2026-10", HOY).map((p) => p.id)).toEqual([
      1, 2,
    ]);
  });

  it("un mes pasado no anuncia nada: lo cargado ya está en la lista", () => {
    expect(proximosAutomaticos([alquiler, sueldos], "2026-08", HOY)).toEqual([]);
  });
});
