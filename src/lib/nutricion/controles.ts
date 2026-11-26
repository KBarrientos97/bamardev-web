import { cambio, conUnidad, fechaLarga, redondear, sufijoDelDia, vecesDelDia, type CampoControl } from "./calculo";
import { celdaDe, FILAS, MEDIDAS, type Medida } from "./planilla";
import type { Catalogo, Control, Rango } from "./tipos";

/**
 * La tarjeta «Controles» con muchos controles (CONTRATO-nutricion-evaluacion-22nov
 * §8), sin pantalla: el armado según el ancho, qué controles se ven con cada
 * filtro, la línea de resumen, el cambio de una medida entre dos controles, la
 * duración entre dos fechas y las filas del modo «Comparar dos fechas».
 * Todo trabaja con POSICIONES en la lista de controles (el 0 es el inicial).
 */

// ── El armado según el ancho de la tarjeta ──────────────────────────────────

export type Armado = "pc" | "tablet" | "telefono";

/** El ancho que se toma sin `ResizeObserver` o midiendo 0 (los tests): el de una PC. */
export const ANCHO_POR_DEFECTO = 1046;

export function armadoPorAncho(ancho: number | null | undefined): Armado {
  const a = ancho && ancho > 0 ? ancho : ANCHO_POR_DEFECTO;
  if (a >= 940) return "pc";
  if (a >= 680) return "tablet";
  return "telefono";
}

/** Los anchos en px de la tabla de PC y tablet: lo fijo y el mínimo de una columna de control. */
export const COLUMNAS = {
  pc: { medida: 168, inicial: 156, anteriores: 80, cambio: 164, control: 124, ultimos: 3 },
  tablet: { medida: 132, inicial: 124, anteriores: 68, cambio: 124, control: 116, ultimos: 2 },
  /** La tabla completa del teléfono: sólo «Medida» pegada y cada control como una columna más. */
  telefono: { medida: 112, inicial: 0, anteriores: 0, cambio: 0, control: 112, ultimos: 0 },
} as const;

/** Cuántos «últimos» se ven de entrada (tablet 2, PC 3; el teléfono no filtra, compara). */
export const ultimosDe = (armado: Armado): number => (armado === "tablet" ? COLUMNAS.tablet.ultimos : COLUMNAS.pc.ultimos);

export interface AnchosTabla {
  medida: number;
  inicial: number;
  anteriores: number;
  cambio: number;
  /** Cada columna de control: lo que queda repartido, con el mínimo como piso. */
  control: number;
  /** El ancho de toda la tabla. */
  total: number;
}

/**
 * Si entran todas, las columnas de control se reparten lo que queda. Si no
 * entran (la tabla se desliza), lo que queda ENTRE las columnas pegadas se
 * reparte en columnas enteras (la de «anteriores» no cuenta: se va de costado),
 * así al deslizar, con el encaje del carril, nunca queda un control a medias
 * detrás de las pegadas.
 */
export function anchosDeTabla(armado: Armado, ancho: number, opciones: { anteriores: boolean; cambio: boolean; controles: number }): AnchosTabla {
  const c = COLUMNAS[armado];
  const anteriores = opciones.anteriores ? c.anteriores : 0;
  const cambio = opciones.cambio ? c.cambio : 0;
  const pegadas = c.medida + c.inicial + cambio;
  const fijas = pegadas + anteriores;
  const n = Math.max(1, opciones.controles);
  let control: number;
  if (fijas + n * c.control <= ancho) {
    control = Math.max(c.control, Math.floor((ancho - fijas) / n));
  } else {
    const libre = ancho - pegadas;
    const entran = Math.max(1, Math.floor(libre / c.control));
    control = Math.max(c.control, Math.floor(libre / entran));
  }
  return { medida: c.medida, inicial: c.inicial, anteriores, cambio, control, total: fijas + (opciones.controles ? control * opciones.controles : 0) };
}

