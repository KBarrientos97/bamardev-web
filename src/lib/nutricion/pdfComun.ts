import type { jsPDF } from "jspdf";
import { Telefono } from "../telefono";

/**
 * Lo común de los PDF de nutrición (el del seguimiento del tratamiento y el
 * de la evaluación): la hoja A4 en puntos, los colores, las fuentes, cómo se
 * parte un texto en renglones, la cabecera, los datos en cuatro columnas, el
 * pie de cada hoja y las dos entregas por WhatsApp (el chat del número y el
 * diálogo de compartir).
 *
 * Texto de verdad (jsPDF con la Helvetica de siempre, WinAnsi): nada de «−»
 * (U+2212), «≈», flechas, espacios duros ni emojis, que esa fuente no tiene.
 * Lo que escribió el usuario pasa por `paraLaFuente`.
 */

// ── La hoja ─────────────────────────────────────────────────────────────────

export const ANCHO = 595.28;
export const ALTO = 841.89;
export const MARGEN = 34;
export const UTIL = ANCHO - MARGEN * 2;
export const PIE = 30;
/** Hasta dónde se dibuja en cada hoja (debajo va el pie). */
export const FIN = ALTO - MARGEN - PIE;

// ── Los colores ─────────────────────────────────────────────────────────────

export const TEXTO = "#0F172A";
export const GRIS = "#475569";
export const GRIS_CLARO = "#64748B";
export const BORDE = "#CBD5E1";
export const FONDO_CUADRO = "#F5FBF7";
export const ROJO = "#B91C1C";
export const AMBAR = "#B45309";
/** El verde de nutrición, si el tema del negocio no trae otro. */
export const MARCA_NUTRICION = "#047857";

/** El verde (o el color) del tema del negocio; sin pantalla, el de siempre. */
export function colorDeMarca(): string {
  if (typeof document === "undefined") return MARCA_NUTRICION;
  const v = getComputedStyle(document.documentElement).getPropertyValue("--color-primary-700").trim();
  return /^#[0-9a-f]{6}$/i.test(v) ? v : MARCA_NUTRICION;
}

// ── Las fuentes y los renglones ─────────────────────────────────────────────

export type Fuente = { tam: number; negrita?: boolean; color?: string };

export function usar(pdf: jsPDF, f: Fuente) {
  pdf.setFont("helvetica", f.negrita ? "bold" : "normal");
  pdf.setFontSize(f.tam);
  pdf.setTextColor(f.color ?? TEXTO);
}

/**
 * jsPDF mide los textos restando el «kerning» de la fuente, pero los dibuja sin
 * él: un renglón entero sale hasta 3 pt más ancho de lo medido y se pasa del
 * margen. Con estas medidas se mide como se dibuja.
 */
function medidasComoSeDibuja(pdf: jsPDF) {
  return { widths: pdf.getFont().metadata.Unicode.widths, kerning: {} };
}

/** El ancho de un texto tal como queda dibujado (sin el kerning que jsPDF resta al medir). */
export function anchoComoSeDibuja(pdf: jsPDF, texto: string): number {
  return (pdf.getStringUnitWidth(texto, medidasComoSeDibuja(pdf)) * pdf.getFontSize()) / pdf.internal.scaleFactor;
}

export function partir(pdf: jsPDF, texto: string, ancho: number, f: Fuente, pegarUnidades = false, comoSeDibuja = false): string[] {
  usar(pdf, f);
  // Con `pegarUnidades` (las observaciones y la marca), un número no queda separado de su
  // unidad ni el vial partido («10» / «mg en 0,5 ml»): se pegan con espacios duros para
  // cortar y se vuelven espacios comunes para dibujar. (jsPDF mide el espacio duro un poco
  // más ancho: en las columnas angostas de los datos cortaría antes de tiempo.)
  // Con `comoSeDibuja`, sin el kerning (ver `medidasComoSeDibuja`).
  const t = pegarUnidades ? conUnidadesPegadas(texto) : texto;
  return (pdf.splitTextToSize(t, ancho, comoSeDibuja ? medidasComoSeDibuja(pdf) : undefined) as string[])
    .map((l) => l.replace(/ /g, " "))
    .filter((l, i, a) => l.length > 0 || i < a.length - 1);
}

/** «10 mg en 0,5 ml», «17 UI», «7,5 kg»: el número con su unidad (y el vial entero) no se cortan. */
export function conUnidadesPegadas(texto: string): string {
  return texto.replace(/(\d) (mg|ml|UI|kg)(?![\p{L}])/gu, "$1 $2").replace(/mg en (\d)/g, "mg en $1");
}

