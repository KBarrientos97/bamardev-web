import type { jsPDF } from "jspdf";
import { entregarPdf, type EntregaPdf } from "../pdf/tablaPdf";
import { fechaCorta, fechaLarga, fmtNumero, hoyIso, posicionEnMedidor, rangoDe, sufijoDelDia, tallaEnMetros, vecesDelDia } from "./calculo";
import {
  altoDeDatos,
  anchoComoSeDibuja,
  BORDE,
  colorDeMarca,
  dibujarCabecera,
  dibujarDatos,
  dibujarPies,
  enUnRenglon,
  enviarPdfPorWhatsapp,
  FIN,
  FONDO_CUADRO,
  FUENTES,
  GRIS,
  GRIS_CLARO,
  MARCA_NUTRICION,
  MARGEN,
  paraLaFuente,
  partir as partirComun,
  sinEspaciosDuros,
  TEXTO,
  usar,
  UTIL,
  type EnvioWhatsapp,
  type Fuente,
} from "./pdfComun";
import { celdaDe, evolucionDe, FILAS, imcDeHoy, MEDIDAS, tarjetasDeHoy, valorCon, type Medida } from "./planilla";
import { colorDeEscalaImc, TONO_COLOR } from "./tonos";
import type { Catalogo, Control, Paciente, Rango, TonoGrado } from "./tipos";

/**
 * El PDF de la evaluación nutricional (CONTRATO-nutricion-evaluacion-22nov
 * §6): la planilla del paciente en papel, de la misma familia que el del
 * seguimiento (`seguimiento/pdf.ts`). De arriba abajo: la cabecera, los datos
 * del paciente, «Cómo está hoy» (las seis tarjetas de la pantalla), la barra
 * del IMC, el gráfico del peso, la planilla de controles en bloques de cinco,
 * las notas de los controles y la ficha. Lo vacío no ocupa lugar.
 *
 * Los números y los grados salen de las mismas funciones que la pantalla
 * (`planilla.ts`); los cambios van con palabras («Bajó 1,05 kg desde el
 * inicio»), que la fuente del PDF no tiene el signo menos. Varias hojas si
 * hace falta: un bloque de la planilla no se parte, un título no queda solo
 * al pie y los textos largos siguen por renglones en la hoja siguiente.
 *
 * Dato sensible de salud: no va a la consola ni a la telemetría, y el nombre
 * del archivo no lleva ni el nombre ni el carnet.
 */

// ── Lo que dice el papel (sin dibujar, para poder probarlo) ─────────────────

export interface DatoPdf {
  etiqueta: string;
  valor: string;
}

export interface GradoPdf {
  nombre: string;
  tono: TonoGrado;
}

/** Una tarjeta de «Cómo está hoy». */
export interface CuadroDeHoy {
  etiqueta: string;
  /** «82,4 kg»; «—» sin dato. */
  valor: string;
  grado: GradoPdf | null;
  /** «Bajó 1,05 kg desde el inicio», «Bajó 2,05 kg desde el anterior». */
  cambios: string[];
  /** «del seguimiento (24/11/2026)». */
  delSeguimiento: string | null;
}

/** La barra del IMC: un tramo por grado de la tabla, los cortes y la marca en el IMC de hoy. */
export interface ImcPdf {
  /** «31,2». */
  valor: string;
  grado: GradoPdf | null;
  /** «22/11/2026». */
  fecha: string;
  /** Dónde va la marca: 0 = punta izquierda, 1 = derecha (`posicionEnMedidor`). */
  posicion: number;
  tramos: { nombre: string; color: string; activo: boolean }[];
  cortes: { texto: string; posicion: number }[];
}

export interface PuntoPesoPdf {
  /** «14 nov» («14 nov (2)» el segundo del día). */
  etiqueta: string;
  valor: number;
  /** «82,4». */
  texto: string;
  delSeguimiento: boolean;
}

export interface CeldaPdf {
  /** El número sin la unidad, «—» o «sin medir» (el grado se eligió sin el valor). */
  texto: string;
  tipo: "valor" | "vacio" | "sinMedir";
  grado: GradoPdf | null;
}

/** Hasta cinco controles de la planilla, con su encabezado si hay más de un bloque. */
export interface BloqueControles {
  /** «Controles 6 a 10 de 12»; null si entran todos en uno. */
  titulo: string | null;
  columnas: { fecha: string; tipo: "INICIAL" | "CONTROL" }[];
  filas: { nombre: string; unidad: string | null; celdas: CeldaPdf[] }[];
}

export interface NotaPdf {
  /** «18/11/2026 · Inicial». */
  titulo: string;
  texto: string;
}

export interface FichaPdf {
  datos: DatoPdf[];
  enfermedades: { nombre: string; nota: string | null }[];
  textos: { etiqueta: string; texto: string }[];
}

export interface DocumentoEvaluacion {
  negocio: string | null;
  emitido: string;
  paciente: string;
  datos: DatoPdf[];
  hoy: CuadroDeHoy[];
  imc: ImcPdf | null;
  pesos: PuntoPesoPdf[];
  /** Hay pesos de los controles y del seguimiento: el gráfico lleva la leyenda. */
  leyenda: boolean;
  controles: BloqueControles[];
  notas: NotaPdf[];
  ficha: FichaPdf | null;
}

/** Cuántos controles van en cada bloque de la planilla. */
export const CONTROLES_POR_BLOQUE = 5;

/**
 * Un cambio con palabras: «Bajó 1,05 kg desde el inicio», «Subió 9 % desde el
 * inicio», «Igual que al inicio» («… que el anterior»). Con los decimales de
 * la medida, como la tarjeta de la pantalla.
 */
