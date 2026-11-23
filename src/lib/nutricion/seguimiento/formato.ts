import { fmtPlata } from "../../format";
import { fechaLarga, fmtNumero, hoyIso, redondear } from "../calculo";
import type {
  CatalogoSeguimiento,
  DosisAnotada,
  Equivalencias,
  MesTratamiento,
  Paso,
  PagoPendiente,
  Registro,
  TratamientoDelCatalogo,
  UltimoPago,
  UnidadDosis,
} from "./tipos";

/**
 * Cómo se leen los números del seguimiento (CONTRATO-nutricion-seguimiento-23nov
 * §4): la dosis con sus equivalencias, los kilos que bajó o subió, los días
 * desde la última visita, los meses y los pagos. Sin pantalla, para poder
 * probarlo. La cuenta de los meses NO está acá: la hace el servidor (§2).
 */

/** El espacio duro: «17 UI» no se parte en dos renglones. */
const NB = " ";

/** Los tres botones de «¿En qué anotás la dosis?», en este orden. */
export const UNIDADES_DOSIS: UnidadDosis[] = ["UI", "mg", "ml"];

// ── La dosis ────────────────────────────────────────────────────────────────

/**
 * Un número de dosis en su unidad (§4.2 «Cómo se muestra una dosis»): las UI
 * en entero, los mg con hasta 2 decimales sin ceros de más y los ml con 2.
 * `aprox` dice si hubo que redondear (8,3 UI → «8»).
 */
export function numeroDeDosis(n: number, unidad: UnidadDosis): { texto: string; aprox: boolean } {
  if (unidad === "UI") {
    const e = redondear(n, 0);
    return { texto: fmtNumero(e, 0), aprox: Math.abs(e - n) > 1e-9 };
  }
  const r = redondear(n, 2);
  const texto = unidad === "ml" ? r.toFixed(2).replace(".", ",") : fmtNumero(r, 2);
  return { texto, aprox: Math.abs(r - n) > 1e-9 };
}

/** «17 UI», «5,1 mg», «0,17 ml»; con «≈» delante si se redondeó. */
export function fmtDosis(n: number, unidad: UnidadDosis): string {
  const { texto, aprox } = numeroDeDosis(n, unidad);
  return `${aprox ? `≈${NB}` : ""}${texto}${NB}${unidad}`;
}

const CAMPO: Record<UnidadDosis, keyof Equivalencias> = { mg: "dosisMg", UI: "dosisUi", ml: "dosisMl" };
/** El orden de las equivalencias en gris: mg, UI, ml. */
const ORDEN_EQUIVALENCIAS: UnidadDosis[] = ["mg", "UI", "ml"];

/**
 * Las equivalencias en gris, sin la unidad en que se anotó: «≈ 5,1 mg ·
 * 0,17 ml». Vacío si no se puede saber ninguna (UI sin presentación: sólo ml).
 */
export function textoEquivalencias(eq: Partial<Equivalencias>, anotadaEn: UnidadDosis | null): string {
  const partes = partesEquivalencias(eq, anotadaEn);
  return partes.length ? `≈${NB}${partes.join(" · ")}` : "";
}

/** Cada equivalencia por separado («5,1 mg», «0,17 ml»), para que bajen enteras de renglón. */
export function partesEquivalencias(eq: Partial<Equivalencias>, anotadaEn: UnidadDosis | null): string[] {
  return ORDEN_EQUIVALENCIAS.filter((u) => u !== anotadaEn).flatMap((u) => {
    const v = eq[CAMPO[u]];
    return v == null ? [] : [`${numeroDeDosis(v, u).texto}${NB}${u}`];
  });
}

/** Una dosis anotada para leer: lo anotado y, aparte, sus equivalencias. */
export function textoDosis(d: Pick<DosisAnotada, "dosis" | "unidadDosis"> & Partial<Equivalencias>): { anotado: string; equivalencias: string } {
  return { anotado: fmtDosis(d.dosis, d.unidadDosis), equivalencias: textoEquivalencias(d, d.unidadDosis) };
}

