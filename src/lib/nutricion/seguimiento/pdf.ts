import type { jsPDF } from "jspdf";
import { entregarPdf, type EntregaPdf } from "../../pdf/tablaPdf";
import { calcularImc, fechaLarga, fmtNumero, hoyIso, tallaEnMetros } from "../calculo";
import {
  AMBAR,
  BORDE,
  colorDeMarca,
  dibujarCabecera,
  dibujarDatos,
  dibujarPies,
  enviarPdfPorWhatsapp,
  FIN,
  FONDO_CUADRO,
  FUENTES,
  GRIS,
  GRIS_CLARO,
  MARCA_NUTRICION,
  MARGEN,
  partir,
  partirPorPartes,
  ROJO,
  sinEspaciosDuros,
  TEXTO,
  usar,
  UTIL,
  type EnvioWhatsapp,
  type Fuente,
} from "../pdfComun";
import { escalonesDeLaSemana, leerDosis, nombreSemana, productoVigente, rachaAntes, textoKg, textoKgTotal, textoProducto, type EscalonesDeLaSemana } from "./formato";
import type { CatalogoSeguimiento, HojaPaciente, Registro, Tratamiento } from "./tipos";

/**
 * El PDF del seguimiento del tratamiento (CONTRATO-nutricion-seguimiento-23nov
 * §7.2, maqueta `PDF.dc.html` SIN la sección de pagos): cabecera con el
 * negocio, los datos del paciente y del tratamiento, cuatro cuadros de
 * resumen, el gráfico del peso y la tabla Semana · Fecha · Peso · Kg bajado ·
 * Dosis · Observaciones (la marca del cambio de producto va en
 * Observaciones). Varias hojas si hace falta, con el encabezado de la tabla en
 * cada una; una semana con observaciones muy largas sigue en la hoja
 * siguiente en vez de cortarse al borde.
 *
 * Texto de verdad (jsPDF con la Helvetica de siempre, como `tablaPdf`): nada
 * de «≈» ni flechas, que esa fuente no tiene. Dato sensible de salud: no va a
 * la consola ni a la telemetría, y el nombre del archivo no lleva ni el nombre
 * ni el carnet.
 */

// ── Lo que dice el papel (sin dibujar, para poder probarlo) ─────────────────

export interface FilaPdfSeguimiento {
  semana: string;
  fecha: string;
  peso: string;
  /** «Bajó 0,7» / «Subió 0,3» / «Igual», con su tono. */
  kg: { texto: string; tono: "bajo" | "subio" | "igual" } | null;
  /** «2,1 desde el inicio». */
  kgTotal: string | null;
  dosis: string;
  /** El motivo de «No se aplicó». */
  dosisDetalle: string | null;
  noSeAplico: boolean;
  /** «Desde esta semana usa Tirze · 15 mg en 0,5 ml (antes TG).» */
  marca: string | null;
  observaciones: string;
}

export interface PuntoPdf {
  semana: number;
  etiqueta: string;
  peso: number | null;
  noSeAplico: boolean;
}

export interface DocumentoSeguimiento {
  negocio: string | null;
  emitido: string;
  paciente: string;
  datos: { etiqueta: string; valor: string }[];
  resumen: { etiqueta: string; valor: string; nota: string }[];
  puntos: PuntoPdf[];
  filas: FilaPdfSeguimiento[];
}

/**
 * Una dosis para el papel: lo anotado y su otro dato, sin «≈» («8 UI · 2,5 mg»;
 * en mg, «2,5 mg · 8 UI»). Con los escalones de su semana, la de un escalón va
 * con los valores del escalón, como en la pantalla (§7.4).
 */
export function dosisParaPdf(r: Pick<Registro, "dosis" | "unidadDosis" | "dosisMg" | "dosisUi"> & Partial<Pick<Registro, "dosisMl">>, escalones?: EscalonesDeLaSemana | null): string {
  if (r.dosis == null || !r.unidadDosis) return "—";
  const l = leerDosis({ dosis: r.dosis, unidadDosis: r.unidadDosis, dosisMg: r.dosisMg, dosisUi: r.dosisUi, dosisMl: r.dosisMl ?? null }, escalones);
  const anotado = `${fmtNumero(r.dosis, 3)} ${r.unidadDosis}`;
  return sinEspaciosDuros(l.otraSinAprox ? `${anotado} · ${l.otraSinAprox}` : anotado);
}

