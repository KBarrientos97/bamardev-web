import { describe, expect, it } from "vitest";
import type { Gasto, TipoCostoGasto } from "../types";
import { estadoResultado, puntoEquilibrio, tipoCostoBase, type FinancieroBase } from "./resultado";

/**
 * Los mismos casos que `EstadoResultadoTest` y `PuntoEquilibrioTest` de la app:
 * la cuenta tiene que dar igual en los dos lados, o el dueño ve dos números
 * distintos para el mismo mes según dónde lo mire.
 */

function financiero(
  ventas: number,
  costo: number,
  extra: { sinCosto?: number; compras?: number; delta?: number | null } = {},
): FinancieroBase {
  return {
    ventas,
    costoVentas: costo,
    utilidadBruta: ventas - costo,
    utilidadBrutaDeltaPct: extra.delta ?? null,
    ventasSinCosto: extra.sinCosto ?? 0,
    compras: { total: extra.compras ?? 0 },
    numCompras: 0,
  };
}

function gasto(
  monto: number,
  categoria: string,
  p: { tipoCosto?: TipoCostoGasto | null; pagado?: number; nombre?: string } = {},
): Gasto {
  const pagado = p.pagado ?? monto;
  return {
    id: 1,
    concepto: "Gasto de prueba",
    categoria,
    categoriaNombre: p.nombre ?? categoria,
    tipoCosto: p.tipoCosto === undefined ? "FIJO" : p.tipoCosto,
    monto,
    pagado,
    saldo: monto - pagado,
    estado: "PENDIENTE",
    fecha: "2026-09-05",
    fechaVencimiento: null,
    vencido: false,
    diasAtraso: 0,
    diasParaVencer: 0,
    metodoPago: null,
    beneficiario: null,
    nota: null,
    sucursalId: null,
    sucursal: null,
    recurrente: false,
    numeroFactura: null,
    nit: null,
  };
}

