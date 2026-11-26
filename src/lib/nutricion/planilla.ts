import { conUnidad, evolucion, grado, gradoDelResumen, resumenDe, type CampoControl, type ResumenMedida } from "./calculo";
import { hayDeLosDos, puntosDeLaSerie, resumenDeLaSerie, ultimoImcDeLaSerie } from "./pesos";
import type { Catalogo, Control, MedidaConTabla, Paciente, Rango } from "./tipos";

/**
 * Lo que muestra la planilla del paciente (CONTRATO-nutricion-evaluacion-22nov
 * §4.3), sin pantalla: las medidas con su unidad y su tabla, las tarjetas de
 * «cómo está hoy», el IMC del medidor, los puntos del gráfico y cada celda de
 * la planilla de controles. Lo usan la pantalla y el PDF de la evaluación
 * (§6.2): los dos dicen los mismos números y los mismos grados.
 */

/** Cada medida de la planilla: cómo se llama, su unidad, sus decimales y, si tiene, su tabla de grados. */
export interface Medida {
  campo: CampoControl;
  nombre: string;
  /** El nombre corto para la planilla y los chips del gráfico. */
  corto: string;
  unidad: string;
  decimales: number;
  grado?: { medida: MedidaConTabla; campo: "imcGrado" | "grasaGrado" | "musculoGrado" | "visceralGrado" };
}

export const MEDIDAS: Record<CampoControl, Medida> = {
  pesoKg: { campo: "pesoKg", nombre: "Peso", corto: "Peso", unidad: "kg", decimales: 2 },
  imc: { campo: "imc", nombre: "IMC", corto: "IMC", unidad: "", decimales: 1, grado: { medida: "imc", campo: "imcGrado" } },
  grasaPct: { campo: "grasaPct", nombre: "% de grasa", corto: "% grasa", unidad: "%", decimales: 1, grado: { medida: "grasa", campo: "grasaGrado" } },
  musculoPct: {
    campo: "musculoPct",
    nombre: "% de músculo",
    corto: "% músculo",
    unidad: "%",
    decimales: 1,
    grado: { medida: "musculo", campo: "musculoGrado" },
  },
  edadCorporal: { campo: "edadCorporal", nombre: "Edad corporal", corto: "Edad corporal", unidad: "años", decimales: 0 },
  grasaVisceral: {
    campo: "grasaVisceral",
    nombre: "Grasa visceral",
    corto: "Grasa visceral",
    unidad: "",
    decimales: 1,
    grado: { medida: "visceral", campo: "visceralGrado" },
  },
  pechoCm: { campo: "pechoCm", nombre: "Pecho", corto: "Pecho", unidad: "cm", decimales: 1 },
  cinturaCm: { campo: "cinturaCm", nombre: "Cintura", corto: "Cintura", unidad: "cm", decimales: 1 },
  caderaCm: { campo: "caderaCm", nombre: "Cadera", corto: "Cadera", unidad: "cm", decimales: 1 },
};

/**
 * Los renglones de la planilla. Las tres cintas van como el cuerpo, de arriba
 * abajo (Pecho, Cintura, Cadera): el mismo orden del paso «Medidas» y de
 * «Nuevo control», para que lo que se carga y lo que se lee no se crucen.
 */
export const FILAS: CampoControl[] = ["pesoKg", "imc", "grasaPct", "musculoPct", "edadCorporal", "grasaVisceral", "pechoCm", "cinturaCm", "caderaCm"];
/** Las medidas que se pueden ver en el gráfico, en este orden (las cintas, igual que en la planilla). */
export const DEL_GRAFICO: CampoControl[] = ["pesoKg", "imc", "grasaPct", "musculoPct", "pechoCm", "cinturaCm", "caderaCm", "grasaVisceral"];
/** Las tarjetas de arriba. */
export const DEL_RESUMEN: CampoControl[] = ["pesoKg", "imc", "grasaPct", "musculoPct", "grasaVisceral", "cinturaCm"];

/** «82,4 kg» (con el espacio duro de `conUnidad`); «—» sin dato. */
export const valorCon = (m: Pick<Medida, "unidad" | "decimales">, n: number | null | undefined) => conUnidad(n, m.unidad, m.decimales);

/** ¿Esta medida sale de la serie de pesos al día (§4.4 del seguimiento)? Sólo Peso e IMC, y si la respuesta la trae. */
export const deLaSerie = (p: Pick<Paciente, "pesos">, campo: CampoControl): campo is "pesoKg" | "imc" => !!p.pesos && (campo === "pesoKg" || campo === "imc");

/** El grado del valor que muestra la tarjeta: el del mismo control (ver `gradoDelResumen`). */
export function gradoActual(controles: Control[], m: Medida, catalogo: Catalogo | null) {
  if (!m.grado) return null;
  return grado(catalogo, m.grado.medida, gradoDelResumen(controles, m.campo, m.grado.campo));
}

