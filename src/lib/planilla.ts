import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

/**
 * Leer y armar planillas sin Excel: un .xlsx es un .zip con XML adentro.
 * `fflate` lo abre y el navegador lee el XML.
 *
 * Todo se lee como TEXTO, tal como está en la celda, y quien usa la planilla
 * decide qué es cada columna. Interpretar acá ("esto parece una fecha") es lo
 * que hace que un código de barras pierda los ceros o que "04/2028" pase a ser
 * el 1 de abril.
 */

/** Las filas de la primera hoja; la fila 1 del Excel es la posición 0. */
export type Filas = string[][];

/** Un archivo que no se puede leer, con lo que hay que hacer para que sí. */
export class PlanillaIlegible extends Error {}

/** La primera hoja de un .xlsx, o un .csv. */
export async function leerPlanilla(archivo: Blob): Promise<Filas> {
  const datos = await bytesDe(archivo);
  if (empiezaCon(datos, [0x50, 0x4b, 0x03, 0x04])) return leerXlsx(datos);
  // El .xls de antes de 2007 es otro formato entero, no un zip.
  if (empiezaCon(datos, [0xd0, 0xcf, 0x11, 0xe0])) {
    throw new PlanillaIlegible(
      'Es un Excel viejo (.xls). Abrilo en Excel y guardalo como "Libro de Excel (.xlsx)".',
    );
  }
  return leerCsv(datos);
}

async function bytesDe(archivo: Blob): Promise<Uint8Array> {
  if (typeof archivo.arrayBuffer === "function") {
    return new Uint8Array(await archivo.arrayBuffer());
  }
  return new Promise((ok, mal) => {
    const lector = new FileReader();
    lector.onload = () => ok(new Uint8Array(lector.result as ArrayBuffer));
    lector.onerror = () => mal(lector.error);
    lector.readAsArrayBuffer(archivo);
  });
}

function empiezaCon(datos: Uint8Array, firma: number[]): boolean {
  return firma.every((b, i) => datos[i] === b);
}

// ── .xlsx ───────────────────────────────────────────────────────────────────

export function leerXlsx(datos: Uint8Array): Filas {
  let partes: Record<string, Uint8Array>;
  try {
    partes = unzipSync(datos, {
      filter: (f) => f.name.endsWith(".xml") || f.name.endsWith(".rels"),
    });
  } catch {
    throw new PlanillaIlegible("No se pudo abrir: el archivo no parece un Excel (.xlsx).");
  }
  const xml = (ruta: string) => {
    const parte = partes[ruta];
    return parte ? new DOMParser().parseFromString(strFromU8(parte), "application/xml") : null;
  };

  const hoja = xml(rutaPrimeraHoja(xml("xl/workbook.xml"), xml("xl/_rels/workbook.xml.rels")));
  if (!hoja) throw new PlanillaIlegible("El Excel no tiene ninguna hoja.");
  const compartidos = porNombre(xml("xl/sharedStrings.xml"), "si").map(textoDe);

  const filas: Filas = [];
  for (const fila of porNombre(hoja, "row")) {
    const numero = Number(fila.getAttribute("r")) || filas.length + 1;
    const celdas: string[] = [];
    let siguiente = 0;
    for (const c of hijos(fila, "c")) {
      // La celda dice en qué columna está: las vacías no vienen, y contarlas
      // en orden correría los datos de columna.
      const ref = c.getAttribute("r");
      const col = ref ? columnaDe(ref) : siguiente;
      celdas[col] = valorDe(c, compartidos);
      siguiente = col + 1;
    }
    filas[numero - 1] = Array.from(celdas, (v) => v ?? "");
  }
  return Array.from(filas, (f) => f ?? []);
}

/** La primera hoja del libro, que no siempre se llama sheet1. */
function rutaPrimeraHoja(libro: Document | null, rels: Document | null): string {
  const hoja = porNombre(libro, "sheet")[0];
  const id = hoja?.getAttributeNS(NS_REL, "id") || hoja?.getAttribute("r:id");
  const destino = porNombre(rels, "Relationship")
    .find((r) => r.getAttribute("Id") === id)
    ?.getAttribute("Target");
  if (!destino) return "xl/worksheets/sheet1.xml";
  return destino.startsWith("/") ? destino.slice(1) : `xl/${destino}`;
}

function valorDe(c: Element, compartidos: string[]): string {
  const v = hijos(c, "v")[0]?.textContent ?? "";
  switch (c.getAttribute("t")) {
    case "s":
      return compartidos[Number(v)] ?? "";
    case "inlineStr": {
      const is = hijos(c, "is")[0];
      return is ? textoDe(is) : "";
    }
    case "b":
      return v === "1" ? "VERDADERO" : "FALSO";
    case "e":
      // #N/A, #¡VALOR!: un error de fórmula no es un dato.
      return "";
    default:
      return v;
  }
}

/** El texto de un <si> o un <is>: su <t>, o la suma de los <r> si tiene formato. */
function textoDe(el: Element): string {
  let texto = "";
  for (const hijo of Array.from(el.children)) {
    if (hijo.localName === "t") texto += hijo.textContent ?? "";
    else if (hijo.localName === "r") texto += hijos(hijo, "t").map((t) => t.textContent).join("");
  }
  return texto;
}

/** "AB12" → 27 (la columna, desde 0). */
function columnaDe(ref: string): number {
  let n = 0;
  for (const letra of ref.replace(/\d+$/, "").toUpperCase()) n = n * 26 + letra.charCodeAt(0) - 64;
  return n - 1;
}

function porNombre(doc: Document | null, nombre: string): Element[] {
  return doc ? Array.from(doc.getElementsByTagNameNS("*", nombre)) : [];
}