/**
 * Como `partir`, pero «Tirze · 15 mg en 0,5 ml» se corta en el «·»: el vial no
 * queda partido («15 mg en» / «0,5 ml»). Si una parte sola no entra, se corta
 * como siempre.
 */
export function partirPorPartes(pdf: jsPDF, texto: string, ancho: number, f: Fuente): string[] {
  usar(pdf, f);
  if (pdf.getTextWidth(texto) <= ancho || !texto.includes(" · ")) return partir(pdf, texto, ancho, f);
  const lineas: string[] = [];
  for (const parte of texto.split(" · ")) {
    const ultima = lineas[lineas.length - 1];
    if (ultima != null && pdf.getTextWidth(`${ultima} · ${parte}`) <= ancho) lineas[lineas.length - 1] = `${ultima} · ${parte}`;
    else lineas.push(...partir(pdf, parte, ancho, f));
  }
  return lineas;
}

/** Las fuentes de las partes que comparten los dos PDF. */
export const FUENTES = {
  negocio: { tam: 13.5, negrita: true },
  titulo: { tam: 16, negrita: true },
  emitido: { tam: 9.5, color: GRIS },
  rotulo: { tam: 8, negrita: true, color: GRIS },
  dato: { tam: 11 },
  cuadroValor: { tam: 16, negrita: true },
  cuadroNota: { tam: 9, color: GRIS },
  chico: { tam: 8, color: GRIS_CLARO },
  pie: { tam: 8, color: GRIS_CLARO },
} satisfies Record<string, Fuente>;

// ── Lo que la fuente no tiene ───────────────────────────────────────────────

export const sinEspaciosDuros = (s: string) => s.replace(/[   ]/g, " ");

/** Lo que WinAnsi tiene fuera de Latin-1 (jsPDF lo pasa a su código): «—», «…», «•», las comillas curvas. */
const EXTRAS_WINANSI = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");

/** Lo que no está en la fuente pero tiene un equivalente simple. */
const EQUIVALENTES: Record<string, string> = {
  "−": "-",
  "‐": "-",
  "‑": "-",
  "‒": "-",
  "―": "—",
  "≈": "aprox.",
  "≤": "<=",
  "≥": ">=",
  "≠": "distinto de",
  "→": "->",
  "⟶": "->",
  "⇒": "=>",
  "←": "<-",
  "⟵": "<-",
  "↔": "<->",
  "↑": "",
  "↓": "",
  "∙": "·",
  "⋅": "·",
  "‧": "·",
  "′": "'",
  "″": '"',
  "\t": " ",
};

/** ¿La Helvetica del PDF lo dibuja? Latin-1 imprimible (sin el espacio duro ni el guion suave) y los extras de WinAnsi. */
export function entraEnLaFuente(ch: string): boolean {
  if (ch === "\n") return true;
  const c = ch.codePointAt(0) ?? 0;
  if (c >= 0x20 && c <= 0x7e) return true;
  if (c >= 0xa1 && c <= 0xff && c !== 0xad) return true;
  return EXTRAS_WINANSI.has(ch);
}

/**
 * Lo que escribió el usuario, listo para la fuente del PDF: lo que no tiene se
 * cambia por su equivalente simple («−» → «-», «≈» → «aprox.», las letras con
 * marcas raras por la letra sola) o se quita (emojis, espacios de ancho cero),
 * sin dejar basura ni espacios dobles. Los renglones se conservan (a lo sumo
 * uno en blanco entre párrafos).
 */