/** La dosis de un registro, o null si no se anotó (o no se aplicó). */
export function dosisDelRegistro(r: Registro): DosisAnotada | null {
  if (r.sinDosis || r.dosis == null || !r.unidadDosis) return null;
  return { dosis: r.dosis, unidadDosis: r.unidadDosis, dosisMg: r.dosisMg, dosisUi: r.dosisUi, dosisMl: r.dosisMl };
}

/** El número de esa dosis en otra unidad (la del tratamiento hoy), o null si no se puede saber. */
export function enUnidad(d: Partial<DosisAnotada> | null | undefined, unidad: UnidadDosis): number | null {
  if (!d) return null;
  if (d.unidadDosis === unidad && d.dosis != null) return d.dosis;
  return d[CAMPO[unidad]] ?? null;
}

/**
 * Lo que escribe un botón de un toque en el campo de la dosis (§4.2): en la
 * unidad del tratamiento, las UI en entero, los ml con 2 decimales y los mg
 * tal cual. Con coma, como se escribe a mano.
 */
export function paraEscribir(n: number, unidad: UnidadDosis): string {
  if (unidad === "UI") return fmtNumero(redondear(n, 0), 0);
  if (unidad === "ml") return fmtNumero(redondear(n, 2), 2);
  return fmtNumero(n, 3);
}

/** El número de un escalón en esa unidad (null si sin presentación no se puede pasar a UI o ml). */
export function valorDelPaso(p: Paso, unidad: UnidadDosis): number | null {
  return unidad === "mg" ? p.mg : unidad === "UI" ? p.ui : p.ml;
}

/** Cómo se lee un escalón en su botón: «8 UI · 2,5 mg»; con la unidad en mg, «2,5 mg · ≈ 8 UI». */
export function textoPaso(p: Paso, unidad: UnidadDosis): string {
  const mg = `${numeroDeDosis(p.mg, "mg").texto}${NB}mg`;
  if (unidad === "mg") return p.ui == null ? mg : `${mg} · ≈${NB}${numeroDeDosis(p.ui, "UI").texto}${NB}UI`;
  const v = valorDelPaso(p, unidad);
  return v == null ? mg : `${numeroDeDosis(v, unidad).texto}${NB}${unidad} · ${mg}`;
}

/** «Subir: 25 UI (7,5 mg)»; con la unidad en mg, «Subir: 7,5 mg (≈ 25 UI)». */
export function textoSubir(p: Paso, unidad: UnidadDosis): string {
  const mg = `${numeroDeDosis(p.mg, "mg").texto}${NB}mg`;
  if (unidad === "mg") return p.ui == null ? `Subir: ${mg}` : `Subir: ${mg} (≈${NB}${numeroDeDosis(p.ui, "UI").texto}${NB}UI)`;
  const v = valorDelPaso(p, unidad);
  return v == null ? `Subir: ${mg}` : `Subir: ${numeroDeDosis(v, unidad).texto}${NB}${unidad} (${mg})`;
}

/**
 * El escalón que sigue al de la dosis de antes, comparando por mg (§4.2
 * «Subir»). La dosis de antes «está» en un escalón si el botón de ese escalón
 * escribiría el mismo número (8 UI es el escalón de 2,5 mg: 8,3 UI redondeado);
 * si no está en ninguno, el primero con más mg. Sin dosis de antes, sin mg o en
 * el último escalón: null.
 */
export function pasoSiguiente(pasos: Paso[], antes: Partial<DosisAnotada> | null | undefined, unidad: UnidadDosis): Paso | null {
  if (!antes || !pasos.length) return null;
  const actual = enUnidad(antes, unidad);
  if (actual != null) {
    const escrito = paraEscribir(actual, unidad);
    const i = pasos.findIndex((p) => {
      const v = valorDelPaso(p, unidad);
      return v != null && paraEscribir(v, unidad) === escrito;
    });
    if (i >= 0) return pasos[i + 1] ?? null;
  }
  const mg = antes.dosisMg ?? (antes.unidadDosis === "mg" ? antes.dosis : null);
  if (mg == null) return null;
  return pasos.find((p) => p.mg > mg + 1e-9) ?? null;
}

