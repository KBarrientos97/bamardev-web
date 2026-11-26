import { edadEn, edadEnFecha, gradoDeTabla, hoyIso, textoDe, valorDe, type CampoNumerico } from "./calculo";
import { normalizarAgua } from "./agua";
import { ATAJOS, normalizarRespuesta, type CampoConAtajos } from "./respuestas";
import type { Catalogo, Control, ControlInput, Enfermedad, FichaInput, MedidaConTabla, Paciente, Sexo } from "./tipos";

/**
 * Lo que se escribe en la evaluación (todo texto, como está en los campos) y
 * cómo se convierte en lo que viaja al backend. Todo arranca VACÍO (§0.4):
 * nada se precarga con otra visita; lo único que la pantalla completa sola es
 * lo que sale de una fórmula o de la tabla.
 */

export interface FormFicha {
  nombre: string;
  ci: string;
  ciExpedido: string;
  sexo: Sexo | "";
  /** La edad escrita (cuando no hay fecha de nacimiento). */
  edad: string;
  fechaNacimiento: string;
  tallaCm: string;
  hijos: string;
  telefono: string;
  observaciones: string;
  ultimosAnalisis: string;
  /** Sólo las contestadas; sin la clave = «sin preguntar». */
  enfermedades: Record<string, { tiene: boolean; nota: string }>;
  otrasEnfermedades: string;
  cirugias: string;
  conductaAlimentaria: string;
  conductaSueno: string;
  actividadFisica: string;
  consumoAgua: string;
  /**
   * La edad como la tiene anotada el servidor (sin fecha de nacimiento): lo
   * que se escribió y el día. No se edita ni viaja: sirve para que la tabla
   * de un control use la misma edad que va a usar el servidor.
   */
  edadAnotada?: { edad: number; en: string } | null;
}

/** Los grados elegidos A MANO (null = el de la tabla). */
export type GradosElegidos = Record<MedidaConTabla, string | null>;

export interface FormControl {
  fecha: string;
  pesoKg: string;
  cinturaCm: string;
  caderaCm: string;
  pechoCm: string;
  grasaPct: string;
  musculoPct: string;
  edadCorporal: string;
  grasaVisceral: string;
  nota: string;
  grados: GradosElegidos;
}

export const SIN_GRADOS: GradosElegidos = { imc: null, grasa: null, musculo: null, visceral: null };

export function fichaVacia(): FormFicha {
  return {
    nombre: "",
    ci: "",
    ciExpedido: "",
    sexo: "",
    edad: "",
    fechaNacimiento: "",
    tallaCm: "",
    hijos: "",
    telefono: "",
    observaciones: "",
    ultimosAnalisis: "",
    enfermedades: {},
    otrasEnfermedades: "",
    cirugias: "",
    conductaAlimentaria: "",
    conductaSueno: "",
    actividadFisica: "",
    consumoAgua: "",
  };
}

/** Un control vacío: la fecha es hoy (editable), todo lo demás en blanco. */
export function controlVacio(fecha = hoyIso()): FormControl {
  return {
    fecha,
    pesoKg: "",
    cinturaCm: "",
    caderaCm: "",
    pechoCm: "",
    grasaPct: "",
    musculoPct: "",
    edadCorporal: "",
    grasaVisceral: "",
    nota: "",
    grados: { ...SIN_GRADOS },
  };
}

const texto = (v: string) => (v.trim() ? v.trim() : null);

/**
 * Un campo con atajos, como se guarda: «si:  » → «Sí», «no, nunca» → «No:
 * nunca» (`normalizarRespuesta`). Como `hayCambios` compara dos `fichaAInput`,
 * un «no» que vino así del servidor no aparece como cambio.
 */
const conAtajos = (f: FormFicha, campo: CampoConAtajos) => texto(normalizarRespuesta(f[campo], ATAJOS[campo]));

/** La edad de hoy: la de la fecha de nacimiento si está, si no la escrita. */
export function edadDeFicha(f: Pick<FormFicha, "edad" | "fechaNacimiento">, hoy = hoyIso()): number | null {
  if (f.fechaNacimiento) return edadEn(f.fechaNacimiento, hoy);
  return valorDe("edad", f.edad);
}

/**
 * La edad el día del control: la que elige la tabla de sus grados (§3.4),
 * con la cuenta del servidor. Si la edad escrita es la de hoy que sale de lo
 * anotado (no se tocó), vale lo anotado con su día; si se escribió otra, el
 * servidor la anota con la fecha de hoy.
 */
export function edadDelControl(f: Pick<FormFicha, "edad" | "fechaNacimiento" | "edadAnotada">, fecha: string, hoy = hoyIso()): number | null {
  const deHoy = edadDeFicha(f, hoy);
  const a = f.edadAnotada;
  const sinTocar = !f.fechaNacimiento && a != null && deHoy === edadEnFecha({ edadDeclarada: a.edad, edadDeclaradaEn: a.en }, hoy, hoy);
  return edadEnFecha(
    {
      fechaNacimiento: f.fechaNacimiento || null,
      edad: deHoy,
      edadDeclarada: sinTocar ? a.edad : deHoy,
      edadDeclaradaEn: sinTocar ? a.en : hoy,
    },
    fecha,
    hoy,
  );
}