/** Lo que va en el papel, armado del tratamiento que se está mirando. */
export function documentoSeguimiento({
  negocio,
  paciente,
  tratamiento: t,
  catalogo,
  hoy = hoyIso(),
}: {
  negocio: string | null | undefined;
  paciente: HojaPaciente["paciente"];
  tratamiento: Tratamiento;
  /** Para leer cada dosis contra sus escalones (§7.4); sin él, los escalones del tratamiento. */
  catalogo?: Pick<CatalogoSeguimiento, "tratamientos" | "ocultos" | "uiPorMl"> | null;
  hoy?: string;
}): DocumentoSeguimiento {
  const r = t.resumen;
  const actual = productoVigente(t, r.semana);
  const ultimoConPeso = [...t.registros].reverse().find((x) => x.pesoKg != null) ?? null;
  const ultimaSemana = textoKg([...t.registros].reverse().find((x) => x.kgSemana != null)?.kgSemana);
  const total = textoKg(r.kgBajados);
  const imc = (kg: number | null) => {
    const v = calcularImc(kg, paciente.tallaCm);
    return v != null ? `IMC ${fmtNumero(v, 1)}` : "";
  };
  const kg = (n: number | null) => (n == null ? "—" : `${fmtNumero(n, 2)} kg`);
  const d = r.dosisActual;
  const escalones = (semana: number) => escalonesDeLaSemana(t, semana, catalogo);
  const semanaDeLaDosis = rachaAntes(t.registros, Infinity)?.semana;

  const filas: FilaPdfSeguimiento[] = t.registros.map((x) => {
    const k = textoKg(x.kgSemana);
    const marca = x.producto
      ? `Desde esta semana usa ${textoProducto({ nombre: x.producto.nombre, vialMg: x.producto.vialMg ?? null, vialMl: x.producto.vialMl ?? null })}${
          x.producto.anterior ? ` (antes ${x.producto.anterior})` : ""
        }.`
      : null;
    return {
      semana: nombreSemana(x.semana),
      fecha: fechaLarga(x.fecha),
      peso: kg(x.pesoKg),
      kg: k ? { texto: k.texto, tono: k.tono } : null,
      kgTotal: textoKgTotal(x.kgBajados),
      dosis: x.sinDosis ? "No se aplicó" : dosisParaPdf(x, escalones(x.semana)),
      dosisDetalle: x.sinDosis ? x.motivoSinDosis : null,
      noSeAplico: x.sinDosis,
      marca: marca ? sinEspaciosDuros(marca) : null,
      observaciones: x.observaciones?.trim() ?? "",
    };
  });

  const doc: DocumentoSeguimiento = {
    negocio: negocio?.trim() || null,
    emitido: `Emitido el ${fechaLarga(hoy)}`,
    paciente: paciente.nombre,
    datos: [
      { etiqueta: "PACIENTE", valor: paciente.nombre },
      { etiqueta: "CARNET", valor: paciente.ci ? `${paciente.ci}${paciente.ciExpedido ? ` ${paciente.ciExpedido}` : ""}` : "—" },
      { etiqueta: "EDAD", valor: paciente.edad != null ? `${paciente.edad} años` : "—" },
      // En metros con dos decimales, como se dice una talla y como se ve en la pantalla: «1,60 m» (no «1,6 m»).
      { etiqueta: "TALLA", valor: paciente.tallaCm ? `${tallaEnMetros(paciente.tallaCm)} m` : "—" },
      { etiqueta: "PRODUCTO", valor: textoProducto(actual) },
      { etiqueta: "INICIO", valor: fechaLarga(t.inicio) },
      {
        etiqueta: "SEMANAS",
        valor: t.estado === "TERMINADO" && t.terminadoEn ? `${r.semana} (terminó el ${fechaLarga(t.terminadoEn)})` : `${r.semana} de tratamiento`,
      },
      { etiqueta: "DOSIS ACTUAL", valor: d ? dosisParaPdf(d, semanaDeLaDosis != null ? escalones(semanaDeLaDosis) : null) : "—" },
    ],
    resumen: [
      { etiqueta: "PESO INICIAL", valor: kg(r.pesoInicial), nota: imc(r.pesoInicial) },
      { etiqueta: "PESO ACTUAL", valor: kg(r.pesoActual), nota: imc(r.pesoActual) || (ultimoConPeso ? `al ${fechaLarga(ultimoConPeso.fecha)}` : "") },
      {
        etiqueta: total?.tono === "subio" ? "SUBIÓ EN TOTAL" : "BAJÓ EN TOTAL",
        valor: total ? `${total.cifra} kg` : "—",
        nota: total ? `en ${r.semana} ${r.semana === 1 ? "semana" : "semanas"}` : "",
      },
      { etiqueta: "ÚLTIMA SEMANA", valor: ultimaSemana ? `${ultimaSemana.cifra} kg` : "—", nota: ultimaSemana ? ultimaSemana.texto.split(/\s/)[0].toLowerCase() : "" },
    ],
    puntos: t.registros.map((x) => ({ semana: x.semana, etiqueta: x.semana === 0 ? "Inicial" : `Sem. ${x.semana}`, peso: x.pesoKg, noSeAplico: x.sinDosis })),
    filas,
  };
  // El papel no tiene espacios duros (la fuente del PDF no los conoce).
  doc.datos = doc.datos.map((x) => ({ ...x, valor: sinEspaciosDuros(x.valor) }));
  doc.resumen = doc.resumen.map((x) => ({ ...x, valor: sinEspaciosDuros(x.valor), nota: sinEspaciosDuros(x.nota) }));
  doc.filas = doc.filas.map((f) => ({
    ...f,
    peso: sinEspaciosDuros(f.peso),
    kg: f.kg ? { ...f.kg, texto: sinEspaciosDuros(f.kg.texto) } : null,
    kgTotal: f.kgTotal && sinEspaciosDuros(f.kgTotal),
    dosis: sinEspaciosDuros(f.dosis),
  }));
  return doc;
}

