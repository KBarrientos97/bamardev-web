import type { AccionCita, Cita, EstadoCita } from "./tiposAgenda";

/**
 * Qué se puede hacer con una cita según su estado (PLAN-AGENDA-BELLEZA §6).
 *
 * La pantalla sólo OFRECE: quien decide si la transición vale es el backend
 * (400 TRANSICION_INVALIDA, con `updateMany` sobre el estado de origen). Esta
 * tabla existe para no mostrar botones que van a fallar, no para reemplazarlo.
 */

export const ETIQUETA_ESTADO: Record<EstadoCita, string> = {
  SOLICITADA: "Solicitud",
  RESERVADA: "Reservada",
  CONFIRMADA: "Confirmada",
  EN_ESPERA: "Llegó",
  EN_COLA: "En cola",
  EN_ATENCION: "En atención",
  POR_COBRAR: "Por cobrar",
  COMPLETADA: "Completada",
  CANCELADA: "Cancelada",
  NO_ASISTIO: "No vino",
  RECHAZADA: "Rechazada",
  EXPIRADA: "Vencida",
  ABANDONADA: "Se fue",
  PENDIENTE_PAGO: "Esperando pago",
};

export const ETIQUETA_ACCION: Record<AccionCita, string> = {
  CONFIRMAR: "Confirmar",
  LLEGO: "Llegó",
  ATENDER: "Atender",
  FINALIZAR: "Finalizar",
  NO_ASISTIO: "No vino",
  CANCELAR: "Cancelar cita",
  SIN_CARGO: "Sin cargo",
  ABANDONO: "Se fue",
};

const TERMINALES: EstadoCita[] = [
  "COMPLETADA",
  "CANCELADA",
  "NO_ASISTIO",
  "RECHAZADA",
  "EXPIRADA",
  "ABANDONADA",
];

export function esTerminal(estado: EstadoCita): boolean {
  return TERMINALES.includes(estado);
}

/**
 * Las transiciones del diagrama de §6. RESERVADA salta directo a EN_ATENCION
 * (llegó y la atienden ya) y lo mismo CONFIRMADA. SOLICITADA y PENDIENTE_PAGO
 * no tienen acciones acá: son de la reserva online (fase 2), con su bandeja.
 * EN_COLA se atiende con "Atender ahora", que es otro endpoint.
 */
const ACCIONES: Record<EstadoCita, AccionCita[]> = {
  SOLICITADA: [],
  PENDIENTE_PAGO: [],
  RESERVADA: ["CONFIRMAR", "LLEGO", "ATENDER", "NO_ASISTIO", "CANCELAR"],
  CONFIRMADA: ["LLEGO", "ATENDER", "NO_ASISTIO", "CANCELAR"],
  EN_ESPERA: ["ATENDER", "CANCELAR"],
  EN_COLA: ["ABANDONO"],
  EN_ATENCION: ["FINALIZAR"],
  // Cobrar es el POS (la siguiente entrega); sin cargo cierra sin venta.
  POR_COBRAR: ["SIN_CARGO"],
  COMPLETADA: [],
  CANCELADA: [],
  NO_ASISTIO: [],
  RECHAZADA: [],
  EXPIRADA: [],
  ABANDONADA: [],
};

/**
 * Lo que el profesional marca en SUS citas (§4): llegó, en atención,
 * finalizada y no-show. Cancelar, mover y confirmar son de recepción.
 */
const DEL_PROFESIONAL: AccionCita[] = ["LLEGO", "ATENDER", "FINALIZAR", "NO_ASISTIO"];

export function accionesPara(
  estado: EstadoCita,
  opc: { profesional?: boolean } = {},
): AccionCita[] {
  const todas = ACCIONES[estado] ?? [];
  return opc.profesional ? todas.filter((a) => DEL_PROFESIONAL.includes(a)) : todas;
}

/** Los motivos que se ofrecen al cancelar y al cerrar sin cargo (§5.2). */
export const MOTIVOS_CANCELAR = ["Cliente avisó", "Decisión del negocio", "Otro"] as const;
export const MOTIVOS_SIN_CARGO = ["Cortesía", "Retoque o garantía", "Otro"] as const;

