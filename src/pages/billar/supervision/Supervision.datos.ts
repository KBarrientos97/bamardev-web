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
  /** Las de hoy: las abiertas y las que se abrieron o cerraron en la jornada (la lista trae también las de ayer). */
  cajasTotal: number;
  /** Las abiertas que vienen de antes de la jornada: cajas que se olvidaron de cerrar. */
  cajasViejas: number;
  /** Lo vendido en el turno que se mira (ventas aprobadas, sin las anuladas); sin turno, lo de la jornada. */
  vendido: number;
  ventas: number;
  /** Lo vendido en toda la jornada, de todas las cajas (sin las de días atrás). */
  vendidoHoy: number;
  ventasHoy: number;
  mesasEnJuego: number;
  mesasTotal: number;
  pausadas: number;
  cuentas: number;
  /** Lo que suman las mesas y cuentas abiertas, y cuánto falta cobrar. */
  totalAbierto: number;
  porCobrar: number;
  /**
   * Lo que suman sólo las cuentas abiertas, para su rótulo: con
   * `totalAbierto` ahí, una cuenta de Bs 30 con mesas por Bs 420 decía
   * "Cuentas abiertas · Bs 450" (revisión del 23-oct).
   */
  totalCuentas: number;
}

export function resumenSupervision(
  api: Pick<SupervisionApi, "cajas" | "hoy" | "desde" | "turno">,
  mesas: VistaMesa[],
  cuentas: VistaCuenta[],
): ResumenSup {
  const enUso = mesas.filter((v) => v.cuenta);
  // Lo del turno que se mira; un backend anterior no lo manda y todo es de hoy.
  const delTurno = api.turno ?? api.hoy;
  return {
    cajasAbiertas: api.cajas.filter((c) => c.abierta).length,
    cajasTotal: api.cajas.filter((c) => c.abierta || c.desde >= api.desde || (c.hasta ?? 0) >= api.desde).length,
    cajasViejas: api.cajas.filter((c) => estadoDeCaja(c, api.desde) === "vieja").length,
    // No es la suma de las cajas: una caja abierta de ayer trae sus ventas de ayer.
    vendido: round2(delTurno.vendido),
    ventas: delTurno.ventas,
    vendidoHoy: round2(api.hoy.vendido),
    ventasHoy: api.hoy.ventas,
    mesasEnJuego: enUso.length,
    mesasTotal: mesas.length,
    pausadas: enUso.filter((v) => v.estado === "pausada").length,
    cuentas: cuentas.length,
    totalAbierto: round2(enUso.reduce((t, v) => t + v.cuenta!.total, 0) + cuentas.reduce((t, v) => t + v.calc.total, 0)),
    porCobrar: round2(enUso.reduce((t, v) => t + v.cuenta!.saldo, 0) + cuentas.reduce((t, v) => t + v.calc.saldo, 0)),
    totalCuentas: round2(cuentas.reduce((t, v) => t + v.calc.total, 0)),
  };
}

// ── Las cajas ───────────────────────────────────────────────────────────────

const dos = (n: number) => String(n).padStart(2, "0");
const hhmm = (d: Date) => `${dos(d.getHours())}:${dos(d.getMinutes())}`;
const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
/** "25/10" */
const diaMes = (d: Date) => `${dos(d.getDate())}/${dos(d.getMonth() + 1)}`;

/**
 * Cuándo pasó algo, dicho corto: la hora si es de hoy, "ayer 22:10" si fue
 * ayer y "Mar 20/10 22:10" si es más viejo (con el día de la semana: se
 * revisa la semana entera). Una caja que quedó abierta de antes tiene que
 * leerse como lo que es.
 */
