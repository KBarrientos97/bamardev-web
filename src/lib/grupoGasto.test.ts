import { describe, expect, it } from "vitest";
import type { Gasto } from "../types";
import { desgloseGastos, estadoLinea, grupoDe, listaNombres, pareceDeBanco } from "./grupoGasto";

function gasto(p: Partial<Gasto>): Gasto {
  return {
    id: 1,
    concepto: "Alquiler",
    categoria: "ALQUILER",
    categoriaNombre: "Alquiler",
    tipoCosto: "FIJO",
    monto: 100,
    pagado: 0,
    saldo: 100,
    estado: "PENDIENTE",
    fecha: "2026-10-01",
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
    ...p,
  };
}

describe("a qué parte del resultado va cada gasto", () => {
  it("se decide por el código: los financieros al banco, los impuestos aparte y el resto al local", () => {
    expect(grupoDe("GASTOS_FINANCIEROS")).toBe("BANCO");
    expect(grupoDe("IMPUESTOS")).toBe("IMPUESTOS");
    expect(grupoDe("ALQUILER")).toBe("LOCAL");
    // Una categoría propia del negocio va al local.
    expect(grupoDe("MI_CATEGORIA")).toBe("LOCAL");
  });

  it("el total se parte en lo del local, lo del banco y los impuestos, sumando lo gastado y no lo pagado", () => {
    const d = desgloseGastos([
      gasto({ monto: 4343, pagado: 0 }),
      gasto({ categoria: "GASTOS_FINANCIEROS", monto: 3635, pagado: 3635 }),
    ]);
    expect(d).toEqual({ delLocal: 4343, banco: 3635, impuestos: 0, total: 7978, separado: true });
  });

  it("un negocio sin banco ni impuestos no tiene nada que separar", () => {
    expect(desgloseGastos([gasto({})]).separado).toBe(false);
  });
});

describe("los gastos que parecen del banco", () => {
  it("deuda y deudas guardadas en otros parecen del banco", () => {
    // El caso real del restaurante: Bs 926 contados como gasto del local.
    expect(pareceDeBanco(gasto({ concepto: "Deuda", categoria: "OTROS", categoriaNombre: "Otros" }))).toBe(true);
    expect(pareceDeBanco(gasto({ concepto: "Deudas", categoria: "OTROS", categoriaNombre: "Otros" }))).toBe(true);
  });

  it("los acentos y las mayúsculas no importan, y el banco como beneficiario también cuenta", () => {
    expect(pareceDeBanco(gasto({ concepto: "PRÉSTAMO moto" }))).toBe(true);
    expect(pareceDeBanco(gasto({ concepto: "Cuota", beneficiario: "Banco Unión" }))).toBe(true);
  });

  it("se miran palabras enteras: los bancos para la barra son para sentarse", () => {
    expect(pareceDeBanco(gasto({ concepto: "Bancos para la barra" }))).toBe(false);
  });

  it("un gasto que ya está en gastos financieros no se marca", () => {
    expect(pareceDeBanco(gasto({ concepto: "Deuda", categoria: "GASTOS_FINANCIEROS" }))).toBe(false);
  });
});

describe("el estado de un rubro entero", () => {
  it("un solo gasto vencido marca el rubro", () => {
    expect(estadoLinea([gasto({ estado: "PAGADO", pagado: 100, saldo: 0 }), gasto({ vencido: true })])).toBe("VENCIDO");
  });

  it("todo saldado está pagado, algo pagado está parcial y nada pagado, pendiente", () => {
    expect(estadoLinea([gasto({ estado: "PAGADO", pagado: 100, saldo: 0 })])).toBe("PAGADO");
    expect(estadoLinea([gasto({ estado: "PAGADO", pagado: 100, saldo: 0 }), gasto({})])).toBe("PARCIAL");
    expect(estadoLinea([gasto({})])).toBe("PENDIENTE");
  });
});

describe("la lista de nombres de un aviso", () => {
  it("dice uno, dos o tres por su nombre, y de cuatro en adelante resume", () => {
    expect(listaNombres(["Deuda"])).toBe("«Deuda»");
    expect(listaNombres(["Deuda", "Deudas"])).toBe("«Deuda» y «Deudas»");
    expect(listaNombres(["A", "B", "C"])).toBe("«A», «B» y «C»");
    expect(listaNombres(["A", "B", "C", "D", "E"])).toBe("«A», «B» y 3 más");
  });
});