// ── Las hojas: qué semana va en cuál, sin cortar nada al borde ──────────────

/** Un renglón de la tabla ya medido: su alto sin las observaciones y sus renglones de observaciones. */
export interface FilaMedida<T> {
  fila: T;
  /** Lo que mide sin contar las observaciones (las otras columnas, con su relleno). */
  altoBase: number;
  lineas: string[];
}

/** Lo que va en una hoja: la fila con los renglones de observaciones que entran ahí (`sigue`: es la continuación). */
export interface FilaEnHoja<T> {
  fila: T;
  lineas: string[];
  sigue: boolean;
  alto: number;
}

/**
 * Reparte las semanas en hojas. Una semana entra entera si cabe; si no cabe
 * en lo que queda pero sí en una hoja nueva, baja entera; si ni en una hoja
 * entera (observaciones de 2000 letras), se parte por renglones de las
 * observaciones y sigue en la hoja siguiente («(sigue)»). Nada queda cortado.
 */
export function paginarFilas<T>(
  filas: FilaMedida<T>[],
  { primera, resto, altoLinea, relleno }: { primera: number; resto: number; altoLinea: number; relleno: number },
): FilaEnHoja<T>[][] {
  const hojas: FilaEnHoja<T>[][] = [[]];
  let libre = primera;
  const altoDe = (base: number, n: number) => Math.max(base, relleno + n * altoLinea);
  const nuevaHoja = () => {
    hojas.push([]);
    libre = resto;
  };
  for (const f of filas) {
    let lineas = f.lineas;
    let sigue = false;
    for (;;) {
      const alto = altoDe(f.altoBase, lineas.length);
      if (alto <= libre) {
        hojas[hojas.length - 1].push({ fila: f.fila, lineas, sigue, alto });
        libre -= alto;
        break;
      }
      // Entera en una hoja nueva, si ahí entra.
      if (alto <= resto) {
        nuevaHoja();
        continue;
      }
      // Más alta que una hoja entera: se parte por las observaciones (al menos 3 renglones acá).
      const entran = Math.floor((libre - relleno) / altoLinea);
      if (entran >= 3 && libre >= f.altoBase) {
        const parte = lineas.slice(0, entran);
        hojas[hojas.length - 1].push({ fila: f.fila, lineas: parte, sigue, alto: altoDe(f.altoBase, parte.length) });
        lineas = lineas.slice(entran);
        sigue = true;
        nuevaHoja();
        continue;
      }
      if (libre >= resto) {
        // Ni en una hoja vacía entra la base (no pasa con las medidas de verdad): va igual.
        hojas[hojas.length - 1].push({ fila: f.fila, lineas, sigue, alto });
        libre = 0;
        break;
      }
      nuevaHoja();
    }
  }
  // La primera puede quedar vacía: la tabla empieza en la hoja siguiente.
  return hojas;
}