// ── El filtro ───────────────────────────────────────────────────────────────

export type Filtro = { tipo: "ultimos" } | { tipo: "seis" } | { tipo: "todos" } | { tipo: "fechas"; desde: string; hasta: string };

export interface Vista {
  /** ¿Hay más controles (además del inicial) que los «Últimos N»? Si no, no hay filtro: se ve todo. */
  hayFiltro: boolean;
  /** El filtro que vale de verdad (sin filtro, siempre «todos»). */
  filtro: Filtro;
  /** Las posiciones de los controles que se ven, sin el inicial, en orden. */
  visibles: number[];
  /** Cuántos controles quedan escondidos ENTRE el inicial y los visibles (la columna «‹ N anteriores»). */
  anteriores: number;
  /** ¿Está «Últimos 6» entre las opciones? */
  conSeis: boolean;
}

const dia = (f: string) => f.slice(0, 10);

export function vistaDe(controles: Control[], filtro: Filtro, n: number): Vista {
  const otros = controles.map((_, i) => i).slice(1);
  const hayFiltro = otros.length > n;
  const conSeis = otros.length > 6;
  if (!hayFiltro) return { hayFiltro, filtro: { tipo: "todos" }, visibles: otros, anteriores: 0, conSeis };
  let visibles: number[];
  let valido = filtro;
  if (filtro.tipo === "fechas") {
    visibles = otros.filter((i) => {
      const f = dia(controles[i].fecha);
      return (!filtro.desde || f >= filtro.desde) && (!filtro.hasta || f <= filtro.hasta);
    });
  } else if (filtro.tipo === "todos") {
    visibles = otros;
  } else {
    // «Últimos 6» sin haber más de 6 vuelve a «Últimos N».
    const k = filtro.tipo === "seis" && conSeis ? 6 : n;
    if (filtro.tipo === "seis" && !conSeis) valido = { tipo: "ultimos" };
    visibles = otros.slice(-k);
  }
  const recortado = valido.tipo === "ultimos" || valido.tipo === "seis";
  return { hayFiltro, filtro: valido, visibles, anteriores: recortado ? otros.length - visibles.length : 0, conSeis };
}

/** Las fechas con las que arranca «Elegir fechas»: la del primero de los que se veían y la del último control. */
export function fechasIniciales(controles: Control[], vista: Vista): { desde: string; hasta: string } {
  const primero = vista.visibles[0] ?? Math.min(1, controles.length - 1);
  return { desde: dia(controles[Math.max(primero, 0)]?.fecha ?? ""), hasta: dia(controles[controles.length - 1]?.fecha ?? "") };
}

/** «Se ven 4 de 12: el inicial y los 3 últimos» y las demás (§8.2.5). `desliza`: la tabla no entra y se desliza. */
export function resumenDeVista(controles: Control[], vista: Vista, desliza: boolean): string {
  const total = controles.length;
  const k = vista.visibles.length;
  const f = vista.filtro;
  if (f.tipo === "fechas") {
    if (!k) return "No hay controles en esas fechas: se ve sólo el inicial";
    const rango = `del ${fechaLarga(f.desde)} al ${fechaLarga(f.hasta)}`;
    return `Se ven ${k + 1} de ${total}: el inicial y ${k === 1 ? "1" : `los ${k}`} ${rango}`;
  }
  if (f.tipo === "todos") {
    const base = total === 1 ? "Se ve el único control" : `Se ven los ${total} controles`;
    return desliza ? `${base}: deslizá de costado para ver los anteriores` : base;
  }
  return `Se ven ${k + 1} de ${total}: el inicial y ${k === 1 ? "el último" : `los ${k} últimos`}`;
}

// ── Duración entre dos fechas ───────────────────────────────────────────────