export function cambioConPalabras(d: number | null | undefined, m: Pick<Medida, "unidad" | "decimales">, desde: "inicio" | "anterior"): string | null {
  if (d == null || !Number.isFinite(d)) return null;
  const cifra = fmtNumero(Math.abs(d), m.decimales);
  if (!cifra || cifra === "0") return desde === "inicio" ? "Igual que al inicio" : "Igual que el anterior";
  return `${d > 0 ? "Subió" : "Bajó"} ${cifra}${m.unidad ? ` ${m.unidad}` : ""} desde el ${desde}`;
}

const gradoPdf = (g: Rango | null | undefined): GradoPdf | null => (g ? { nombre: enUnRenglon(g.nombre), tono: g.tono } : null);

function celdaPdf(c: Control, m: Medida, catalogo: Catalogo): CeldaPdf {
  const { valor, grado } = celdaDe(c, m, catalogo);
  if (valor == null && !grado) return { texto: "—", tipo: "vacio", grado: null };
  if (valor == null) return { texto: "sin medir", tipo: "sinMedir", grado: gradoPdf(grado) };
  return { texto: sinEspaciosDuros(valorCon({ ...m, unidad: "" }, valor)), tipo: "valor", grado: gradoPdf(grado) };
}

/** Lo que va en el papel, armado del paciente que muestra la planilla (`GET /nutricion/pacientes/:id`) y del catálogo. */
export function documentoEvaluacion({
  negocio,
  paciente: p,
  catalogo,
  hoy = hoyIso(),
}: {
  negocio: string | null | undefined;
  paciente: Paciente;
  catalogo: Catalogo;
  hoy?: string;
}): DocumentoEvaluacion {
  const controles = p.controles;
  const nombre = enUnRenglon(p.nombre) || "—";
  const veces = vecesDelDia(controles.map((c) => c.fecha));
  const primero = controles[0];
  const ultimo = controles[controles.length - 1];

  const datos: DatoPdf[] = [
    { etiqueta: "PACIENTE", valor: nombre },
    { etiqueta: "CARNET", valor: enUnRenglon(p.ci ? `${p.ci}${p.ciExpedido ? ` ${p.ciExpedido}` : ""}` : "") || "—" },
    { etiqueta: "EDAD", valor: p.edad != null ? `${p.edad} años` : "—" },
    { etiqueta: "SEXO", valor: p.sexo === "F" ? "Mujer" : p.sexo === "M" ? "Hombre" : "—" },
    // En metros con dos decimales, como se dice una talla y como se ve en la pantalla: «1,60 m» (no «1,6 m»).
    { etiqueta: "TALLA", valor: p.tallaCm ? `${tallaEnMetros(p.tallaCm)} m` : "—" },
    { etiqueta: "TELÉFONO", valor: enUnRenglon(p.telefono) || "—" },
    { etiqueta: "PRIMER CONTROL", valor: primero ? fechaLarga(primero.fecha) : "—" },
    { etiqueta: "ÚLTIMO CONTROL", valor: ultimo ? fechaLarga(ultimo.fecha) : "—" },
  ];

  // ── Cómo está hoy: las mismas seis tarjetas de la pantalla ──
  const hoyCuadros: CuadroDeHoy[] = tarjetasDeHoy(p, catalogo).map((k) => ({
    etiqueta: k.medida.nombre.toUpperCase(),
    valor: k.resumen ? sinEspaciosDuros(valorCon(k.medida, k.resumen.actual)) : "—",
    grado: gradoPdf(k.grado),
    cambios: [cambioConPalabras(k.desdeInicio, k.medida, "inicio"), cambioConPalabras(k.desdeAnterior, k.medida, "anterior")].filter((x): x is string => !!x),
    delSeguimiento: k.delSeguimiento ? `del seguimiento (${fechaLarga(k.delSeguimiento)})` : null,
  }));

  // ── La barra del IMC: el mismo IMC que el medidor de la pantalla ──
  const deHoy = imcDeHoy(p, catalogo);
  const rangos = deHoy.rangos ?? [];
  let imc: ImcPdf | null = null;
  if (deHoy.ultimo?.imc != null && rangos.length) {
    const valor = deHoy.ultimo.imc;
    const activo = deHoy.ultimo.imcGrado ?? rangoDe({ sexo: null, edadDesde: null, edadHasta: null, rangos }, valor)?.grado ?? null;
    imc = {
      valor: fmtNumero(valor, 1),
      grado: gradoPdf(deHoy.grado),
      fecha: fechaLarga(deHoy.ultimo.fecha),
      posicion: posicionEnMedidor(valor, rangos) ?? 0,
      tramos: rangos.map((g, i) => ({ nombre: enUnRenglon(g.nombre), color: colorDeEscalaImc(i, rangos.length).fondo, activo: g.grado === activo })),
      cortes: rangos.slice(0, -1).flatMap((g, i) => (g.hasta == null ? [] : [{ texto: fmtNumero(g.hasta), posicion: (i + 1) / rangos.length }])),
    };
  }

  // ── El peso: los mismos puntos que el gráfico de la pantalla en «Peso» ──
  const evolucion = evolucionDe(p, "pesoKg");
  const pesos: PuntoPesoPdf[] = evolucion.puntos.map((x) => ({
    etiqueta: `${fechaCorta(x.fecha)}${sufijoDelDia(x.vez)}`,
    valor: x.valor,
    texto: fmtNumero(x.valor, MEDIDAS.pesoKg.decimales),
    delSeguimiento: !!x.chico,
  }));

  // ── La planilla de controles, de a cinco ──
  const columnas = controles.map((c, i) => ({ fecha: `${fechaLarga(c.fecha)}${sufijoDelDia(veces[i])}`, tipo: c.inicial ? ("INICIAL" as const) : ("CONTROL" as const) }));
  const bloques: BloqueControles[] = [];
  for (let i = 0; i < controles.length; i += CONTROLES_POR_BLOQUE) {
    const parte = controles.slice(i, i + CONTROLES_POR_BLOQUE);
    const hasta = i + parte.length;
    bloques.push({
      titulo:
        controles.length <= CONTROLES_POR_BLOQUE ? null : parte.length === 1 ? `Control ${hasta} de ${controles.length}` : `Controles ${i + 1} a ${hasta} de ${controles.length}`,
      columnas: columnas.slice(i, hasta),
      filas: FILAS.map((campo) => {
        const m = MEDIDAS[campo];
        // «% de grasa» ya dice su unidad: «(%)» al lado sería repetirla (como la pantalla).
        return { nombre: m.nombre, unidad: m.unidad && m.unidad !== "%" ? `(${m.unidad})` : null, celdas: parte.map((c) => celdaPdf(c, m, catalogo)) };
      }),
    });
  }

  // ── Las notas de los controles ──
  const notas: NotaPdf[] = controles.flatMap((c, i) => {
    const texto = paraLaFuente(c.nota);
    return texto ? [{ titulo: `${fechaLarga(c.fecha)}${sufijoDelDia(veces[i])} · ${c.inicial ? "Inicial" : "Control"}`, texto }] : [];
  });

  // ── La ficha: lo que tenga algo ──
  const nombreEnf = (codigo: string) => catalogo.enfermedades.find((e) => e.codigo === codigo)?.nombre ?? codigo;
  const fichaDatos: DatoPdf[] = [
    ...(p.fechaNacimiento ? [{ etiqueta: "FECHA DE NACIMIENTO", valor: fechaLarga(p.fechaNacimiento) }] : []),
    ...(p.hijos != null ? [{ etiqueta: "HIJOS", valor: String(p.hijos) }] : []),
  ];
  const enfermedades = Object.entries(p.enfermedades ?? {})
    .filter(([, e]) => e.tiene)
    .map(([codigo, e]) => ({ nombre: enUnRenglon(nombreEnf(codigo)) || codigo, nota: paraLaFuente(e.nota) || null }));
  const textos = (
    [
      ["Observaciones", p.observaciones],
      ["Últimos análisis clínicos", p.ultimosAnalisis],
      ["Otras enfermedades", p.otrasEnfermedades],
      ["Cirugías", p.cirugias],
      ["Conducta alimentaria", p.conductaAlimentaria],
      ["Conducta del sueño", p.conductaSueno],
      ["Actividad física", p.actividadFisica],
      ["Consumo de agua", p.consumoAgua],
    ] as [string, string | null][]
  ).flatMap(([etiqueta, t]) => {
    const texto = paraLaFuente(t);
    return texto ? [{ etiqueta, texto }] : [];
  });
  const ficha = fichaDatos.length || enfermedades.length || textos.length ? { datos: fichaDatos, enfermedades, textos } : null;

  // El papel no tiene espacios duros (la fuente del PDF no los conoce): «14 nov» y «82,4 kg» los traen.
  return barrer({
    negocio: enUnRenglon(negocio) || null,
    emitido: `Emitido el ${fechaLarga(hoy)}`,
    paciente: nombre,
    datos,
    hoy: hoyCuadros,
    imc,
    pesos,
    leyenda: evolucion.leyenda,
    controles: bloques,
    notas,
    ficha,
  });
}