/** La ficha tal como se manda: vacío = null, los números ya leídos. */
export function fichaAInput(f: FormFicha): Required<FichaInput> {
  const enfermedades: Record<string, Enfermedad> = {};
  for (const [codigo, e] of Object.entries(f.enfermedades)) {
    enfermedades[codigo] = { tiene: e.tiene, nota: texto(e.nota) };
  }
  return {
    nombre: f.nombre.trim(),
    ci: texto(f.ci),
    ciExpedido: f.ci.trim() ? texto(f.ciExpedido) : null,
    telefono: texto(f.telefono),
    fechaNacimiento: texto(f.fechaNacimiento),
    // La edad escrita vale sólo sin fecha de nacimiento (§3.3).
    edad: f.fechaNacimiento ? null : valorDe("edad", f.edad),
    sexo: f.sexo || null,
    hijos: valorDe("hijos", f.hijos),
    tallaCm: valorDe("tallaCm", f.tallaCm),
    observaciones: texto(f.observaciones),
    ultimosAnalisis: conAtajos(f, "ultimosAnalisis"),
    enfermedades,
    otrasEnfermedades: texto(f.otrasEnfermedades),
    cirugias: conAtajos(f, "cirugias"),
    conductaAlimentaria: texto(f.conductaAlimentaria),
    conductaSueno: conAtajos(f, "conductaSueno"),
    actividadFisica: conAtajos(f, "actividadFisica"),
    consumoAgua: texto(normalizarAgua(f.consumoAgua)),
  };
}

const CAMPOS_CONTROL: (keyof FormControl & CampoNumerico)[] = [
  "pesoKg",
  "cinturaCm",
  "caderaCm",
  "pechoCm",
  "grasaPct",
  "musculoPct",
  "edadCorporal",
  "grasaVisceral",
];

/** Qué campo del input lleva el grado de cada medida. */
export const CAMPO_GRADO: Record<MedidaConTabla, "imcGrado" | "grasaGrado" | "musculoGrado" | "visceralGrado"> = {
  imc: "imcGrado",
  grasa: "grasaGrado",
  musculo: "musculoGrado",
  visceral: "visceralGrado",
};

/** El control tal como se manda, completo (vacío = null). Los grados, sólo los elegidos a mano. */
export function controlAInput(c: FormControl): Required<ControlInput> {
  const r = { fecha: c.fecha || hoyIso(), nota: texto(c.nota) } as Required<ControlInput>;
  for (const campo of CAMPOS_CONTROL) r[campo] = valorDe(campo, c[campo]);
  for (const m of Object.keys(CAMPO_GRADO) as MedidaConTabla[]) r[CAMPO_GRADO[m]] = c.grados[m];
  return r;
}

/** ¿Tiene algo además de la fecha? (una medida, un grado elegido o la nota). */
export function controlConDatos(c: FormControl): boolean {
  const i = controlAInput(c);
  return Object.entries(i).some(([k, v]) => k !== "fecha" && v != null);
}

/** Para un alta: sólo lo que tiene algo (el backend toma lo que no viene como vacío). */
export function soloConValor<T extends object>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, v]) => v != null && !(typeof v === "object" && Object.keys(v).length === 0)),
  ) as Partial<T>;
}

const igual = (a: unknown, b: unknown) => JSON.stringify(ordenado(a)) === JSON.stringify(ordenado(b));
function ordenado(v: unknown): unknown {
  if (!v || typeof v !== "object" || Array.isArray(v)) return v;
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, ordenado(x)]));
}

/**
 * Lo que cambió de `antes` a `ahora`, para un PATCH: sólo cambia lo que viene
 * y `null` borra (§3.3). `enfermedades`, si cambió, va entera.
 */
export function cambios<T extends object>(antes: T, ahora: T): Partial<T> {
  const r: Partial<T> = {};
  for (const k of Object.keys(ahora) as (keyof T)[]) {
    if (!igual(antes[k], ahora[k])) r[k] = ahora[k];
  }
  return r;
}

export const hayCambios = (antes: object, ahora: object) => Object.keys(cambios(antes, ahora)).length > 0;

/** De qué medida sale cada grado (el del IMC, del peso: la talla es de la ficha). */
const VALOR_DEL_INPUT: Record<MedidaConTabla, "pesoKg" | "grasaPct" | "musculoPct" | "grasaVisceral"> = {
  imc: "pesoKg",
  grasa: "grasaPct",
  musculo: "musculoPct",
  visceral: "grasaVisceral",
};

/**
 * Lo que cambió de un control, para su PATCH. Si cambió un valor, su grado
 * viaja siempre (§3.4): sin él el servidor pone el de la tabla y se perdería
 * el elegido a mano; con `null` lo pone igual, que es lo que se quiere.
 */
