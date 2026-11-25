import { errorDeTope, fmtNumero, hoyIso, leerNumero, redondear, textoDe, valorDe } from "../calculo";
import type { CambiosTratamiento, IniciarTratamientoInput, ProductoSeguimiento, Registro, RegistroInput, Tratamiento, UnidadDosis, Vial } from "./tipos";

/**
 * Lo que se escribe en la hoja «Semana N» y en «Iniciar tratamiento» (todo
 * texto, como está en los campos) y cómo se convierte en lo que viaja al
 * backend (CONTRATO-nutricion-seguimiento-23nov §3.3 y §4.2). Todo campo de
 * carga arranca VACÍO, salvo la fecha (hoy) y el número de la semana: lo de la
 * semana anterior va en gris al lado y los botones de un toque escriben recién
 * cuando se tocan.
 */

export interface FormSemana {
  /** El número de la semana (en el inicial no se muestra ni cambia). */
  semana: string;
  fecha: string;
  pesoKg: string;
  dosis: string;
  /** «No se aplicó esta semana». */
  sinDosis: boolean;
  motivoSinDosis: string;
  observaciones: string;
  pagoMedicamento: string;
  pagoControl: string;
  pagoOtro: string;
  pagoNota: string;
  /** «Cambió de producto desde esta semana» (§7.1): la marca está puesta. Nunca en el inicial. */
  cambioProducto: boolean;
  /** El producto nuevo (arranca vacío) y su vial (opcional: los dos o ninguno). */
  productoNombre: string;
  productoVialMg: string;
  productoVialMl: string;
}

/** Una semana nueva: el número y la fecha de hoy; lo demás, vacío. */
export function semanaVacia(semana: number, fecha = hoyIso()): FormSemana {
  return {
    semana: String(semana),
    fecha,
    pesoKg: "",
    dosis: "",
    sinDosis: false,
    motivoSinDosis: "",
    observaciones: "",
    pagoMedicamento: "",
    pagoControl: "",
    pagoOtro: "",
    pagoNota: "",
    cambioProducto: false,
    productoNombre: "",
    productoVialMg: "",
    productoVialMl: "",
  };
}

const plata = (n: number | null) => (n == null ? "" : fmtNumero(n, 2));
const vial = (n: number | null | undefined) => (n == null ? "" : fmtNumero(n, 2));

/** Un registro que se corrige, tal como se guardó (la dosis, en la unidad en que se anotó). */
export function semanaDesde(r: Registro): FormSemana {
  return {
    semana: String(r.semana),
    fecha: r.fecha,
    pesoKg: textoDe("pesoKg", r.pesoKg),
    dosis: r.dosis == null ? "" : fmtNumero(r.dosis, 3),
    sinDosis: r.sinDosis,
    motivoSinDosis: r.motivoSinDosis ?? "",
    observaciones: r.observaciones ?? "",
    pagoMedicamento: plata(r.pagoMedicamento),
    pagoControl: plata(r.pagoControl),
    pagoOtro: plata(r.pagoOtro),
    pagoNota: r.pagoNota ?? "",
    cambioProducto: !!r.producto,
    productoNombre: r.producto?.nombre ?? "",
    productoVialMg: vial(r.producto?.vialMg),
    productoVialMl: vial(r.producto?.vialMl),
  };
}

// ── Topes (para frenar un dedazo; el backend valida lo mismo, §3.3) ─────────

interface Limite {
  min: number;
  max: number;
  /** El mínimo no vale («mayor que 0»). */
  minExcluido?: boolean;
  decimales: number;
  /** Lo que se puede escribir pegado al número («480 Bs», «2,5 mg»). */
  unidad?: string;
}

export const LIMITES = {
  dosis: { min: 0, minExcluido: true, max: 1000, decimales: 3 },
  vialMg: { min: 0, minExcluido: true, max: 1000, decimales: 2, unidad: "mg" },
  vialMl: { min: 0, minExcluido: true, max: 100, decimales: 2, unidad: "ml" },
  pago: { min: 0, max: 100000, decimales: 2, unidad: "Bs" },
  semana: { min: 1, max: 520, decimales: 0 },
  pagoCadaSemanas: { min: 2, max: 12, decimales: 0 },
} satisfies Record<string, Limite>;

export type CampoLimitado = keyof typeof LIMITES;

/**
 * Lo escrito sin la unidad al final (o «Bs» adelante) y sin espacios. En la
 * plata, el punto de miles como se lee en la pantalla («Bs 1.260»): «1.500»
 * son mil quinientos (decía «Hasta 2 decimales»); «1.50» o «1,5» siguen
 * siendo uno con cincuenta.
 */