function partesDe(fecha: string): [number, number, number] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** «1 año y 3 días», «2 meses», «1 año, 2 meses y 3 días»; «el mismo día». Se cuenta de la fecha más vieja a la más nueva. */
export function duracionEntre(desde: string, hasta: string): string {
  const x = partesDe(desde);
  const y = partesDe(hasta);
  if (!x || !y) return "";
  const [a, b] = dia(desde) > dia(hasta) ? [y, x] : [x, y];
  // Los meses enteros que caben (el día 31 cae en el último del mes más corto) y los días que sobran.
  const enMes = (m: number) => {
    const total = a[1] - 1 + m;
    const año = a[0] + Math.floor(total / 12);
    const mes = total % 12;
    return Date.UTC(año, mes, Math.min(a[2], new Date(Date.UTC(año, mes + 1, 0)).getUTCDate()));
  };
  const fin = Date.UTC(b[0], b[1] - 1, b[2]);
  let enteros = (b[0] - a[0]) * 12 + b[1] - a[1];
  if (enMes(enteros) > fin) enteros -= 1;
  const dias = Math.round((fin - enMes(enteros)) / 86_400_000);
  const años = Math.floor(enteros / 12);
  const meses = enteros % 12;
  const partes = [años && plural(años, "año", "años"), meses && plural(meses, "mes", "meses"), dias && plural(dias, "día", "días")].filter(Boolean) as string[];
  if (!partes.length) return "el mismo día";
  if (partes.length === 1) return partes[0];
  return `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
}

// ── El cambio de una medida ─────────────────────────────────────────────────

export type TonoCambio = "bueno" | "malo" | "neutro";

export interface CambioMedida {
  /** «↓ 14,5 kg», «↑ 4,2 %», «=» o «—». */
  texto: string;
  tono: TonoCambio;
  /** «Obesidad grado 2 → Sobrepeso» si el grado cambió. */
  grado: string | null;
  /** «del 18/12/2025 al 22/10/2026» cuando las puntas no son el inicial o la última columna. */
  del: string | null;
}

const SIN_CAMBIO: CambioMedida = { texto: "—", tono: "neutro", grado: null, del: null };

/** ¿Subir es lo bueno? Sólo el músculo; en todo lo demás, bajar. */
const BUENO_SUBIR: CampoControl[] = ["musculoPct"];

function textoDeCambio(m: Medida, d: number): { texto: string; tono: TonoCambio } {
  const r = redondear(d, m.decimales);
  if (r === 0) return { texto: "=", tono: "neutro" };
  const abs = Math.abs(r);
  const unidad = m.unidad === "años" && abs === 1 ? "año" : m.unidad;
  const subio = r > 0;
  const bueno = BUENO_SUBIR.includes(m.campo) ? subio : !subio;
  return { texto: `${subio ? "↑" : "↓"} ${conUnidad(abs, unidad, m.decimales)}`, tono: bueno ? "bueno" : "malo" };
}

function cambioDeGrado(a: Rango | null, b: Rango | null): string | null {
  return a && b && a.grado !== b.grado ? `${a.nombre} → ${b.nombre}` : null;
}

/** El cambio de `m` entre dos controles (de `a` a `b`); «—» si a alguno le falta el valor. */
export function cambioEntre(a: Control, b: Control, m: Medida, catalogo: Catalogo | null): CambioMedida {
  const d = cambio(b[m.campo], a[m.campo]);
  if (d == null) return SIN_CAMBIO;
  return { ...textoDeCambio(m, d), grado: cambioDeGrado(celdaDe(a, m, catalogo).grado, celdaDe(b, m, catalogo).grado), del: null };
}

/**
 * La columna «Cambio · desde el inicial»: de la primera medición de esa medida
 * a la última hasta la columna de más a la derecha (`hasta`, una posición).
 */
export function cambioDesdeElInicial(controles: Control[], m: Medida, catalogo: Catalogo | null, hasta: number): CambioMedida {
  let i = -1;
  let j = -1;
  for (let k = 0; k <= hasta && k < controles.length; k++) {
    if (controles[k][m.campo] == null) continue;
    if (i < 0) i = k;
    j = k;
  }
  if (i < 0 || i === j) return SIN_CAMBIO;
  const c = cambioEntre(controles[i], controles[j], m, catalogo);
  const del = i !== 0 || j !== hasta ? `del ${fechaLarga(controles[i].fecha)} al ${fechaLarga(controles[j].fecha)}` : null;
  return { ...c, del };
}

// ── «Comparar dos fechas» (teléfono) ────────────────────────────────────────

export interface Par {
  /** Posición del más viejo y del más nuevo. */
  desde: number;
  hasta: number;
  alReves: boolean;
  misma: boolean;
}

export function parDe(desde: number, hasta: number): Par {
  return { desde: Math.min(desde, hasta), hasta: Math.max(desde, hasta), alReves: desde > hasta, misma: desde === hasta };
}

/** Las opciones de los dos `<select>`: «20/11/2025 · Inicial», «18/12/2025», «23/11/2026 · Último». */
export function opcionesDeFecha(controles: Control[]): { valor: number; texto: string }[] {
  const veces = vecesDelDia(controles.map((c) => c.fecha));
  return controles.map((c, i) => ({
    valor: i,
    texto: `${fechaLarga(c.fecha)}${sufijoDelDia(veces[i])}${i === 0 ? " · Inicial" : i === controles.length - 1 ? " · Último" : ""}`,
  }));
}

/** «Del 20/11/2025 al 23/11/2026: 1 año y 3 días», o el aviso de la misma fecha elegida dos veces. */
export function lineaDeComparacion(controles: Control[], par: Par): string {
  if (par.misma) return "Elegiste la misma fecha dos veces: no hay cambios que mostrar.";
  const a = controles[par.desde].fecha;
  const b = controles[par.hasta].fecha;
  return `Del ${fechaLarga(a)} al ${fechaLarga(b)}: ${duracionEntre(a, b)}`;
}

export const AVISO_AL_REVES = "Pusiste las fechas al revés: se comparan de la más vieja a la más nueva.";

export interface FilaComparar {
  medida: Medida;
  desde: { valor: number | null; grado: Rango | null };
  hasta: { valor: number | null; grado: Rango | null };
  cambio: CambioMedida;
}

/** Las medidas con dato en alguna de las dos fechas y los nombres de las que no tienen en ninguna. */
export function filasDeComparar(controles: Control[], par: Par, catalogo: Catalogo | null): { filas: FilaComparar[]; sinMedir: string[] } {
  const a = controles[par.desde];
  const b = controles[par.hasta];
  const filas: FilaComparar[] = [];
  const sinMedir: string[] = [];
  for (const campo of FILAS) {
    const m = MEDIDAS[campo];
    const d = celdaDe(a, m, catalogo);
    const h = celdaDe(b, m, catalogo);
    if (d.valor == null && !d.grado && h.valor == null && !h.grado) {
      sinMedir.push(m.nombre);
      continue;
    }
    // Con la misma fecha en las dos puntas no hay cambio que contar.
    const c = par.misma ? SIN_CAMBIO : cambioEntre(a, b, m, catalogo);
    filas.push({ medida: m, desde: d, hasta: h, cambio: { ...c, grado: par.misma ? null : (c.grado ?? cambioDeGrado(d.grado, h.grado)) } });
  }
  return { filas, sinMedir };
}

/** «Cadera y Pecho», «A, B y C». */
export function listaConY(nombres: string[]): string {
  if (nombres.length <= 1) return nombres.join("");
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

/** «Sin medir en esas fechas: Cadera y Pecho.» (o nada). */
export function textoSinMedir(sinMedir: string[]): string | null {
  return sinMedir.length ? `Sin medir en esas fechas: ${listaConY(sinMedir)}.` : null;
}
