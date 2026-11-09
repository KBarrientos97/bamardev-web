import { request } from "../api";
import type { DestacadoDia } from "./tipos";

/**
 * El destacado del día desde la caja (PLAN-PAGINA-PRO M4): "Almuerzo de
 * hoy", "Turnos libres hoy", "Oferta del día". Se ve al instante en el sitio,
 * sin borrador: lo publica quien está en la caja. Pide `sitio_web` y
 * `negocio.configurar`; el cuerpo lo valida entero el backend (400 con el
 * motivo, en español).
 */

export interface TipoDestacado {
  tipo: string;
  etiqueta: string;
}

/** `GET /pagina/destacado`: los tipos del rubro (el primero, elegido) y el vigente. */
export interface EstadoDestacado {
  tipos: TipoDestacado[];
  vigente: DestacadoDia | null;
}

export interface TurnoAPublicar {
  /** ISO, el inicio que dio la agenda. */
  inicio: string;
  recursoId: number;
  profesional: string | null;
}

export interface DestacadoAPublicar {
  tipo: string;
  /** Hasta 4, del catálogo de productos del sistema. */
  productoIds?: number[];
  /** "Cuántos hay": baja sola con cada venta. Sólo con producto. */
  cantidad?: number;
  texto?: string;
  descuentoPct?: number;
  /** Sólo TURNOS_LIBRES, hasta 8. */
  turnos?: TurnoAPublicar[];
  /** ISO, en el futuro y como mucho en 24 h. */
  hasta: string;
}

export const apiDestacado = {
  estado: () => request<EstadoDestacado>("/pagina/destacado"),
  publicar: (d: DestacadoAPublicar) =>
    request<EstadoDestacado>("/pagina/destacado", { method: "POST", body: JSON.stringify(d) }),
  quitar: () => request<EstadoDestacado>("/pagina/destacado", { method: "DELETE" }),
};

/** Los topes del backend (`LIMITES_DESTACADO`). */
export const TOPES_DESTACADO = { productos: 4, turnos: 8, texto: 160, cantidad: 9999 } as const;

/** Bolivia no cambia la hora: UTC−4 todo el año. */
const BOLIVIA_MS = 4 * 3_600_000;

/** "15:00" de hoy en Bolivia como ISO; si ya pasó, la de mañana (siempre dentro de 24 h). */
export function horaAIso(hora: string, ahora = new Date()): string | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hora);
  if (!m) return null;
  const local = new Date(ahora.getTime() - BOLIVIA_MS);
  const dia = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  let t = dia + (Number(m[1]) * 60 + Number(m[2])) * 60_000 + BOLIVIA_MS;
  if (t <= ahora.getTime()) t += 24 * 3_600_000;
  return new Date(t).toISOString();
}

/** "15:30" de un ISO, en Bolivia. */
export function horaDe(iso: string): string {
  const d = new Date(new Date(iso).getTime() - BOLIVIA_MS);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/**
 * La hora propuesta para quitarlo: el almuerzo a las 15:00, la farmacia de
 * turno a las 08:00 del otro día y lo demás al cierre (21:00). Si la de hoy
 * ya pasó, la última media hora del día: un destacado que vence mañana a la
 * tarde no es "del día".
 */
export function horaPropuesta(tipo: string, ahora = new Date()): string {
  if (tipo === "DE_TURNO") return "08:00";
  const preferida = tipo === "ALMUERZO" || tipo === "PLATO_DEL_DIA" ? "15:00" : "21:00";
  const local = new Date(ahora.getTime() - BOLIVIA_MS);
  const minutos = local.getUTCHours() * 60 + local.getUTCMinutes();
  const [h, mm] = preferida.split(":").map(Number);
  if (h * 60 + mm > minutos) return preferida;
  return minutos < 23 * 60 + 30 ? "23:30" : "23:59";
}

/** "Almuerzo de hoy: Sopa de maní · Quedan 18": cómo lo va a leer el cliente. */
export function resumenDestacado(d: {
  etiqueta: string;
  titulos: string[];
  cantidad: number | null;
  texto: string | null;
  descuentoPct: number | null;
  turnos: number;
}): string {
  const partes: string[] = [];
  if (d.turnos) partes.push(`${d.turnos} ${d.turnos === 1 ? "turno libre" : "turnos libres"}`);
  if (d.titulos.length) partes.push(d.titulos.join(", "));
  if (d.descuentoPct) partes.push(`${d.descuentoPct} % menos`);
  if (d.cantidad) partes.push(d.cantidad === 1 ? "Queda 1" : `Quedan ${d.cantidad}`);
  if (d.texto) partes.push(d.texto);
  return partes.length ? `${d.etiqueta}: ${partes.join(" · ")}` : d.etiqueta;
}