/** Cada texto del documento, sin espacios duros. */
function barrer<T>(v: T): T {
  if (typeof v === "string") return sinEspaciosDuros(v) as T;
  if (Array.isArray(v)) return v.map(barrer) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, barrer(x)])) as T;
  return v;
}

// ── Las hojas: qué va en cuál ───────────────────────────────────────────────

/** Una parte del papel ya medida: su alto, el aire de arriba (que no va al principio de una hoja) y si va con la siguiente. */
export interface Pieza {
  alto: number;
  /** El aire de arriba; arriba de todo de una hoja, no va. */
  antes?: number;
  /** Va en la misma hoja que la siguiente: un título con lo primero de lo suyo. */
  conLaSiguiente?: boolean;
}

/**
 * Dónde va cada pieza: en qué hoja (desde 0) y a qué altura. Las que van
 * juntas (`conLaSiguiente`) bajan juntas a la hoja siguiente si no entran;
 * una pieza no se parte (por eso los textos largos son una pieza por renglón
 * y un bloque de la planilla, una sola).
 */
export function ubicarPiezas(piezas: Pieza[], { inicio, arriba, fin }: { inicio: number; arriba: number; fin: number }): { hoja: number; y: number }[] {
  const lugar: { hoja: number; y: number }[] = [];
  let hoja = 0;
  let y = inicio;
  const aire = (k: number) => (y <= arriba ? 0 : (piezas[k].antes ?? 0));
  for (let i = 0; i < piezas.length; ) {
    let j = i;
    while (j < piezas.length - 1 && piezas[j].conLaSiguiente) j++;
    let alto = aire(i) + piezas[i].alto;
    for (let k = i + 1; k <= j; k++) alto += (piezas[k].antes ?? 0) + piezas[k].alto;
    if (y + alto > fin && y > arriba) {
      hoja++;
      y = arriba;
    }
    for (let k = i; k <= j; k++) {
      // Una cadena más alta que una hoja entera (no pasa con las partes de verdad): sigue en la siguiente.
      if (y + aire(k) + piezas[k].alto > fin && y > arriba) {
        hoja++;
        y = arriba;
      }
      const a = aire(k);
      lugar[k] = { hoja, y: y + a };
      y += a + piezas[k].alto;
    }
    i = j + 1;
  }
  return lugar;
}

