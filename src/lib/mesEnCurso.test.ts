import { describe, expect, it } from "vitest";
import { mesEnCurso, redondearEstimado } from "./mesEnCurso";

// Los números de octubre del restaurante (rediseño del 11-oct): 9.906
// vendidos al día 11, utilidad bruta 3.082,08, gastos del mes 7.978.
const OCTUBRE = { diaActual: 11, diasDelMes: 31, ventas: 9906, utilidadBruta: 3082.08, gastosDelMes: 7978 };

describe("la tarjeta del mes en curso", () => {
  it("los números de octubre dan lo mismo que la maqueta y que la app", () => {
    const m = mesEnCurso(OCTUBRE)!;
    expect(m.meta).toBe(25642);
    expect(m.faltaVender).toBe(15736);
    expect(m.vendesPorDia).toBe(900);
    expect(m.necesitasPorDia).toBe(787);
    expect(Math.round(m.avanceMeta! * 100)).toBe(39);
    expect(Math.round(m.avanceMes * 100)).toBe(35);
    expect(m.vaBien).toBe(true);
    expect(m.proyeccion).toBe(700);
  });

  it("va atrasado cuando el calendario va por delante de lo vendido", () => {
    const m = mesEnCurso({ ...OCTUBRE, diaActual: 20 })!;
    expect(m.vaBien).toBe(false);
  });

  it("sin margen no hay meta ni proyección, y la tarjeta igual aparece para avisarlo", () => {
    const m = mesEnCurso({ ...OCTUBRE, utilidadBruta: -120 })!;
    expect(m.sinMargen).toBe(true);
    expect(m.meta).toBeNull();
    expect(m.proyeccion).toBeNull();
    expect(m.necesitasPorDia).toBeNull();
  });

  it("un margen de centavos cuenta como sin margen", () => {
    // Daría una meta de millones que se leería como alcanzable.
    expect(mesEnCurso({ ...OCTUBRE, utilidadBruta: 0.004 })!.sinMargen).toBe(true);
  });

  it("el último día no se calcula cuánto vender por día", () => {
    expect(mesEnCurso({ ...OCTUBRE, diaActual: 31 })!.necesitasPorDia).toBeNull();
  });

  it("pasada la meta ya no falta nada", () => {
    const m = mesEnCurso({ ...OCTUBRE, ventas: 30000, utilidadBruta: 9334 })!;
    expect(m.cubierto).toBe(true);
    expect(m.faltaVender).toBe(0);
    expect(m.necesitasPorDia).toBeNull();
    expect(m.gananciaALaFecha).toBe(1356);
  });

  it("sin gastos cargados o sin ventas la tarjeta no aparece", () => {
    expect(mesEnCurso({ ...OCTUBRE, gastosDelMes: 0 })).toBeNull();
    expect(mesEnCurso({ ...OCTUBRE, ventas: 0, utilidadBruta: 0 })).toBeNull();
  });

  it("el estimado se redondea a la centena, y a la decena si es chico", () => {
    expect(redondearEstimado(707.93)).toBe(700);
    expect(redondearEstimado(-1234)).toBe(-1200);
    expect(redondearEstimado(45.2)).toBe(50);
  });
});