export function paraLaFuente(texto: string | null | undefined): string {
  if (!texto) return "";
  let sal = "";
  for (const ch of texto.replace(/\r\n?/g, "\n")) {
    if (entraEnLaFuente(ch)) sal += ch;
    else if (ch in EQUIVALENTES) sal += EQUIVALENTES[ch];
    else if (/\s/u.test(ch)) sal += " ";
    else for (const d of ch.normalize("NFKD")) if (entraEnLaFuente(d) && d !== "\n") sal += d;
  }
  return sal
    .replace(/ {2,}/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Como `paraLaFuente`, en un solo renglón (el nombre, el carnet, el teléfono). */
export const enUnRenglon = (texto: string | null | undefined) => paraLaFuente(texto).replace(/\n+/g, " ");

// ── Las partes de la hoja ───────────────────────────────────────────────────

/**
 * La cabecera: el negocio a la izquierda (hasta 2 renglones; sin negocio,
 * nada), el título a la derecha en el color del tema, «Emitido el …» y la
 * línea del color. Devuelve dónde sigue.
 */
export function dibujarCabecera(pdf: jsPDF, { titulo, emitido, negocio }: { titulo: string; emitido: string; negocio: string | null }, marca: string): number {
  let y = MARGEN;
  const anchoTitulo = 210;
  usar(pdf, FUENTES.titulo);
  pdf.setTextColor(marca);
  pdf.text(titulo, MARGEN + UTIL, y + 14, { align: "right" });
  usar(pdf, FUENTES.emitido);
  pdf.text(emitido, MARGEN + UTIL, y + 28, { align: "right" });
  let altoCab = 34;
  if (negocio) {
    const l = partir(pdf, negocio, UTIL - anchoTitulo, FUENTES.negocio).slice(0, 2);
    usar(pdf, FUENTES.negocio);
    l.forEach((t, i) => pdf.text(t, MARGEN, y + 14 + i * 16));
    altoCab = Math.max(altoCab, 14 + (l.length - 1) * 16 + 14);
  }
  y += altoCab;
  pdf.setDrawColor(marca);
  pdf.setLineWidth(2.25);
  pdf.line(MARGEN, y, MARGEN + UTIL, y);
  return y + 16;
}

/** Lo que ocupan los datos en 4 columnas (lo mismo que avanza `dibujarDatos`), para saber antes si entran. */
export function altoDeDatos(pdf: jsPDF, datos: { etiqueta: string; valor: string }[]): number {
  const anchoDato = (UTIL - 3 * 12) / 4;
  let alto = 0;
  for (let fila = 0; fila < datos.length; fila += 4) {
    const renglones = Math.max(...datos.slice(fila, fila + 4).map((d) => partirPorPartes(pdf, d.valor, anchoDato, FUENTES.dato).slice(0, 3).length));
    alto += 22 + (renglones - 1) * 13 + 6 + 8;
  }
  return alto;
}

/** Los datos en 4 columnas (rótulo arriba, el valor en hasta 3 renglones). Devuelve dónde sigue. */
export function dibujarDatos(pdf: jsPDF, yInicio: number, datos: { etiqueta: string; valor: string }[]): number {
  let y = yInicio;
  const anchoDato = (UTIL - 3 * 12) / 4;
  for (let fila = 0; fila < datos.length; fila += 4) {
    let altoFila = 0;
    datos.slice(fila, fila + 4).forEach((d, i) => {
      const x = MARGEN + i * (anchoDato + 12);
      usar(pdf, FUENTES.rotulo);
      pdf.text(d.etiqueta, x, y + 8, { charSpace: 0.5 });
      const l = partirPorPartes(pdf, d.valor, anchoDato, FUENTES.dato).slice(0, 3);
      usar(pdf, FUENTES.dato);
      l.forEach((t, k) => pdf.text(t, x, y + 22 + k * 13));
      altoFila = Math.max(altoFila, 22 + (l.length - 1) * 13 + 6);
    });
    y += altoFila + 8;
  }
  return y;
}

/** El pie de cada hoja: el texto a la izquierda y «Página X de N» a la derecha. */
export function dibujarPies(pdf: jsPDF, texto: string) {
  const total = pdf.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    pdf.setPage(p);
    pdf.setDrawColor(BORDE);
    pdf.setLineWidth(0.75);
    pdf.line(MARGEN, ALTO - MARGEN - 14, MARGEN + UTIL, ALTO - MARGEN - 14);
    usar(pdf, FUENTES.pie);
    pdf.text(texto, MARGEN, ALTO - MARGEN);
    pdf.text(`Página ${p} de ${total}`, MARGEN + UTIL, ALTO - MARGEN, { align: "right" });
  }
}

// ── La entrega por WhatsApp ─────────────────────────────────────────────────
//
// Desde una página web, `wa.me/<número>?text=…` abre el chat de ese número con
// el mensaje escrito, pero NO puede adjuntar un archivo; adjuntar el PDF sólo
// se puede con el diálogo de compartir del sistema (que no deja elegir el
// número: hay que buscar el contacto, y si no está agendado no aparece) o a
// mano con el clip. Por eso son dos entregas separadas, y el diálogo «Enviar
// por WhatsApp» (`DialogoWhatsapp`) ofrece las dos (26-nov-2026).

// Vive en `foco.ts` (la regla del foco con el dedo); sigue saliendo de acá para no romper importaciones.
export { conDedo } from "./foco";

/**
 * El teléfono de la ficha, como se muestra en el campo del diálogo (al lado
 * del «+591»): sin el 591 si lo trae. Uno de otro país («+54 9 11…») va tal
 * cual; vacío si no hay.
 */
export function numeroDeLaFicha(telefono: string | null | undefined): string {
  const limpio = (telefono ?? "").replace(/[^\d\s+-]/g, "").trim();
  const conPais = Telefono.bolivia(limpio);
  if (!conPais) return "";
  return conPais.length === 11 ? conPais.slice(3) : limpio;
}

/**
 * El número para `wa.me` (sólo dígitos, con el código de país), o null si no
 * vale: 8 dígitos (de Bolivia: va con 591 adelante), 11 que empiezan con 591,
 * o con «+» adelante y de 8 a 15 dígitos (otro país, tal cual). Con «+591», el
 * de Bolivia completo: «+591 7049068» no es de otro país, le falta un dígito.
 */
export function numeroParaWhatsapp(valor: string): string | null {
  const texto = valor.trim();
  const digitos = texto.replace(/\D/g, "");
  if (digitos.length === 11 && digitos.startsWith("591")) return digitos;
  if (texto.startsWith("+")) return digitos.length >= 8 && digitos.length <= 15 && !digitos.startsWith("591") ? digitos : null;
  return digitos.length === 8 ? Telefono.paraWhatsApp(digitos) : null;
}

/** «+591 70490686»; uno de otro país, «+5491112345678». */
export function numeroParaMostrar(numero: string): string {
  return numero.length === 11 && numero.startsWith("591") ? Telefono.paraMostrar(numero) : `+${numero}`;
}

/** Cómo terminó «Compartir el PDF por otra app». Cancelar no es un error. */
export type ResultadoCompartir = "compartido" | "cancelado" | "descargado";

/** Baja el PDF con su nombre (el `<a download>` de siempre). */
function bajar(blob: Blob, nombreArchivo: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * El chat de ese número con el mensaje listo, y el PDF descargado para
 * adjuntarlo con el clip. El chat se abre EN EL MISMO CLIC, antes de cualquier
 * espera (si no, lo frena el bloqueador de ventanas): `armar` se espera recién
 * después. Si armar el PDF falla, el chat ya quedó abierto y la promesa falla.
 *
 * Con el PDF ya armado (`listo`: el diálogo lo arma al abrirse), primero baja
 * y después abre el chat, las dos cosas dentro del toque: en el teléfono, abrir
 * el chat manda la página al fondo, y una descarga que arranca recién ahí
 * queda a merced del navegador.
 */
export async function abrirChatConPdf({
  numero,
  texto,
  nombreArchivo,
  armar,
  listo,
}: {
  /** Para `wa.me`: sólo dígitos, con el código de país (59170490686). */
  numero: string;
  /** El mensaje: «Seguimiento del tratamiento al 24/11/2026.» */
  texto: string;
  nombreArchivo: string;
  armar: () => Promise<Blob>;
  /** El PDF, si ya está armado. */
  listo?: Blob | null;
}): Promise<void> {
  const chat = `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
  if (listo) {
    bajar(listo, nombreArchivo);
    window.open(chat, "_blank", "noopener,noreferrer");
    return;
  }
  window.open(chat, "_blank", "noopener,noreferrer");
  bajar(await armar(), nombreArchivo);
}

/**
 * El diálogo de compartir del sistema con el PDF y, si el equipo lo acepta,
 * también el mensaje (ahí se elige WhatsApp, u otra app, y el contacto). Si el
 * equipo no puede compartir archivos, baja el PDF. Conviene que `armar` ya
 * esté resuelta: el navegador pide que `share` salga del toque, y armar un PDF
 * largo puede tardar más que eso.
 */
export async function compartirPdf({
  texto,
  nombreArchivo,
  armar,
}: {
  texto: string;
  nombreArchivo: string;
  armar: () => Promise<Blob>;
}): Promise<ResultadoCompartir> {
  const blob = await armar();
  const archivo = new File([blob], nombreArchivo, { type: "application/pdf" });
  if (typeof navigator.share === "function" && typeof navigator.canShare === "function" && navigator.canShare({ files: [archivo] })) {
    try {
      const conTexto = navigator.canShare({ files: [archivo], text: texto });
      await navigator.share(conTexto ? { files: [archivo], text: texto, title: nombreArchivo } : { files: [archivo], title: nombreArchivo });
      return "compartido";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "cancelado";
    }
  }
  bajar(blob, nombreArchivo);
  return "descargado";
}