describe("estado de resultado", () => {
  it("la cascada del pizarrón da la misma utilidad neta", () => {
    const er = estadoResultado(financiero(350_000, 126_000), [
      gasto(45_000, "SUELDOS"),
      gasto(30_400, "ALQUILER"),
      gasto(20_000, "LUZ"),
      gasto(25_000, "GASTOS_FINANCIEROS"),
      gasto(18_000, "IMPUESTOS"),
    ]);
    expect(er.utilidadBruta).toBeCloseTo(224_000, 2);
    expect(er.gastosOperativos).toBeCloseTo(95_400, 2);
    expect(er.utilidadOperativa).toBeCloseTo(128_600, 2);
    expect(er.utilidadAntesImpuestos).toBeCloseTo(103_600, 2);
    expect(er.utilidadNeta).toBeCloseTo(85_600, 2);
    expect(er.margenNetoPct!).toBeCloseTo(0.2446, 4);
  });

  it("impuestos y financieros no se cuentan como gasto operativo", () => {
    // Invariante 3: van debajo de la utilidad operativa.
    const er = estadoResultado(financiero(10_000, 0), [
      gasto(1_000, "ALQUILER"),
      gasto(2_000, "GASTOS_FINANCIEROS"),
      gasto(3_000, "IMPUESTOS"),
    ]);
    expect(er.gastosOperativos).toBeCloseTo(1_000, 2);
    expect(er.gastosFinancieros).toBeCloseTo(2_000, 2);
    expect(er.impuestos).toBeCloseTo(3_000, 2);
    expect(er.utilidadOperativa).toBeCloseTo(9_000, 2);
    expect(er.utilidadNeta).toBeCloseTo(4_000, 2);
    expect(er.lineas.map((l) => l.codigo)).toEqual(["ALQUILER"]);
  });

  it("el desglose agrupa por código aunque cambie el nombre", () => {
    const er = estadoResultado(financiero(1_000, 0), [
      gasto(100, "LUZ", { nombre: "Luz" }),
      gasto(150, "LUZ", { nombre: "Electricidad" }),
    ]);
    expect(er.lineas).toHaveLength(1);
    expect(er.lineas[0].monto).toBeCloseTo(250, 2);
    expect(er.lineas[0].cantidad).toBe(2);
  });

  it("el desglose viene de mayor a menor y sus barras suman uno", () => {
    const er = estadoResultado(financiero(1_000, 0), [
      gasto(100, "LUZ"),
      gasto(500, "SUELDOS"),
      gasto(300, "ALQUILER"),
    ]);
    expect(er.lineas.map((l) => l.codigo)).toEqual(["SUELDOS", "ALQUILER", "LUZ"]);
    expect(er.lineas.reduce((a, l) => a + l.sobreGastosPct, 0)).toBeCloseTo(1, 3);
  });

  it("un gasto sin pagar o a medio pagar entra por el monto entero", () => {
    // Invariante 2: el resultado suma `monto`, no `pagado`.
    const er = estadoResultado(financiero(10_000, 0), [
      gasto(3_000, "ALQUILER", { pagado: 0 }),
      gasto(4_000, "SUELDOS", { pagado: 1_500 }),
    ]);
    expect(er.gastosOperativos).toBeCloseTo(7_000, 2);
  });

  it("sin ventas los márgenes no se dibujan en vez de dar cero", () => {
    const er = estadoResultado(financiero(0, 0), [gasto(500, "ALQUILER")]);
    expect(er.margenBrutoPct).toBeNull();
    expect(er.margenOperativoPct).toBeNull();
    expect(er.margenNetoPct).toBeNull();
    expect(er.gastosSobreVentasPct).toBeNull();
  });

  it("un margen negativo se muestra negativo, no recortado a cero", () => {
    const er = estadoResultado(financiero(1_000, 400), [gasto(900, "SUELDOS")]);
    expect(er.utilidadNeta).toBeCloseTo(-300, 2);
    expect(er.margenNetoPct!).toBeCloseTo(-0.3, 3);
    expect(er.enPerdida).toBe(true);
  });

  it("una pérdida de centavos no cuenta como pérdida", () => {
    expect(estadoResultado(financiero(1_000, 1_000), []).enPerdida).toBe(false);
  });

  it("un período sin nada es vacío; con ventas y sin gastos no", () => {
    expect(estadoResultado(financiero(0, 0), []).vacio).toBe(true);
    const conVentas = estadoResultado(financiero(5_000, 0), []);
    expect(conVentas.vacio).toBe(false);
    expect(conVentas.utilidadNeta).toBeCloseTo(5_000, 2);
  });

  it("las compras del período no tocan la utilidad bruta", () => {
    // Lo comprado y no vendido sigue en el almacén.
    const er = estadoResultado(financiero(10_000, 4_000, { compras: 30_000 }), []);
    expect(er.utilidadBruta).toBeCloseTo(6_000, 2);
    expect(er.comprasTotal).toBeCloseTo(30_000, 2);
  });

  it("el delta es el de la utilidad bruta tal como llega; sin período anterior, null", () => {
    expect(estadoResultado(financiero(1_000, 400, { delta: 12.5 }), []).deltaUtilidadBrutaPct).toBe(12.5);
    expect(estadoResultado(financiero(1_000, 400), []).deltaUtilidadBrutaPct).toBeNull();
  });

  it("lo vendido sin costo cargado se mide para poder avisarlo", () => {
    const er = estadoResultado(financiero(10_000, 4_000, { sinCosto: 2_500 }), []);
    expect(er.sinCostoSobreVentasPct!).toBeCloseTo(0.25, 3);
  });

  it("sin impuestos ni financieros la neta da igual que la operativa", () => {
    const er = estadoResultado(financiero(10_000, 4_000), [gasto(1_000, "ALQUILER")]);
    expect(er.sinBajoLaLinea).toBe(true);
    expect(er.utilidadNeta).toBeCloseTo(er.utilidadOperativa, 2);
  });
});