function limpio(campo: CampoLimitado, texto: string): string {
  const t = texto.trim();
  const u = (LIMITES[campo] as Limite).unidad;
  if (!u) return t;
  const sinAdelante = t.replace(new RegExp(`^${u}\\.?\\s*`, "i"), "");
  const sinUnidad = sinAdelante.toLowerCase().endsWith(u.toLowerCase()) ? sinAdelante.slice(0, -u.length).trimEnd() : sinAdelante;
  // Sin cero adelante: «0.500» no es un quinientos, sigue siendo un número con decimales de más.
  return campo === "pago" && /^[1-9]\d{0,2}(\.\d{3})+(,\d{1,2})?$/.test(sinUnidad) ? sinUnidad.replace(/\./g, "") : sinUnidad;
}

/** El número escrito (con coma o punto), o null si está vacío o no es un número. */
export function numeroDe(campo: CampoLimitado, texto: string): number | null {
  return leerNumero(limpio(campo, texto));
}

const decimalesDe = (texto: string) => (/[.,](\d+)$/.exec(texto.trim())?.[1].length ?? 0);

/** Lo que está mal en lo escrito, o null si está bien (o vacío). */
export function errorDeNumero(campo: CampoLimitado, texto: string): string | null {
  if (!texto.trim()) return null;
  const t = limpio(campo, texto);
  const n = leerNumero(t);
  if (n == null) return "Escribí sólo el número";
  const l: Limite = LIMITES[campo];
  if (l.decimales === 0 && !Number.isInteger(n)) return "Sin decimales";
  if (decimalesDe(t) > l.decimales) return `Hasta ${l.decimales} decimales`;
  const bajo = l.minExcluido ? n <= l.min : n < l.min;
  if (bajo || n > l.max) {
    if (campo === "pago") return "Entre Bs 0 y Bs 100.000";
    const tope = `${fmtNumero(l.max)}${l.unidad ? ` ${l.unidad}` : ""}`;
    return l.minExcluido ? `Mayor que ${fmtNumero(l.min)} y hasta ${tope}` : `Entre ${fmtNumero(l.min)} y ${tope}`;
  }
  return null;
}

/** El número ya redondeado a lo que se guarda, o null (vacío o con error). */
export function valorLimitado(campo: CampoLimitado, texto: string): number | null {
  if (errorDeNumero(campo, texto)) return null;
  const n = numeroDe(campo, texto);
  return n == null ? null : redondear(n, LIMITES[campo].decimales);
}

// ── La semana ───────────────────────────────────────────────────────────────

const texto = (v: string) => (v.trim() ? v.trim() : null);
const pago = (v: string) => valorLimitado("pago", v);

/** ¿Hay algo escrito que cuente como pago del mes (medicamento o control)? */
export const conPagoDelMes = (f: Pick<FormSemana, "pagoMedicamento" | "pagoControl">) => (pago(f.pagoMedicamento) ?? 0) + (pago(f.pagoControl) ?? 0) > 0;

/**
 * ¿La semana tiene algo? Una semana no puede quedar vacía (§3.3): peso,
 * dosis, observaciones, algún pago… o «No se aplicó», que también es un dato.
 */
export function semanaConDatos(f: FormSemana): boolean {
  return (
    !!f.pesoKg.trim() ||
    (!f.sinDosis && !!f.dosis.trim()) ||
    f.sinDosis ||
    !!f.observaciones.trim() ||
    !!f.pagoMedicamento.trim() ||
    !!f.pagoControl.trim() ||
    !!f.pagoOtro.trim() ||
    !!f.pagoNota.trim() ||
    // §7.1: una semana que sólo trae la marca del cambio de producto no está vacía.
    (f.cambioProducto && !!f.productoNombre.trim())
  );
}

export type ErroresSemana = Partial<Record<keyof FormSemana | "productoVial", string | null>>;

/** ¿Algún campo tiene un error? (para el «Hay un dato para revisar»). */
export const hayErrores = (e: Record<string, string | null | undefined>) => Object.values(e).some(Boolean);

/**
 * Lo que está mal en la semana. `semanasCargadas` son los números que ya
 * existen (sin el de esta misma, si se corrige): la semana repetida se avisa
 * antes de mandarla.
 */
