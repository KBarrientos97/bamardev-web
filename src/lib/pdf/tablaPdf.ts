import type { jsPDF } from "jspdf";
import { esCelular } from "../compartirTicket";

/**
 * Un reporte en PDF: el título, una tabla con grupos (las categorías) y su
 * total, y las notas. Es el mismo papel que exporta la app
 * (`ui/util/ExportadorPdf.kt`): A4, texto de verdad, cada columna del ancho de
 * su cifra más larga y el nombre con lo que sobra.
 *
 * Existe porque el cliente lo pidió así en el celular (Productos vendidos y
 * Ventas y ganancia, 5-nov): un PDF se ve igual en cualquier lado y se manda
 * por WhatsApp. Los otros reportes siguen bajando su Excel.
 *
 * No sabe de plata: recibe los textos ya formateados.
 */
export interface DocumentoPdf {
  titulo: string;
  /** Arriba del título, en el color de la marca. */
  negocio?: string | null;
  /** El período o el turno. */
  subtitulo: string;
  /** "9 productos · 32 unidades · Ganancia Bs 431,00". */
  resumen: string;
  /** La primera es la del nombre; las demás, de cifras alineadas a la derecha. */
  columnas: string[];
  grupos: GrupoPdf[];
  total: TotalPdf;
  notas?: string[];
}

export interface GrupoPdf {
  titulo: string;
  /** Una por cada columna de cifras. */
  celdas: CeldaPdf[];
  filas: FilaPdf[];
}

export interface FilaPdf {
  nombre: string;
  /** Un renglón chico debajo del nombre: "Bs 56,00 c/u". */
  detalle?: string;
  celdas: CeldaPdf[];
}

export interface TotalPdf {
  etiqueta: string;
  celdas: CeldaPdf[];
}

/** `apagado`: dato de apoyo o que no se pudo calcular. `negativo`: una pérdida, en rojo. */
export type TonoPdf = "normal" | "apagado" | "negativo";

export interface CeldaPdf {
  texto: string;
  tono?: TonoPdf;
}

// ── Medidas (puntos de A4), las mismas de la app ────────────────────────────

const ANCHO = 595;
const ALTO = 842;
const MARGEN = 40;
const RELLENO = 14;
const RADIO = 10;
const SEPARACION = 16;
const ANCHO_NOMBRE_MIN = 120;
const ALTO_PIE = 16;
const ALTO_CABECERA = 22;
const INICIO_RESTO = MARGEN + 20;
const FIN_DE_HOJA = ALTO - MARGEN - ALTO_PIE;

const NEGRO = "#111827";
const GRIS = "#6B7280";
const GRIS_CLARO = "#9CA3AF";
const BORDE = "#E5E7EB";
const ROJO = "#B91C1C";
export const MARCA_POR_DEFECTO = "#0F7B5F";

/** Un renglón de la tabla ya medido. */
export type Renglon =
  | { tipo: "grupo"; alto: number; grupo: GrupoPdf }
  | { tipo: "fila"; alto: number; fila: FilaPdf; lineas: string[] }
  | { tipo: "total"; alto: number; total: TotalPdf };

/**
 * Dónde se corta cada hoja. Dos reglas, las de la app (`PaginasPdf.kt`): una
 * categoría no queda sola al pie (su título baja con su primer producto) y el
 * TOTAL no arranca una hoja solo (se lleva el último producto).
 *
 * `disponible(i)` es cuánto alto entra en la hoja i (la primera tiene el
 * encabezado). Un bloque más alto que una hoja entera va igual, solo.
 */
export function repartirEnHojas(renglones: Renglon[], disponible: (hoja: number) => number): Renglon[][] {
  const bloques: Renglon[][] = [];
  for (let i = 0; i < renglones.length; i++) {
    const r = renglones[i];
    const anterior = bloques[bloques.length - 1];
    const ultimoDelAnterior = anterior?.[anterior.length - 1];
    if (r.tipo === "total" && anterior) anterior.push(r);
    else if (r.tipo === "fila" && ultimoDelAnterior?.tipo === "grupo") anterior.push(r);
    else bloques.push([r]);
  }
  // El total se lleva la última fila: si el bloque anterior al total quedó con
  // [fila, total] ya está; si el total cayó junto a un grupo entero, igual
  // viajan juntos.
  const hojas: Renglon[][] = [[]];
  let usado = 0;
  for (const b of bloques) {
    const alto = b.reduce((a, r) => a + r.alto, 0);
    const hoja = hojas.length - 1;
    if (usado + alto > disponible(hoja) && hojas[hoja].length > 0) {
      hojas.push([]);
      usado = 0;
    }
    hojas[hojas.length - 1].push(...b);
    usado += alto;
  }
  return hojas;
}

