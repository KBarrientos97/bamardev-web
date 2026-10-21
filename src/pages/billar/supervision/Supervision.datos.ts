import { fmtMoney } from "../../../lib/format";
import { round2 } from "../calculo";
import type { ActividadApi, CajaSupervisionApi, SesionSupervisionApi, SupervisionApi } from "../api";
import { aCuenta, aMesa } from "../api";
import type { CuentaSinMesa, Mesa } from "../tipos";
import type { VistaCuenta, VistaMesa } from "../vista";

/**
 * Lo de la pantalla de Supervisión del administrador (21-oct) que no es
 * dibujo: armar mesas y cuentas con quién las abrió y cargó, los números de
 * arriba, cómo se lee cada caja y qué entra en cada filtro de la actividad.
 */

/** Quién hizo qué en una sesión (mesa o cuenta): lo que el tablero de la cajera no trae. */
export interface QuienSesion {
  abrio: string;
  pausadaPor?: { quien: string; autorizo?: string; sinPin?: boolean };
  /** Por id de consumo: quién lo cargó y, si se anuló, quién lo anuló. */
  consumos: Map<string, { por: string; anuladoPor?: string }>;
}

export interface MesaSup {
  mesa: Mesa;
  /** Id interno de la sesión (la ruta de pausar); sin sesión, null. */
  sesionId: number | null;
  quien: QuienSesion | null;
}

export interface CuentaSup {
  cuenta: CuentaSinMesa;
  sesionId: number;
  quien: QuienSesion;
}

function quienDe(s: SesionSupervisionApi): QuienSesion {
  return {
    abrio: s.abiertaPor,
    pausadaPor: s.pausadaPor,
    consumos: new Map(s.consumos.map((c) => [String(c.id), { por: c.por, anuladoPor: c.anuladoPor }])),
  };
}

/** Las mesas y cuentas del backend como las usan las pantallas, con quién las abrió. */
export function armarSupervision(api: SupervisionApi): { mesas: MesaSup[]; cuentas: CuentaSup[] } {
  return {
    mesas: api.mesas.map((m) => ({
      mesa: aMesa(m),
      sesionId: m.sesion?.id ?? null,
      quien: m.sesion ? quienDe(m.sesion) : null,
    })),
    cuentas: api.cuentas.map((c) => ({
      cuenta: aCuenta(c),
      sesionId: c.sesion.id,
      quien: quienDe(c.sesion),
    })),
  };
}

// ── Lo de arriba ────────────────────────────────────────────────────────────

export interface ResumenSup {
  cajasAbiertas: number;
  cajasTotal: number;
  /** Las abiertas que vienen de antes de la jornada: cajas que se olvidaron de cerrar. */
  cajasViejas: number;
  /** Lo vendido en la jornada (ventas aprobadas, sin las anuladas ni las de días atrás). */
  vendido: number;
  ventas: number;
  mesasEnJuego: number;
  mesasTotal: number;
  pausadas: number;
  cuentas: number;
  /** Lo que suman las mesas y cuentas abiertas, y cuánto falta cobrar. */
  totalAbierto: number;
  porCobrar: number;
}

export function resumenSupervision(
  api: Pick<SupervisionApi, "cajas" | "hoy" | "desde">,
  mesas: VistaMesa[],
  cuentas: VistaCuenta[],
): ResumenSup {
  const enUso = mesas.filter((v) => v.cuenta);
  return {
    cajasAbiertas: api.cajas.filter((c) => c.abierta).length,
    cajasTotal: api.cajas.length,
    cajasViejas: api.cajas.filter((c) => estadoDeCaja(c, api.desde) === "vieja").length,
    // No es la suma de las cajas: una caja abierta de ayer trae sus ventas de ayer.
    vendido: round2(api.hoy.vendido),
    ventas: api.hoy.ventas,
    mesasEnJuego: enUso.length,
    mesasTotal: mesas.length,
    pausadas: enUso.filter((v) => v.estado === "pausada").length,
    cuentas: cuentas.length,
    totalAbierto: round2(enUso.reduce((t, v) => t + v.cuenta!.total, 0) + cuentas.reduce((t, v) => t + v.calc.total, 0)),
    porCobrar: round2(enUso.reduce((t, v) => t + v.cuenta!.saldo, 0) + cuentas.reduce((t, v) => t + v.calc.saldo, 0)),
  };
}

