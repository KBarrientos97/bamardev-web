import { fmtPlata } from "../../format";
import { fechaLarga, fmtNumero, hoyIso, redondear } from "../calculo";
import type {
  CatalogoSeguimiento,
  DosisAnotada,
  Equivalencias,
  MesTratamiento,
  Paso,
  Pagado,
  PagoPendiente,
  Producto,
  Registro,
  Tratamiento,
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
export function rachaAntes(
  registros: Registro[],
  semana: number,
  /**
   * Los escalones de cada semana (§7.4). Con ellos, una dosis que es un
   * escalón cuenta con los mg del escalón: tras un cambio de vial, 25 UI del
   * de 20 mg/ml siguen la racha de 17 UI del de 30 (las dos son los 5 mg), en
   * vez de empezar de 1 por los 5,1 mg de la cuenta exacta.
   */
  escalonesDe?: (semana: number) => EscalonesDeLaSemana | null,
): { dosis: DosisAnotada; aplicaciones: number; semana: number } | null {
  const antes = registros.filter((r) => r.semana < semana).sort((a, b) => a.semana - b.semana);
  const nominal = (d: DosisAnotada, s: number) => (escalonesDe ? conMgDelEscalon(d, escalonesDe(s)) : d);
  let ultima: { dosis: DosisAnotada; semana: number } | null = null;
  let referencia: DosisAnotada | null = null;
  let aplicaciones = 0;
  for (let i = antes.length - 1; i >= 0; i--) {
    const d = dosisDelRegistro(antes[i]);
    if (!d) continue;
    const n = nominal(d, antes[i].semana);
    if (!ultima || !referencia) {
      ultima = { dosis: d, semana: antes[i].semana };
      referencia = n;
    } else if (!mismaDosis(n, referencia)) break;
    aplicaciones++;
  }
  return ultima ? { ...ultima, aplicaciones } : null;
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

/**
 * Cómo se lee un escalón en su botón: «8 UI · 2,5 mg»; con la unidad en mg,
 * «2,5 mg · 8 UI». Un escalón son sus valores nominales (§7.4): sin «≈».
 */
export function textoPaso(p: Paso, unidad: UnidadDosis): string {
  const { principal, secundario } = partesPaso(p, unidad);
  return secundario ? `${principal} · ${secundario}` : principal;
}

/**
 * Un escalón en su botón grande, en dos renglones: arriba el número en la
 * unidad del tratamiento («8 UI», «2,5 mg», «0,08 ml») y abajo el otro dato
 * («2,5 mg»; con la unidad en mg, «8 UI»). Sin poder pasarlo, sólo los mg.
 * Sin «≈»: para la doctora, 8 rayitas SON los 2,5 mg (§7.4).
 */
export function partesPaso(p: Paso, unidad: UnidadDosis): { principal: string; secundario: string | null } {
  const mg = `${numeroDeDosis(p.mg, "mg").texto}${NB}mg`;
  if (unidad === "mg") return { principal: mg, secundario: p.ui == null ? null : `${numeroDeDosis(p.ui, "UI").texto}${NB}UI` };
  const v = valorDelPaso(p, unidad);
  return v == null ? { principal: mg, secundario: null } : { principal: `${numeroDeDosis(v, unidad).texto}${NB}${unidad}`, secundario: mg };
}

// ── Cómo se lee una dosis anotada (§7.4) ────────────────────────────────────

/** La jeringa de insulina del contrato (§2): 100 UI por ml, si no llega el catálogo. */
const UI_POR_ML = 100;

/**
 * Lo que hace falta para leer una dosis de una semana (§7.4): los escalones
 * de la droga (en mg) y la concentración del producto vigente esa semana
 * (`mgPorMl`, una pista: se usa si coincide con la que se guardó en el registro).
 */
export interface EscalonesDeLaSemana {
  pasosMg: number[];
  mgPorMl?: number | null;
  uiPorMl?: number;
}

/**
 * La concentración (mg por ml) con que se guardó una dosis: la delatan sus
 * equivalencias (mg / ml). Si la pista del vial de esa semana es la misma (con
 * el redondeo de por medio), va la del vial, exacta. null si no se sabe.
 */
export function concentracionDeLaDosis(d: Partial<Equivalencias>, pista?: number | null): number | null {
  const deLaDosis = d.dosisMg != null && d.dosisMl != null && d.dosisMg > 0 && d.dosisMl > 0 ? d.dosisMg / d.dosisMl : null;
  if (deLaDosis != null && pista != null && pista > 0 && Math.abs(deLaDosis - pista) <= pista * 0.02) return pista;
  return deLaDosis;
}

/** Lo que escribe el botón de un escalón, como número (las UI en entero, los ml con 2, los mg tal cual). */
function escritoDelPaso(n: number, unidad: UnidadDosis): number {
  // Primero a 6 decimales: 7,5 mg en un vial de 20 mg/ml son 37,5 UI, no 37,4999… (que bajaría a 37).
  const limpio = redondear(n, 6);
  return unidad === "UI" ? redondear(limpio, 0) : unidad === "ml" ? redondear(limpio, 2) : redondear(limpio, 3);
}

/** Una dosis lista para leer (§7.4). */
export interface DosisLeida {
  /** Lo anotado, como se anotó: «8 UI». */
  anotado: string;
  /** Las equivalencias en gris, cada una entera: «2,5 mg», «0,08 ml». */
  equivalencias: string[];
  /** Si las equivalencias son una cuenta (van con «≈»); las de un escalón, no. */
  aprox: boolean;
  /** El otro dato de un renglón: los mg (con la dosis en mg, las UI). «12,5 mg», «≈ 8 UI». null si no se sabe. */
  otra: string | null;
  /** El mismo, sin «≈» (para el PDF, cuya fuente no lo tiene). */
  otraSinAprox: string | null;
  /** Las equivalencias nominales del escalón con que coincide, o null si no coincide con ninguno. */
  delEscalon: Equivalencias | null;
}

/**
 * Cómo se MUESTRA una dosis anotada, en toda la sección y en el PDF (§7.4).
 * El servidor manda las equivalencias exactas; si lo anotado, en su unidad,
 * coincide con lo que escribe el botón de un escalón con la concentración de
 * ESA semana (8 UI con el vial de 30 mg/ml es el escalón de 2,5 mg: 8,3
 * redondeado), se muestran las del escalón y sin «≈» («8 UI · 2,5 mg», no
 * «8 UI ≈ 2,4 mg»). En mg es el espejo: 2,5 mg es «2,5 mg · 8 UI». Si no
 * coincide con ningún escalón (o no hay escalones), las calculadas, con «≈».
 */
export function leerDosis(d: Pick<DosisAnotada, "dosis" | "unidadDosis"> & Partial<Equivalencias>, escalones?: EscalonesDeLaSemana | null): DosisLeida {
  const unidad = d.unidadDosis;
  const anotado = fmtDosis(d.dosis, unidad);
  const otraUnidad: UnidadDosis = unidad === "mg" ? "UI" : "mg";
  const uiPorMl = escalones?.uiPorMl && escalones.uiPorMl > 0 ? escalones.uiPorMl : UI_POR_ML;
  const c = concentracionDeLaDosis(d, escalones?.mgPorMl);
  const paso = (escalones?.pasosMg ?? []).find((mg) => {
    const v = unidad === "mg" ? mg : c ? (unidad === "ml" ? mg / c : (mg / c) * uiPorMl) : null;
    return v != null && Math.abs(escritoDelPaso(v, unidad) - d.dosis) < 1e-9;
  });
  if (paso != null) {
    const ml = c ? paso / c : null;
    const eq: Equivalencias = { dosisMg: paso, dosisUi: ml != null ? ml * uiPorMl : null, dosisMl: ml };
    const v = eq[CAMPO[otraUnidad]];
    const otra = v == null ? null : `${numeroDeDosis(v, otraUnidad).texto}${NB}${otraUnidad}`;
    return { anotado, equivalencias: partesEquivalencias(eq, unidad), aprox: false, otra, otraSinAprox: otra, delEscalon: eq };
  }
  const v = d[CAMPO[otraUnidad]];
  return {
    anotado,
    equivalencias: partesEquivalencias(d, unidad),
    aprox: true,
    otra: v == null ? null : fmtDosisCalculada(v, otraUnidad),
    otraSinAprox: v == null ? null : `${numeroDeDosis(v, otraUnidad).texto}${NB}${otraUnidad}`,
    delEscalon: null,
  };
}

/**
 * La dosis con los mg de su escalón, si es uno (§7.4: 17 UI con el vial de 30
 * mg/ml SON los 5 mg). Para «Igual que la anterior» con otro vial: los mismos
 * 5 mg son 25 UI con el de 20 mg/ml (el escalón), no 26 (los 5,1 mg de la
 * cuenta exacta, que además subían de a poco la dosis en cada cambio de vial).
 */
export function conMgDelEscalon<T extends Pick<DosisAnotada, "dosis" | "unidadDosis"> & Partial<Equivalencias>>(d: T, escalones?: EscalonesDeLaSemana | null): T {
  const e = leerDosis(d, escalones).delEscalon;
  return e ? { ...d, dosisMg: e.dosisMg } : d;
}

/** Los escalones de la droga en mg: los que manda el servidor o, si el producto de hoy no es del catálogo, los de otro que sí (§7.1). */
export function pasosMgDe(
  t: Pick<Tratamiento, "pasos" | "nombre" | "presentacion" | "productoInicial" | "registros">,
  catalogo: Pick<CatalogoSeguimiento, "tratamientos" | "ocultos"> | null | undefined,
  ...otrosNombres: string[]
): number[] {
  if (t.pasos.length) return t.pasos.map((p) => p.mg);
  const nombres = [...otrosNombres, productoInicialDe(t).nombre, ...t.registros.flatMap((r) => (r.producto ? [r.producto.nombre] : []))];
  for (const n of nombres) {
    const pasos = delCatalogo(catalogo, n)?.pasosMg;
    if (pasos?.length) return pasos;
  }
  return [];
}

/** La concentración del vial de un producto (mg por ml), o null sin vial. */
export function mgPorMlDe(p: Producto): number | null {
  return p.vialMg != null && p.vialMl != null && p.vialMg > 0 && p.vialMl > 0 ? p.vialMg / p.vialMl : null;
}

/** Lo que hace falta para leer las dosis de la semana `semana` de un tratamiento (§7.4). */
export function escalonesDeLaSemana(
  t: Pick<Tratamiento, "pasos" | "nombre" | "presentacion" | "productoInicial" | "registros">,
  semana: number,
  catalogo?: Pick<CatalogoSeguimiento, "tratamientos" | "ocultos" | "uiPorMl"> | null,
): EscalonesDeLaSemana {
  const p = productoVigente(t, semana);
  return { pasosMg: pasosMgDe(t, catalogo, p.nombre), mgPorMl: mgPorMlDe(p), uiPorMl: catalogo?.uiPorMl };
}

/**
 * Una dosis con su otro dato, en un renglón: «8 UI · 2,5 mg» (lo del botón
 * «Igual que la anterior»). Lo anotado va como se anotó; el otro dato, el del
 * escalón si coincide con uno (§7.4) o la cuenta (con «≈» si se redondeó).
 */
export function dosisConMg(d: Pick<DosisAnotada, "dosis" | "unidadDosis"> & Partial<Equivalencias>, escalones?: EscalonesDeLaSemana | null): string {
  const l = leerDosis(d, escalones);
  return l.otra ? `${l.anotado} · ${l.otra}` : l.anotado;
}

/** «8 UI (2,5 mg)»: la dosis de la franja «La semana pasada»; en mg, sola. */
export function dosisYSusMg(d: Pick<DosisAnotada, "dosis" | "unidadDosis"> & Partial<Equivalencias>, escalones?: EscalonesDeLaSemana | null): string {
  const l = leerDosis(d, escalones);
  return d.unidadDosis !== "mg" && l.otra ? `${l.anotado} (${l.otra})` : l.anotado;
}

/** «Subir: 25 UI (7,5 mg)»; con la unidad en mg, «Subir: 7,5 mg (25 UI)». */
export function textoSubir(p: Paso, unidad: UnidadDosis): string {
  const { principal, secundario } = partesPaso(p, unidad);
  return secundario ? `Subir: ${principal} (${secundario})` : `Subir: ${principal}`;
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

// ── El producto de cada semana (§7.1) ───────────────────────────────────────

/** El producto con el que EMPEZÓ el tratamiento (un backend sin marcas: el del tratamiento). */
export function productoInicialDe(t: Pick<Tratamiento, "nombre" | "presentacion" | "productoInicial">): Producto {
  return t.productoInicial ?? { nombre: t.nombre, vialMg: t.presentacion?.mg ?? null, vialMl: t.presentacion?.ml ?? null };
}

/** La semana con la marca de cambio más alta que sea ≤ `semana` (sin contar el registro `sinId`), o null. */
export function marcaVigente(registros: Registro[], semana: number, sinId?: number | null): Registro | null {
  let r: Registro | null = null;
  for (const x of registros) if (x.producto && x.id !== sinId && x.semana <= semana && (!r || x.semana > r.semana)) r = x;
  return r;
}

/**
 * El producto vigente en la semana W (§7.1): la marca de la semana más alta
 * ≤ W que tenga marca; si no hay, el del inicio. `sinId` saca de la cuenta el
 * registro que se está corrigiendo (su marca está en el formulario).
 */
export function productoVigente(t: Pick<Tratamiento, "nombre" | "presentacion" | "productoInicial" | "registros">, semana: number, sinId?: number | null): Producto {
  const m = marcaVigente(t.registros, semana, sinId)?.producto;
  return m ? { nombre: m.nombre, vialMg: m.vialMg ?? null, vialMl: m.vialMl ?? null } : productoInicialDe(t);
}

/** «Tirze · 15 mg en 0,5 ml», o sólo el nombre si no tiene vial. */
export function textoProducto(p: Producto): string {
  return p.vialMg != null && p.vialMl != null ? `${p.nombre} · ${textoPresentacion(p.vialMg, p.vialMl)}` : p.nombre;
}

/** El renglón de la marca en la tabla: «Desde la semana 12 usa Tirze · 15 mg en 0,5 ml · antes Tirzepatida». */
export function textoMarca(r: Pick<Registro, "semana" | "producto">): string {
  return partesMarca(r).join(" · ");
}

/** El renglón de la marca en partes («Desde la semana 12 usa Tirze», «15 mg en 0,5 ml», «antes Tirzepatida»), para que baje entera cada una. */
export function partesMarca(r: Pick<Registro, "semana" | "producto">): string[] {
  if (!r.producto) return [];
  const { nombre, vialMg, vialMl, anterior } = r.producto;
  return [
    `Desde la semana ${r.semana} usa ${nombre}`,
    ...(vialMg != null && vialMl != null ? [textoPresentacion(vialMg, vialMl)] : []),
    ...(anterior ? [`antes ${anterior}`] : []),
  ];
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

/**
 * El tratamiento del catálogo que se llama así (sin distinguir mayúsculas ni
 * tildes), o null. Busca también en los que el negocio ocultó (§9.1): que no
 * salga como botón no le quita los escalones al paciente que ya lo usa.
 */
export function delCatalogo(catalogo: Pick<CatalogoSeguimiento, "tratamientos" | "ocultos"> | null | undefined, nombre: string): TratamientoDelCatalogo | null {
  const n = normalizar(nombre);
  if (!n || !catalogo) return null;
  const es = (t: TratamientoDelCatalogo) => normalizar(t.nombre) === n;
  return catalogo.tratamientos.find(es) ?? catalogo.ocultos?.find(es) ?? null;
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

/** La plata sin partirse: «Bs 600», con el espacio duro (sin «.00», regla del producto). */
const plata = (n: number) => fmtPlata(n).replace(/ /g, NB);

/**
 * Una referencia del pago en la hoja «Semana» (§8.2): lo que lleva pagado el
 * mes, con palabras («El mes 1 pagó Bs 600») y aparte su detalle
 * («Medicamento Bs 450 · Control Bs 150»), que se muestra entero o baja entero.
 */
export interface ReferenciaPago {
  texto: string;
  /** Los conceptos mayores que cero; con uno solo, sólo su nombre («Medicamento»). null si no hay. */
  detalle: string | null;
}

/**
 * «Medicamento Bs 450 · Control Bs 150 · Otro Bs 20»: sólo los conceptos
 * mayores que cero y en ese orden; con uno solo, sólo su nombre (la plata ya
 * está en el texto). Cada concepto con espacios duros, y el «·» pegado al de
 * antes: si no entra, se corta sólo entre un concepto y otro.
 */
export function detallePagado(p: Pick<Pagado, "medicamento" | "control" | "otro">): string | null {
  const conceptos = (
    [
      ["Medicamento", p.medicamento],
      ["Control", p.control],
      ["Otro", p.otro],
    ] as const
  ).filter(([, n]) => redondear(n || 0, 2) > 0);
  if (!conceptos.length) return null;
  if (conceptos.length === 1) return conceptos[0][0];
  return conceptos.map(([nombre, n]) => `${nombre}${NB}${plata(n)}`).join(`${NB}· `);
}

/**
 * Las referencias del pago para la semana `semana` (§8.2), por MES y con lo
 * que ya manda el servidor en `meses` (un mes se puede pagar en varias
 * visitas: lo que se lee es el mes entero, no el último pago suelto):
 * - «Este mes ya lleva Bs 250»: lo pagado en OTRAS semanas del mes de esta
 *   (los tres conceptos). Si `registro` (la semana que se corrige) es de ese
 *   mes, lo que tiene guardado no cuenta.
 * - «El mes 1 pagó Bs 600»: el mes anterior, con su `pagado.total`; si debe
 *   (no tiene medicamento ni control, aunque tenga «Otro»), «El mes 1 sigue
 *   sin pago»; si no pagó y no debe (avisos apagados), nada. En el mes 1 no
 *   hay mes anterior.
 * Primero la de este mes. Vacío si la semana cae fuera de los meses que mandó
 * el servidor (como `tocaPago`).
 */
export function referenciasDelPago(
  meses: MesTratamiento[],
  semana: number,
  registro?: Pick<Registro, "mes" | "pagoMedicamento" | "pagoControl" | "pagoOtro"> | null,
): ReferenciaPago[] {
  const mes = mesDeLaSemana(meses, semana);
  if (!mes) return [];
  const refs: ReferenciaPago[] = [];
  const propio = registro && registro.mes === mes.mes ? registro : null;
  const resto = (pagado: number, suyo: number | null | undefined) => Math.max(0, redondear((pagado || 0) - (suyo ?? 0), 2));
  const sinEsta = {
    medicamento: resto(mes.pagado.medicamento, propio?.pagoMedicamento),
    control: resto(mes.pagado.control, propio?.pagoControl),
    otro: resto(mes.pagado.otro, propio?.pagoOtro),
  };
  const llevado = redondear(sinEsta.medicamento + sinEsta.control + sinEsta.otro, 2);
  if (llevado > 0) refs.push({ texto: `Este mes ya lleva ${plata(llevado)}`, detalle: detallePagado(sinEsta) });
  const anterior = meses.find((m) => m.mes === mes.mes - 1);
  if (anterior) {
    const total = redondear(anterior.pagado.total || 0, 2);
    // Primero si debe: un mes con sólo «Otro» anotado no está pagado (decir «pagó Bs 20» confundiría).
    if (anterior.debe) refs.push({ texto: `El mes ${anterior.mes} sigue sin pago`, detalle: null });
    else if (total > 0) refs.push({ texto: `El mes ${anterior.mes} pagó ${plata(total)}`, detalle: detallePagado(anterior.pagado) });
  }
  return refs;
}

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
 * El último pago en «Pagos pendientes», un renglón por elemento (§8.2): con el
 * mes de ese pago y lo que pagó ese mes entero, «El mes 1 pagó Bs 600» y
 * «Último pago: el 21/11/2026» (un mes se puede pagar en dos visitas: lo que
 * se lee primero es el mes, no el último pago suelto). Un backend anterior no
 * manda el mes: «Último pago: Bs 350 el 21/11/2026». Sin pago, «Todavía no
 * pagó nada». «el» va pegado a la fecha: en la columna angosta quedaba «…Bs
 * 630 el» en un renglón y la fecha sola en el otro.
 */
export function textoUltimoPago(u: UltimoPago | null | undefined): string[] {
  if (!u) return ["Todavía no pagó nada"];
  const fecha = `el${NB}${fechaLarga(u.fecha)}`;
  if (u.mes != null && u.pagadoEnElMes != null) return [`El mes ${u.mes} pagó ${plata(u.pagadoEnElMes)}`, `Último pago: ${fecha}`];
  return [`Último pago: ${plata(u.total)} ${fecha}`];
}

/** Lo que se ofrece del peso de la Evaluación: «La evaluación de hoy anotó 121,8 kg» con «Usar ese». */
export interface PesoDeLaEvaluacion {
  texto: string;
  pesoKg: number;
}

/**
 * Cuándo se anotó un peso, para ordenarlo como la serie única del §4.4: por
 * su día y, el mismo día, por cuándo se guardó (`actualizadoEn`, ISO).
 */
export interface MomentoDelPeso {
  fecha: string;
  actualizadoEn?: string | null;
}

/**
 * ¿`a` se anotó DESPUÉS que `b`? Un día mayor, o el mismo día con un
 * `actualizadoEn` estrictamente mayor. Si alguno no trae su `actualizadoEn`
 * (un backend anterior), el mismo día no es «después».
 */
export function anotadoDespues(a: MomentoDelPeso, b: MomentoDelPeso): boolean {
  if (a.fecha !== b.fecha) return a.fecha > b.fecha;
  const ta = a.actualizadoEn ? Date.parse(a.actualizadoEn) : NaN;
  const tb = b.actualizadoEn ? Date.parse(b.actualizadoEn) : NaN;
  return Number.isFinite(ta) && Number.isFinite(tb) && ta > tb;
}

/**
 * El último peso del seguimiento (§8.2): el más reciente de TODAS las semanas
 * con peso (por fecha y, el mismo día, por `actualizadoEn`; no por número de
 * semana). null si ninguna tiene peso.
 */
export function ultimoPesoDelSeguimiento<R extends Pick<Registro, "fecha" | "pesoKg" | "actualizadoEn">>(registros: readonly R[]): R | null {
  let ultimo: R | null = null;
  for (const r of registros) if (r.pesoKg != null && (!ultimo || anotadoDespues(r, ultimo))) ultimo = r;
  return ultimo;
}

/** ¿Es un día escrito como «AAAA-MM-DD»? (el campo de fecha vacío o a medio escribir, no). */
export const esDia = (s: string | null | undefined): s is string => !!s && DIA.test(s);

/**
 * El peso del último control de la Evaluación, para ofrecerlo con «Usar»
 * (nunca se precarga, §4.4 y §8.2). Al iniciar (y en el registro inicial),
 * siempre. En una semana, sólo si el control se anotó DESPUÉS del último peso
 * del seguimiento (`ultimoPeso`, ver `ultimoPesoDelSeguimiento`; sin ningún
 * peso, sí) y no es de un día posterior al de la hoja (`fechaHoja`; sin una
 * fecha válida, el de hoy). Así dice lo mismo que la Evaluación: se ofrece
 * cuando el peso al día del paciente es el de un control.
 */
export function pesoDeLaEvaluacion(
  ultimoControl: (MomentoDelPeso & { pesoKg: number }) | null,
  ultimoPeso: MomentoDelPeso | null,
  rotulo: "semana" | "inicio",
  hoy = hoyIso(),
  fechaHoja?: string | null,
): PesoDeLaEvaluacion | null {
  if (!ultimoControl) return null;
  if (rotulo === "semana") {
    if (ultimoPeso && !anotadoDespues(ultimoControl, ultimoPeso)) return null;
    if (ultimoControl.fecha > (esDia(fechaHoja) ? fechaHoja : hoy)) return null;
  }
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