/** Los espacios raros de `toLocaleString` ("p. m." con espacio fino) no existen en la fuente del PDF. */
export function limpio(texto: string): string {
  return texto.replace(/[   ]/g, " ");
}

/** Arma el PDF y lo entrega (ver `entregarPdf`). jsPDF se carga recién acá: no pesa en el resto de la web. */
export async function bajarPdf(nombreArchivo: string, doc: DocumentoPdf, marca = colorDeMarca()): Promise<EntregaPdf> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  dibujar(pdf, doc, marca, new Date());
  return entregarPdf(pdf.output("blob"), nombreArchivo);
}

/** Cómo llegó el PDF a quien lo pidió. `cancelado`: cerró el diálogo sin elegir; no es un error. */
export type EntregaPdf = "compartido" | "guardado" | "descargado" | "cancelado";

/** El diálogo "Guardar como" de Chrome y Edge (File System Access). Firefox y Safari no lo tienen. */
type ElegirDestino = (opciones: {
  suggestedName?: string;
  types?: { description?: string; accept: Record<string, string[]> }[];
}) => Promise<{ createWritable(): Promise<{ write(datos: Blob): Promise<void>; close(): Promise<void> }> }>;

/**
 * Entrega el PDF como lo espera cada equipo (Kevin, 11-nov: "en el celular
 * debe compartir a WhatsApp como en Android; en una PC debe descargarlo donde
 * quiera").
 *
 * - Celular o tablet: el diálogo de compartir del sistema, con el archivo
 *   (ahí se elige WhatsApp y el chat). `pdf.save()` ahí bajaba el archivo a
 *   una carpeta que nadie abre —o no hacía nada visible— y el botón parecía
 *   roto.
 * - Compu con "Guardar como" (Chrome, Edge): elige la carpeta y el nombre.
 * - Si no (Firefox, Safari, o un equipo que no comparte archivos): la
 *   descarga de siempre, a la carpeta de descargas.
 *
 * Se decide por el celular y no por si el navegador comparte: Chrome en
 * Windows también comparte archivos, y en la PC abriría el diálogo de Windows
 * en vez de guardar (lo mismo que `enviarPorWhatsapp`).
 *
 * El navegador sólo deja compartir o elegir carpeta desde un gesto del
 * usuario: hay que llamarlo desde el clic, sin esperas largas en el medio.
 */
export async function entregarPdf(blob: Blob, nombreArchivo: string): Promise<EntregaPdf> {
  const archivo = new File([blob], nombreArchivo, { type: "application/pdf" });
  if (
    esCelular() &&
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [archivo] })
  ) {
    try {
      await navigator.share({ files: [archivo], title: nombreArchivo });
      return "compartido";
    } catch (e) {
      if (cancelado(e)) return "cancelado";
      // El diálogo no se pudo abrir: queda la descarga.
    }
  }
  const elegir = (window as Window & { showSaveFilePicker?: ElegirDestino }).showSaveFilePicker;
  if (typeof elegir === "function") {
    try {
      const destino = await elegir.call(window, {
        suggestedName: nombreArchivo,
        types: [{ description: "PDF", accept: { "application/pdf": [".pdf"] } }],
      });
      const escritura = await destino.createWritable();
      await escritura.write(blob);
      await escritura.close();
      return "guardado";
    } catch (e) {
      if (cancelado(e)) return "cancelado";
      // Sin permiso (un iframe, http): la descarga de siempre.
    }
  }
  descargar(blob, nombreArchivo);
  return "descargado";
}

/** Cerrar el diálogo del sistema sin elegir nada no es un error que mostrar. */
function cancelado(e: unknown): boolean {
  return e instanceof DOMException && e.name === "AbortError";
}

function descargar(blob: Blob, nombreArchivo: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo;
  a.click();
  URL.revokeObjectURL(url);
}

/** El verde (o el color) del tema del negocio; sin pantalla, el de siempre. */
function colorDeMarca(): string {
  if (typeof document === "undefined") return MARCA_POR_DEFECTO;
  const v = getComputedStyle(document.documentElement).getPropertyValue("--color-primary-700").trim();
  return /^#[0-9a-f]{6}$/i.test(v) ? v : MARCA_POR_DEFECTO;
}

type Fuente = { tam: number; negrita?: boolean; color?: string };

