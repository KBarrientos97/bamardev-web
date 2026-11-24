import { cambio, evolucion, vecesDelDia, type ResumenMedida } from "./calculo";
import type { Control, Paciente, PesoDelPaciente } from "./tipos";

/**
 * El peso al día en la Evaluación (CONTRATO-nutricion-seguimiento-23nov §4.4):
 * el peso que se anota cada semana en el Seguimiento se ve también en la
 * planilla del paciente (las tarjetas de Peso e IMC, el gráfico, el medidor y
 * el «anterior:» de la hoja de control). No se duplica nada: el servidor arma
 * UNA serie (`pesos`) con los de los dos lados, por fecha. Si la respuesta no
 * la trae, todo sale de los controles, como en la etapa 1.
 */

export type CampoDeLaSerie = "pesoKg" | "imc";

export interface PuntoDePeso {
  fecha: string;
  valor: number;
  /** La vez del día (el segundo del mismo día lleva «(2)»). */
  vez: number;
  /** Vino de una semana del seguimiento (el punto va más chico). */
  delSeguimiento: boolean;
}

/** Los puntos de Peso o de IMC: de la serie si llegó; si no, de los controles. */
export function puntosDeLaSerie(p: Pick<Paciente, "controles" | "pesos">, campo: CampoDeLaSerie): PuntoDePeso[] {
  if (!p.pesos) return evolucion(p.controles, campo).map((x) => ({ ...x, delSeguimiento: false }));
  const veces = vecesDelDia(p.pesos.map((x) => x.fecha));
  return p.pesos.flatMap((x, i) => {
    const v = campo === "pesoKg" ? x.pesoKg : x.imc;
    return v == null ? [] : [{ fecha: x.fecha, valor: v, vez: veces[i], delSeguimiento: x.origen === "SEGUIMIENTO" }];
  });
}

/** ¿Hay de los dos orígenes? Entonces el gráfico lleva la leyenda «● Control · • Seguimiento semanal». */
export function hayDeLosDos(puntos: PuntoDePeso[]): boolean {
  return puntos.some((x) => x.delSeguimiento) && puntos.some((x) => !x.delSeguimiento);
}

/** La tarjeta de Peso o IMC: el último de la serie, comparado con el primero y con el anterior. */
export function resumenDeLaSerie(puntos: PuntoDePeso[]): (ResumenMedida & { delSeguimiento: boolean }) | null {
  if (!puntos.length) return null;
  const ultimo = puntos[puntos.length - 1];
  return {
    actual: ultimo.valor,
    fecha: ultimo.fecha,
    delSeguimiento: ultimo.delSeguimiento,
    desdeInicio: puntos.length > 1 ? cambio(ultimo.valor, puntos[0].valor) : null,
    desdeAnterior: puntos.length > 1 ? cambio(ultimo.valor, puntos[puntos.length - 2].valor) : null,
  };
}

/** El último IMC de la serie (para el medidor y la tarjeta), con su grado y su fecha; null sin la serie o sin IMC. */
export function ultimoImcDeLaSerie(pesos: PesoDelPaciente[] | undefined): PesoDelPaciente | null {
  if (!pesos) return null;
  for (let i = pesos.length - 1; i >= 0; i--) if (pesos[i].imc != null || pesos[i].imcGrado) return pesos[i];
  return null;
}

/**
 * El «anterior:» del Peso en la hoja de control (§4.4): el último de la serie
 * (al cargar uno nuevo) o el de justo antes de este control (al corregirlo).
 * Un control sin peso no está en la serie: vale el último hasta su fecha.
 * null si la respuesta no trae la serie (manda lo de la etapa 1).
 */
export function pesoAnteriorDeLaSerie(
  pesos: PesoDelPaciente[] | undefined,
  control: Pick<Control, "id" | "fecha"> | null,
): PesoDelPaciente | null | undefined {
  if (!pesos) return undefined;
  if (!control) return pesos[pesos.length - 1] ?? null;
  const i = pesos.findIndex((x) => x.origen === "CONTROL" && x.controlId === control.id);
  if (i >= 0) return pesos[i - 1] ?? null;
  for (let j = pesos.length - 1; j >= 0; j--) if (pesos[j].fecha <= control.fecha) return pesos[j];
  return null;
}
