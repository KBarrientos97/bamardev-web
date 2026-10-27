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

  it("sin diarios da exactamente lo de siempre", () => {
    // Restaurante, farmacia y belleza no los mandan.
    expect(mesEnCurso({ ...OCTUBRE, gastosDiarios: 0 })).toEqual(mesEnCurso(OCTUBRE));
    expect(mesEnCurso(OCTUBRE)!.diariosDelMes).toBe(0);
    expect(mesEnCurso(OCTUBRE)!.gastosMeta).toBe(7978);
  });

  it("las cenas solas no habilitan la tarjeta", () => {
    // Un billar con cenas y sin el alquiler ni los sueldos cargados leía "Ya
    // cubriste los gastos de octubre" y "Llevás Bs 8.800 a favor".
    expect(mesEnCurso({ ...OCTUBRE, gastosDelMes: 0, gastosDiarios: 200 })).toBeNull();
  });

  it("los diarios se llevan al mes entero en la meta y en la proyección", () => {
    // Al día 11 van Bs 220 de cenas: Bs 20 por noche, unos Bs 620 en el mes.
    // Antes la meta los tomaba como el gasto del mes entero (220), quedaba
    // corta y la proyección inflada en las cenas de las noches que faltan.
    const m = mesEnCurso({ ...OCTUBRE, gastosDiarios: 220 })!;
    expect(m.diariosDelMes).toBe(620);
    expect(m.gastosMeta).toBe(8598);
    // Pesan en la meta igual que un gasto del mes de Bs 620 más.
    const comoFijo = mesEnCurso({ ...OCTUBRE, gastosDelMes: 7978 + 620 })!;
    expect(m.meta).toBe(comoFijo.meta);
    expect(m.faltaVender).toBe(comoFijo.faltaVender);
    expect(m.proyeccion).toBe(comoFijo.proyeccion);
    expect(m.meta).toBeGreaterThan(mesEnCurso(OCTUBRE)!.meta!);
  });

  it("la ganancia a la fecha resta lo que salió de verdad, no lo proyectado", () => {
    const m = mesEnCurso({ ...OCTUBRE, ventas: 30000, utilidadBruta: 9334, gastosDiarios: 220 })!;
    // 9.334 − 7.978 − 220: las cenas de las noches que faltan todavía no salieron.
    expect(m.gananciaALaFecha).toBe(1136);
  });

  it("un monto de diarios negativo no baja la meta", () => {
    expect(mesEnCurso({ ...OCTUBRE, gastosDiarios: -50 })).toEqual(mesEnCurso(OCTUBRE));
    expect(mesEnCurso({ ...OCTUBRE, gastosDeCaja: -50 })).toEqual(mesEnCurso(OCTUBRE));
  });

  it("lo pagado de la caja cuenta una vez: no se lleva al mes entero", () => {
    // Un arreglo de Bs 900 pagado de la caja no se repite cada noche. Llevado
    // al mes (÷ 11 × 31) eran Bs 2.536 de meta en vez de 900.
    const m = mesEnCurso({ ...OCTUBRE, gastosDeCaja: 900 })!;
    expect(m.diariosDelMes).toBe(0);
    expect(m.gastosMeta).toBe(8878);
    const comoCargado = mesEnCurso({ ...OCTUBRE, gastosDelMes: 7978 + 900 })!;
    expect(m.meta).toBe(comoCargado.meta);
    expect(m.proyeccion).toBe(comoCargado.proyeccion);
    // La ganancia a la fecha también lo resta.
    expect(mesEnCurso({ ...OCTUBRE, ventas: 30000, utilidadBruta: 9334, gastosDeCaja: 100 })!.gananciaALaFecha).toBe(1256);
  });

  it("lo de la caja solo no habilita la tarjeta", () => {
    // Sin el alquiler ni los sueldos cargados diría "Ya cubriste los gastos".
    expect(mesEnCurso({ ...OCTUBRE, gastosDelMes: 0, gastosDeCaja: 900 })).toBeNull();
  });

  it("el estimado se redondea a la centena, y a la decena si es chico", () => {
    expect(redondearEstimado(707.93)).toBe(700);
    expect(redondearEstimado(-1234)).toBe(-1200);
    expect(redondearEstimado(45.2)).toBe(50);
  });
});
