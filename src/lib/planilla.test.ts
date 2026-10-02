import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { crearXlsx, leerCsv, leerPlanilla, leerXlsx, PlanillaIlegible } from "./planilla";

/**
 * Un .xlsx como lo guarda Excel: los textos en sharedStrings, las celdas
 * vacías que NO vienen, y la primera hoja que no se llama sheet1.
 */
function xlsxComoExcel(): Uint8Array {
  const ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
  const nsR = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  return zipSync({
    "xl/workbook.xml": strToU8(
      `<workbook ${ns} ${nsR}><sheets><sheet name="Stock" sheetId="1" r:id="rId3"/></sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId3" Type="x" Target="worksheets/hoja7.xml"/></Relationships>',
    ),
    "xl/sharedStrings.xml": strToU8(
      `<sst ${ns}><si><t>Nombre</t></si><si><t>Precio</t></si>` +
        // Texto con formato: va en pedazos <r>, y la fonética <rPh> no es texto.
        "<si><r><t>Ibupro</t></r><r><rPr><b/></rPr><t>feno</t></r><rPh><t>X</t></rPh></si></sst>",
    ),
    "xl/worksheets/hoja7.xml": strToU8(
      `<worksheet ${ns}><sheetData>` +
        '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row>' +
        // B2 no viene: la celda vacía no corre el precio a la columna B.
        '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="C2"><v>2.5</v></c></row>' +
        // La fila 3 no existe: la 4 sigue siendo la 4.
        '<row r="4"><c r="A4" t="inlineStr"><is><t>Alcohol &amp; gel</t></is></c>' +
        '<c r="B4" t="b"><v>1</v></c><c r="C4" t="e"><v>#N/A</v></c></row>' +
        "</sheetData></worksheet>",
    ),
  });
}

describe("leer un Excel", () => {
  it("lee la primera hoja con cada celda en su columna y cada fila en su número", () => {
    expect(leerXlsx(xlsxComoExcel())).toEqual([
      ["Nombre", "", "Precio"],
      ["Ibuprofeno", "", "2.5"],
      [],
      ["Alcohol & gel", "VERDADERO", ""],
    ]);
  });

  it("lo que arma crearXlsx se vuelve a leer igual", async () => {
    const libro = crearXlsx([
      {
        nombre: "Medicamentos",
        filas: [
          ["Código", "Nombre", "Precio", "Vencimiento"],
          ["0779001", "Paracetamol <500>", 2.5, "04/2028"],
        ],
        anchos: [16, 30, 10, 14],
        columnasTexto: [0, 3],
      },
      { nombre: "Ayuda", filas: [["Una fila por lote"]] },
    ]);
    // El cero adelante del código y la barra del vencimiento sobreviven.
    expect(await leerPlanilla(new Blob([libro as BlobPart]))).toEqual([
      ["Código", "Nombre", "Precio", "Vencimiento"],
      ["0779001", "Paracetamol <500>", "2.5", "04/2028"],
    ]);
  });

  it("un .xls viejo se rechaza diciendo cómo convertirlo", async () => {
    const xls = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    await expect(leerPlanilla(new Blob([xls as BlobPart]))).rejects.toBeInstanceOf(PlanillaIlegible);
    await expect(leerPlanilla(new Blob([xls as BlobPart]))).rejects.toThrow(/\.xlsx/);
  });

  it("un zip que no es Excel no revienta: no tiene hojas", () => {
    expect(() => leerXlsx(zipSync({ "foto.txt": strToU8("hola") }))).toThrow(PlanillaIlegible);
  });
});

describe("leer un CSV", () => {
  it("el de Excel en español: punto y coma, comillas y tildes de Windows", () => {
    // En Windows-1252 cada letra es un byte: la é de "Analgésicos" es 0xE9,
    // que como UTF-8 no se puede leer.
    const texto = 'Nombre;Categoría\r\n"Paracetamol; 500 mg";Analgésicos\r\n"Jarabe ""Ped""";\r\n';
    const bytes = Uint8Array.from(texto, (c) => c.charCodeAt(0));
    expect(leerCsv(bytes)).toEqual([
      ["Nombre", "Categoría"],
      ["Paracetamol; 500 mg", "Analgésicos"],
      ['Jarabe "Ped"', ""],
    ]);
  });

  it("en UTF-8 con BOM y separado por comas", () => {
    expect(leerCsv(strToU8("﻿Nombre,Precio\nIbuprofeno,\"2,5\"\n"))).toEqual([
      ["Nombre", "Precio"],
      ["Ibuprofeno", "2,5"],
    ]);
  });
});
