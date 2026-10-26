import { describe, expect, it } from "vitest";
import { fmtMoney } from "../../../lib/format";
import {
  aniosComprasMensual,
  armarComprasPorArticulo,
  filasComprasMensual,
  cantidadConUnidad,
  etiquetaOrigen,
  parteDe,
  resumenDocumentos,
  usaInsumos,
  type ArticuloComprado,
} from "./Compras.datos";

function articulo(nombre: string, total: number, tipo: "INSUMO" | "PRODUCTO" = "PRODUCTO"): ArticuloComprado {
  return { nombre, tipo, unidad: "Caja", cantidad: 2, total, costoUnitario: total / 2 };
}

describe("la cantidad con su unidad", () => {
  it("pone la unidad en plural y en minúscula", () => {
    // Las unidades llegan como las cargó el negocio ("Caja"): "16 Caja" se
    // leía como un error.
    expect(cantidadConUnidad(16, "Caja")).toBe("16 cajas");
    expect(cantidadConUnidad(1, "Caja")).toBe("1 caja");
    expect(cantidadConUnidad(46, "Unidad")).toBe("46 unidades");
    expect(cantidadConUnidad(5, "Quintal")).toBe("5 quintales");
    expect(cantidadConUnidad(3, "Galón")).toBe("3 galones");
    expect(cantidadConUnidad(2, "Blíster")).toBe("2 blísteres");
    expect(cantidadConUnidad(4, "Pack")).toBe("4 packs");
    expect(cantidadConUnidad(2.5, "Kilogramo")).toBe("2,5 kilogramos");
  });

  it("la fracción va con lo que necesita, sin ceros de más", () => {
    // Salía "2,50 kilogramos" y 0,125 kg, "0,13" (Kevin, 25-oct: sin ",00" en las cantidades).
    expect(cantidadConUnidad(0.125, "Kilogramo")).toBe("0,125 kilogramos");
    expect(cantidadConUnidad(1.5, "kg")).toBe("1,5 kg");
    expect(cantidadConUnidad(2.3 - 0.3, "Caja")).toBe("2 cajas");
  });

  it("una abreviatura queda como está: 16 kgs está mal", () => {
    expect(cantidadConUnidad(16, "kg")).toBe("16 kg");
    expect(cantidadConUnidad(10, "QQ")).toBe("10 QQ");
    expect(cantidadConUnidad(3, "@")).toBe("3 @");
    expect(cantidadConUnidad(3, "Unid.")).toBe("3 Unid.");
  });

  it("en un nombre de varias palabras se pluraliza la primera", () => {
    expect(cantidadConUnidad(3, "Bolsa de 1kg")).toBe("3 bolsas de 1kg");
  });

  it("sin unidad cargada habla de unidades", () => {
    expect(cantidadConUnidad(12, "")).toBe("12 unidades");
    expect(cantidadConUnidad(1, null)).toBe("1 unidad");
  });
});

describe("compras por artículo", () => {
  it("van de lo que más se gastó a lo que menos, con la barra contra el primero", () => {
    const filas = armarComprasPorArticulo([articulo("Maní", 348.18), articulo("Paceña", 1740.92), articulo("Tizas", 278.55, "INSUMO")]);
    expect(filas.map((f) => f.nombre)).toEqual(["Paceña", "Maní", "Tizas"]);
    expect(filas[0].fraccion).toBe(1);
    expect(filas[1].fraccion).toBeCloseTo(348.18 / 1740.92);
  });

  it("la parte de cada tipo no se calcula sin compras", () => {
    expect(parteDe(25, 100)).toBe(0.25);
    expect(parteDe(0, 0)).toBeNull();
  });
});

describe("quién ve los insumos", () => {
  it("el restaurante con la feature sí; la farmacia, belleza o un plan sin insumos no", () => {
    expect(usaInsumos("RESTAURANTE", ["insumos"])).toBe(true);
    expect(usaInsumos("RESTAURANTE", ["salon"])).toBe(false);
    expect(usaInsumos("FARMACIA", ["insumos"])).toBe(false);
    expect(usaInsumos("PELUQUERIA", ["insumos"])).toBe(false);
    // Sin features en la sesión falla abierto, como el resto de la app.
    expect(usaInsumos("BILLAR", [])).toBe(true);
  });
});

describe("los documentos", () => {
  it("el resumen cuenta lo aprobado y aparte lo pendiente y lo anulado, que no suman", () => {
    expect(resumenDocumentos({ compras: 12, invertido: 3481.85, promedioCompra: 290.15, anuladas: 2, pendientes: 1 })).toBe(
      `12 compras aprobadas · ${fmtMoney(3481.85)} · 1 pendiente · 2 anuladas`,
    );
    expect(resumenDocumentos({ compras: 1, invertido: 50, promedioCompra: 50, anuladas: 0, pendientes: 0 })).toBe(
      `1 compra aprobada · ${fmtMoney(50)}`,
    );
  });

  it("el origen se dice en palabras", () => {
    expect(etiquetaOrigen("MIXTO")).toBe("Insumos y productos");
    expect(etiquetaOrigen("VACIO")).toBe("Sin líneas");
  });
});

describe("compras por mes", () => {
  const mes = (n: number, total: number, estado: "FUTURO" | "CON_COMPRAS" | "SIN_COMPRAS") => ({
    mes: n,
    nombre: ["Enero", "Febrero", "Marzo"][n - 1],
    compras: estado === "CON_COMPRAS" ? 2 : 0,
    total,
    estado,
  });

  it("marca el mes de mayor gasto y mide los demás contra él", () => {
    const filas = filasComprasMensual({ meses: [mes(1, 500, "CON_COMPRAS"), mes(2, 1000, "CON_COMPRAS"), mes(3, 0, "FUTURO")] });
    expect(filas.map((f) => f.mayor)).toEqual([false, true, false]);
    expect(filas[0].fraccion).toBeCloseTo(0.5);
    expect(filas[0].sigla).toBe("ENE");
  });

  it("un mes que todavía no llegó no se mide ni se marca", () => {
    // Un mes futuro en cero no es un mes "sin compras": no pasó todavía.
    const filas = filasComprasMensual({ meses: [mes(1, 0, "SIN_COMPRAS"), mes(2, 0, "FUTURO")] });
    expect(filas.every((f) => f.fraccion === 0 && !f.mayor)).toBe(true);
  });

  it("el selector de años siempre trae el que se está viendo, el más nuevo primero", () => {
    expect(aniosComprasMensual({ anio: 2024, anios: [2026, 2025] })).toEqual([2026, 2025, 2024]);
  });
});