// ── El dibujo ───────────────────────────────────────────────────────────────

/** El color de siempre del seguimiento (el verde de nutrición). */
export const MARCA_SEGUIMIENTO = MARCA_NUTRICION;

export { conUnidadesPegadas, type EnvioWhatsapp } from "../pdfComun";

/** Las columnas de la tabla (pt): Semana · Fecha · Peso · Kg bajado · Dosis · Observaciones (lo que sobra). */
const RELLENO_X = 7;
const SEPARACION = 6;
const COLUMNAS = [
  { titulo: "SEMANA", ancho: 52 },
  { titulo: "FECHA", ancho: 54 },
  { titulo: "PESO", ancho: 48 },
  { titulo: "KG BAJADO", ancho: 86 },
  { titulo: "DOSIS", ancho: 86 },
];
const ANCHO_OBS = UTIL - RELLENO_X * 2 - COLUMNAS.reduce((a, c) => a + c.ancho, 0) - SEPARACION * COLUMNAS.length;
const ALTO_CABECERA_TABLA = 24;
const ALTO_LINEA_OBS = 11.5;
const RELLENO_Y = 7;

const F = {
  ...FUENTES,
  cabeceraTabla: { tam: 8, negrita: true, color: "#FFFFFF" },
  semana: { tam: 10, negrita: true },
  celda: { tam: 9.5 },
  obs: { tam: 9.5, color: "#334155" },
  marca: { tam: 9.5, negrita: true, color: "#1E40AF" },
} satisfies Record<string, Fuente>;

/** Mide una semana: cuánto ocupan sus columnas (sin las observaciones) y los renglones de las observaciones. */
function medirFila(pdf: jsPDF, f: FilaPdfSeguimiento): FilaMedida<{ f: FilaPdfSeguimiento; partes: Record<string, string[]> }> {
  const partes: Record<string, string[]> = {
    kgTotal: f.kgTotal ? partir(pdf, f.kgTotal, COLUMNAS[3].ancho, F.chico) : [],
    dosis: partirPorPartes(pdf, f.dosis, COLUMNAS[4].ancho, f.noSeAplico ? { ...F.celda, negrita: true } : F.celda),
    dosisDetalle: f.dosisDetalle ? partir(pdf, f.dosisDetalle, COLUMNAS[4].ancho, F.chico) : [],
  };
  const lineas = [
    ...(f.marca ? partir(pdf, f.marca, ANCHO_OBS, F.marca, true).map((l) => `\u0001${l}`) : []),
    ...(f.observaciones ? partir(pdf, f.observaciones, ANCHO_OBS, F.obs, true) : []),
  ];
  const altoKg = 12 + partes.kgTotal.length * 10;
  const altoDosis = partes.dosis.length * 12 + partes.dosisDetalle.length * 10;
  return { fila: { f, partes }, altoBase: Math.max(30, RELLENO_Y * 2 + Math.max(24, altoKg, altoDosis)), lineas };
}

function cabeceraTabla(pdf: jsPDF, y: number, marca: string) {
  pdf.setFillColor(marca);
  pdf.rect(MARGEN, y, UTIL, ALTO_CABECERA_TABLA, "F");
  usar(pdf, F.cabeceraTabla);
  let x = MARGEN + RELLENO_X;
  for (const c of COLUMNAS) {
    pdf.text(c.titulo, x, y + 15.5, { charSpace: 0.4 });
    x += c.ancho + SEPARACION;
  }
  pdf.text("OBSERVACIONES", x, y + 15.5, { charSpace: 0.4 });
}

