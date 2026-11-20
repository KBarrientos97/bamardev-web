import { aCentavos } from "./dinero";

/**
 * El historial del repartidor por día (20-nov): `GET /reparto/historial?desde&hasta`.
 * Es lo que le faltaba a «Mi día» para mostrar la semana: «Mis entregas» corta
 * en la jornada (desde las 6:00) y los días anteriores no llegan.
 *
 * `envio` es la tarifa que se le cobró al cliente («Envío cobrado»), no lo que
 * gana el repartidor: el sistema no sabe qué le paga el negocio por viaje.
 */
export interface EntregaDelHistorial {
  ventaId: number;
  numero: string;
  cliente: string;
  entregadoEn: string;
  envio: number;
  formaPago: string;
  total: number;
}

export interface DiaDelHistorial {
  /** YYYY-MM-DD, el día de la jornada. */
  dia: string;
  cantidad: number;
  totalEnvios: number;
  entregas: EntregaDelHistorial[];
}

export interface HistorialReparto {
  dias: DiaDelHistorial[];
  cantidad: number;
  totalEnvios: number;
}

const num = (v: unknown) => (Number.isFinite(Number(v)) ? aCentavos(Number(v)) : 0);
const txt = (v: unknown, otro: string) => (typeof v === "string" && v.trim() ? v.trim() : otro);
const lista = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === "object") : [];

/**
 * La respuesta, con cada campo en su tipo (un Decimal que viaja como texto no
 * rompe la pantalla). Algo que no es un historial (un backend anterior que
 * contesta otra cosa) da null: «Semana» dice que no está disponible.
 */
export function normalizarHistorial(raw: unknown): HistorialReparto | null {
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as { dias?: unknown }).dias)) return null;
  const r = raw as Record<string, unknown>;
  const dias = lista(r.dias)
    .map((d) => ({
      dia: txt(d.dia, ""),
      cantidad: Math.max(0, Math.trunc(Number(d.cantidad) || 0)),
      totalEnvios: num(d.totalEnvios),
      entregas: lista(d.entregas).map((e) => ({
        ventaId: Number(e.ventaId) || 0,
        numero: txt(e.numero, `#${Number(e.ventaId) || 0}`),
        cliente: txt(e.cliente, "Sin nombre"),
        entregadoEn: txt(e.entregadoEn, ""),
        envio: num(e.envio),
        formaPago: txt(e.formaPago, "Sin detalle"),
        total: num(e.total),
      })),
    }))
    .filter((d) => d.dia)
    // El más reciente arriba: hoy es lo primero que se busca.
    .sort((a, b) => b.dia.localeCompare(a.dia));
  return { dias, cantidad: Math.max(0, Math.trunc(Number(r.cantidad) || 0)), totalEnvios: num(r.totalEnvios) };
}

/** Las 6:00: el corte del «hoy» del reparto, igual que el backend (`CORTE_ENTREGAS_MIN`). */
const CORTE_MS = 6 * 3_600_000;
/** Bolivia es UTC−4 todo el año. */
const BOLIVIA_MS = 4 * 3_600_000;

/** El día de la jornada (YYYY-MM-DD): a las 3 a. m. todavía es el de ayer. */
export function diaDeJornada(ahora = new Date()): string {
  return new Date(ahora.getTime() - BOLIVIA_MS - CORTE_MS).toISOString().slice(0, 10);
}

/** Los últimos 7 días de jornada, hoy incluido. */
export function rangoSemana(ahora = new Date()): { desde: string; hasta: string } {
  const hasta = diaDeJornada(ahora);
  const d = new Date(`${hasta}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 6);
  return { desde: d.toISOString().slice(0, 10), hasta };
}

/** «vie 20/11», para el encabezado de cada día. */
export function textoDia(dia: string): string {
  const d = new Date(`${dia}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return dia;
  const semana = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"][d.getUTCDay()];
  return `${semana} ${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
}