export function cambiosDeControl(antes: FormControl, ahora: FormControl): Partial<ControlInput> {
  const r: Partial<ControlInput> = cambios(controlAInput(antes), controlAInput(ahora));
  for (const m of Object.keys(CAMPO_GRADO) as MedidaConTabla[]) {
    if (VALOR_DEL_INPUT[m] in r && !(CAMPO_GRADO[m] in r)) r[CAMPO_GRADO[m]] = ahora.grados[m];
  }
  return r;
}

// ── Desde lo guardado (para editar) ─────────────────────────────────────────

const deTexto = (v: string | null | undefined) => v ?? "";

/** La ficha guardada, para editarla. La edad, la de hoy (así no se corre un año al guardar). */
export function fichaDesde(p: Paciente): FormFicha {
  const enfermedades: FormFicha["enfermedades"] = {};
  for (const [codigo, e] of Object.entries(p.enfermedades ?? {})) {
    enfermedades[codigo] = { tiene: e.tiene, nota: deTexto(e.nota) };
  }
  return {
    nombre: p.nombre,
    ci: deTexto(p.ci),
    ciExpedido: deTexto(p.ciExpedido),
    sexo: p.sexo ?? "",
    edad: p.fechaNacimiento ? "" : textoDe("edad", p.edad ?? p.edadDeclarada),
    fechaNacimiento: deTexto(p.fechaNacimiento),
    tallaCm: textoDe("tallaCm", p.tallaCm),
    hijos: textoDe("hijos", p.hijos),
    telefono: deTexto(p.telefono),
    observaciones: deTexto(p.observaciones),
    ultimosAnalisis: deTexto(p.ultimosAnalisis),
    enfermedades,
    otrasEnfermedades: deTexto(p.otrasEnfermedades),
    cirugias: deTexto(p.cirugias),
    conductaAlimentaria: deTexto(p.conductaAlimentaria),
    conductaSueno: deTexto(p.conductaSueno),
    actividadFisica: deTexto(p.actividadFisica),
    consumoAgua: deTexto(p.consumoAgua),
    edadAnotada: edadAnotadaDe(p),
  };
}

function edadAnotadaDe(p: Paciente): FormFicha["edadAnotada"] {
  return !p.fechaNacimiento && p.edadDeclarada != null && p.edadDeclaradaEn ? { edad: p.edadDeclarada, en: p.edadDeclaradaEn } : null;
}

/**
 * Después de guardar, lo que el servidor normaliza queda a la vista como lo
 * guardó: si en el carnet se escribió «8958703 SC», queda «8958703» y «SC» en
 * Exp. (y la edad anotada, con su día).
 */
export function conLoDelServidor(f: FormFicha, p: Paciente): FormFicha {
  return { ...f, ci: deTexto(p.ci), ciExpedido: p.ci ? deTexto(p.ciExpedido) : "", edadAnotada: edadAnotadaDe(p) };
}

/** De qué valor sale cada grado, para saber si el guardado lo puso la tabla o la doctora. */
const VALOR_DEL_GRADO: Record<MedidaConTabla, keyof Control> = {
  imc: "imc",
  grasa: "grasaPct",
  musculo: "musculoPct",
  visceral: "grasaVisceral",
};

/**
 * Un control guardado, para corregirlo. Un grado que coincide con el de la
 * tabla queda «de la tabla» (null); uno distinto lo eligió la doctora con un
 * clic y queda marcado «elegido a mano». La tabla es la de la edad que tenía
 * el día de ese control (§3.4).
 */
export function controlDesde(
  c: Control,
  contexto: {
    catalogo: Catalogo | null;
    sexo: Sexo | null;
    edad: number | null;
    fechaNacimiento?: string | null;
    edadDeclarada?: number | null;
    edadDeclaradaEn?: string | null;
  },
  hoy = hoyIso(),
): FormControl {
  const grados = { ...SIN_GRADOS };
  const edad = edadEnFecha(contexto, c.fecha, hoy);
  for (const m of Object.keys(CAMPO_GRADO) as MedidaConTabla[]) {
    const guardado = c[CAMPO_GRADO[m]];
    if (!guardado) continue;
    const valor = c[VALOR_DEL_GRADO[m]] as number | null;
    const deTabla = contexto.catalogo ? gradoDeTabla(contexto.catalogo.tablas[m], contexto.sexo, edad, valor) : null;
    grados[m] = guardado === deTabla ? null : guardado;
  }
  return {
    fecha: c.fecha,
    pesoKg: textoDe("pesoKg", c.pesoKg),
    cinturaCm: textoDe("cinturaCm", c.cinturaCm),
    caderaCm: textoDe("caderaCm", c.caderaCm),
    pechoCm: textoDe("pechoCm", c.pechoCm),
    grasaPct: textoDe("grasaPct", c.grasaPct),
    musculoPct: textoDe("musculoPct", c.musculoPct),
    edadCorporal: textoDe("edadCorporal", c.edadCorporal),
    grasaVisceral: textoDe("grasaVisceral", c.grasaVisceral),
    nota: deTexto(c.nota),
    grados,
  };
}