describe("punto de equilibrio", () => {
  const LUZ = (m = 600) => gasto(m, "LUZ", { tipoCosto: "FIJO" });

  it("el caso real de la pizarra cierra", () => {
    // Pollos Don Omar a 30 días: de ahí salió el pedido.
    const pe = puntoEquilibrio(financiero(20_662, 13_473.27), [LUZ()]);
    expect(pe.margenContribucion).toBeCloseTo(7_188.73, 2);
    expect(pe.margenContribucionPct!).toBeCloseTo(0.3479, 4);
    expect(Math.abs(pe.puntoEquilibrio! - 1_724.53)).toBeLessThan(0.5);
  });

  it("el margen de contribución descuenta el costo y los gastos variables", () => {
    const pe = puntoEquilibrio(financiero(10_000, 6_000), [
      gasto(1_000, "COMISION_DELIVERY", { tipoCosto: "VARIABLE" }),
      gasto(500, "ALQUILER", { tipoCosto: "FIJO" }),
    ]);
    expect(pe.costosVariables).toBeCloseTo(7_000, 2);
    expect(pe.margenContribucion).toBeCloseTo(3_000, 2);
    expect(pe.puntoEquilibrio!).toBeCloseTo(1_666.67, 2);
  });

  it("un gasto fijo y uno variable del mismo monto dan metas distintas", () => {
    const base = financiero(10_000, 6_000);
    const fijo = puntoEquilibrio(base, [gasto(1_000, "ALQUILER", { tipoCosto: "FIJO" })]);
    const variable = puntoEquilibrio(base, [gasto(1_000, "GAS", { tipoCosto: "VARIABLE" })]);
    expect(fijo.puntoEquilibrio!).toBeCloseTo(2_500, 2);
    expect(variable.puntoEquilibrio!).toBeCloseTo(0, 2);
    expect(variable.sinFijos).toBe(true);
  });

  it("si cada venta pierde plata no hay punto de equilibrio", () => {
    // Devolver un número acá sería darle al dueño una meta que no existe.
    const pe = puntoEquilibrio(financiero(10_000, 11_000), [gasto(500, "ALQUILER")]);
    expect(pe.margenNegativo).toBe(true);
    expect(pe.puntoEquilibrio).toBeNull();
    expect(pe.margenSeguridadPct).toBeNull();
    expect(pe.cubierto).toBe(false);
    expect(pe.margenNegativoPorVariables).toBe(false);
  });

  it("un margen de medio centavo tampoco da punto de equilibrio", () => {
    // Con `pct > 0` pelado, este ruido de redondeo daba una meta de millones.
    const pe = puntoEquilibrio(financiero(10_000, 9_999.999), [gasto(500, "ALQUILER")]);
    expect(pe.puntoEquilibrio).toBeNull();
  });

  it("una compra grande en un período corto hunde el margen y la culpa es de los variables", () => {
    // El caso real: una garrafa de Bs 1.000 en una semana de Bs 1.014.
    const pe = puntoEquilibrio(financiero(1_014, 649), [
      gasto(1_000, "GAS", { tipoCosto: "VARIABLE" }),
      LUZ(),
    ]);
    expect(pe.utilidadBruta).toBeCloseTo(365, 2);
    expect(pe.margenContribucion).toBeCloseTo(-635, 2);
    expect(pe.margenNegativoPorVariables).toBe(true);
    expect(pe.puntoEquilibrio).toBeNull();
  });

  it("sin ventas no se inventa una meta, y un período vacío no rompe", () => {
    const sinVentas = puntoEquilibrio(financiero(0, 0), [gasto(500, "ALQUILER")]);
    expect(sinVentas.margenContribucionPct).toBeNull();
    expect(sinVentas.puntoEquilibrio).toBeNull();
    const vacio = puntoEquilibrio(financiero(0, 0), []);
    expect(vacio.vacio).toBe(true);
    expect(vacio.margenNegativo).toBe(false);
  });

  it("el margen de seguridad dice cuánto se puede caer antes de perder", () => {
    const pe = puntoEquilibrio(financiero(20_662, 13_473.27), [LUZ()]);
    expect(pe.cubierto).toBe(true);
    expect(pe.margenSeguridadPct!).toBeCloseTo(0.917, 3);
    expect(pe.faltaVender!).toBeCloseTo(0, 2);
  });

  it("si todavía no se llegó dice cuánto falta y el margen va negativo", () => {
    const pe = puntoEquilibrio(financiero(1_000, 650), [LUZ()]);
    expect(pe.cubierto).toBe(false);
    expect(pe.puntoEquilibrio!).toBeCloseTo(1_714.29, 2);
    expect(pe.faltaVender!).toBeCloseTo(714.29, 2);
    expect(pe.margenSeguridadPct!).toBeLessThan(0);
  });

  it("la meta se baja a un día sólo cuando se sabe cuántos son", () => {
    const con = puntoEquilibrio(financiero(20_662, 13_473.27), [LUZ()], 30);
    expect(Math.abs(con.ventaDiariaNecesaria! - 57.48)).toBeLessThan(0.1);
    expect(puntoEquilibrio(financiero(20_662, 13_473.27), [LUZ()], 0).ventaDiariaNecesaria).toBeNull();
  });

  it("los impuestos y lo financiero no cuentan como gastos fijos", () => {
    const pe = puntoEquilibrio(financiero(10_000, 6_000), [
      gasto(500, "ALQUILER", { tipoCosto: "FIJO" }),
      gasto(300, "IMPUESTOS", { tipoCosto: "FIJO" }),
      gasto(200, "GASTOS_FINANCIEROS", { tipoCosto: "FIJO" }),
    ]);
    expect(pe.gastosFijos).toBeCloseTo(500, 2);
    expect(pe.puntoEquilibrio!).toBeCloseTo(1_250, 2);
  });

  it("las ventas sin costo avisan que la meta se ve más fácil de lo que es", () => {
    const pe = puntoEquilibrio(financiero(10_000, 6_000, { sinCosto: 2_000 }), [gasto(500, "ALQUILER")]);
    expect(pe.metaOptimista).toBe(true);
    expect(pe.sinCostoSobreVentasPct!).toBeCloseTo(0.2, 4);
  });

  it("se suma lo gastado y no lo pagado", () => {
    const pe = puntoEquilibrio(financiero(10_000, 6_000), [gasto(500, "ALQUILER", { pagado: 0 })]);
    expect(pe.gastosFijos).toBeCloseTo(500, 2);
  });

  it("los fijos se agrupan por rubro y van de mayor a menor", () => {
    const pe = puntoEquilibrio(financiero(10_000, 6_000), [
      gasto(200, "LUZ", { tipoCosto: "FIJO" }),
      gasto(800, "ALQUILER", { tipoCosto: "FIJO" }),
      gasto(100, "LUZ", { tipoCosto: "FIJO" }),
      gasto(300, "GAS", { tipoCosto: "VARIABLE" }),
    ]);
    expect(pe.lineasFijas.map((l) => [l.codigo, l.monto, l.cantidad])).toEqual([
      ["ALQUILER", 800, 1],
      ["LUZ", 300, 2],
    ]);
    expect(pe.lineasVariables.map((l) => l.codigo)).toEqual(["GAS"]);
    expect(pe.lineasFijas[0].sobreGastosPct).toBeLessThanOrEqual(1);
  });

  it("un gasto que llega sin tipoCosto cae en el tipo de su categoría", () => {
    // La red para un backend que no lo mande: la comisión de delivery es
    // variable aunque llegue todos los meses; una categoría propia, fija.
    expect(tipoCostoBase("COMISION_DELIVERY")).toBe("VARIABLE");
    expect(tipoCostoBase("MUSICA_EN_VIVO")).toBe("FIJO");
    const pe = puntoEquilibrio(financiero(10_000, 6_000), [
      gasto(1_000, "COMISION_DELIVERY", { tipoCosto: null }),
    ]);
    expect(pe.gastosVariables).toBeCloseTo(1_000, 2);
    expect(pe.gastosFijos).toBeCloseTo(0, 2);
  });
});