// ── El dibujo ───────────────────────────────────────────────────────────────

/** Parte el texto en renglones midiendo como se dibuja (sin el kerning que jsPDF resta al medir). */
const partir = (pdf: jsPDF, texto: string, ancho: number, f: Fuente, pegarUnidades = false) => partirComun(pdf, texto, ancho, f, pegarUnidades, true);

const F = {
  ...FUENTES,
  subtitulo: { tam: 9.5, negrita: true },
  texto: { tam: 9.5, color: "#334155" },
  chip: { tam: 8, negrita: true },
  marcaImc: { tam: 10, negrita: true },
  corte: { tam: 8.5, color: GRIS },
  tramo: { tam: 8, color: GRIS },
  valorPunto: { tam: 8.5, negrita: true },
  fechaPunto: { tam: 8, color: GRIS },
  leyenda: { tam: 8.5, color: GRIS },
  bloque: { tam: 9.5, negrita: true },
  cabeceraTabla: { tam: 8, negrita: true, color: "#FFFFFF" },
  fechaColumna: { tam: 8.5, negrita: true, color: "#FFFFFF" },
  tipoColumna: { tam: 6.5, negrita: true, color: "#FFFFFF" },
  medida: { tam: 9, negrita: true },
  unidad: { tam: 8.5, color: GRIS_CLARO },
  celda: { tam: 9.5, negrita: true },
  sinMedir: { tam: 8 },
  gradoCelda: { tam: 7, negrita: true },
} satisfies Record<string, Fuente>;

const ALTO_LINEA = 12.5;
const ENTRE_SECCIONES = 20;
const ALTO_TITULO = 16;
const SEPARACION_CUADROS = 9;
const ANCHO_CUADRO = (UTIL - 2 * SEPARACION_CUADROS) / 3;
const ANCHO_MEDIDA = 112;
const ANCHO_COLUMNA = (UTIL - ANCHO_MEDIDA) / CONTROLES_POR_BLOQUE;
const ALTO_CABECERA_TABLA = 28;
const ANCHO_NOMBRE_ENFERMEDAD = 150;
/**
 * El aire que se deja a la derecha de un texto corrido: el visor de PDF
 * redondea el avance de cada letra a píxeles y, en pantalla, un renglón entero
 * salía hasta 3 pt más ancho que lo medido, pasado del margen (24-nov).
 */
const HOLGURA_RENGLON = 4;

/** Lo que se dibuja: la pieza con su dibujo. */
type PiezaDibujo = Pieza & { dibujar: (y: number) => void };

/** El título de una sección («CÓMO ESTÁ HOY»), con lo primero de la sección; a la derecha, un dato chico. */
function titulo(pdf: jsPDF, texto: string, derecha?: string): PiezaDibujo {
  return {
    alto: ALTO_TITULO,
    antes: ENTRE_SECCIONES,
    conLaSiguiente: true,
    dibujar: (y) => {
      usar(pdf, F.rotulo);
      pdf.text(texto, MARGEN, y + 8, { charSpace: 0.5 });
      if (derecha) {
        usar(pdf, F.chico);
        pdf.text(derecha, MARGEN + UTIL, y + 8, { align: "right" });
      }
    },
  };
}

/** Un texto largo: un subtítulo (que va con sus dos primeros renglones) y una pieza por renglón. */
function textoLargo(pdf: jsPDF, subtitulo: string, texto: string, antes: number): PiezaDibujo[] {
  const lineas = partir(pdf, texto, UTIL - HOLGURA_RENGLON, F.texto, true);
  return [
    {
      alto: 15,
      antes,
      conLaSiguiente: lineas.length > 0,
      dibujar: (y) => {
        usar(pdf, F.subtitulo);
        pdf.text(subtitulo, MARGEN, y + 10);
      },
    },
    ...lineas.map((l, i) => ({
      alto: ALTO_LINEA,
      // El primer renglón no queda solo con el subtítulo al pie: baja con el segundo.
      conLaSiguiente: i === 0 && lineas.length > 1,
      dibujar: (y: number) => {
        usar(pdf, F.texto);
        pdf.text(l, MARGEN, y + 9.5);
      },
    })),
  ];
}

/** El chip de un grado: el punto y el nombre sobre el fondo suave de su tono. Devuelve lo que mide de alto. */
function chip(pdf: jsPDF, x: number, y: number, lineas: string[], tono: TonoGrado): number {
  const c = TONO_COLOR[tono];
  usar(pdf, F.chip);
  const ancho = Math.max(...lineas.map((l) => anchoComoSeDibuja(pdf, l))) + 20;
  const alto = 6 + lineas.length * 9.5;
  pdf.setFillColor(c.suave);
  pdf.roundedRect(x, y, ancho, alto, alto / 2 > 7.75 ? 6 : alto / 2, alto / 2 > 7.75 ? 6 : alto / 2, "F");
  pdf.setFillColor(c.texto);
  pdf.circle(x + 8, y + 7.75, 2, "F");
  usar(pdf, { ...F.chip, color: c.texto });
  lineas.forEach((l, i) => pdf.text(l, x + 13, y + 11 + i * 9.5));
  return alto;
}