// ── Las cajas ───────────────────────────────────────────────────────────────

const dos = (n: number) => String(n).padStart(2, "0");
const hhmm = (d: Date) => `${dos(d.getHours())}:${dos(d.getMinutes())}`;

/**
 * Cuándo pasó algo, dicho corto: la hora si es de hoy, "ayer 22:10" si fue
 * ayer y "20/10 22:10" si es más viejo. Una caja que quedó abierta de antes
 * tiene que leerse como lo que es.
 */
export function cuando(ms: number, ahora: number): string {
  const d = new Date(ms);
  const hoy = new Date(ahora);
  const ayer = new Date(ahora);
  ayer.setDate(hoy.getDate() - 1);
  const mismoDia = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (mismoDia(d, hoy)) return hhmm(d);
  if (mismoDia(d, ayer)) return `ayer ${hhmm(d)}`;
  return `${dos(d.getDate())}/${dos(d.getMonth() + 1)} ${hhmm(d)}`;
}

/** "3 h 12 min", "45 min", "menos de 1 min": cuánto lleva abierta o cuánto duró. */
export function duracion(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60_000));
  if (min < 1) return "menos de 1 min";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return min % 60 ? `${h} h ${min % 60} min` : `${h} h`;
}

/** Abierta, abierta desde antes de la jornada (se olvidó de cerrarla) o cerrada. */
export type EstadoCaja = "abierta" | "vieja" | "cerrada";

export function estadoDeCaja(c: CajaSupervisionApi, desdeJornada: number): EstadoCaja {
  if (!c.abierta) return "cerrada";
  return c.desde < desdeJornada ? "vieja" : "abierta";
}

/** "cuadra", "sobran Bs 5,00" o "faltan Bs 5,00": cómo quedó el arqueo. */
export function textoDiferencia(dif: number): string {
  if (Math.abs(dif) < 0.005) return "cuadra";
  return `${dif > 0 ? "sobran" : "faltan"} ${fmtMoney(Math.abs(dif))}`;
}

/** Las dos letras del avatar: "Pepe Mamani" → "PM". */
export function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "?";
  return (partes[0][0] + (partes.length > 1 ? partes[1][0] : "")).toUpperCase();
}

// ── La actividad ────────────────────────────────────────────────────────────

export type FiltroActividad = "todo" | "caja" | "mesas" | "ventas";

export const FILTROS_ACTIVIDAD: { clave: FiltroActividad; etiqueta: string }[] = [
  { clave: "todo", etiqueta: "Todo" },
  { clave: "caja", etiqueta: "Caja" },
  { clave: "mesas", etiqueta: "Mesas y consumos" },
  { clave: "ventas", etiqueta: "Ventas" },
];

const DE_CAJA = new Set(["CAJA_ABIERTA", "CAJA_CERRADA"]);
const DE_VENTAS = new Set(["VENTA", "VENTA_ANULADA", "CORREGIR_PAGO"]);

/** A qué filtro pertenece un renglón: lo que no es de la caja ni de las ventas es de las mesas. */
export function grupoDeActividad(codigo: string): Exclude<FiltroActividad, "todo"> {
  if (DE_CAJA.has(codigo)) return "caja";
  if (DE_VENTAS.has(codigo)) return "ventas";
  return "mesas";
}

export function filtrarActividad(lista: ActividadApi[], filtro: FiltroActividad): ActividadApi[] {
  return filtro === "todo" ? lista : lista.filter((a) => grupoDeActividad(a.codigo) === filtro);
}

/** Cómo se pinta un renglón: lo que resta o frena (pausas, anulaciones) llama la atención. */
export type TonoActividad = "normal" | "ambar" | "rosa" | "verde" | "azul";

export function tonoDeActividad(codigo: string): TonoActividad {
  switch (codigo) {
    case "PAUSAR":
      return "ambar";
    case "ANULAR_CONSUMO":
    case "ANULAR_MESA":
    case "ANULAR_CUENTA":
    case "VENTA_ANULADA":
    case "EDITAR_INICIO":
    case "CORREGIR_PAGO":
      return "rosa";
    case "VENTA":
      return "verde";
    case "CAJA_ABIERTA":
    case "CAJA_CERRADA":
      return "azul";
    default:
      return "normal";
  }
}
