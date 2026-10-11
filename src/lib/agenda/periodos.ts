import { lunesDe, sumarDias } from "./horaAgenda";
import type { Periodo } from "./tiposComisiones";

/**
 * Los períodos de liquidación como se pagan en Bolivia (PLAN-PELUQUERIA §2):
 * semana de lunes a domingo, quincena del 1 al 15 y del 16 a fin de mes, y mes
 * calendario. Todo con fechas del negocio `AAAA-MM-DD`.
 */

export type TipoPeriodo = Exclude<Periodo, "OTRO">;

/** Un período elegido en pantalla: uno de los de siempre o un rango libre ("OTRO"). */
export interface PeriodoElegido {
  tipo: Periodo;
  desde: string;
  hasta: string;
}

/**
 * El último período de ese tipo que ya terminó: el anterior al de hoy. Es lo
 * que se liquida por defecto (QA N2-08: la pantalla abría en la semana en
 * curso y dejaba cerrar días que todavía no pasaron).
 */
export function periodoCerrado(tipo: TipoPeriodo, hoy: string): PeriodoElegido {
  return { tipo, ...correrPeriodo(tipo, periodoDe(tipo, hoy), -1) };
}

/** ¿El período termina después de hoy? (no se puede liquidar entero todavía) */
export function terminaDespues(p: { hasta: string }, hoy: string): boolean {
  return p.hasta > hoy;
}

/** El período de hoy de un tipo. */
export function periodoActual(tipo: TipoPeriodo, hoy: string): PeriodoElegido {
  return { tipo, ...periodoDe(tipo, hoy) };
}

/** Último día del mes de una fecha. */
function finDeMes(fecha: string): string {
  const [y, m] = fecha.split("-").map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${fecha.slice(0, 7)}-${String(ultimo).padStart(2, "0")}`;
}

/** El período que contiene a `fecha`. */
export function periodoDe(tipo: TipoPeriodo, fecha: string): { desde: string; hasta: string } {
  if (tipo === "SEMANA") {
    const desde = lunesDe(fecha);
    return { desde, hasta: sumarDias(desde, 6) };
  }
  if (tipo === "MES") return { desde: `${fecha.slice(0, 7)}-01`, hasta: finDeMes(fecha) };
  const dia = Number(fecha.slice(8));
  return dia <= 15
    ? { desde: `${fecha.slice(0, 7)}-01`, hasta: `${fecha.slice(0, 7)}-15` }
    : { desde: `${fecha.slice(0, 7)}-16`, hasta: finDeMes(fecha) };
}

/** El período anterior (o siguiente con `paso = 1`) del mismo tipo. */
export function correrPeriodo(
  tipo: TipoPeriodo,
  actual: { desde: string },
  paso: -1 | 1,
): { desde: string; hasta: string } {
  if (tipo === "SEMANA") return periodoDe(tipo, sumarDias(actual.desde, 7 * paso));
  // Un día antes del inicio cae en el anterior; 17 días después del inicio de
  // una quincena (dura de 13 a 16) o 32 del de un mes cae en el siguiente.
  if (paso === -1) return periodoDe(tipo, sumarDias(actual.desde, -1));
  return periodoDe(tipo, sumarDias(actual.desde, tipo === "MES" ? 32 : 17));
}

/** "Semana del 19 al 25 de oct." para mostrar, sin depender del navegador. */
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export function textoPeriodo(desde: string, hasta: string): string {
  const d = Number(desde.slice(8));
  const h = Number(hasta.slice(8));
  const md = MESES[Number(desde.slice(5, 7)) - 1];
  const mh = MESES[Number(hasta.slice(5, 7)) - 1];
  if (desde === hasta) return `${d} de ${md}.`;
  return md === mh ? `${d} al ${h} de ${mh}.` : `${d} de ${md}. al ${h} de ${mh}.`;
}