/**
 * Las equivalencias de una dosis escrita, con la concentración del vial y la
 * jeringa de insulina (§2 «Equivalencias»: ml = mg / mgPorMl · UI = ml × 100 ·
 * mg = ml × mgPorMl). Es la misma cuenta del servidor, sólo para mostrar en
 * gris mientras se escribe; lo que se guarda lo calcula él. Sin presentación,
 * de UI a ml (y al revés) sí; los mg quedan null. mg a 2 decimales, UI a 1, ml a 3.
 */
export function equivalenciasDe(dosis: number, unidad: UnidadDosis, mgPorMl: number | null | undefined, uiPorMl: number): Equivalencias {
  const conc = mgPorMl && mgPorMl > 0 ? mgPorMl : null;
  const ml = unidad === "ml" ? dosis : unidad === "UI" ? dosis / uiPorMl : conc ? dosis / conc : null;
  const mg = unidad === "mg" ? dosis : ml != null && conc ? ml * conc : null;
  const ui = ml != null ? ml * uiPorMl : null;
  return {
    dosisMg: mg == null ? null : redondear(mg, 2),
    dosisUi: ui == null ? null : redondear(ui, 1),
    dosisMl: ml == null ? null : redondear(ml, 3),
  };
}

/** La concentración de un vial escrito a mano (15 mg en 0,5 ml → 30 mg/ml, 1 UI = 0,3 mg). */
export function concentracion(mg: number, ml: number, uiPorMl: number): { mgPorMl: number; mgPorUi: number } | null {
  if (!(mg > 0) || !(ml > 0) || !(uiPorMl > 0)) return null;
  const mgPorMl = mg / ml;
  return { mgPorMl, mgPorUi: mgPorMl / uiPorMl };
}

/** Los escalones del catálogo con sus equivalencias (para iniciar, cuando el tratamiento todavía no existe). */
export function pasosDe(pasosMg: number[], mgPorMl: number | null | undefined, uiPorMl: number): Paso[] {
  return pasosMg.map((mg) => {
    const eq = equivalenciasDe(mg, "mg", mgPorMl, uiPorMl);
    return { mg, ui: eq.dosisUi, ml: eq.dosisMl };
  });
}

/** «Vial de 15 mg en 0,5 ml». */
export function textoVial(mg: number, ml: number): string {
  return `Vial de ${fmtNumero(mg, 2)}${NB}mg en ${fmtNumero(ml, 2)}${NB}ml`;
}

/** «1 UI = 0,3 mg». */
export function textoMgPorUi(mgPorUi: number): string {
  return `1${NB}UI = ${fmtNumero(mgPorUi, 3)}${NB}mg`;
}

/** La aclaración de la jeringa, con lo que trae el catálogo (100 UI por ml). */
export function textoJeringa(uiPorMl: number): string {
  return `jeringa de insulina de ${fmtNumero(uiPorMl, 0)}${NB}UI por ml`;
}

// ── El catálogo ─────────────────────────────────────────────────────────────

/** En minúsculas y sin tildes: «Tirzepatída» y «TIRZEPATIDA» son el mismo. */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

/** El tratamiento del catálogo que se llama así (sin distinguir mayúsculas ni tildes), o null. */
export function delCatalogo(catalogo: Pick<CatalogoSeguimiento, "tratamientos"> | null | undefined, nombre: string): TratamientoDelCatalogo | null {
  const n = normalizar(nombre);
  if (!n || !catalogo) return null;
  return catalogo.tratamientos.find((t) => normalizar(t.nombre) === n) ?? null;
}