/** Las seis tarjetas, de a tres por fila. */
function cuadrosDeHoy(pdf: jsPDF, cuadros: CuadroDeHoy[]): PiezaDibujo[] {
  const interior = ANCHO_CUADRO - 20;
  const medidos = cuadros.map((k) => {
    const grado = k.grado ? partir(pdf, k.grado.nombre, interior - 20, F.chip) : [];
    const altoChip = grado.length ? 6 + grado.length * 9.5 : 0;
    // Los renglones de abajo (dónde va cada uno, desde arriba del cuadro): debajo del chip, o del valor sin chip.
    const renglones: { texto: string; fuente: Fuente; base: number }[] = [];
    let base = grado.length ? 43 + altoChip + 12 : 50;
    for (const l of k.cambios.flatMap((c) => partir(pdf, c, interior, F.cuadroNota))) {
      renglones.push({ texto: l, fuente: F.cuadroNota, base });
      base += 11.5;
    }
    for (const l of k.delSeguimiento ? partir(pdf, k.delSeguimiento, interior, F.chico) : []) {
      renglones.push({ texto: l, fuente: F.chico, base: base - 0.5 });
      base += 10.5;
    }
    const fondo = renglones.length ? renglones[renglones.length - 1].base + 10 : grado.length ? 43 + altoChip + 9 : 58;
    return { k, grado, renglones, alto: Math.max(58, fondo) };
  });
  const filas: (typeof medidos)[] = [];
  for (let i = 0; i < medidos.length; i += 3) filas.push(medidos.slice(i, i + 3));
  return filas.map((fila, n) => {
    const alto = Math.max(...fila.map((m) => m.alto));
    return {
      alto,
      antes: n > 0 ? SEPARACION_CUADROS : 0,
      dibujar: (y: number) =>
        fila.forEach((m, i) => {
          const x = MARGEN + i * (ANCHO_CUADRO + SEPARACION_CUADROS);
          pdf.setFillColor(FONDO_CUADRO);
          pdf.setDrawColor(BORDE);
          pdf.setLineWidth(0.75);
          pdf.roundedRect(x, y, ANCHO_CUADRO, alto, 8, 8, "FD");
          usar(pdf, F.rotulo);
          pdf.text(m.k.etiqueta, x + 10, y + 15, { charSpace: 0.5 });
          usar(pdf, { ...F.cuadroValor, color: m.k.valor === "—" ? GRIS_CLARO : TEXTO });
          pdf.text(m.k.valor, x + 10, y + 35);
          if (m.k.grado) chip(pdf, x + 10, y + 43, m.grado, m.k.grado.tono);
          for (const r of m.renglones) {
            usar(pdf, r.fuente);
            pdf.text(r.texto, x + 10, y + r.base);
          }
        }),
    };
  });
}

/** La barra del IMC: un tramo por grado, los cortes debajo, los nombres y la marca en el IMC de hoy. */
function barraImc(pdf: jsPDF, imc: ImcPdf): PiezaDibujo {
  const n = imc.tramos.length;
  const anchoTramo = UTIL / n;
  const nombres = imc.tramos.map((t) => partir(pdf, t.nombre, anchoTramo - 6, t.activo ? { ...F.tramo, negrita: true } : F.tramo));
  const renglones = Math.max(1, ...nombres.map((l) => l.length));
  const alto = 63 + (renglones - 1) * 9.5 + 4;
  return {
    alto,
    dibujar: (y) => {
      const arriba = y + 22;
      const altoBarra = 16;
      imc.tramos.forEach((t, i) => {
        pdf.setFillColor(t.color);
        pdf.rect(MARGEN + i * anchoTramo + (i ? 0.75 : 0), arriba, anchoTramo - (i ? 0.75 : 0) - (i < n - 1 ? 0.75 : 0), altoBarra, "F");
      });
      // Los cortes, debajo de cada unión.
      usar(pdf, F.corte);
      for (const c of imc.cortes) pdf.text(c.texto, MARGEN + c.posicion * UTIL, arriba + altoBarra + 12, { align: "center" });
      // El nombre de cada tramo, centrado (el de hoy, en negrita).
      imc.tramos.forEach((t, i) => {
        usar(pdf, t.activo ? { ...F.tramo, negrita: true, color: TEXTO } : F.tramo);
        nombres[i].forEach((l, k) => pdf.text(l, MARGEN + (i + 0.5) * anchoTramo, arriba + altoBarra + 25 + k * 9.5, { align: "center" }));
      });
      // La marca: una raya oscura sobre la barra y, arriba, el valor con su grado.
      const x = MARGEN + Math.min(1, Math.max(0, imc.posicion)) * UTIL;
      const xRaya = Math.min(MARGEN + UTIL - 1.5, Math.max(MARGEN + 1.5, x));
      pdf.setFillColor(TEXTO);
      pdf.setDrawColor("#FFFFFF");
      pdf.setLineWidth(0.8);
      pdf.rect(xRaya - 1.5, arriba - 3, 3, altoBarra + 6, "FD");
      const xPunta = Math.min(MARGEN + UTIL - 5, Math.max(MARGEN + 5, x));
      pdf.setFillColor(TEXTO);
      pdf.triangle(xPunta - 5, arriba - 9, xPunta + 5, arriba - 9, xPunta, arriba - 3.5, "F");
      const etiqueta = `IMC ${imc.valor}${imc.grado ? ` · ${imc.grado.nombre}` : ""}`;
      usar(pdf, F.marcaImc);
      const w = anchoComoSeDibuja(pdf, etiqueta);
      const cx = Math.min(Math.max(x, MARGEN + w / 2), MARGEN + UTIL - w / 2);
      pdf.text(etiqueta, cx, y + 9, { align: "center" });
    },
  };
}

