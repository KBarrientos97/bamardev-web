import { describe, expect, it } from "vitest";
import { leerPlanilla } from "../../lib/planilla";
import {
  COLUMNAS,
  enTandas,
  leerMedicamentos,
  leerNumero,
  leerVencimiento,
  plantillaMedicamentos,
  resumenStock,
  ubicarEncabezado,
  type LecturaMedicamentos,
} from "./cargaExcel";

const TITULOS = ["Código", "Nombre", "Laboratorio", "Precio", "Costo", "Cantidad", "Lote", "Vencimiento", "Maneja lote"];

function leer(filas: string[][]): LecturaMedicamentos {
  const r = leerMedicamentos([TITULOS, ...filas]);
  if ("error" in r) throw new Error(r.error);
  return r;
}

describe("los títulos", () => {
  it("reconoce un Excel propio aunque los títulos se llamen distinto", () => {
    const e = ubicarEncabezado([
      ["Farmacia San Rafael — inventario 2026"],
      [],
      ["Cód. barra", "Producto", "P.V.P.", "Existencia", "Nº Lote", "Fecha de vencimiento", "Notas"],
    ]);
    expect(e).toMatchObject({
      fila: 2,
      columnas: { codBarra: 0, nombre: 1, precio: 2, cantidad: 3, lote: 4, vencimiento: 5 },
      ignoradas: ["Notas"],
    });
  });

  it("'Nombre' le gana a 'Descripción' si están los dos", () => {
    const e = ubicarEncabezado([["Descripción", "Nombre", "Precio de venta *"]]);
    expect(e?.columnas).toMatchObject({ nombre: 1, precio: 2 });
  });

  it("sin nombre o sin precio no hay por dónde empezar, y lo dice", () => {
    const r = leerMedicamentos([["Producto", "Stock"], ["Ibuprofeno", "10"]]);
    expect(r).toEqual({ error: expect.stringContaining('"Nombre" y "Precio de venta"') });
  });

  it("la plantilla que se baja se reconoce entera", async () => {
    const filas = await leerPlanilla(new Blob([plantillaMedicamentos() as BlobPart]));
    const e = ubicarEncabezado(filas);
    expect(Object.keys(e?.columnas ?? {})).toHaveLength(COLUMNAS.length);
    expect(e?.ignoradas).toEqual([]);
  });
});

describe("una celda", () => {
  it("lee los números como los escribe una persona o los guarda Excel", () => {
    expect(leerNumero("12,50", "El precio")).toEqual({ valor: 12.5 });
    expect(leerNumero("2.5", "El precio")).toEqual({ valor: 2.5 });
    expect(leerNumero("1.234,50", "El precio")).toEqual({ valor: 1234.5 });
    expect(leerNumero("Bs 15", "El precio")).toEqual({ valor: 15 });
    expect(leerNumero("", "El precio")).toEqual({ valor: null });
    expect(leerNumero("doce", "El precio")).toEqual({ error: 'El precio "doce" no es un número.' });
    expect(leerNumero("-3", "El costo")).toEqual({ error: "El costo no puede ser negativo." });
  });

  it("el vencimiento de la caja vale hasta el último día del mes", () => {
    expect(leerVencimiento("04/2028")).toEqual({ valor: "2028-04-30" });
    expect(leerVencimiento("2/28")).toEqual({ valor: "2028-02-29" });
    expect(leerVencimiento("15/04/2028")).toEqual({ valor: "2028-04-15" });
    expect(leerVencimiento("2028-04-15")).toEqual({ valor: "2028-04-15" });
  });

  it("una fecha que guardó Excel se toma como está, aunque sea el día 1", () => {
    // 46844 es el 1 de abril de 2028: si Excel convirtió "04/2028", queda el
    // 1 y se deja de vender antes, que es el lado seguro.
    expect(leerVencimiento("46844")).toEqual({ valor: "2028-04-01" });
    expect(leerVencimiento("31/04/2028")).toHaveProperty("error");
    expect(leerVencimiento("pronto")).toHaveProperty("error");
  });
});

