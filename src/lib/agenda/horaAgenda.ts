/**
 * El reloj de la agenda: la hora del NEGOCIO, no la del equipo.
 *
 * El contrato manda instantes en UTC (`2026-10-21T13:00:00.000Z`) y fechas y
 * horas sueltas en hora de La Paz. Se convierte siempre con la zona explícita y
 * nunca con la del navegador: la PC de un dueño de viaje, o un celular con la
 * hora mal puesta, mostraría la agenda corrida y alguien llegaría una hora
 * tarde. Es el mismo criterio que `common/hora-negocio.ts` del backend.
 */

export const ZONA_NEGOCIO = "America/La_Paz";

const formato = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONA_NEGOCIO,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function partes(d: Date) {
  const p: Record<string, number> = {};
  for (const parte of formato.formatToParts(d)) {
    if (parte.type !== "literal") p[parte.type] = Number(parte.value);
  }
  return p as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

const dos = (n: number) => String(n).padStart(2, "0");

/** Minutos de diferencia entre la zona del negocio y UTC en ese instante (−240). */
function offsetMin(d: Date): number {
  const p = partes(d);
  const comoUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((comoUtc - Math.floor(d.getTime() / 1000) * 1000) / 60000);
}

/** "AAAA-MM-DD" del negocio para ese instante (hoy, por defecto). */
export function fechaNegocio(d: Date | string = new Date()): string {
  const p = partes(typeof d === "string" ? new Date(d) : d);
  return `${p.year}-${dos(p.month)}-${dos(p.day)}`;
}

/** "HH:mm" del negocio para un instante ISO. */
export function horaNegocio(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = partes(d);
  return `${dos(p.hour)}:${dos(p.minute)}`;
}

/** Minutos desde la medianoche del negocio. */
export function minutosDelDia(iso: string | Date): number {
  const p = partes(typeof iso === "string" ? new Date(iso) : iso);
  return p.hour * 60 + p.minute;
}

/** "09:30" → 570. */
export function aMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** 570 → "09:30". */
export function deMinutos(min: number): string {
  const m = Math.max(0, Math.round(min));
  return `${dos(Math.floor(m / 60))}:${dos(m % 60)}`;
}

/** El instante UTC (ISO) de una fecha y hora del negocio. */
export function instante(fecha: string, hhmm: string): string {
  const [a, m, d] = fecha.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  const supuesto = Date.UTC(a, m - 1, d, h, mi);
  const off = offsetMin(new Date(supuesto));
  return new Date(supuesto - off * 60000).toISOString();
}

/** Suma días a una fecha "AAAA-MM-DD" sin pasar por la zona del equipo. */
export function sumarDias(fecha: string, dias: number): string {
  const [a, m, d] = fecha.split("-").map(Number);
  const t = new Date(Date.UTC(a, m - 1, d + dias));
  return `${t.getUTCFullYear()}-${dos(t.getUTCMonth() + 1)}-${dos(t.getUTCDate())}`;
}

/** 1 = lunes … 7 = domingo, como el contrato. */
export function diaSemana(fecha: string): number {
  const [a, m, d] = fecha.split("-").map(Number);
  const js = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  return js === 0 ? 7 : js;
}

/** El lunes de la semana de esa fecha. */
export function lunesDe(fecha: string): string {
  return sumarDias(fecha, 1 - diaSemana(fecha));
}

const DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
const DIAS_CORTOS = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** "sábado 10 de octubre". */
export function fechaLarga(fecha: string): string {
  const [, m, d] = fecha.split("-").map(Number);
  return `${DIAS[diaSemana(fecha) - 1]} ${d} de ${MESES[m - 1]}`;
}

/** "SÁB". */
export function diaCorto(fecha: string): string {
  return DIAS_CORTOS[diaSemana(fecha) - 1];
}

/** Con mayúscula inicial, para títulos. */
export function capitalizar(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** "45 min", "1 h", "2 h 30". */
export function duracionTexto(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${dos(r)}` : `${h} h`;
}

/** Minutos entre dos instantes ISO. */
export function minutosEntre(desde: string, hasta: string): number {
  return Math.round((new Date(hasta).getTime() - new Date(desde).getTime()) / 60000);
}

/** El mismo instante corrido `min` minutos. */
export function correr(iso: string, min: number): string {
  return new Date(new Date(iso).getTime() + min * 60000).toISOString();
}