function dibujarFila(
  pdf: jsPDF,
  y: number,
  e: FilaEnHoja<{ f: FilaPdfSeguimiento; partes: Record<string, string[]> }>,
  marca: string,
) {
  const { f, partes } = e.fila;
  const arriba = y + RELLENO_Y + 8;
  let x = MARGEN + RELLENO_X;
  const col = (i: number) => {
    const x0 = x;
    x += COLUMNAS[i].ancho + SEPARACION;
    return x0;
  };
  const xs = COLUMNAS.map((_, i) => col(i));
  const xObs = x;
  if (e.sigue) {
    usar(pdf, F.chico);
    pdf.text(`${f.semana} (sigue)`, xs[0], arriba);
  } else {
    usar(pdf, F.semana);
    pdf.text(f.semana, xs[0], arriba);
    usar(pdf, F.celda);
    pdf.text(f.fecha, xs[1], arriba);
    usar(pdf, { ...F.celda, negrita: f.peso !== "—", color: f.peso === "—" ? GRIS_CLARO : TEXTO });
    pdf.text(f.peso, xs[2], arriba);
    if (f.kg) {
      usar(pdf, { ...F.celda, negrita: true, color: f.kg.tono === "bajo" ? marca : f.kg.tono === "subio" ? ROJO : GRIS });
      pdf.text(f.kg.texto, xs[3], arriba);
    } else {
      usar(pdf, { ...F.celda, color: GRIS_CLARO });
      pdf.text("—", xs[3], arriba);
    }
    usar(pdf, F.chico);
    partes.kgTotal.forEach((l, i) => pdf.text(l, xs[3], arriba + 11 + i * 10));
    usar(pdf, f.noSeAplico ? { ...F.celda, negrita: true, color: AMBAR } : F.celda);
    partes.dosis.forEach((l, i) => pdf.text(l, xs[4], arriba + i * 12));
    usar(pdf, F.chico);
    partes.dosisDetalle.forEach((l, i) => pdf.text(l, xs[4], arriba + partes.dosis.length * 12 - 1 + i * 10));
  }
  e.lineas.forEach((l, i) => {
    const esMarca = l.startsWith("\u0001");
    usar(pdf, esMarca ? F.marca : F.obs);
    pdf.text(esMarca ? l.slice(1) : l, xObs, arriba + i * ALTO_LINEA_OBS);
  });
  if (!e.lineas.length && !e.sigue) {
    usar(pdf, { ...F.celda, color: GRIS_CLARO });
    pdf.text("—", xObs, arriba);
  }
  pdf.setDrawColor(BORDE);
  pdf.setLineWidth(0.75);
  pdf.line(MARGEN, y + e.alto, MARGEN + UTIL, y + e.alto);
}

