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
 * Un número de dosis CALCULADO (una equivalencia, lo que escribe un escalón):
 * las UI en entero, los mg con hasta 2 decimales sin ceros de más y los ml
 * con 2. `aprox` dice si hubo que redondear (8,3 UI → «8»). Lo anotado no
 * pasa por acá: va como se anotó (`fmtDosis`).
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

/**
 * Una dosis ANOTADA, en su propia unidad, como se anotó (Kevin, 23-nov: si
 * escribió «7,5» en UI es «7,5 UI», no «≈ 8 UI»): hasta 3 decimales, sin
 * ceros de más, en mg, UI o ml («17 UI», «5,1 mg», «0,15 ml», «0,5 ml»).
 */
export function fmtDosis(n: number, unidad: UnidadDosis): string {
  return `${fmtNumero(n, 3)}${NB}${unidad}`;
}

/**
 * Una dosis CALCULADA (pasada a otra unidad o a otro vial), con la regla de
 * las equivalencias: «≈ 38 UI», «2,25 mg», «0,25 ml»; con «≈» si se redondeó.
 */
export function fmtDosisCalculada(n: number, unidad: UnidadDosis): string {
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

/** Dos dosis son la misma si coinciden en mg (cuando las dos los tienen) o, si no, en número y unidad (§2 «Misma dosis»). */
export function mismaDosis(a: Pick<DosisAnotada, "dosis" | "unidadDosis" | "dosisMg">, b: Pick<DosisAnotada, "dosis" | "unidadDosis" | "dosisMg">): boolean {
  if (a.dosisMg != null && b.dosisMg != null) return Math.abs(a.dosisMg - b.dosisMg) < 1e-9;
  return a.unidadDosis === b.unidadDosis && Math.abs(a.dosis - b.dosis) < 1e-9;
}

/**
 * La última dosis aplicada ANTES de la semana `semana` y cuántas aplicaciones
 * seguidas lleva con ella, contando hacia atrás (§2: las «No se aplicó» y las
 * semanas sin dosis no cortan la racha ni suman). Es lo de la franja «La
 * semana pasada» y la que viene marcada en una semana nueva. null si no hay.
 */
export function rachaAntes(registros: Registro[], semana: number): { dosis: DosisAnotada; aplicaciones: number; semana: number } | null {
  const antes = registros.filter((r) => r.semana < semana).sort((a, b) => a.semana - b.semana);
  let ultima: { dosis: DosisAnotada; semana: number } | null = null;
  let aplicaciones = 0;
  for (let i = antes.length - 1; i >= 0; i--) {
    const d = dosisDelRegistro(antes[i]);
    if (!d) continue;
    if (!ultima) ultima = { dosis: d, semana: antes[i].semana };
    else if (!mismaDosis(d, ultima.dosis)) break;
    aplicaciones++;
  }
  return ultima ? { ...ultima, aplicaciones } : null;
}

/** El último pago anotado antes de esa semana: «El anterior: Bs 600 el 20/10 (450 + 150)». */
export function ultimoPagoAntes(registros: Registro[], semana: number): { fecha: string; total: number; partes: number[] } | null {
  const conPago = registros
    .filter((r) => r.semana < semana && pagoDelRegistro(r) > 0)
    .sort((a, b) => a.semana - b.semana);
  const r = conPago[conPago.length - 1];
  if (!r) return null;
  const partes = [r.pagoMedicamento, r.pagoControl, r.pagoOtro].filter((n): n is number => n != null && n > 0);
  return { fecha: r.fecha, total: redondear(pagoDelRegistro(r), 2), partes };
}

/** «El anterior: Bs 600 el 20/10 (450 + 150)»; con un solo concepto, sin el paréntesis. */
export function textoPagoAnterior(p: { fecha: string; total: number; partes: number[] }): string {
  const detalle = p.partes.length > 1 ? ` (${p.partes.map((n) => fmtNumero(n, 2)).join(" + ")})` : "";
  return `El anterior: ${fmtPlata(p.total)} el${NB}${diaYMes(p.fecha)}${detalle}`;
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

/**
 * Un escalón en su botón grande, en dos renglones: arriba el número en la
 * unidad del tratamiento («8 UI», «2,5 mg», «0,08 ml») y abajo el otro dato
 * («2,5 mg»; con la unidad en mg, «≈ 8 UI»). Sin poder pasarlo, sólo los mg.
 */
export function partesPaso(p: Paso, unidad: UnidadDosis): { principal: string; secundario: string | null } {
  const mg = `${numeroDeDosis(p.mg, "mg").texto}${NB}mg`;
  if (unidad === "mg") return { principal: mg, secundario: p.ui == null ? null : `≈${NB}${numeroDeDosis(p.ui, "UI").texto}${NB}UI` };
  const v = valorDelPaso(p, unidad);
  return v == null ? { principal: mg, secundario: null } : { principal: `${numeroDeDosis(v, unidad).texto}${NB}${unidad}`, secundario: mg };
}

/**
 * Una dosis con su otro dato, en un renglón: «8 UI · 2,5 mg» (lo de la franja
 * «La semana pasada» y los botones grandes). Lo anotado va como se anotó; la
 * equivalencia, sin «≈» (es la misma cuenta del vial de esa semana).
 */
export function dosisConMg(d: Pick<DosisAnotada, "dosis" | "unidadDosis"> & Partial<Equivalencias>): string {
  const anotado = fmtDosis(d.dosis, d.unidadDosis);
  const otra = d.unidadDosis === "mg" ? d.dosisUi : d.dosisMg;
  return otra == null ? anotado : `${anotado} · ${fmtDosisCalculada(otra, d.unidadDosis === "mg" ? "UI" : "mg")}`;
}

/** «8 UI (2,4 mg)»: la dosis de la franja «La semana pasada»; en mg, sola. */
export function dosisYSusMg(d: Pick<DosisAnotada, "dosis" | "unidadDosis"> & Partial<Equivalencias>): string {
  const anotado = fmtDosis(d.dosis, d.unidadDosis);
  return d.unidadDosis !== "mg" && d.dosisMg != null ? `${anotado} (${fmtDosisCalculada(d.dosisMg, "mg")})` : anotado;
}

/** «Subir: 25 UI (7,5 mg)»; con la unidad en mg, «Subir: 7,5 mg (≈ 25 UI)». */
export function textoSubir(p: Paso, unidad: UnidadDosis): string {
  const mg = `${numeroDeDosis(p.mg, "mg").texto}${NB}mg`;
  if (unidad === "mg") return p.ui == null ? `Subir: ${mg}` : `Subir: ${mg} (≈${NB}${numeroDeDosis(p.ui, "UI").texto}${NB}UI)`;
  const v = valorDelPaso(p, unidad);
  return v == null ? `Subir: ${mg}` : `Subir: ${numeroDeDosis(v, unidad).texto}${NB}${unidad} (${mg})`;
}

/**
 * La dosis de antes en la unidad de hoy, para «Igual que la anterior» (§2
 * «Misma dosis»: la misma dosis son los mismos mg). Si se conocen sus mg y la
 * concentración de HOY, se pasa por los mg: con otro vial, 25 UI de 30 mg/ml
 * (7,5 mg) son 37,5 UI de 20 mg/ml, no 25 (eso serían 5 mg). Si lo que
 * escribiría el botón es lo mismo que se anotó, va lo anotado tal cual. Sin mg
 * o sin vial hoy, como antes: lo anotado o su equivalencia.
 */
export function mismaDosisEn(
  antes: Partial<DosisAnotada> | null | undefined,
  unidad: UnidadDosis,
  mgPorMl: number | null | undefined,
  uiPorMl: number,
): number | null {
  if (!antes) return null;
  const mg = antes.dosisMg ?? (antes.unidadDosis === "mg" ? antes.dosis : null);
  if (mg != null && (unidad === "mg" || (mgPorMl && mgPorMl > 0))) {
    const eq = equivalenciasDe(mg, "mg", mgPorMl, uiPorMl);
    const hoy = unidad === "mg" ? mg : unidad === "UI" ? eq.dosisUi : eq.dosisMl;
    if (hoy != null) {
      if (antes.unidadDosis === unidad && antes.dosis != null && paraEscribir(antes.dosis, unidad) === paraEscribir(hoy, unidad)) return antes.dosis;
      return hoy;
    }
  }
  return enUnidad(antes, unidad);
}

/**
 * «Igual que la anterior», listo para el botón y el campo: el número que
 * escribe (la misma que se anotó va tal cual, «7,5»; pasada a otro vial o a
 * otra unidad es una cuenta, en entero las UI), si es una cuenta (`calculada`)
 * y el número. null sin dosis de antes o si no se puede pasar a la unidad de hoy.
 */
export function igualQueLaAnterior(
  antes: Partial<DosisAnotada> | null | undefined,
  unidad: UnidadDosis,
  mgPorMl: number | null | undefined,
  uiPorMl: number,
): { escribe: string; valor: number; calculada: boolean } | null {
  const igual = antes ? mismaDosisEn(antes, unidad, mgPorMl, uiPorMl) : null;
  if (igual == null || !antes) return null;
  const calculada = antes.unidadDosis !== unidad || antes.dosis == null || paraEscribir(igual, unidad) !== paraEscribir(antes.dosis, unidad);
  return { escribe: calculada ? paraEscribir(igual, unidad) : fmtNumero(igual, 3), valor: igual, calculada };
}

/**
 * El escalón que sigue al de la dosis de antes, comparando por mg (§4.2
 * «Subir»). La dosis de antes «está» en un escalón si el botón de ese escalón,
 * con el vial de ESA semana, habría escrito el mismo número (8 UI es el
 * escalón de 2,5 mg: 8,3 UI redondeado); así un cambio de vial no hace que
 * «Subir» repita los mismos mg ni saltee un escalón. Si no está en ninguno, el
 * primero con más mg. Sin mg de antes (se anotó sin vial), lo anotado contra
 * los escalones de hoy. Sin dosis de antes, sin mg o en el último escalón: null.
 */
export function pasoSiguiente(pasos: Paso[], antes: Partial<DosisAnotada> | null | undefined, unidad: UnidadDosis): Paso | null {
  if (!antes || !pasos.length) return null;
  const mg = antes.dosisMg ?? (antes.unidadDosis === "mg" ? antes.dosis : null);
  const u = antes.unidadDosis;
  if (mg != null && u && antes.dosis != null && antes.dosis > 0 && mg > 0) {
    // Cuánto de su unidad era cada mg ese día (el vial de entonces).
    const porMg = u === "mg" ? 1 : antes.dosis / mg;
    const escrito = paraEscribir(antes.dosis, u);
    const i = pasos.findIndex((p) => paraEscribir(p.mg * porMg, u) === escrito);
    if (i >= 0) return pasos[i + 1] ?? null;
  } else {
    const actual = enUnidad(antes, unidad);
    if (actual != null) {
      const escrito = paraEscribir(actual, unidad);
      const i = pasos.findIndex((p) => {
        const v = valorDelPaso(p, unidad);
        return v != null && paraEscribir(v, unidad) === escrito;
      });
      if (i >= 0) return pasos[i + 1] ?? null;
    }
  }
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
  return `Vial de ${textoPresentacion(mg, ml)}`;
}

/** «15 mg en 0,5 ml». */
export function textoPresentacion(mg: number, ml: number): string {
  return `${fmtNumero(mg, 2)}${NB}mg en ${fmtNumero(ml, 2)}${NB}ml`;
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

/** Hacia dónde fue el peso: bajó, subió o quedó igual (con palabras, no sólo con color ni flechas). */
export type TonoKg = "bajo" | "subio" | "igual";

/**
 * Lo que bajó (positivo) o subió (negativo), con palabras: «Bajó 0,7»,
 * «Subió 0,3», «Igual». `kg` es lo de antes menos lo de ahora. null sin dato.
 */
export function textoKg(kg: number | null | undefined): { texto: string; tono: TonoKg; cifra: string } | null {
  if (kg == null || !Number.isFinite(kg)) return null;
  const r = redondear(kg, 2);
  if (r === 0) return { texto: "Igual", tono: "igual", cifra: "0" };
  const cifra = fmtNumero(Math.abs(r), 2);
  return r > 0 ? { texto: `Bajó${NB}${cifra}`, tono: "bajo", cifra } : { texto: `Subió${NB}${cifra}`, tono: "subio", cifra };
}

/**
 * El total desde el inicio, de dato secundario al lado del de la semana (§7):
 * «2,1 desde el inicio» (bajó), «Subió 0,8 desde el inicio», «Igual que al
 * inicio». null sin dato.
 */
export function textoKgTotal(kg: number | null | undefined): string | null {
  const k = textoKg(kg);
  if (!k) return null;
  if (k.tono === "igual") return "Igual que al inicio";
  return k.tono === "bajo" ? `${k.cifra} desde el inicio` : `Subió ${k.cifra} desde el inicio`;
}

/**
 * El resultado en vivo mientras se escribe el peso (§7.2): contra el último
 * peso cargado antes de esa semana («Bajó 0,7 kg» · «desde la semana
 * pasada»; si ese peso es de otra semana, «desde la semana 4» o «desde el
 * inicial») y, debajo, el total («Bajó 2,8 kg desde el inicio (126 kg)»).
 */
export function resultadoDelPeso(
  peso: number | null,
  antes: { pesoKg: number; semana: number } | null,
  inicial: { pesoKg: number; semana: number } | null,
  semana: number,
): { semana: { texto: string; desde: string; tono: TonoKg } | null; total: string | null } | null {
  if (peso == null) return null;
  const s = antes ? textoKg(antes.pesoKg - peso) : null;
  const desde = !antes ? "" : antes.semana === 0 ? "desde el inicial" : antes.semana === semana - 1 ? "desde la semana pasada" : `desde la semana ${antes.semana}`;
  // Si el de antes ES el primer peso, el total diría lo mismo: no va.
  const t = inicial && inicial.semana !== antes?.semana ? textoKg(inicial.pesoKg - peso) : null;
  const deInicio = inicial ? ` (${fmtNumero(inicial.pesoKg, 2)}${NB}kg)` : "";
  return {
    semana: s ? (s.tono === "igual" ? { texto: "Igual", desde: desde.replace(/^desde /, "que "), tono: s.tono } : { texto: `${s.texto}${NB}kg`, desde, tono: s.tono }) : null,
    total: !t ? null : t.tono === "igual" ? `Igual que al inicio${deInicio}` : `${t.texto}${NB}kg desde el inicio${deInicio}`,
  };
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

/**
 * «Último pago: Bs 630 el 02/11/2026», o «Todavía no pagó nada». «el» va
 * pegado a la fecha: en la columna angosta de «Pagos pendientes» quedaba «…Bs
 * 630 el» en un renglón y la fecha sola en el otro.
 */
export function textoUltimoPago(u: UltimoPago | null | undefined): string {
  return u ? `Último pago: ${fmtPlata(u.total)} el${NB}${fechaLarga(u.fecha)}` : "Todavía no pagó nada";
}

/** Lo que se ofrece del peso de la Evaluación: «La evaluación de hoy anotó 121,8 kg» con «Usar ese». */
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
  hoy = hoyIso(),
): PesoDeLaEvaluacion | null {
  if (!ultimoControl) return null;
  if (rotulo === "semana" && desde && ultimoControl.fecha < desde) return null;
  const kg = `${fmtNumero(ultimoControl.pesoKg, 2)}${NB}kg`;
  return {
    pesoKg: ultimoControl.pesoKg,
    texto:
      rotulo === "inicio"
        ? `Último control de la evaluación: ${kg} (${fechaLarga(ultimoControl.fecha)})`
        : ultimoControl.fecha === hoy
          ? `La evaluación de hoy anotó ${kg}`
          : `La evaluación del ${fechaLarga(ultimoControl.fecha)} anotó ${kg}`,
  };
}

/** Mujer u Hombre, o nada. */
export const textoSexo = (s: "F" | "M" | null | undefined) => (s === "F" ? "Mujer" : s === "M" ? "Hombre" : null);

/** «1 semana», «2 semanas». */
export const semanas = (n: number) => `${n} ${n === 1 ? "semana" : "semanas"}`;