describe("las filas", () => {
  it("junta los lotes de un mismo medicamento, cada uno con su costo", () => {
    const r = leer([
      ["777001", "Ibuprofeno 400 mg", "IFA", "2,5", "1,2", "100", "IBU-1", "04/2028", ""],
      ["777001", "Ibuprofeno 400 mg", "IFA", "2,5", "1,1", "40", "IBU-2", "09/2027", ""],
    ]);
    expect(r.problemas).toEqual([]);
    expect(r.medicamentos).toHaveLength(1);
    expect(r.medicamentos[0]).toMatchObject({
      fila: 2,
      codBarra: "777001",
      precio: 2.5,
      costo: 1.2,
      manejaLote: true,
      lotes: [
        { fila: 2, codigo: "IBU-1", vencimiento: "2028-04-30", cantidad: 100, costo: 1.2 },
        { fila: 3, codigo: "IBU-2", vencimiento: "2027-09-30", cantidad: 40, costo: 1.1 },
      ],
    });
  });

  it("sin código, el mismo nombre y laboratorio es el mismo; otro laboratorio es otro", () => {
    const r = leer([
      ["", "Paracetamol 500 mg", "BAGÓ", "1", "", "10", "P1", "01/2028", ""],
      ["", "paracetamol 500 mg", "Bago", "1", "", "5", "P2", "02/2028", ""],
      ["", "Paracetamol 500 mg", "IFA", "1", "", "8", "P3", "03/2028", ""],
    ]);
    expect(r.medicamentos.map((m) => [m.laboratorio, m.lotes.length])).toEqual([
      ["BAGÓ", 2],
      ["IFA", 1],
    ]);
  });

  it("un mismo código con dos nombres es un error del archivo, no un lote más", () => {
    const r = leer([
      ["777009", "Loratadina", "", "3", "", "10", "L1", "01/2028", ""],
      ["777009", "Cetirizina", "", "3", "", "10", "C1", "01/2028", ""],
    ]);
    expect(r.medicamentos).toHaveLength(1);
    expect(r.problemas).toEqual([
      { fila: 3, mensaje: 'El código 777009 ya está en la fila 2 con otro nombre ("Loratadina").' },
    ]);
  });

  it("sin cantidad entra sólo al catálogo; sin lote, como stock sin lote", () => {
    const r = leer([
      ["", "Alcohol en gel", "", "15", "", "", "", "", ""],
      ["", "Barbijo", "", "1", "0,4", "200", "", "", "No"],
    ]);
    expect(r.medicamentos[0].lotes).toEqual([]);
    expect(r.medicamentos[1]).toMatchObject({
      manejaLote: false,
      lotes: [{ fila: 3, cantidad: 200, costo: 0.4 }],
    });
  });

  it("cada problema dice en qué fila está, y el resto se carga igual", () => {
    const r = leer([
      ["", "", "", "5", "", "", "", "", ""],
      ["", "Diclofenaco", "", "", "", "", "", "", ""],
      ["", "Omeprazol", "", "3", "", "10", "OM-1", "", ""],
      ["", "Ranitidina", "", "3", "", "10", "", "05/2028", ""],
      ["", "Venda", "", "3", "", "4", "V-1", "05/2028", "No"],
      ["", "Aspirina", "", "2", "", "", "A-1", "05/2028", ""],
      ["7,79E+12", "Jarabe", "", "9", "", "", "", "", ""],
      ["", "Loratadina", "", "3", "", "12", "LOR-1", "09/2028", ""],
    ]);
    expect(r.problemas.map((p) => [p.fila, p.mensaje])).toEqual([
      [2, "Falta el nombre."],
      [3, "Falta el precio de venta."],
      [4, "El lote OM-1 no tiene vencimiento (MM/AAAA)."],
      [5, "Tiene vencimiento pero no el número de lote."],
      [6, "Dice que no maneja lote, pero trae el lote V-1."],
      [7, "Tiene lote o vencimiento pero no la cantidad."],
      [8, expect.stringContaining("Excel ya le borró dígitos")],
    ]);
    expect(r.medicamentos.map((m) => m.nombre)).toEqual(["Loratadina"]);
    expect(r.filas).toBe(8);
  });

  it("las filas vacías no cuentan ni dan error", () => {
    const r = leer([[], ["", "", ""], ["", "Loratadina", "", "3", "", "", "", "", ""]]);
    expect(r.filas).toBe(1);
    expect(r.problemas).toEqual([]);
  });
});

describe("lo que va a entrar", () => {
  it("cuenta unidades, lotes, lo que entra sin lote y lo ya vencido", () => {
    const r = leer([
      ["", "Ibuprofeno", "", "2", "", "100", "I1", "04/2028", ""],
      ["", "Ibuprofeno", "", "2", "", "5", "I0", "01/2020", ""],
      ["", "Amoxicilina", "", "3", "", "30", "", "", ""],
      ["", "Barbijo", "", "1", "", "200", "", "", "No"],
    ]);
    expect(resumenStock(r.medicamentos, "2026-10-01")).toEqual({
      conStock: 3,
      unidades: 335,
      lotes: 2,
      sinLote: 1,
      vencidos: 1,
    });
  });

  it("se manda de a 100 medicamentos", () => {
    expect(enTandas(Array.from({ length: 250 }, (_, i) => i)).map((t) => t.length)).toEqual([
      100, 100, 50,
    ]);
  });
});