// ── Los kilos ───────────────────────────────────────────────────────────────

/**
 * Lo que bajó o subió, con su flecha: positivo = bajó («↓ 7,2»), negativo =
 * subió («↑ 0,8»), cero = igual. null sin dato.
 */
export function flechaKg(kg: number | null | undefined): { texto: string; subio: boolean; igual: boolean } | null {
  if (kg == null || !Number.isFinite(kg)) return null;
  const r = redondear(kg, 2);
  if (r === 0) return { texto: "=", subio: false, igual: true };
  return { texto: `${r > 0 ? "↓" : "↑"}${NB}${fmtNumero(Math.abs(r), 2)}`, subio: r < 0, igual: false };
}

/**
 * Lo que cambia con el peso que se está escribiendo (§4.2): «↓ 1,2 esta
 * semana · ↓ 7,2 en total». Sin peso de antes o sin el inicial, la parte que
 * falta no va.
 */
export function textoCambioPeso(peso: number | null, anterior: number | null, inicial: number | null): string {
  if (peso == null) return "";
  const partes: string[] = [];
  const semana = anterior != null ? flechaKg(anterior - peso) : null;
  if (semana) partes.push(semana.igual ? "igual que la semana anterior" : `${semana.texto} esta semana`);
  const total = inicial != null ? flechaKg(inicial - peso) : null;
  if (total && !total.igual) partes.push(`${total.texto} en total`);
  return partes.join(" · ");
}

// ── Fechas y semanas ────────────────────────────────────────────────────────

const DIA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Los días de `desde` a `hasta` ("AAAA-MM-DD"); null si alguna no es una fecha. */
export function diasEntre(desde: string, hasta: string): number | null {
  const a = DIA.exec(desde);
  const b = DIA.exec(hasta);
  if (!a || !b) return null;
  const ua = Date.UTC(+a[1], +a[2] - 1, +a[3]);
  const ub = Date.UTC(+b[1], +b[2] - 1, +b[3]);
  return Math.round((ub - ua) / 86_400_000);
}

/**
 * «hoy», «ayer», «hace 7 días» (desde la fecha hasta hoy), con espacios duros:
 * no se parte en «(hace» / «46 días)». Una fecha futura, la fecha.
 */
export function haceDias(fecha: string | null | undefined, hoy = hoyIso()): string {
  if (!fecha) return "";
  const d = diasEntre(fecha, hoy);
  if (d == null) return "";
  if (d < 0) return fechaLarga(fecha);
  if (d === 0) return "hoy";
  if (d === 1) return "ayer";
  return `hace${NB}${d}${NB}días`;
}

/** «14/12», para lo que va al lado de un campo. */
export function diaYMes(fecha: string): string {
  const m = DIA.exec(fecha);
  return m ? `${m[3]}/${m[2]}` : fecha;
}

/** «Inicial», «Semana 6». */
export function nombreSemana(semana: number): string {
  return semana === 0 ? "Inicial" : `Semana ${semana}`;
}

/** Para el eje del gráfico, que va apretado: «Inicial», «Sem. 6». */
export function semanaCorta(semana: number): string {
  return semana === 0 ? "Inicial" : `Sem.${NB}${semana}`;
}

// ── Los meses y los pagos ───────────────────────────────────────────────────

/** «Mes 1 · Inicial a semana 4», «Mes 2 · Semanas 5 a 9». */
export function tituloMes(m: Pick<MesTratamiento, "mes" | "desdeSemana" | "hastaSemana">): string {
  return m.desdeSemana === 0
    ? `Mes ${m.mes} · Inicial a semana ${m.hastaSemana}`
    : `Mes ${m.mes} · Semanas ${m.desdeSemana} a ${m.hastaSemana}`;
}

/** El mes de la hoja donde cae esa semana (de los que mandó el servidor), o null. */
export function mesDeLaSemana(meses: MesTratamiento[], semana: number): MesTratamiento | null {
  return meses.find((m) => semana >= m.desdeSemana && semana <= m.hastaSemana) ?? null;
}