const F = {
  texto: { tam: 10.5 },
  cifra: { tam: 10.5, negrita: true },
  detalle: { tam: 9, color: GRIS_CLARO },
  cabecera: { tam: 8.5, negrita: true, color: GRIS },
  grupo: { tam: 9.5, negrita: true },
  totalEtiqueta: { tam: 12, negrita: true },
  nota: { tam: 9, color: GRIS_CLARO },
  pie: { tam: 8, color: GRIS_CLARO },
} satisfies Record<string, Fuente>;

function usar(pdf: jsPDF, f: Fuente, color?: string) {
  pdf.setFont("helvetica", f.negrita ? "bold" : "normal");
  pdf.setFontSize(f.tam);
  pdf.setTextColor(color ?? f.color ?? NEGRO);
}

function ancho(pdf: jsPDF, texto: string, f: Fuente): number {
  usar(pdf, f);
  return pdf.getTextWidth(limpio(texto));
}

/** Corta [texto] al ancho, en dos renglones como mucho; el segundo termina en "…" si no entra. */
function enDosRenglones(pdf: jsPDF, texto: string, max: number, f: Fuente): string[] {
  usar(pdf, f);
  const lineas = pdf.splitTextToSize(limpio(texto), max) as string[];
  if (lineas.length <= 2) return lineas;
  let segunda = lineas.slice(1).join(" ");
  while (segunda.length > 1 && pdf.getTextWidth(`${segunda}…`) > max) segunda = segunda.slice(0, -1);
  return [lineas[0], `${segunda.trimEnd()}…`];
}