/** El gráfico del peso: la línea por los pesos, el valor arriba de los que entran sin pisarse y las fechas abajo. */
function graficoPesos(pdf: jsPDF, puntos: PuntoPesoPdf[], leyenda: boolean, marca: string): PiezaDibujo {
  const altoGrafico = 104;
  return {
    alto: altoGrafico + (leyenda ? 14 : 0),
    dibujar: (y) => {
      const arriba = y + 16;
      const abajo = y + altoGrafico - 20;
      const izq = MARGEN + 16;
      const der = MARGEN + UTIL - 16;
      const pesos = puntos.map((p) => p.valor);
      let min = Math.min(...pesos);
      let max = Math.max(...pesos);
      if (max - min < 1) {
        min -= 0.5;
        max += 0.5;
      }
      // Como la pantalla: un punto por peso, a la misma distancia (no por la fecha).
      const xDe = (i: number) => (puntos.length <= 1 ? (izq + der) / 2 : izq + (i / (puntos.length - 1)) * (der - izq));
      const yDe = (v: number) => abajo - ((v - min) / (max - min)) * (abajo - arriba);
      pdf.setDrawColor("#E5E7EB");
      pdf.setLineWidth(0.75);
      for (const f of [0, 0.5, 1]) pdf.line(MARGEN, arriba + (abajo - arriba) * f, MARGEN + UTIL, arriba + (abajo - arriba) * f);
      pdf.setDrawColor(marca);
      pdf.setLineWidth(2.2);
      pdf.setLineJoin("round");
      pdf.setLineCap("round");
      for (let i = 1; i < puntos.length; i++) pdf.line(xDe(i - 1), yDe(puntos[i - 1].valor), xDe(i), yDe(puntos[i].valor));
      // El punto de un control, hueco y grande; el del seguimiento, chico y lleno.
      const apretado = puntos.length > 24;
      puntos.forEach((p, i) => {
        if (p.delSeguimiento) {
          pdf.setFillColor(marca);
          pdf.circle(xDe(i), yDe(p.valor), apretado ? 1.6 : 2.2, "F");
        } else {
          pdf.setFillColor("#FFFFFF");
          pdf.setDrawColor(marca);
          pdf.setLineWidth(1.8);
          pdf.circle(xDe(i), yDe(p.valor), apretado ? 2.6 : 3.8, "FD");
        }
      });
      // Los valores: siempre el primero y el último; los demás, si entran sin pisarse (30 pt de aire).
      const conValor: number[] = [];
      const orden = [0, puntos.length - 1, ...puntos.map((_, i) => i).slice(1, -1)];
      for (const i of orden) if (!conValor.includes(i) && conValor.every((k) => Math.abs(xDe(k) - xDe(i)) >= 30)) conValor.push(i);
      usar(pdf, F.valorPunto);
      for (const i of conValor) {
        const t = puntos[i].texto;
        const w = anchoComoSeDibuja(pdf, t);
        const cx = Math.min(Math.max(xDe(i), MARGEN + w / 2), MARGEN + UTIL - w / 2);
        pdf.text(t, cx, yDe(puntos[i].valor) - 7, { align: "center" });
      }
      // Las fechas abajo: siempre la primera y la última, las demás si entran (40 pt de aire).
      usar(pdf, F.fechaPunto);
      const conFecha: number[] = [];
      for (const i of orden) if (!conFecha.includes(i) && conFecha.every((k) => Math.abs(xDe(k) - xDe(i)) >= 40)) conFecha.push(i);
      for (const i of conFecha) {
        const t = puntos[i].etiqueta;
        const w = anchoComoSeDibuja(pdf, t);
        const cx = Math.min(Math.max(xDe(i), MARGEN + w / 2), MARGEN + UTIL - w / 2);
        pdf.text(t, cx, abajo + 15, { align: "center" });
      }
      if (leyenda) {
        const yl = abajo + 28;
        pdf.setFillColor("#FFFFFF");
        pdf.setDrawColor(marca);
        pdf.setLineWidth(1.5);
        pdf.circle(MARGEN + 4, yl - 3, 3.2, "FD");
        usar(pdf, F.leyenda);
        pdf.text("Control", MARGEN + 12, yl);
        const x2 = MARGEN + 12 + anchoComoSeDibuja(pdf, "Control") + 18;
        pdf.setFillColor(marca);
        pdf.circle(x2 + 2, yl - 3, 2.2, "F");
        usar(pdf, F.leyenda);
        pdf.text("Seguimiento semanal", x2 + 9, yl);
      }
    },
  };
}