/** ¿En esa semana se paga su mes? (0 = el pago inicial, que también cuenta para el aviso de la hoja). */
export function esSemanaDePago(meses: MesTratamiento[], semana: number): boolean {
  const m = mesDeLaSemana(meses, semana);
  return m != null && m.semanaDePago === semana;
}

/** El casillero amarillo del papel: la semana de pago de su mes, sin el inicial. */
export function casilleroAmarillo(meses: MesTratamiento[], semana: number): boolean {
  return semana > 0 && esSemanaDePago(meses, semana);
}

/** Lo que cuenta como «pagó el mes»: medicamento y control (otro no). */
export const pagoDelMes = (p: { medicamento: number; control: number }) => (p.medicamento || 0) + (p.control || 0);

/** Lo que pagó en un registro, contando los tres conceptos. */
export const pagoDelRegistro = (r: Pick<Registro, "pagoMedicamento" | "pagoControl" | "pagoOtro">) =>
  (r.pagoMedicamento ?? 0) + (r.pagoControl ?? 0) + (r.pagoOtro ?? 0);

/** «Falta el pago de la semana 5 (desde el 07/12/2026)», o «Falta el pago inicial». */
export function textoFaltaPago(p: PagoPendiente): string {
  return p.semana === 0 ? "Falta el pago inicial" : `Falta el pago de la semana ${p.semana} (desde el ${fechaLarga(p.desde)})`;
}

/** «Pago de la semana 5 · desde el 07/12/2026 (hace 9 días)»; el del mes 1, «Pago inicial · …». */
export function textoPendiente(p: PagoPendiente, hoy = hoyIso()): string {
  const que = p.semana === 0 ? "Pago inicial" : `Pago de la semana ${p.semana}`;
  const hace = haceDias(p.desde, hoy);
  return `${que} · desde el ${fechaLarga(p.desde)}${hace ? ` (${hace})` : ""}`;
}

/** «Último pago: Bs 630 el 02/11/2026», o «Todavía no pagó nada». */
export function textoUltimoPago(u: UltimoPago | null | undefined): string {
  return u ? `Último pago: ${fmtPlata(u.total)} el ${fechaLarga(u.fecha)}` : "Todavía no pagó nada";
}

/** Lo que se ofrece del peso de la Evaluación: «Evaluación del 14/12/2026: 121,8 kg» con «Usar». */
export interface PesoDeLaEvaluacion {
  texto: string;
  pesoKg: number;
}

/**
 * El peso del último control de la Evaluación, para ofrecerlo con «Usar»
 * (nunca se precarga, §4.4): al iniciar, siempre; en una semana, si es del
 * mismo día o posterior al último peso del seguimiento (`desde`).
 */
export function pesoDeLaEvaluacion(
  ultimoControl: { fecha: string; pesoKg: number } | null,
  desde: string | null,
  rotulo: "semana" | "inicio",
): PesoDeLaEvaluacion | null {
  if (!ultimoControl) return null;
  if (rotulo === "semana" && desde && ultimoControl.fecha < desde) return null;
  const kg = `${fmtNumero(ultimoControl.pesoKg, 2)}${NB}kg`;
  return {
    pesoKg: ultimoControl.pesoKg,
    texto:
      rotulo === "inicio"
        ? `Último control de la evaluación: ${kg} (${fechaLarga(ultimoControl.fecha)})`
        : `Evaluación del ${fechaLarga(ultimoControl.fecha)}: ${kg}`,
  };
}

/** Mujer u Hombre, o nada. */
export const textoSexo = (s: "F" | "M" | null | undefined) => (s === "F" ? "Mujer" : s === "M" ? "Hombre" : null);

/** «1 semana», «2 semanas». */
export const semanas = (n: number) => `${n} ${n === 1 ? "semana" : "semanas"}`;