function hijos(el: Element, nombre: string): Element[] {
  return Array.from(el.children).filter((h) => h.localName === nombre);
}

// ── .csv ────────────────────────────────────────────────────────────────────

export function leerCsv(datos: Uint8Array): Filas {
  const texto = decodificar(datos);
  return partirCsv(texto, separadorDe(texto));
}

/**
 * UTF-8 si lo es; si no, Windows-1252. "Guardar como CSV" en el Excel de
 * Windows escribe en Windows-1252, y leerlo como UTF-8 rompe cada tilde: el
 * "Ibuprofeno jarabe" pasa, pero "Analgésicos" llega como "Analg�sicos".
 */
function decodificar(datos: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(datos).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(datos);
  }
}

/** El Excel en español separa con punto y coma; otros sistemas, con coma o tab. */
function separadorDe(texto: string): string {
  const primera = texto.split(/\r?\n/, 1)[0] ?? "";
  const cuenta = (s: string) => primera.split(s).length - 1;
  return [";", ",", "\t"].reduce((mejor, s) => (cuenta(s) > cuenta(mejor) ? s : mejor), ",");
}

function partirCsv(texto: string, sep: string): Filas {
  const filas: Filas = [];
  let fila: string[] = [];
  let celda = "";
  let entreComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (entreComillas) {
      if (c === '"' && texto[i + 1] === '"') {
        celda += '"';
        i++;
      } else if (c === '"') entreComillas = false;
      else celda += c;
    } else if (c === '"') entreComillas = true;
    else if (c === sep) {
      fila.push(celda);
      celda = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      fila.push(celda);
      filas.push(fila);
      fila = [];
      celda = "";
    } else celda += c;
  }
  if (celda || fila.length) {
    fila.push(celda);
    filas.push(fila);
  }
  return filas;
}

// ── Armar un .xlsx ──────────────────────────────────────────────────────────

export interface HojaNueva {
  nombre: string;
  /** La primera fila va en negrita y queda fija al bajar. */
  filas: (string | number | null)[][];
  /** Ancho de cada columna, en caracteres. */
  anchos?: number[];
  /**
   * Columnas (desde 0) con formato Texto: lo que se escriba ahí queda como se
   * escribió. Sin esto, Excel convierte "04/2028" en el 1 de abril y un código
   * de barras largo en "7,79E+12".
   */
  columnasTexto?: number[];
}

const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_PAQ = "http://schemas.openxmlformats.org/package/2006/relationships";
const CABECERA = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

/** Un libro de Excel con estas hojas, listo para bajar. */
export function crearXlsx(hojas: HojaNueva[]): Uint8Array {
  const partes: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      `${CABECERA}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        hojas
          .map(
            (_, i) =>
              `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
          )
          .join("") +
        "</Types>",
    ),
    "_rels/.rels": strToU8(
      `${CABECERA}<Relationships xmlns="${NS_PAQ}"><Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    "xl/workbook.xml": strToU8(
      `${CABECERA}<workbook xmlns="${NS}" xmlns:r="${NS_REL}"><sheets>` +
        hojas
          .map((h, i) => `<sheet name="${escapar(h.nombre)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
          .join("") +
        "</sheets></workbook>",
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `${CABECERA}<Relationships xmlns="${NS_PAQ}">` +
        hojas
          .map(
            (_, i) =>
              `<Relationship Id="rId${i + 1}" Type="${NS_REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
          )
          .join("") +
        `<Relationship Id="rId${hojas.length + 1}" Type="${NS_REL}/styles" Target="styles.xml"/>` +
        "</Relationships>",
    ),
    // Tres formatos: el normal, Texto (49) y Texto en negrita para los títulos.
    "xl/styles.xml": strToU8(
      `${CABECERA}<styleSheet xmlns="${NS}">` +
        '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
        '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
        '<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
        '<xf numFmtId="49" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/></cellXfs>' +
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
        "</styleSheet>",
    ),
  };
  hojas.forEach((h, i) => {
    partes[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(hojaXml(h));
  });
  return zipSync(partes);
}

function hojaXml(h: HojaNueva): string {
  const texto = new Set(h.columnasTexto ?? []);
  const cols = (h.anchos ?? [])
    .map(
      (ancho, i) =>
        `<col min="${i + 1}" max="${i + 1}" width="${ancho}" customWidth="1"${texto.has(i) ? ' style="1"' : ""}/>`,
    )
    .join("");
  const filas = h.filas
    .map((fila, f) => {
      const celdas = fila
        .map((valor, c) => {
          if (valor == null || valor === "") return "";
          const ref = `${letraDe(c)}${f + 1}`;
          const estilo = f === 0 ? ' s="2"' : texto.has(c) ? ' s="1"' : "";
          return typeof valor === "number"
            ? `<c r="${ref}"${estilo}><v>${valor}</v></c>`
            : `<c r="${ref}" t="inlineStr"${estilo}><is><t xml:space="preserve">${escapar(valor)}</t></is></c>`;
        })
        .join("");
      return `<row r="${f + 1}">${celdas}</row>`;
    })
    .join("");
  return (
    `${CABECERA}<worksheet xmlns="${NS}">` +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    (cols ? `<cols>${cols}</cols>` : "") +
    `<sheetData>${filas}</sheetData></worksheet>`
  );
}

/** 0 → "A", 27 → "AB". */
function letraDe(col: number): string {
  let n = col + 1;
  let letras = "";
  while (n > 0) {
    const resto = (n - 1) % 26;
    letras = String.fromCharCode(65 + resto) + letras;
    n = Math.floor((n - 1) / 26);
  }
  return letras;
}

function escapar(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