/** El gráfico del peso: la línea por las semanas con peso, el valor arriba de los puntos que entran sin pisarse. */
function dibujarGrafico(pdf: jsPDF, y: number, puntos: PuntoPdf[], marca: string): number {
  const alto = 118;
  const conPeso = puntos.filter((p) => p.peso != null);
  if (!conPeso.length) return y;
  usar(pdf, F.rotulo);
  pdf.text("PESO POR SEMANA (KG)", MARGEN, y + 8, { charSpace: 0.5 });
  const arriba = y + 30;
  const abajo = y + alto - 20;
  const izq = MARGEN + 16;
  const der = MARGEN + UTIL - 16;
  const pesos = conPeso.map((p) => p.peso!);
  let min = Math.min(...pesos);
  let max = Math.max(...pesos);
  if (max - min < 1) {
    min -= 0.5;
    max += 0.5;
  }
  const s0 = puntos[0].semana;
  const s1 = puntos[puntos.length - 1].semana;
  const xDe = (s: number) => (s1 === s0 ? (izq + der) / 2 : izq + ((s - s0) / (s1 - s0)) * (der - izq));
  const yDe = (p: number) => abajo - ((p - min) / (max - min)) * (abajo - arriba);
  pdf.setDrawColor("#E5E7EB");
  pdf.setLineWidth(0.75);
  for (const f of [0, 0.5, 1]) pdf.line(MARGEN, arriba + (abajo - arriba) * f, MARGEN + UTIL, arriba + (abajo - arriba) * f);
  // La línea.
  pdf.setDrawColor(marca);
  pdf.setLineWidth(2.2);
  pdf.setLineJoin("round");
  pdf.setLineCap("round");
  for (let i = 1; i < conPeso.length; i++) pdf.line(xDe(conPeso[i - 1].semana), yDe(conPeso[i - 1].peso!), xDe(conPeso[i].semana), yDe(conPeso[i].peso!));
  // Los «no se aplicó» sin peso: a la altura de la línea, entre sus vecinos.
  const yInterpolado = (s: number) => {
    const a = [...conPeso].reverse().find((p) => p.semana < s);
    const b = conPeso.find((p) => p.semana > s);
    if (a && b) return yDe(a.peso! + ((b.peso! - a.peso!) * (s - a.semana)) / (b.semana - a.semana));
    return yDe((a ?? b)!.peso!);
  };
  const r = conPeso.length > 24 ? 2.2 : 3.6;
  for (const p of puntos) {
    if (p.peso == null && !p.noSeAplico) continue;
    const cx = xDe(p.semana);
    const cy = p.peso != null ? yDe(p.peso) : yInterpolado(p.semana);
    if (p.noSeAplico) {
      pdf.setFillColor("#FFFFFF");
      pdf.setDrawColor(AMBAR);
      pdf.setLineWidth(1.4);
      pdf.circle(cx, cy, r + 0.6, "FD");
    } else {
      pdf.setFillColor(marca);
      pdf.circle(cx, cy, r, "F");
    }
  }
  // Los valores: el primero, el último, el más bajo y los que entran sin pisarse (al menos 30 pt de aire).
  const ancla = new Set([conPeso[0], conPeso[conPeso.length - 1]].map((p) => p.semana));
  const conValor: PuntoPdf[] = [];
  const candidatos = [...conPeso].sort((a, b) => (ancla.has(b.semana) ? 1 : 0) - (ancla.has(a.semana) ? 1 : 0));
  for (const p of candidatos) if (conValor.every((q) => Math.abs(xDe(q.semana) - xDe(p.semana)) >= 30)) conValor.push(p);
  usar(pdf, { tam: 9, negrita: true });
  for (const p of conValor) {
    const t = fmtNumero(p.peso, 2);
    const w = pdf.getTextWidth(t);
    const cx = Math.min(Math.max(xDe(p.semana), MARGEN + w / 2), MARGEN + UTIL - w / 2);
    pdf.text(t, cx, yDe(p.peso!) - 6, { align: "center" });
  }
  // Las semanas abajo: una de cada tanto, siempre la primera y la última.
  usar(pdf, { tam: 8.5, color: GRIS });
  const conEtiqueta: PuntoPdf[] = [];
  const todos = [puntos[0], puntos[puntos.length - 1], ...puntos.slice(1, -1)];
  for (const p of todos) {
    if (!p || conEtiqueta.includes(p)) continue;
    if (conEtiqueta.every((q) => Math.abs(xDe(q.semana) - xDe(p.semana)) >= 40)) conEtiqueta.push(p);
  }
  for (const p of conEtiqueta) {
    const w = pdf.getTextWidth(p.etiqueta);
    const cx = Math.min(Math.max(xDe(p.semana), MARGEN + w / 2), MARGEN + UTIL - w / 2);
    pdf.text(p.etiqueta, cx, abajo + 15, { align: "center" });
  }
  let fin = abajo + 22;
  if (puntos.some((p) => p.noSeAplico)) {
    pdf.setFillColor("#FFFFFF");
    pdf.setDrawColor(AMBAR);
    pdf.setLineWidth(1.2);
    pdf.circle(MARGEN + 4, fin + 3, 3, "FD");
    usar(pdf, { tam: 8.5, color: GRIS });
    pdf.text("Semana en que no se aplicó la dosis", MARGEN + 12, fin + 6);
    fin += 12;
  }
  return fin;
}

