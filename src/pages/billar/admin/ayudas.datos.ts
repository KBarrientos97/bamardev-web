import { fmtMoney } from "../../../lib/format";
import { cobroTiempo, fmtCobrado, fmtTiempoFijo, MAX_FIJO_MIN, precioTiempoFijo, round2, simularLibre } from "../calculo";
import type { TipoMesa } from "../tipos";
import { FRACCIONES } from "./borrador";

/**
 * Los ejemplos de las ayudas de Tarifas y paquetes (el "?" al lado de cada
 * rótulo). Salen de la misma cuenta que cobra la mesa (`simularLibre`,
 * `precioTiempoFijo`, `cobroTiempo`) y con la tarifa que se está editando: un
 * ejemplo escrito a mano deja de ser cierto apenas el dueño cambia la
 * fracción, y una ayuda que contradice al cobro confunde más que no tenerla.
 */

/** Con la tarifa a medio completar, los ejemplos usan una típica y la ayuda lo dice. */
export const TIPO_EJEMPLO: TipoMesa = {
  id: "",
  nombre: "Ejemplo",
  tarifa: 20,
  fraccion: 15,
  tolerancia: 3,
  minimo: 30,
  paquetes: [
    { min: 60, precio: 20 },
    { min: 120, precio: 40 },
    { min: 180, precio: 55 },
  ],
  promos: [],
};

/** Una fila de ejemplo: "Si juegan 1:04 → se cobra 1:15 → Bs 25,00". */
export interface Ejemplo {
  juegan: string;
  cobra: string;
  bs: string;
}

/**
 * Lo que se cobra por `min` jugados en tiempo libre, SIN promo: los ejemplos
 * del redondeo con una promo de "desde 1 h" mostraban un precio que no se
 * explicaba con la fracción. La promo tiene su propia ayuda.
 */
export function ejemploCobro(t: TipoMesa, min: number): Ejemplo {
  const r = simularLibre({ ...t, promos: [] }, min * 60);
  return { juegan: fmtCobrado(min), cobra: fmtCobrado(r.min), bs: fmtMoney(r.total) };
}

/** Desde dónde arrancan los ejemplos del redondeo: la hora, o el mínimo si es más largo (si no, lo tapa). */
function base(t: TipoMesa): number {
  return Math.max(60, Math.ceil(t.minimo / t.fraccion) * t.fraccion);
}

/**
 * Tres tiempos que muestran el redondeo con la fracción y la tolerancia
 * cargadas: justo en la tolerancia (no sube), un minuto después (sube un
 * bloque) y un bloque más adelante. Por minuto: la hora y 1:34, que tiene
 * centavos (lo que se ve en el simulador).
 */
export function ejemplosFraccion(t: TipoMesa): Ejemplo[] {
  return minutosDeEjemplo(t).map((m) => ejemploCobro(t, m));
}

function minutosDeEjemplo(t: TipoMesa): number[] {
  const b = base(t);
  if (t.fraccion === 1) return [b, b + 34];
  return [b + t.tolerancia, b + t.tolerancia + 1, b + t.fraccion + t.tolerancia + 1];
}

/** Si un monto no se puede pagar justo con monedas de 10 centavos (Bs 0,33; Bs 6,25). */
function conCentavos(bs: number): boolean {
  return Math.abs(bs * 10 - Math.round(bs * 10)) > 1e-6;
}

/**
 * El primero de los ejemplos de la fracción que sale con centavos sin moneda,
 * para el aviso. No siempre es el último: a Bs 25 la hora de a 15 min, 1:30
 * sale Bs 37,50 (que se paga justo) y 1:15 sale Bs 31,25 (que no).
 */
export function ejemploConCentavos(t: TipoMesa): string | null {
  for (const m of minutosDeEjemplo(t)) {
    const total = simularLibre({ ...t, promos: [] }, m * 60).total;
    if (conCentavos(total)) return fmtMoney(total);
  }
  return null;
}

export interface Bloque {
  /** Cuánto vale un bloque de la fracción (un minuto, si es por minuto). */
  bs: number;
  conCentavos: boolean;
  /** La fracción más chica con bloques redondos, si la actual no los da. */
  redonda: { fraccion: number; bs: number } | null;
}