/** Un bloque de la planilla de controles (hasta cinco columnas), entero: no se parte entre hojas. */
function bloqueControles(pdf: jsPDF, b: BloqueControles, marca: string): PiezaDibujo {
  const anchoTabla = ANCHO_MEDIDA + b.columnas.length * ANCHO_COLUMNA;
  const anchoPildora = ANCHO_COLUMNA - 10;
  const filas = b.filas.map((f) => {
    // El nombre del grado con aire a los costados de la píldora («Sobre el promedio» quedaba pegado al borde).
    const celdas = f.celdas.map((c) => ({ c, grado: c.grado ? partir(pdf, c.grado.nombre, anchoPildora - 10, F.gradoCelda) : [] }));
    const nombre = partir(pdf, f.unidad ? `${f.nombre} ${f.unidad}` : f.nombre, ANCHO_MEDIDA - 14, F.medida);
    const conGrado = Math.max(0, ...celdas.map((x) => x.grado.length));
    const altoPildora = conGrado ? 11.5 + conGrado * 9 + 4.5 : 0;
    const alto = Math.max(21, conGrado ? altoPildora + 7 : 0, 10 + nombre.length * 11);
    return { f, celdas, nombre, alto, altoPildora };
  });
  const arribaTabla = b.titulo ? 18 : 0;
  const alto = arribaTabla + ALTO_CABECERA_TABLA + filas.reduce((a, x) => a + x.alto, 0);
  return {
    alto,
    dibujar: (y0) => {
      if (b.titulo) {
        usar(pdf, F.bloque);
        pdf.text(b.titulo, MARGEN, y0 + 10);
      }
      let y = y0 + arribaTabla;
      // El encabezado: la fecha y, debajo, «INICIAL» o «CONTROL».
      pdf.setFillColor(marca);
      pdf.rect(MARGEN, y, anchoTabla, ALTO_CABECERA_TABLA, "F");
      usar(pdf, F.cabeceraTabla);
      pdf.text("MEDIDA", MARGEN + 8, y + 17.5, { charSpace: 0.4 });
      b.columnas.forEach((c, i) => {
        const cx = MARGEN + ANCHO_MEDIDA + (i + 0.5) * ANCHO_COLUMNA;
        usar(pdf, F.fechaColumna);
        pdf.text(c.fecha, cx, y + 12, { align: "center" });
        usar(pdf, F.tipoColumna);
        const w = anchoComoSeDibuja(pdf, c.tipo) + c.tipo.length * 0.4;
        if (c.tipo === "INICIAL") {
          pdf.setFillColor("#FFFFFF");
          pdf.roundedRect(cx - w / 2 - 5, y + 15.5, w + 10, 9, 4.5, 4.5, "F");
          usar(pdf, { ...F.tipoColumna, color: marca });
        }
        pdf.text(c.tipo, cx - w / 2, y + 22.1, { charSpace: 0.4 });
      });
      y += ALTO_CABECERA_TABLA;
      for (const fila of filas) {
        // El nombre de la medida, centrado en su renglón.
        usar(pdf, F.medida);
        const arribaNombre = y + fila.alto / 2 - (fila.nombre.length * 11) / 2 + 8;
        fila.nombre.forEach((l, k) => {
          // La unidad, en gris, si quedó en el mismo renglón que el nombre.
          if (fila.f.unidad && l.endsWith(fila.f.unidad) && l !== fila.f.unidad) {
            const sola = l.slice(0, l.length - fila.f.unidad.length);
            usar(pdf, F.medida);
            pdf.text(sola, MARGEN + 8, arribaNombre + k * 11);
            const w = anchoComoSeDibuja(pdf, sola);
            usar(pdf, F.unidad);
            pdf.text(fila.f.unidad, MARGEN + 8 + w, arribaNombre + k * 11);
          } else {
            usar(pdf, l === fila.f.unidad ? F.unidad : F.medida);
            pdf.text(l, MARGEN + 8, arribaNombre + k * 11);
          }
        });
        fila.celdas.forEach(({ c, grado }, i) => {
          const cx = MARGEN + ANCHO_MEDIDA + (i + 0.5) * ANCHO_COLUMNA;
          if (c.grado) {
            const t = TONO_COLOR[c.grado.tono];
            const arriba = y + (fila.alto - fila.altoPildora) / 2;
            pdf.setFillColor(t.suave);
            pdf.roundedRect(cx - anchoPildora / 2, arriba, anchoPildora, fila.altoPildora, 5, 5, "F");
            usar(pdf, c.tipo === "sinMedir" ? { ...F.sinMedir, color: t.texto } : { ...F.celda, color: t.texto });
            pdf.text(c.texto, cx, arriba + 11.5, { align: "center" });
            usar(pdf, { ...F.gradoCelda, color: t.texto });
            grado.forEach((l, k) => pdf.text(l, cx, arriba + 11.5 + (k + 1) * 9, { align: "center" }));
          } else {
            usar(pdf, c.tipo === "vacio" ? { ...F.celda, negrita: false, color: GRIS_CLARO } : c.tipo === "sinMedir" ? { ...F.sinMedir, color: GRIS } : F.celda);
            pdf.text(c.texto, cx, y + fila.alto / 2 + 3.5, { align: "center" });
          }
        });
        y += fila.alto;
        pdf.setDrawColor(BORDE);
        pdf.setLineWidth(0.75);
        pdf.line(MARGEN, y, MARGEN + anchoTabla, y);
      }
      // Las columnas, separadas con una raya suave (como la hoja).
      pdf.setDrawColor("#E2E8F0");
      pdf.setLineWidth(0.5);
      for (let i = 0; i < b.columnas.length; i++) pdf.line(MARGEN + ANCHO_MEDIDA + i * ANCHO_COLUMNA, y0 + arribaTabla + ALTO_CABECERA_TABLA, MARGEN + ANCHO_MEDIDA + i * ANCHO_COLUMNA, y);
    },
  };
}

/** Las enfermedades de base marcadas «Sí»: el nombre a la izquierda y su nota al lado; una pieza por renglón. */
function enfermedadesDeBase(pdf: jsPDF, lista: FichaPdf["enfermedades"], antes: number): PiezaDibujo[] {
  const piezas: PiezaDibujo[] = [
    {
      alto: 15,
      antes,
      conLaSiguiente: true,
      dibujar: (y) => {
        usar(pdf, F.subtitulo);
        pdf.text("Enfermedades de base", MARGEN, y + 10);
      },
    },
  ];
  const anchoNota = UTIL - ANCHO_NOMBRE_ENFERMEDAD - 10 - HOLGURA_RENGLON;
  lista.forEach((e, n) => {
    const nombre = partir(pdf, e.nombre, ANCHO_NOMBRE_ENFERMEDAD, { ...F.texto, negrita: true, color: TEXTO });
    const nota = e.nota ? partir(pdf, e.nota, anchoNota, F.texto, true) : [];
    const renglones = Math.max(nombre.length, nota.length);
    for (let k = 0; k < renglones; k++) {
      piezas.push({
        alto: ALTO_LINEA,
        antes: k === 0 && n > 0 ? 3 : 0,
        dibujar: (y) => {
          if (nombre[k]) {
            usar(pdf, { ...F.texto, negrita: true, color: TEXTO });
            pdf.text(nombre[k], MARGEN, y + 9.5);
          }
          if (nota[k]) {
            usar(pdf, F.texto);
            pdf.text(nota[k], MARGEN + ANCHO_NOMBRE_ENFERMEDAD + 10, y + 9.5);
          }
        },
      });
    }
  });
  return piezas;
}