export function erroresDeSemana(
  f: FormSemana,
  { inicial, semanasCargadas, hoy = hoyIso() }: { inicial: boolean; semanasCargadas: number[]; hoy?: string },
): ErroresSemana {
  const e: ErroresSemana = {
    fecha: !f.fecha ? "Elegí la fecha" : f.fecha > hoy ? "No puede ser después de hoy" : null,
    pesoKg: errorDeTope("pesoKg", f.pesoKg),
    dosis: f.sinDosis ? null : errorDeNumero("dosis", f.dosis),
    pagoMedicamento: errorDeNumero("pago", f.pagoMedicamento),
    pagoControl: errorDeNumero("pago", f.pagoControl),
    pagoOtro: errorDeNumero("pago", f.pagoOtro),
  };
  if (!inicial) {
    const n = numeroDe("semana", f.semana);
    e.semana = !f.semana.trim()
      ? "Escribí el número de la semana"
      : errorDeNumero("semana", f.semana) ?? (n != null && semanasCargadas.includes(n) ? `Ya hay un registro de la semana ${n}.` : null);
  }
  if (!inicial && f.cambioProducto) {
    const nombre = f.productoNombre.trim();
    e.productoNombre = !nombre ? "Escribí el producto nuevo" : nombre.length < 2 ? "Al menos 2 letras" : nombre.length > 80 ? "Hasta 80 letras" : null;
    e.productoVialMg = errorDeNumero("vialMg", f.productoVialMg);
    e.productoVialMl = errorDeNumero("vialMl", f.productoVialMl);
    e.productoVial = !!f.productoVialMg.trim() !== !!f.productoVialMl.trim() ? "Completá los dos: los mg y los ml del vial" : null;
  }
  return e;
}

/** La marca del producto como viaja (§7.1), o null si no hay marca. */
export function productoAInput(f: FormSemana): NonNullable<RegistroInput["producto"]> | null {
  if (!f.cambioProducto) return null;
  const v = vialDe({ vialMg: f.productoVialMg, vialMl: f.productoVialMl });
  return { nombre: f.productoNombre.trim(), ...(v ? { vialMg: v.mg, vialMl: v.ml } : {}) };
}

/** Todo lo de la semana como viaja (con null en lo vacío). La dosis no va si «No se aplicó». */
export function semanaAInput(f: FormSemana, inicial: boolean): RegistroInput {
  const r: RegistroInput = {
    fecha: f.fecha,
    pesoKg: valorDe("pesoKg", f.pesoKg),
    observaciones: texto(f.observaciones),
    pagoMedicamento: pago(f.pagoMedicamento),
    pagoControl: pago(f.pagoControl),
    pagoOtro: pago(f.pagoOtro),
    pagoNota: texto(f.pagoNota),
  };
  if (!inicial) r.semana = valorLimitado("semana", f.semana) ?? undefined;
  if (f.sinDosis) {
    r.sinDosis = true;
    r.motivoSinDosis = texto(f.motivoSinDosis);
  } else {
    r.dosis = valorLimitado("dosis", f.dosis);
  }
  // La clave `producto` viaja SÓLO con una marca: un backend anterior al
  // §7.1 la rechaza, y así las semanas comunes se siguen guardando.
  const producto = inicial ? null : productoAInput(f);
  if (producto) r.producto = producto;
  return r;
}

/** Para el alta: sólo lo escrito (lo vacío no viaja). */
export function soloLoEscrito(r: RegistroInput): RegistroInput {
  return Object.fromEntries(Object.entries(r).filter(([, v]) => v !== null && v !== undefined && v !== "")) as RegistroInput;
}

/**
 * Para la corrección: sólo lo que cambió (`null` borra el dato). Marcar «No
 * se aplicó» manda `sinDosis: true` y el motivo; desmarcarlo, `sinDosis: false`
 * (el servidor borra el motivo) y la dosis que se haya escrito.
 */
export function cambiosDeSemana(antes: FormSemana, ahora: FormSemana, inicial: boolean): RegistroInput {
  const a = semanaAInput(antes, inicial);
  const b = semanaAInput(ahora, inicial);
  const c: RegistroInput = {};
  const campos = ["semana", "fecha", "pesoKg", "observaciones", "pagoMedicamento", "pagoControl", "pagoOtro", "pagoNota"] as const;
  for (const k of campos) {
    if (b[k] !== a[k]) (c as Record<string, unknown>)[k] = b[k] ?? null;
  }
  if (ahora.sinDosis !== antes.sinDosis) {
    c.sinDosis = ahora.sinDosis;
    if (ahora.sinDosis) c.motivoSinDosis = b.motivoSinDosis ?? null;
    else if (b.dosis != null) c.dosis = b.dosis;
  } else if (ahora.sinDosis) {
    if (b.motivoSinDosis !== a.motivoSinDosis) c.motivoSinDosis = b.motivoSinDosis ?? null;
  } else if (b.dosis !== a.dosis) {
    c.dosis = b.dosis ?? null;
  }
  // La marca: la nueva (o corregida), o `null` si se quitó; sin tocarla, no viaja.
  if (!inicial && JSON.stringify(a.producto ?? null) !== JSON.stringify(b.producto ?? null)) c.producto = b.producto ?? null;
  return c;
}