function dibujar(pdf: jsPDF, doc: DocumentoPdf, marca: string, ahora: Date) {
  const columnasCifra = doc.columnas.length - 1;
  const tamTotal = doc.columnas.length > 3 ? 11 : 17;
  const fTotalCifra: Fuente = { tam: tamTotal, negrita: true };
  const anchoTabla = ANCHO - MARGEN * 2 - RELLENO * 2;
  const inicioTabla = MARGEN + RELLENO;

  // Cada columna de cifras mide su texto más ancho (la cabecera incluida).
  const anchos = Array.from({ length: columnasCifra }, (_, i) => {
    const textos: [string, Fuente][] = [[doc.columnas[i + 1], F.cabecera]];
    for (const g of doc.grupos) {
      textos.push([g.celdas[i]?.texto ?? "", F.grupo]);
      for (const f of g.filas) textos.push([f.celdas[i]?.texto ?? "", F.cifra]);
    }
    textos.push([doc.total.celdas[i]?.texto ?? "", fTotalCifra]);
    return Math.max(...textos.map(([t, f]) => ancho(pdf, t, f))) + SEPARACION;
  });
  const anchoNombre = Math.max(ANCHO_NOMBRE_MIN, anchoTabla - anchos.reduce((a, b) => a + b, 0));
  // El borde derecho de cada columna de cifras.
  const bordes: number[] = [];
  let x = inicioTabla + anchoNombre;
  for (const a of anchos) {
    x += a;
    bordes.push(x);
  }

  const renglones: Renglon[] = [];
  for (const g of doc.grupos) {
    renglones.push({ tipo: "grupo", alto: 10 + F.grupo.tam + 9, grupo: g });
    for (const f of g.filas) {
      const lineas = enDosRenglones(pdf, f.nombre, anchoNombre - 8, F.texto);
      const alto = 8 + lineas.length * 13 + (f.detalle ? 11 : 0) + 4;
      renglones.push({ tipo: "fila", alto, fila: f, lineas });
    }
  }
  renglones.push({ tipo: "total", alto: 14 + tamTotal + 14, total: doc.total });

  // El encabezado de la primera hoja.
  const encabezado: { texto: string; f: Fuente; color?: string; alto: number }[] = [];
  if (doc.negocio) encabezado.push({ texto: doc.negocio, f: { tam: 10.5, negrita: true }, color: marca, alto: 16 });
  encabezado.push({ texto: doc.titulo, f: { tam: 22, negrita: true }, alto: 28 });
  encabezado.push({ texto: doc.subtitulo, f: { tam: 10.5, color: GRIS }, alto: 22 });
  if (doc.resumen) encabezado.push({ texto: doc.resumen, f: { tam: 10, color: GRIS }, alto: 22 });
  const altoEncabezado = encabezado.reduce((a, e) => a + e.alto, 0) + 6;
  const inicioPrimera = MARGEN + altoEncabezado;

  const hojas = repartirEnHojas(renglones, (h) =>
    (h === 0 ? FIN_DE_HOJA - inicioPrimera : FIN_DE_HOJA - INICIO_RESTO) - ALTO_CABECERA - RELLENO * 2,
  );

  const cifra = (c: CeldaPdf | undefined, i: number, y: number, f: Fuente, color: string) => {
    if (!c?.texto) return;
    const tono = c.tono === "negativo" ? ROJO : c.tono === "apagado" ? GRIS : color;
    usar(pdf, c.tono === "apagado" ? { ...f, negrita: false } : f, tono);
    pdf.text(limpio(c.texto), bordes[i], y, { align: "right" });
  };

  hojas.forEach((hoja, n) => {
    if (n > 0) pdf.addPage();
    let y = MARGEN;
    if (n === 0) {
      for (const e of encabezado) {
        usar(pdf, e.f, e.color);
        pdf.text(limpio(e.texto), MARGEN, y + e.f.tam);
        y += e.alto;
      }
      y += 6;
    } else {
      y = INICIO_RESTO;
    }

    const inicioCarton = y;
    y += RELLENO;
    // La cabecera de las columnas, en cada hoja.
    usar(pdf, F.cabecera);
    pdf.text(limpio(doc.columnas[0]), inicioTabla, y + F.cabecera.tam);
    doc.columnas.slice(1).forEach((c, i) => pdf.text(limpio(c), bordes[i], y + F.cabecera.tam, { align: "right" }));
    y += ALTO_CABECERA;

    for (const r of hoja) {
      if (r.tipo === "grupo") {
        const base = y + 10 + F.grupo.tam;
        usar(pdf, F.grupo, marca);
        pdf.text(limpio(r.grupo.titulo.toLocaleUpperCase("es")), inicioTabla, base);
        r.grupo.celdas.forEach((c, i) => cifra(c, i, base, F.grupo, marca));
        pdf.setDrawColor(BORDE);
        pdf.setLineWidth(0.8);
        pdf.line(inicioTabla, base + 6, ANCHO - MARGEN - RELLENO, base + 6);
      } else if (r.tipo === "fila") {
        let base = y + 8 + 10.5;
        usar(pdf, F.texto);
        for (const l of r.lineas) {
          pdf.text(l, inicioTabla, base);
          base += 13;
        }
        const primera = y + 8 + 10.5;
        r.fila.celdas.forEach((c, i) => cifra(c, i, primera, F.cifra, NEGRO));
        if (r.fila.detalle) {
          usar(pdf, F.detalle);
          pdf.text(limpio(r.fila.detalle), inicioTabla, base - 2);
        }
      } else {
        pdf.setDrawColor(BORDE);
        pdf.setLineWidth(0.8);
        pdf.line(inicioTabla, y + 6, ANCHO - MARGEN - RELLENO, y + 6);
        const base = y + 14 + tamTotal;
        usar(pdf, F.totalEtiqueta);
        pdf.text(limpio(r.total.etiqueta), inicioTabla, base);
        r.total.celdas.forEach((c, i) => cifra(c, i, base, fTotalCifra, marca));
      }
      y += r.alto;
    }
    y += RELLENO;
    pdf.setDrawColor(BORDE);
    pdf.setLineWidth(0.8);
    pdf.roundedRect(MARGEN, inicioCarton, ANCHO - MARGEN * 2, y - inicioCarton, RADIO, RADIO, "S");

    // Las notas van debajo de la tabla, en la última hoja.
    if (n === hojas.length - 1 && doc.notas?.length) {
      usar(pdf, F.nota);
      let yn = y + 16;
      for (const nota of doc.notas) {
        const lineas = pdf.splitTextToSize(limpio(nota), ANCHO - MARGEN * 2) as string[];
        for (const l of lineas) {
          if (yn > FIN_DE_HOJA) break;
          pdf.text(l, MARGEN, yn);
          yn += 11;
        }
        yn += 4;
      }
    }
  });

  // El pie de cada hoja, cuando ya se sabe cuántas son.
  const total = pdf.getNumberOfPages();
  const generado = `Generado el ${dosCifras(ahora.getDate())}/${dosCifras(ahora.getMonth() + 1)}/${ahora.getFullYear()} ${dosCifras(ahora.getHours())}:${dosCifras(ahora.getMinutes())}`;
  for (let p = 1; p <= total; p++) {
    pdf.setPage(p);
    usar(pdf, F.pie);
    pdf.text(generado, MARGEN, ALTO - MARGEN + 4);
    pdf.text(`Página ${p} de ${total}`, ANCHO - MARGEN, ALTO - MARGEN + 4, { align: "right" });
  }
}

const dosCifras = (n: number) => String(n).padStart(2, "0");
