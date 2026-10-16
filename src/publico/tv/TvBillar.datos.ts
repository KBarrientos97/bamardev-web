import type { Mesa, TipoMesa } from "../../pages/billar/tipos";
import { ErrorTv, type SalonPublicoApi } from "./apiTv";

/**
 * Las cuentas de la TV pública del billar, puras: cada cuánto pregunta, qué
 * hace con cada "no" del servidor y cómo pasa la respuesta a las mesas que
 * dibuja SalonTv.tsx.
 */

/**
 * Cada cuánto pregunta con todo andando. El backend admite 60 por minuto por
 * IP, y todos los televisores de un local salen por la misma: a 10 s entran
 * diez TVs sin que ninguna se quede afuera. El cronómetro corre en la TV
 * cada segundo; lo que tarda hasta 10 s es ver que se abrió o cerró una mesa.
 */
export const CADA_MS = 10_000;
/** Llave anulada: se sigue preguntando, despacio, por si el negocio recupera el billar. */
export const LENTO_MS = 60_000;
/** El tope de la espera entre reintentos sin conexión. */
export const TOPE_REINTENTO_MS = 30_000;

/** 10 s, 20 s, 30 s, 30 s…: sin red no tiene sentido martillar, pero tiene que volver sola. */
export function esperaTrasFallo(fallos: number): number {
  return Math.min(TOPE_REINTENTO_MS, CADA_MS * Math.max(1, fallos));
}

/**
 * Qué significa un error para la TV:
 * - `anulada`: 404, la llave no existe (se generó otra, o el negocio ya no
 *   tiene el billar). El backend contesta igual a todo "no" a propósito.
 * - `invalida`: otro 4xx, el enlace está mal armado (p. ej. un local que ya
 *   no existe en `?sucursal=`). No se arregla esperando.
 * - `sinConexion`: sin red, el servidor caído (5xx), el tope de pedidos (429)
 *   o la espera vencida. Se reintenta y se recupera solo.
 */
export type TipoFalla = "anulada" | "invalida" | "sinConexion";

export function clasificarFalla(err: unknown): TipoFalla {
  if (!(err instanceof ErrorTv)) return "sinConexion";
  if (err.status === 404) return "anulada";
  if (err.status >= 400 && err.status < 500 && err.status !== 408 && err.status !== 429) return "invalida";
  return "sinConexion";
}

/** La misma forma que valida el backend: si no la tiene, no hace falta ni preguntar. */
export function llaveConForma(llave: string): boolean {
  return /^[A-Za-z0-9_-]{20,64}$/.test(llave);
}

/** `?sucursal=12` → 12. Lo que no es un id se ignora: el backend muestra la principal. */
export function sucursalDeLaDireccion(valor: string | null): number | undefined {
  const n = Number(valor);
  return valor && Number.isInteger(n) && n > 0 ? n : undefined;
}

export function tiposDelSalon(r: SalonPublicoApi): Record<string, TipoMesa> {
  return Object.fromEntries(r.tipos.map((t) => [t.id, t]));
}

/**
 * Las mesas con la forma de la web (`Mesa` de tipos.ts), para dibujarlas con
 * las mismas funciones que el tablero. Sin ids internos (el público no los
 * tiene: se usa el número, que es único en la sucursal) y sin nombres.
 */
export function mesasDelSalon(r: SalonPublicoApi): Mesa[] {
  return r.mesas.map((m) => ({
    id: m.numero,
    idInterno: m.numero,
    tipo: m.tipo,
    alias: m.alias,
    tarifaPropia: m.tarifaPropia,
    estado: m.estado,
    reserva: m.reserva ? { hora: m.reserva.hora, nombre: "" } : undefined,
    sesion: m.sesion
      ? {
          id: "",
          start: m.sesion.start,
          pausedAt: m.sesion.pausedAt,
          pausedTotal: m.sesion.pausedTotal,
          prepago: m.sesion.prepago,
          prev: m.sesion.prev,
          consumos: [],
          pagos: [],
        }
      : undefined,
  }));
}