/** Corta el texto del pie para que no pise «Página X de N». */
function pieQueEntra(pdf: jsPDF, texto: string, ancho: number): string {
  usar(pdf, F.pie);
  if (anchoComoSeDibuja(pdf, texto) <= ancho) return texto;
  let t = texto;
  while (t.length > 1 && anchoComoSeDibuja(pdf, `${t}…`) > ancho) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

/** Dibuja el documento entero en `pdf` (A4, en puntos). */
export function dibujarEvaluacion(pdf: jsPDF, doc: DocumentoEvaluacion, marca = MARCA_NUTRICION) {
  // ── Cabecera y datos: arriba de la primera hoja ──
  let y = dibujarCabecera(pdf, { titulo: "Evaluación nutricional", emitido: doc.emitido, negocio: doc.negocio }, marca);
  y = dibujarDatos(pdf, y, doc.datos) - 8;

  // ── Lo demás, en las hojas que hagan falta ──
  const piezas: PiezaDibujo[] = [];
  if (doc.hoy.length) piezas.push(titulo(pdf, "CÓMO ESTÁ HOY"), ...cuadrosDeHoy(pdf, doc.hoy));
  if (doc.imc) piezas.push(titulo(pdf, "IMC", `Del ${doc.imc.fecha}`), barraImc(pdf, doc.imc));
  if (doc.pesos.length) piezas.push(titulo(pdf, "EVOLUCIÓN DEL PESO (KG)"), graficoPesos(pdf, doc.pesos, doc.leyenda, marca));
  if (doc.controles.length) {
    piezas.push(titulo(pdf, "CONTROLES"));
    doc.controles.forEach((b, i) => piezas.push({ ...bloqueControles(pdf, b, marca), antes: i ? 14 : 0 }));
  }
  if (doc.notas.length) {
    piezas.push(titulo(pdf, "NOTAS DE LOS CONTROLES"));
    doc.notas.forEach((n, i) => piezas.push(...textoLargo(pdf, n.titulo, n.texto, i ? 8 : 0)));
  }
  if (doc.ficha) {
    const f = doc.ficha;
    piezas.push(titulo(pdf, "FICHA DEL PACIENTE"));
    let primero = true;
    if (f.datos.length) {
      piezas.push({ alto: altoDeDatos(pdf, f.datos) - 8, dibujar: (yd) => void dibujarDatos(pdf, yd, f.datos) });
      primero = false;
    }
    if (f.enfermedades.length) {
      piezas.push(...enfermedadesDeBase(pdf, f.enfermedades, primero ? 0 : 6));
      primero = false;
    }
    f.textos.forEach((t) => {
      piezas.push(...textoLargo(pdf, t.etiqueta, t.texto, primero ? 0 : 8));
      primero = false;
    });
  }

  const lugares = ubicarPiezas(piezas, { inicio: y, arriba: MARGEN, fin: FIN });
  let hoja = 0;
  piezas.forEach((pz, i) => {
    while (lugares[i].hoja > hoja) {
      pdf.addPage();
      hoja++;
    }
    pz.dibujar(lugares[i].y);
  });

  // ── El pie de cada hoja ──
  usar(pdf, F.pie);
  const total = pdf.getNumberOfPages();
  const lugarPagina = anchoComoSeDibuja(pdf, `Página ${total} de ${total}`) + 16;
  dibujarPies(pdf, pieQueEntra(pdf, `Evaluación nutricional · ${doc.paciente}`, UTIL - lugarPagina));
}

/** El PDF ya armado. jsPDF se carga recién acá: no pesa en el resto de la web. */
export async function pdfDeLaEvaluacion(doc: DocumentoEvaluacion, marca = colorDeMarca()): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  pdf.setProperties({ title: "Evaluación nutricional" });
  dibujarEvaluacion(pdf, doc, marca);
  return pdf.output("blob");
}

/** El nombre del archivo: sin el nombre ni el carnet del paciente (dato sensible). */
export const nombreDelPdfEvaluacion = (hoy = hoyIso()) => `evaluacion-nutricional-${hoy}.pdf`;

/** «Descargar PDF»: en el teléfono y la tablet, compartir el archivo; en la PC, «Guardar como» o la descarga (`entregarPdf`). */
export async function bajarPdfEvaluacion(doc: DocumentoEvaluacion): Promise<EntregaPdf> {
  return entregarPdf(await pdfDeLaEvaluacion(doc), nombreDelPdfEvaluacion());
}

/**
 * «Enviar por WhatsApp» (ver `enviarPdfPorWhatsapp`): en el teléfono y la
 * tablet, el diálogo de compartir con el PDF; en la PC, el chat del paciente
 * (abierto ANTES de armar el PDF, mientras dura el clic) y el PDF descargado.
 */
export async function enviarPdfEvaluacionPorWhatsapp(doc: DocumentoEvaluacion, telefono: string | null): Promise<EnvioWhatsapp> {
  return enviarPdfPorWhatsapp({
    texto: `Evaluación nutricional al ${fechaLarga(hoyIso())}.`,
    telefono,
    nombreArchivo: nombreDelPdfEvaluacion(),
    armar: () => pdfDeLaEvaluacion(doc),
  });
}