/** Dibuja el documento entero en `pdf` (A4, en puntos). */
export function dibujarSeguimiento(pdf: jsPDF, doc: DocumentoSeguimiento, marca = MARCA_SEGUIMIENTO) {
  // ── Cabecera ──
  let y = dibujarCabecera(pdf, { titulo: "Seguimiento del tratamiento", emitido: doc.emitido, negocio: doc.negocio }, marca);

  // ── Datos del paciente y del tratamiento: 4 columnas ──
  y = dibujarDatos(pdf, y, doc.datos) + 4;

  // ── Los cuatro cuadros ──
  const anchoCuadro = (UTIL - 3 * 9) / 4;
  const altoCuadro = 58;
  doc.resumen.forEach((k, i) => {
    const x = MARGEN + i * (anchoCuadro + 9);
    pdf.setFillColor(FONDO_CUADRO);
    pdf.setDrawColor(BORDE);
    pdf.setLineWidth(0.75);
    pdf.roundedRect(x, y, anchoCuadro, altoCuadro, 8, 8, "FD");
    usar(pdf, F.rotulo);
    pdf.text(k.etiqueta, x + 10, y + 15, { charSpace: 0.5 });
    usar(pdf, F.cuadroValor);
    pdf.text(k.valor, x + 10, y + 35);
    if (k.nota) {
      usar(pdf, F.cuadroNota);
      pdf.text(partir(pdf, k.nota, anchoCuadro - 20, F.cuadroNota)[0] ?? "", x + 10, y + 49);
    }
  });
  y += altoCuadro + 16;

  // ── El gráfico ──
  y = dibujarGrafico(pdf, y, doc.puntos, marca) + 12;

  // ── La tabla, en las hojas que hagan falta ──
  const medidas = doc.filas.map((f) => medirFila(pdf, f));
  const hojas = paginarFilas(medidas, {
    primera: FIN - y - ALTO_CABECERA_TABLA,
    resto: FIN - MARGEN - ALTO_CABECERA_TABLA,
    altoLinea: ALTO_LINEA_OBS,
    relleno: RELLENO_Y * 2 + 4,
  });
  hojas.forEach((hoja, n) => {
    if (n > 0) {
      pdf.addPage();
      y = MARGEN;
    }
    // Al pie de la primera no entraba ni una semana: el encabezado de la tabla no queda solo.
    if (!hoja.length) return;
    cabeceraTabla(pdf, y, marca);
    y += ALTO_CABECERA_TABLA;
    for (const e of hoja) {
      dibujarFila(pdf, y, e, marca);
      y += e.alto;
    }
  });

  // ── El pie de cada hoja ──
  dibujarPies(pdf, `Seguimiento del tratamiento · ${doc.paciente}`);
}

/** El PDF ya armado. jsPDF se carga recién acá: no pesa en el resto de la web. */
export async function pdfDelSeguimiento(doc: DocumentoSeguimiento, marca = colorDeMarca()): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  pdf.setProperties({ title: "Seguimiento del tratamiento" });
  dibujarSeguimiento(pdf, doc, marca);
  return pdf.output("blob");
}

/** El nombre del archivo: sin el nombre ni el carnet del paciente (dato sensible). */
export const nombreDelPdf = (hoy = hoyIso()) => `seguimiento-tratamiento-${hoy}.pdf`;

/** «Descargar PDF»: en el teléfono y la tablet, compartir el archivo; en la PC, «Guardar como» o la descarga (`entregarPdf`). */
export async function bajarPdfSeguimiento(doc: DocumentoSeguimiento): Promise<EntregaPdf> {
  return entregarPdf(await pdfDelSeguimiento(doc), nombreDelPdf());
}

/**
 * «Enviar por WhatsApp» (ver `enviarPdfPorWhatsapp`): en el teléfono y la
 * tablet, el diálogo de compartir con el PDF; en la PC, el chat del paciente
 * (abierto ANTES de armar el PDF, mientras dura el clic) y el PDF descargado.
 */
export async function enviarPdfSeguimientoPorWhatsapp(doc: DocumentoSeguimiento, telefono: string | null): Promise<EnvioWhatsapp> {
  return enviarPdfPorWhatsapp({
    texto: `Seguimiento del tratamiento al ${fechaLarga(hoyIso())}.`,
    telefono,
    nombreArchivo: nombreDelPdf(),
    armar: () => pdfDelSeguimiento(doc),
  });
}