/** Acciones que piden un motivo antes de mandarse. */
export function pideMotivo(accion: AccionCita): boolean {
  return accion === "CANCELAR" || accion === "SIN_CARGO";
}

/** ¿Se puede mover (cambiar hora o profesional)? Mientras no empezó. */
export function sePuedeMover(estado: EstadoCita): boolean {
  return estado === "RESERVADA" || estado === "CONFIRMADA" || estado === "SOLICITADA";
}

/**
 * Un botón rápido de las listas (Hoy, Mi agenda). "COBRAR" es especial: se
 * dibuja deshabilitado con "llega pronto" hasta que exista el cobro (F1.5).
 */
export type Rapida = { accion: AccionCita | "COBRAR"; principal: boolean };

/**
 * Los dos botones de una tarjeta, en el orden del lienzo (Hoy.dc): el que
 * corresponde al momento va primero y lleno. Una cita con no-show sugerido
 * ofrece "No vino" primero: el sistema sugiere, no marca solo (§5.2).
 */
export function accionesRapidas(cita: Cita, opc: { profesional?: boolean } = {}): Rapida[] {
  const posibles = new Set(accionesPara(cita.estado, opc));
  const r = (accion: AccionCita, principal = false): Rapida[] =>
    posibles.has(accion) ? [{ accion, principal }] : [];

  if (cita.noShowSugerido && posibles.has("NO_ASISTIO")) {
    return [...r("NO_ASISTIO", true), ...r("LLEGO")];
  }
  switch (cita.estado) {
    case "RESERVADA":
      return opc.profesional ? [...r("LLEGO", true), ...r("ATENDER")] : [...r("CONFIRMAR", true), ...r("LLEGO")];
    case "CONFIRMADA":
      return [...r("LLEGO", true), ...r("NO_ASISTIO")];
    case "EN_ESPERA":
      return r("ATENDER", true);
    case "EN_ATENCION":
      return r("FINALIZAR", true);
    case "POR_COBRAR":
      return opc.profesional ? [] : [{ accion: "COBRAR", principal: true }];
    default:
      return [];
  }
}

/** ¿Se dibuja en la grilla? Lo que liberó el hueco o no tiene hora, no. */
export function vaEnGrilla(estado: EstadoCita): boolean {
  return !["CANCELADA", "RECHAZADA", "EXPIRADA", "ABANDONADA", "EN_COLA"].includes(estado);
}

/**
 * Clases del bloque en la grilla y del badge, con los tokens del tema: el
 * color de marca es el del negocio, nunca uno fijo. El del recurso va aparte
 * (franja izquierda), porque viene de la API.
 */
export function clasesBloque(estado: EstadoCita): string {
  switch (estado) {
    case "EN_ATENCION":
      return "bg-primary-boton border-primary-boton text-white";
    case "POR_COBRAR":
      return "bg-warning-bg border-warning-text text-warning-text";
    case "EN_ESPERA":
      return "bg-info-bg border-info-text text-info-text";
    case "SOLICITADA":
    case "PENDIENTE_PAGO":
      return "bg-white border-dashed border-primary text-primary-700";
    case "COMPLETADA":
      return "bg-slate-100 border-slate-300 text-texto-3";
    case "NO_ASISTIO":
      return "bg-white border-slate-300 text-texto-4 line-through";
    default:
      return "bg-primary-50 border-primary text-primary-700";
  }
}

export function clasesBadge(estado: EstadoCita): string {
  switch (estado) {
    case "EN_ATENCION":
      return "bg-primary-boton text-white";
    case "POR_COBRAR":
      return "bg-warning-bg text-warning-text";
    case "EN_ESPERA":
      return "bg-info-bg text-info-text";
    case "CONFIRMADA":
      return "bg-primary-50 text-primary-700";
    case "SOLICITADA":
    case "PENDIENTE_PAGO":
      return "border border-dashed border-primary bg-white text-primary-700";
    case "CANCELADA":
    case "NO_ASISTIO":
    case "RECHAZADA":
    case "EXPIRADA":
    case "ABANDONADA":
      return "bg-danger-bg text-danger-text";
    default:
      return "bg-slate-100 text-texto-2";
  }
}
