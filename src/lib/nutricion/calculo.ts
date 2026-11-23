import { isoDia } from "../format";
import type { Catalogo, Control, MedidaConTabla, Rango, Sexo, TablaGrados, TonoGrado } from "./tipos";

/**
 * Las cuentas de la evaluación de pacientes, sin pantalla: leer y mostrar los
 * números, el IMC, la edad, qué tabla de grados toca y qué grado le
 * corresponde a un valor (CONTRATO-nutricion-evaluacion-22nov §3.1 y §4).
 *
 * La web NO copia los rangos: las tablas llegan de `GET /nutricion/catalogo`.
 * Acá sólo está la regla para leerlas (`desde <= valor < hasta`, edades
 * inclusive, `null` = sin tope o para los dos sexos).
 */

// ── Números ─────────────────────────────────────────────────────────────────

/** Lo que se acepta mientras se escribe: «72», «72,5», «72.5», «72,» y «,5». */
const NUMERO = /^(\d+([.,]\d*)?|[.,]\d+)$/;

/** El número escrito con coma o con punto; null si está vacío o no es un número. */
export function leerNumero(texto: string | null | undefined): number | null {
  const t = (texto ?? "").trim();
  if (!NUMERO.test(t)) return null;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** El signo menos de verdad (U+2212): el guion corto se lee como un guion. */
export const MENOS = "−";

/**
 * Redondea como el servidor: el medio sube (18,45 → 18,5). Con la cuenta
 * común (`Math.round(18.45 * 10)`) da 18,4, porque 18,45 no se guarda
 * exacto en binario; corriendo la coma con el exponente, sí.
 */
export function redondear(n: number, decimales: number): number {
  if (!Number.isFinite(n)) return n;
  const signo = n < 0 ? -1 : 1;
  const abs = Math.abs(n);
  // Un número que ya viene en notación exponencial (un resto de 1e-16) no admite el truco: es cero a esta escala.
  const r = /e/i.test(String(abs))
    ? Math.round(abs * 10 ** decimales) / 10 ** decimales
    : Number(`${Math.round(Number(`${abs}e${decimales}`))}e-${decimales}`);
  return signo * r || 0;
}

/**
 * El número con coma y sin ceros de más: «82,4», «158», «0,5». Se redondea
 * antes, así un 33,0000001 de una cuenta sale «33». Los negativos llevan el
 * signo menos de verdad.
 */
export function fmtNumero(n: number | null | undefined, maxDecimales = 1): string {
  if (n == null || !Number.isFinite(n)) return "";
  const r = redondear(Math.abs(n), maxDecimales);
  const fijo = r.toFixed(maxDecimales);
  // Los ceros se sacan sólo después de la coma: «100» sigue siendo cien.
  const texto = (fijo.includes(".") ? fijo.replace(/0+$/, "").replace(/\.$/, "") : fijo).replace(".", ",");
  return n < 0 && r !== 0 ? `${MENOS}${texto}` : texto;
}

/** «82,4 kg», «158 cm», «41,2 %»; «—» sin dato. El espacio es duro: la unidad no baja sola. */
export function conUnidad(n: number | null | undefined, unidad: string, maxDecimales = 1): string {
  const t = fmtNumero(n, maxDecimales);
  if (!t) return "—";
  return unidad ? `${t} ${unidad}` : t;
}

/** El cambio con su signo: «+1,2», «−3,7», «0». */
export function fmtCambio(d: number | null | undefined, maxDecimales = 1): string {
  if (d == null || !Number.isFinite(d)) return "";
  const t = fmtNumero(d, maxDecimales);
  if (t === "0" || t === "") return "0";
  return d > 0 ? `+${t}` : t;
}

/** Lo que cambió de `anterior` a `actual`, sin el resto de la coma flotante. */
export function cambio(actual: number | null | undefined, anterior: number | null | undefined): number | null {
  if (actual == null || anterior == null) return null;
  return redondear(actual - anterior, 2);
}

/** ¿Es sólo números? (el buscador manda el texto al carnet en vez del nombre). */
export function esSoloDigitos(texto: string): boolean {
  return /^\d+$/.test(texto.trim());
}

// ── Topes (para frenar un dedazo; el backend valida lo mismo) ─────────────

export type CampoNumerico =
  | "pesoKg"
  | "tallaCm"
  | "cinturaCm"
  | "caderaCm"
  | "pechoCm"
  | "grasaPct"
  | "musculoPct"
  | "edadCorporal"
  | "grasaVisceral"
  | "hijos"
  | "edad";

export interface Tope {
  min: number;
  max: number;
  /** Los decimales que se guardan (0 = entero). */
  decimales: number;
  /** De cuánto en cuánto (la grasa visceral va de 0,5 en 0,5). */
  paso?: number;
  unidad: string;
}

/** §3.3 «Topes de validación». Los decimales, los del servidor (§3.4): el peso a 2, el resto a 1. */
export const TOPES: Record<CampoNumerico, Tope> = {
  pesoKg: { min: 20, max: 400, decimales: 2, unidad: "kg" },
  tallaCm: { min: 80, max: 250, decimales: 1, unidad: "cm" },
  cinturaCm: { min: 30, max: 250, decimales: 1, unidad: "cm" },
  caderaCm: { min: 30, max: 250, decimales: 1, unidad: "cm" },
  pechoCm: { min: 30, max: 250, decimales: 1, unidad: "cm" },
  grasaPct: { min: 3, max: 75, decimales: 1, unidad: "%" },
  musculoPct: { min: 5, max: 70, decimales: 1, unidad: "%" },
  edadCorporal: { min: 10, max: 99, decimales: 0, unidad: "años" },
  grasaVisceral: { min: 1, max: 59, decimales: 1, paso: 0.5, unidad: "" },
  hijos: { min: 0, max: 20, decimales: 0, unidad: "" },
  edad: { min: 1, max: 120, decimales: 0, unidad: "años" },
};

/** Lo que está mal en lo escrito, o null si está bien (o vacío). */
export function errorDeTope(campo: CampoNumerico, texto: string): string | null {
  if (!texto.trim()) return null;
  const n = leerNumero(texto);
  if (n == null) return "Escribí sólo el número";
  const t = TOPES[campo];
  if (t.decimales === 0 && !Number.isInteger(n)) return "Sin decimales";
  if (t.paso && Math.abs(n / t.paso - Math.round(n / t.paso)) > 1e-9) {
    return `Va de ${fmtNumero(t.paso)} en ${fmtNumero(t.paso)}`;
  }
  if (n < t.min || n > t.max) return `Entre ${fmtNumero(t.min)} y ${fmtNumero(t.max)}${t.unidad ? ` ${t.unidad}` : ""}`;
  return null;
}

/** El número escrito, redondeado a lo que se guarda; null vacío o inválido. */
export function valorDe(campo: CampoNumerico, texto: string): number | null {
  const n = leerNumero(texto);
  if (n == null) return null;
  return redondear(n, TOPES[campo].decimales);
}

/** Cómo se ve un valor del campo: con coma y sin ceros de más («82,4»). */
export function textoDe(campo: CampoNumerico, n: number | null | undefined): string {
  return fmtNumero(n, TOPES[campo].decimales);
}

// ── IMC y edad ──────────────────────────────────────────────────────────────

/** Peso / talla², con un decimal (lo mismo que calcula el servidor). */
export function calcularImc(pesoKg: number | null | undefined, tallaCm: number | null | undefined): number | null {
  if (!pesoKg || !tallaCm || pesoKg <= 0 || tallaCm <= 0) return null;
  const metros = tallaCm / 100;
  return redondear(pesoKg / (metros * metros), 1);
}

const DIA = /^(\d{4})-(\d{2})-(\d{2})$/;

function partes(fecha: string): [number, number, number] | null {
  const m = DIA.exec(fecha);
  if (!m) return null;
  const [a, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mes < 1 || mes > 12 || d < 1 || d > 31) return null;
  return [a, mes, d];
}

/** Los años cumplidos en `hoy` de quien nació en `nacimiento` ("AAAA-MM-DD"). */
export function edadEn(nacimiento: string | null | undefined, hoy: string): number | null {
  const n = nacimiento ? partes(nacimiento) : null;
  const h = partes(hoy);
  if (!n || !h || n[0] < 1900) return null;
  const edad = h[0] - n[0] - (h[1] < n[1] || (h[1] === n[1] && h[2] < n[2]) ? 1 : 0);
  return edad >= 0 ? edad : null;
}

/**
 * La edad que tenía el paciente el día de un control: la que manda para elegir
 * la tabla de ese control (§3.4), no la de hoy. Con fecha de nacimiento, la
 * cuenta exacta; con la edad anotada (la de hoy), se le restan los años que
 * pasaron desde el control.
 */
export function edadEnFecha(
  paciente: { fechaNacimiento?: string | null; edad?: number | null },
  fecha: string | null | undefined,
  hoy = hoyIso(),
): number | null {
  if (!fecha) return paciente.fechaNacimiento ? edadEn(paciente.fechaNacimiento, hoy) : (paciente.edad ?? null);
  if (paciente.fechaNacimiento) return edadEn(paciente.fechaNacimiento, fecha);
  if (paciente.edad == null) return null;
  const pasaron = edadEn(fecha, hoy) ?? 0;
  return Math.max(0, paciente.edad - pasaron);
}

/** Hoy, "AAAA-MM-DD", en la hora de la compu (la del negocio). */
export function hoyIso(): string {
  return isoDia(new Date());
}

/** «22 nov» para el eje del gráfico. */
export function fechaCorta(fecha: string): string {
  const p = partes(fecha);
  if (!p) return fecha;
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${p[2]} ${MESES[p[1] - 1]}`;
}

/** «22/11/2026». */
export function fechaLarga(fecha: string | null | undefined): string {
  const p = fecha ? partes(fecha) : null;
  if (!p) return "—";
  return `${String(p[2]).padStart(2, "0")}/${String(p[1]).padStart(2, "0")}/${p[0]}`;
}

/**
 * La edad corporal comparada con la de verdad: «4 años más que su edad»
 * (ámbar) o «2 años menos que su edad» (verde). Sin la edad real, nada.
 */
export function textoEdadCorporal(
  edadCorporal: number | null | undefined,
  edadReal: number | null | undefined,
): { texto: string; tono: TonoGrado } | null {
  if (edadCorporal == null || edadReal == null) return null;
  const d = Math.round(edadCorporal - edadReal);
  if (d === 0) return { texto: "Igual a su edad", tono: "bien" };
  const n = Math.abs(d);
  const anos = n === 1 ? "año" : "años";
  return d > 0 ? { texto: `${n} ${anos} más que su edad`, tono: "alerta" } : { texto: `${n} ${anos} menos que su edad`, tono: "bien" };
}

// ── Tablas de grados ─────────────────────────────────────────────────────────

export interface TablaElegida {
  /** La tabla que toca, o null (falta un dato, o no hay tabla para esa edad). */
  tabla: TablaGrados | null;
  faltaSexo: boolean;
  faltaEdad: boolean;
}

const sirveEdad = (t: TablaGrados, edad: number) =>
  (t.edadDesde == null || edad >= t.edadDesde) && (t.edadHasta == null || edad <= t.edadHasta);

/**
 * La tabla que le toca a ese sexo y esa edad. Lo que no se sabe no descarta
 * ninguna: si con lo que se sabe queda una sola, es ésa (el IMC no pide nada);
 * si quedan varias, falta lo que las distingue.
 */
export function tablaQueToca(tablas: TablaGrados[] | undefined, sexo: Sexo | null | undefined, edad: number | null | undefined): TablaElegida {
  const lista = tablas ?? [];
  const posibles = lista.filter(
    (t) => (t.sexo == null || !sexo || t.sexo === sexo) && (edad == null || sirveEdad(t, edad)),
  );
  if (posibles.length <= 1) return { tabla: posibles[0] ?? null, faltaSexo: false, faltaEdad: false };
  const faltaSexo = !sexo && new Set(posibles.map((t) => t.sexo ?? "")).size > 1;
  const faltaEdad = edad == null && new Set(posibles.map((t) => `${t.edadDesde}-${t.edadHasta}`)).size > 1;
  if (!faltaSexo && !faltaEdad) return { tabla: posibles[0], faltaSexo: false, faltaEdad: false };
  return { tabla: null, faltaSexo, faltaEdad };
}

/** El renglón en el que cae el valor: `desde <= valor < hasta`. */
export function rangoDe(tabla: TablaGrados | null | undefined, valor: number | null | undefined): Rango | null {
  if (!tabla || valor == null || !Number.isFinite(valor)) return null;
  return tabla.rangos.find((r) => (r.desde == null || valor >= r.desde) && (r.hasta == null || valor < r.hasta)) ?? null;
}

/** El grado que pone la tabla (lo mismo que haría el servidor), o null. */
export function gradoDeTabla(
  tablas: TablaGrados[] | undefined,
  sexo: Sexo | null | undefined,
  edad: number | null | undefined,
  valor: number | null | undefined,
): string | null {
  return rangoDe(tablaQueToca(tablas, sexo, edad).tabla, valor)?.grado ?? null;
}

/**
 * Dónde va la aguja del medidor en semicírculo (0 = punta izquierda, 1 =
 * derecha). Cada rango es un sector del mismo ancho, como en la hoja de la
 * doctora, y adentro del sector la aguja avanza en proporción. Los sectores
 * de las puntas no tienen tope: se les da el ancho del vecino (el de «Bajo
 * peso» va de 12 a 18,5). Fuera de la escala, la aguja queda en la punta.
 */
export function posicionEnMedidor(valor: number | null | undefined, rangos: Rango[]): number | null {
  const n = rangos.length;
  if (valor == null || !Number.isFinite(valor) || n === 0) return null;
  const ancho = (r: Rango | undefined) => (r && r.desde != null && r.hasta != null ? r.hasta - r.desde : 5);
  for (let i = 0; i < n; i++) {
    const r = rangos[i];
    const desde = r.desde ?? (r.hasta ?? 0) - ancho(rangos[i + 1]);
    const hasta = r.hasta ?? (r.desde ?? 0) + ancho(rangos[i - 1]);
    const ultimo = i === n - 1;
    if (valor < hasta || ultimo) {
      const t = Math.min(1, Math.max(0, (valor - desde) / (hasta - desde || 1)));
      return (i + t) / n;
    }
  }
  return 1;
}

/** «Falta el sexo para ver la tabla», «… la edad …» o «… el sexo y la edad …». */
export function textoFaltaTabla(faltaSexo: boolean, faltaEdad: boolean): string {
  const que = faltaSexo && faltaEdad ? "el sexo y la edad" : faltaSexo ? "el sexo" : "la edad";
  return `Falta ${que} para ver la tabla`;
}

/**
 * El nombre y el color de un grado guardado («OBESIDAD_1» → «Obesidad grado I»,
 * alto). Los grados se llaman igual en todas las tablas de una medida.
 */
export function grado(catalogo: Catalogo | null | undefined, medida: MedidaConTabla, codigo: string | null | undefined): Rango | null {
  if (!catalogo || !codigo) return null;
  for (const t of catalogo.tablas[medida] ?? []) {
    const r = t.rangos.find((x) => x.grado === codigo);
    if (r) return r;
  }
  return null;
}

// ── Controles ───────────────────────────────────────────────────────────────

/** Las medidas de un control que se siguen en el tiempo. */
export type CampoControl =
  | "pesoKg"
  | "imc"
  | "cinturaCm"
  | "caderaCm"
  | "pechoCm"
  | "grasaPct"
  | "musculoPct"
  | "edadCorporal"
  | "grasaVisceral";

/**
 * El último valor de esa medida ANTES del control `hasta` (sin contarlo), o el
 * último de todos sin `hasta`. Es el «anterior» que se muestra en gris.
 */
export function ultimoValor(controles: Control[], campo: CampoControl, hasta?: number): { valor: number; fecha: string } | null {
  const fin = hasta == null ? controles.length : hasta;
  for (let i = fin - 1; i >= 0; i--) {
    const v = controles[i][campo];
    if (v != null) return { valor: v, fecha: controles[i].fecha };
  }
  return null;
}

/** El primero con esa medida (el del inicio). */
export function primerValor(controles: Control[], campo: CampoControl): { valor: number; fecha: string } | null {
  for (const c of controles) if (c[campo] != null) return { valor: c[campo] as number, fecha: c.fecha };
  return null;
}

/** Los puntos de la evolución de una medida: sólo los controles que la tienen. */
export function evolucion(controles: Control[], campo: CampoControl): { fecha: string; valor: number }[] {
  return controles.flatMap((c) => (c[campo] == null ? [] : [{ fecha: c.fecha, valor: c[campo] as number }]));
}

export interface ResumenMedida {
  actual: number;
  fecha: string;
  /** Desde el primer control con esa medida (null si es el mismo). */
  desdeInicio: number | null;
  /** Desde el control anterior con esa medida (null si no hay). */
  desdeAnterior: number | null;
}

/** El valor de hoy de una medida, con lo que cambió desde el inicio y desde el anterior. */
export function resumenDe(controles: Control[], campo: CampoControl): ResumenMedida | null {
  const puntos = evolucion(controles, campo);
  if (!puntos.length) return null;
  const ultimo = puntos[puntos.length - 1];
  return {
    actual: ultimo.valor,
    fecha: ultimo.fecha,
    desdeInicio: puntos.length > 1 ? cambio(ultimo.valor, puntos[0].valor) : null,
    desdeAnterior: puntos.length > 1 ? cambio(ultimo.valor, puntos[puntos.length - 2].valor) : null,
  };
}