/**
 * Cuánto vale cada bloque. Por minuto a Bs 20 la hora, el minuto vale
 * Bs 0,333… y una mesa de 1:34 sale Bs 31,33: un monto que no se puede dar
 * justo en efectivo (no hay monedas de 1 centavo) y que en cada cobro deja
 * unos centavos de diferencia en el arqueo. Se avisa y se sugiere la fracción
 * más chica que da bloques redondos; elegirla es del dueño.
 */
export function bloque(t: TipoMesa): Bloque {
  const exacto = (f: number) => (t.tarifa * f) / 60;
  const tiene = conCentavos(exacto(t.fraccion));
  const f = tiene ? FRACCIONES.find((x) => !conCentavos(exacto(x))) : undefined;
  return {
    bs: round2(exacto(t.fraccion)),
    conCentavos: tiene,
    redonda: f ? { fraccion: f, bs: round2(exacto(f)) } : null,
  };
}

/** Justo en la tolerancia y un minuto después. null cobrando por minuto: no hay tolerancia. */
export function ejemplosTolerancia(t: TipoMesa): { dentro: Ejemplo; pasado: Ejemplo } | null {
  if (t.fraccion === 1) return null;
  const b = base(t);
  return { dentro: ejemploCobro(t, b + t.tolerancia), pasado: ejemploCobro(t, b + t.tolerancia + 1) };
}

/**
 * El mínimo que se cobra de verdad: se completa en bloques de la fracción,
 * así que un mínimo de 20 con fracción de 15 se cobra 30 (`cobroTiempo`).
 * Con eso a la vista, el dueño que puso 20 no se sorprende al cobrar.
 */
export function minimoEfectivo(t: Pick<TipoMesa, "minimo" | "fraccion">): number {
  return t.minimo > 0 ? Math.ceil(t.minimo / t.fraccion) * t.fraccion : 0;
}

/** Una partida corta: 10 min, o uno menos que un mínimo más corto (para que se vea el mínimo). */
export function ejemploMinimo(t: TipoMesa): Ejemplo {
  const juegan = t.minimo === 0 || t.minimo > 10 ? 10 : Math.max(1, t.minimo - 1);
  return ejemploCobro(t, juegan);
}

export interface EjemploPaquete {
  /** "4 h". */
  tiempo: string;
  /** "3 h + 1 h". */
  partes: string;
  bs: string;
  /** La promo de tiempo fijo que entró en el precio, si hay. */
  promo: string | null;
}

/**
 * Una cantidad sin paquete propio (una hora más que el paquete más largo),
 * para mostrar que se arma la combinación más barata. Sin paquetes: 2 horas
 * sueltas.
 */
export function ejemploPaquete(t: TipoMesa): EjemploPaquete {
  const mayor = Math.max(60, ...t.paquetes.map((p) => p.min));
  const min = t.paquetes.length ? Math.min(MAX_FIJO_MIN, mayor + 60) : 120;
  const r = precioTiempoFijo(t, min);
  return { tiempo: fmtTiempoFijo(min), partes: r.partes.join(" + "), bs: fmtMoney(r.precio), promo: r.promo?.nombre ?? null };
}

/** Lo que se cobra si se pasan 10 min del tiempo fijo: por fracción y sin mínimo, como en la mesa. */
export function ejemploExcedente(t: TipoMesa): Ejemplo {
  const c = cobroTiempo(10 * 60, t, false);
  return { juegan: fmtCobrado(10), cobra: fmtCobrado(c.min), bs: fmtMoney(c.bs) };
}

export interface EjemploPromo {
  nombre: string;
  pct: string;
  juegan: string;
  cobra: string;
  bruto: string;
  total: string;
}

/**
 * La promo activa que se alcanza primero, con media hora más que su "desde"
 * (todas las fracciones entran justas en 30 min, así el ejemplo no suma un
 * redondeo que distraiga). null si no hay ninguna activa.
 */
export function ejemploPromo(t: TipoMesa): EjemploPromo | null {
  const activas = t.promos.filter((p) => p.activa).sort((a, b) => a.desde - b.desde);
  const p = activas[0];
  if (!p) return null;
  const min = Math.round(p.desde * 60) + 30;
  const r = simularLibre(t, min * 60);
  if (!r.promo) return null;
  return {
    nombre: r.promo.nombre,
    pct: String(r.promo.pct).replace(".", ","),
    juegan: fmtCobrado(min),
    cobra: fmtCobrado(r.min),
    bruto: fmtMoney(r.bruto),
    total: fmtMoney(r.total),
  };
}