/** ¿Cambió la marca del producto (se puso, se corrigió o se quitó)? Después de guardar, la hoja se relee entera. */
export function cambioLaMarca(antes: FormSemana, ahora: FormSemana): boolean {
  return JSON.stringify(productoAInput(antes)) !== JSON.stringify(productoAInput(ahora));
}

/** ¿Cambió algo desde que se abrió la hoja? */
export function semanaCambio(antes: FormSemana, ahora: FormSemana): boolean {
  return (Object.keys(antes) as (keyof FormSemana)[]).some((k) => {
    const x = antes[k];
    const y = ahora[k];
    return typeof x === "string" && typeof y === "string" ? x.trim() !== y.trim() : x !== y;
  });
}

// ── El tratamiento ──────────────────────────────────────────────────────────

export interface FormTratamiento {
  nombre: string;
  vialMg: string;
  vialMl: string;
  /** Ninguna marcada al iniciar: es obligatorio elegir una. */
  unidadDosis: UnidadDosis | "";
}

export function tratamientoVacio(): FormTratamiento {
  return { nombre: "", vialMg: "", vialMl: "", unidadDosis: "" };
}

/**
 * El tratamiento que se edita, tal como está guardado. Si cambió de producto
 * en alguna semana (§7.1), el nombre y el vial son los del producto con el que
 * EMPEZÓ (los de `nombre`/`presentacion` son los de hoy, y se corrigen en la
 * semana de su marca).
 */
export function tratamientoDesde(
  t: Pick<Tratamiento, "nombre" | "unidadDosis" | "presentacion"> & Partial<Pick<Tratamiento, "productoInicial" | "cambiosDeProducto">>,
): FormTratamiento {
  const inicial = t.cambiosDeProducto && t.productoInicial ? t.productoInicial : null;
  if (inicial) {
    return { nombre: inicial.nombre, vialMg: vial(inicial.vialMg), vialMl: vial(inicial.vialMl), unidadDosis: t.unidadDosis };
  }
  return {
    nombre: t.nombre,
    vialMg: t.presentacion ? fmtNumero(t.presentacion.mg, 2) : "",
    vialMl: t.presentacion ? fmtNumero(t.presentacion.ml, 2) : "",
    unidadDosis: t.unidadDosis,
  };
}

export type ErroresTratamiento = Partial<Record<keyof FormTratamiento | "vial", string | null>>;

export function erroresDeTratamiento(f: FormTratamiento): ErroresTratamiento {
  const nombre = f.nombre.trim();
  const mg = f.vialMg.trim();
  const ml = f.vialMl.trim();
  return {
    nombre: !nombre ? "Escribí el tratamiento" : nombre.length < 2 ? "Al menos 2 letras" : nombre.length > 80 ? "Hasta 80 letras" : null,
    unidadDosis: f.unidadDosis ? null : "Elegí en qué anotás la dosis",
    vialMg: errorDeNumero("vialMg", f.vialMg),
    vialMl: errorDeNumero("vialMl", f.vialMl),
    vial: !!mg !== !!ml ? "Completá los dos: los mg y los ml del vial" : null,
  };
}

/** El vial escrito: los dos números, o null (vacío, a medias o con error). */
export function vialDe(f: Pick<FormTratamiento, "vialMg" | "vialMl">): { mg: number; ml: number } | null {
  const mg = valorLimitado("vialMg", f.vialMg);
  const ml = valorLimitado("vialMl", f.vialMl);
  return mg != null && ml != null ? { mg, ml } : null;
}

/** El alta: el tratamiento y, si hay algo escrito, el registro inicial. */
export function iniciarAInput(t: FormTratamiento, inicial: FormSemana): IniciarTratamientoInput {
  const vial = vialDe(t);
  const ini = soloLoEscrito(semanaAInput({ ...inicial, sinDosis: false }, true));
  return {
    nombre: t.nombre.trim(),
    unidadDosis: t.unidadDosis as UnidadDosis,
    ...(vial ? { vialMg: vial.mg, vialMl: vial.ml } : {}),
    inicial: ini,
  };
}

// ── Un tratamiento de la lista del negocio (§9.2) ───────────────────────────