// ── Las tarjetas de «cómo está hoy» ─────────────────────────────────────────

export interface TarjetaDeHoy {
  campo: CampoControl;
  medida: Medida;
  /** El último valor y su fecha; null sin dato («—»). */
  resumen: ResumenMedida | null;
  grado: Rango | null;
  /** Lo que cambió desde el primero (null si no hay con qué comparar). */
  desdeInicio: number | null;
  /** Desde el anterior: sólo en el Peso y con más de dos (con dos es lo mismo que desde el inicio). */
  desdeAnterior: number | null;
  /** El día de la semana del seguimiento de donde sale el valor; null si sale de un control. */
  delSeguimiento: string | null;
}

/** Las seis tarjetas de arriba de la planilla (Peso · IMC · % de grasa · % de músculo · Grasa visceral · Cintura). */
export function tarjetasDeHoy(paciente: Paciente, catalogo: Catalogo | null): TarjetaDeHoy[] {
  const controles = paciente.controles;
  return DEL_RESUMEN.map((campo) => {
    const m = MEDIDAS[campo];
    const serie = deLaSerie(paciente, campo) ? puntosDeLaSerie(paciente, campo) : null;
    const r = serie ? resumenDeLaSerie(serie) : resumenDe(controles, campo);
    // El grado del IMC de la serie es el del último peso con IMC (el del seguimiento sale de la tabla).
    const g = serie && campo === "imc" ? grado(catalogo, "imc", ultimoImcDeLaSerie(paciente.pesos)?.imcGrado) : gradoActual(controles, m, catalogo);
    const cuantos = serie ? serie.length : controles.length;
    const delSeguimiento = !!r && "delSeguimiento" in r && r.delSeguimiento;
    return {
      campo,
      medida: m,
      resumen: r,
      grado: g,
      desdeInicio: r?.desdeInicio ?? null,
      desdeAnterior: campo === "pesoKg" && r?.desdeAnterior != null && cuantos > 2 ? r.desdeAnterior : null,
      delSeguimiento: delSeguimiento && r ? r.fecha : null,
    };
  });
}

// ── El medidor del IMC ──────────────────────────────────────────────────────

export interface ImcDeHoy {
  /** El último IMC (o grado del IMC): de la serie si llegó, si no del último control que lo tenga. */
  ultimo: { fecha: string; imc: number | null; imcGrado: string | null } | null;
  /** Los rangos de la tabla del IMC (la que vale para todos). */
  rangos: Rango[] | undefined;
  grado: Rango | null;
}

export function imcDeHoy(paciente: Paciente, catalogo: Catalogo): ImcDeHoy {
  // Con la serie de pesos al día, el último IMC de la serie (puede ser de una
  // semana del seguimiento); sin ella, el del último control, como siempre.
  const ultimo: { fecha: string; imc: number | null; imcGrado: string | null } | undefined = paciente.pesos
    ? (ultimoImcDeLaSerie(paciente.pesos) ?? undefined)
    : [...paciente.controles].reverse().find((c) => c.imc != null || c.imcGrado);
  const rangos = catalogo.tablas.imc?.find((t) => t.sexo == null && t.edadDesde == null && t.edadHasta == null)?.rangos ?? catalogo.tablas.imc?.[0]?.rangos;
  return { ultimo: ultimo ?? null, rangos, grado: grado(catalogo, "imc", ultimo?.imcGrado) };
}

// ── El gráfico ──────────────────────────────────────────────────────────────

export interface PuntoDeEvolucion {
  fecha: string;
  valor: number;
  vez: number;
  /** Un peso del seguimiento semanal: el punto va más chico. */
  chico?: boolean;
}

/** Los puntos del gráfico de una medida (Peso e IMC: la serie al día), y si lleva la leyenda «Control · Seguimiento semanal». */
export function evolucionDe(paciente: Paciente, campo: CampoControl): { puntos: PuntoDeEvolucion[]; leyenda: boolean } {
  // Peso e IMC: todos los puntos de la serie al día; los del seguimiento, más chicos.
  const serie = deLaSerie(paciente, campo) ? puntosDeLaSerie(paciente, campo) : null;
  const puntos = serie ? serie.map((x) => ({ ...x, chico: x.delSeguimiento })) : evolucion(paciente.controles, campo);
  return { puntos, leyenda: !!serie && hayDeLosDos(serie) };
}

// ── La planilla de controles ────────────────────────────────────────────────

/** Una celda de la planilla: el valor (null si no se midió) y su grado, si la medida tiene tabla. */
export function celdaDe(c: Control, m: Medida, catalogo: Catalogo | null): { valor: number | null; grado: Rango | null } {
  return { valor: c[m.campo], grado: m.grado ? grado(catalogo, m.grado.medida, c[m.grado.campo]) : null };
}