export function cuando(ms: number, ahora: number): string {
  const d = new Date(ms);
  const hoy = new Date(ahora);
  const ayer = new Date(ahora);
  ayer.setDate(hoy.getDate() - 1);
  const mismoDia = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (mismoDia(d, hoy)) return hhmm(d);
  if (mismoDia(d, ayer)) return `ayer ${hhmm(d)}`;
  return `${DIAS[d.getDay()].slice(0, 3)} ${diaMes(d)} ${hhmm(d)}`;
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

// ── El turno ────────────────────────────────────────────────────────────────

/**
 * Un turno es una caja: de que se abre a que se cierra. Un billar abre a la
 * tarde y cierra de madrugada, y lo de la caja anterior no se mezcla con lo de
 * la nueva: la pantalla empieza de cero cuando abren otra y el turno de antes
 * se elige aparte.
 */
export type SituacionTurno =
  /** Sin turno que mirar (nadie abrió caja, o un backend anterior): se ve lo de hoy. */
  | "hoy"
  /** La caja que trabaja ahora. */
  | "enCurso"
  /** La única abierta es de antes de la jornada: se olvidaron de cerrarla. */
  | "olvidada"
  /** Todas cerradas: se ve cómo terminó la última, hasta que abran otra. */
  | "cerrado"
  /** Una caja elegida a mano, no la que corresponde ahora. */
  | "elegido";

export function situacionDelTurno(api: Pick<SupervisionApi, "cajas" | "desde" | "turno">): {
  situacion: SituacionTurno;
  caja?: CajaSupervisionApi;
} {
  const t = api.turno;
  const caja = t?.cajaId != null ? api.cajas.find((c) => c.id === t.cajaId) : undefined;
  if (!t || !caja) return { situacion: "hoy" };
  if (t.cajaId !== t.defectoId) return { situacion: "elegido", caja };
  if (!caja.abierta) return { situacion: "cerrado", caja };
  return { situacion: estadoDeCaja(caja, api.desde) === "vieja" ? "olvidada" : "enCurso", caja };
}

const mismoDia = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();

/** "desde 16:02" si sigue abierta; "ayer 16:02 – 02:41" si ya cerró (sin repetir el día si es el mismo). */
export function rangoDeTurno(c: Pick<CajaSupervisionApi, "desde" | "hasta">, ahora: number): string {
  if (c.hasta == null) return `desde ${cuando(c.desde, ahora)}`;
  const fin = mismoDia(c.desde, c.hasta) ? hhmm(new Date(c.hasta)) : cuando(c.hasta, ahora);
  return `${cuando(c.desde, ahora)} – ${fin}`;
}

/** "Domingo 25/10 16:00": el día de la semana, la fecha y la hora, sin "hoy" ni "ayer" (se revisa la semana entera). */
export function diaYHora(ms: number): string {
  const d = new Date(ms);
  return `${DIAS[d.getDay()]} ${diaMes(d)} ${hhmm(d)}`;
}

/**
 * El turno de punta a punta, con el día de cada hora: "Domingo 25/10 16:00 →
 * Lunes 26/10 03:30". Si abrió y cerró el mismo día, el cierre va sin día; si
 * sigue abierta, "desde …".
 */
export function rangoDeTurnoCompleto(c: Pick<CajaSupervisionApi, "desde" | "hasta">): string {
  if (c.hasta == null) return `desde ${diaYHora(c.desde)}`;
  const fin = mismoDia(c.desde, c.hasta) ? hhmm(new Date(c.hasta)) : diaYHora(c.hasta);
  return `${diaYHora(c.desde)} → ${fin}`;
}

/** "lun 19/10 al dom 25/10": los días de la semana de los turnos (se reinicia el lunes, pero termina el domingo). */
export function rangoDeSemana(semana: { desde: number }): string {
  const ini = new Date(semana.desde);
  const fin = new Date(semana.desde);
  fin.setDate(fin.getDate() + 6);
  const corto = (d: Date) => `${DIAS[d.getDay()].slice(0, 3).toLowerCase()} ${diaMes(d)}`;
  return `${corto(ini)} al ${corto(fin)}`;
}

/** "lunes 26/10 a las 13:00": cuándo empieza la semana nueva y los turnos de ésta dejan de verse. */
export function reinicioDeSemana(semana: { hasta: number }): string {
  const d = new Date(semana.hasta);
  return `${DIAS[d.getDay()].toLowerCase()} ${diaMes(d)} a las ${hhmm(d)}`;
}

/** Cómo se nombra un turno en el selector: quién, cuándo y, si es el que corresponde, qué es. */
function etiquetaDeTurno(c: CajaSupervisionApi, api: Pick<SupervisionApi, "desde" | "turno">): string {
  const defecto = api.turno?.defectoId === c.id;
  let marca = "";
  if (c.abierta) marca = estadoDeCaja(c, api.desde) === "vieja" ? "Quedó abierta · " : defecto ? "Turno en curso · " : "Caja abierta · ";
  else if (defecto) marca = "Último turno · ";
  return `${marca}${c.cajero} · ${rangoDeTurnoCompleto(c)}`;
}

/** Los turnos que se pueden mirar: las cajas abiertas y las de la semana, la más nueva primero. */
export function opcionesDeTurno(api: Pick<SupervisionApi, "cajas" | "desde" | "turno">): { id: number; etiqueta: string }[] {
  return [...api.cajas].sort((a, b) => b.desde - a.desde).map((c) => ({ id: c.id, etiqueta: etiquetaDeTurno(c, api) }));
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