/** Hasta cuántas presentaciones del vial se sugieren por tratamiento (§9.1). */
export const MAX_PRESENTACIONES = 6;

/** Un renglón «Vial de [ mg ] en [ ml ]», como está escrito. */
export interface FormVial {
  mg: string;
  ml: string;
}

export interface FormProducto {
  nombre: string;
  /** Siempre al menos un renglón (vacío = sin vial). */
  viales: FormVial[];
}

const vialVacio = (): FormVial => ({ mg: "", ml: "" });

/** «Agregar tratamiento»: el nombre vacío y un renglón del vial vacío. */
export function productoVacio(): FormProducto {
  return { nombre: "", viales: [vialVacio()] };
}

/** «Editar»: el tratamiento como está en la lista (sin viales, un renglón vacío). */
export function productoDesde(p: Pick<ProductoSeguimiento, "nombre" | "presentaciones">): FormProducto {
  return {
    nombre: p.nombre,
    viales: p.presentaciones.length ? p.presentaciones.map((v) => ({ mg: fmtNumero(v.mg, 2), ml: fmtNumero(v.ml, 2) })) : [vialVacio()],
  };
}

/** El nombre como lo guarda el servidor: recortado y con los espacios juntados. */
export const nombreDeProducto = (nombre: string) => nombre.trim().replace(/\s+/g, " ");

export interface ErroresProducto {
  nombre: string | null;
  /** Uno por renglón: el de cada número y el del renglón a medio llenar. */
  viales: { mg: string | null; ml: string | null; vial: string | null }[];
}

/**
 * Lo que está mal: el nombre, 2 a 80 letras (lo mismo que pide la hoja al
 * iniciar un tratamiento: un botón de una letra escribiría un nombre que la
 * hoja rechaza); cada vial, con los topes del vial del tratamiento.
 */
export function erroresDeProducto(f: FormProducto): ErroresProducto {
  const nombre = nombreDeProducto(f.nombre);
  return {
    nombre: !nombre ? "Escribí el nombre del tratamiento" : nombre.length < 2 ? "Al menos 2 letras" : nombre.length > 80 ? "Hasta 80 letras" : null,
    viales: f.viales.map((v) => ({
      mg: errorDeNumero("vialMg", v.mg),
      ml: errorDeNumero("vialMl", v.ml),
      vial: !!v.mg.trim() !== !!v.ml.trim() ? "Completá los dos: los mg y los ml del vial" : null,
    })),
  };
}

export const hayErroresDeProducto = (e: ErroresProducto) => !!e.nombre || e.viales.some((v) => !!(v.mg || v.ml || v.vial));

/** Los viales completos, como viajan: sin los renglones vacíos y sin repetir, en el orden en que se escribieron. */
export function presentacionesDe(f: FormProducto): Vial[] {
  const r: Vial[] = [];
  for (const v of f.viales) {
    const x = vialDe({ vialMg: v.mg, vialMl: v.ml });
    if (x && !r.some((y) => y.mg === x.mg && y.ml === x.ml)) r.push(x);
  }
  return r;
}

/** Lo que cambió al editar (vacío = nada). Al de fábrica no se le manda el nombre. */
export function cambiosDeProducto(
  antes: Pick<ProductoSeguimiento, "nombre" | "presentaciones" | "deFabrica">,
  ahora: FormProducto,
): { nombre?: string; presentaciones?: Vial[] } {
  const c: { nombre?: string; presentaciones?: Vial[] } = {};
  const nombre = nombreDeProducto(ahora.nombre);
  if (!antes.deFabrica && nombre !== antes.nombre) c.nombre = nombre;
  const viales = presentacionesDe(ahora);
  if (JSON.stringify(viales) !== JSON.stringify(antes.presentaciones.map(({ mg, ml }) => ({ mg, ml })))) c.presentaciones = viales;
  return c;
}

/** Lo que cambió del tratamiento. Quitar el vial manda las dos en null. */
export function cambiosDeTratamiento(antes: FormTratamiento, ahora: FormTratamiento): CambiosTratamiento {
  const c: CambiosTratamiento = {};
  if (ahora.nombre.trim() !== antes.nombre.trim()) c.nombre = ahora.nombre.trim();
  if (ahora.unidadDosis && ahora.unidadDosis !== antes.unidadDosis) c.unidadDosis = ahora.unidadDosis;
  const va = vialDe(antes);
  const vb = vialDe(ahora);
  if (va?.mg !== vb?.mg || va?.ml !== vb?.ml) {
    c.vialMg = vb?.mg ?? null;
    c.vialMl = vb?.ml ?? null;
  }
  return c;
}
