import { fmtFecha, fmtHora, fmtMoney } from "../../lib/format";
import type {
  Devolucion,
  EstadoVisual,
  Mesa,
  Pago,
  Promo,
  PromoPrevia,
  Sesion,
  TipoMesa,
} from "./tipos";

/**
 * Las reglas de cobro del billar (BILLAR_MODULO_SPEC §5), copiadas EXACTO del
 * prototipo. Son funciones puras a propósito: el backend tiene que cobrar con
 * las mismas al cerrar la mesa (la pantalla sólo las usa para mostrar), así
 * que cada una tiene su test con los ejemplos de la spec.
 */

/** Redondeo a centavos sin el error de punto flotante (35.2 * 100). */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** La tarifa que rige en la mesa: la propia si tiene, si no la del tipo. */
export function tarifaDe(mesa: Pick<Mesa, "tarifaPropia">, tipo: TipoMesa): TipoMesa {
  return mesa.tarifaPropia ? { ...tipo, tarifa: mesa.tarifaPropia } : tipo;
}

// ── §5.1 Tiempo transcurrido ────────────────────────────────────────────────

/** Segundos jugados en ESTA mesa (sin lo arrastrado de otra). */
export function segundosEnMesa(s: Pick<Sesion, "start" | "pausedAt" | "pausedTotal">, ahora: number): number {
  const hasta = s.pausedAt ?? ahora;
  return Math.max(0, Math.floor((hasta - s.start) / 1000) - s.pausedTotal);
}

/** Segundos jugados en total: lo de esta mesa más lo traído de otra. */
export function segundosJugados(s: Sesion, ahora: number): number {
  return segundosEnMesa(s, ahora) + (s.prev?.secs ?? 0);
}

/**
 * Hasta cuántos segundos jugados se puede anular una mesa. Anular es "se abrió
 * por error": no se cobra nada y se devuelve lo cobrado. Pasados 5 minutos ya
 * es una mesa jugada, y anularla borraba ese tiempo sin dejar venta (QA del
 * 12-oct: el botón seguía a los 50 min). El backend rechaza lo mismo con
 * ANULAR_VENCIDO (`ANULAR_HASTA_SEG` en billar.service.ts): si una cambia,
 * cambian las dos.
 */
export const ANULAR_HASTA_SEG = 5 * 60;

/**
 * Si la mesa todavía se puede anular. Cuenta lo traído de otra mesa, como el
 * reloj. Sin nada que cobrar se puede siempre: con mínimo 0 y una tolerancia
 * de más de 5 min, la mesa no se podía finalizar ni anular.
 *
 * Los 5 minutos corren también desde que se abrió (`desdeQueSeAbrio`), como en
 * el backend: pausada a los 2 minutos, o con el inicio corrido hacia adelante,
 * una mesa jugada horas seguía ofreciendo "Anular" (revisión del 16-oct).
 */
export function sePuedeAnular(c: Pick<Cuenta, "secs" | "total"> | null, desdeQueSeAbrio = 0): boolean {
  return c != null && (c.total <= 0.005 || (c.secs < ANULAR_HASTA_SEG && desdeQueSeAbrio < ANULAR_HASTA_SEG));
}

/** Segundos desde que se abrió la mesa (sin `abierta`, un backend viejo: desde el inicio). */
export function segundosDesdeQueSeAbrio(s: Pick<Sesion, "abierta" | "start">, ahora: number): number {
  return Math.max(0, Math.floor((ahora - (s.abierta ?? s.start)) / 1000));
}

// ── §5.2 Cobro por fracción (tiempo libre) ──────────────────────────────────

export interface Cobro {
  /** Minutos que se cobran. */
  min: number;
  bs: number;
  /** En qué segundo jugado sube al bloque siguiente. */
  nextSecs: number;
  /** Cuánto pasa a valer el tiempo al subir. */
  nextBs: number;
}

export function cobroTiempo(secs: number, t: TipoMesa, useMin = true): Cobro {
  const f = t.fraccion * 60;
  const tol = t.tolerancia * 60;
  let b = Math.floor(secs / f);
  // Pasada la tolerancia, se cobra el bloque.
  if (secs - b * f > tol) b++;
  if (useMin && b * t.fraccion < t.minimo) b = Math.ceil(t.minimo / t.fraccion);
  const min = b * t.fraccion;
  return {
    min,
    bs: round2((t.tarifa * min) / 60),
    nextSecs: b * f + tol,
    nextBs: round2((t.tarifa * (b + 1) * t.fraccion) / 60),
  };
}

// ── §5.3 Tiempo fijo: el precio de N horas ──────────────────────────────────

export interface PrecioHoras {
  precio: number;
  /** Las partes de la combinación, de mayor a menor: ["3 h", "2 h"]. */
  partes: string[];
}

/**
 * La combinación más barata de paquetes (se pueden repetir) completada con
 * horas sueltas. En empate gana el paquete. Programación dinámica: para 24 h
 * con tres paquetes son 72 comparaciones.
 */
export function precioHoras(t: TipoMesa, h: number): PrecioHoras {
  const n = Math.max(0, Math.floor(h));
  const best: number[] = [0];
  // 0 = hora suelta; otro número = un paquete de esas horas.
  const como: number[][] = [[]];
  for (let i = 1; i <= n; i++) {
    best[i] = best[i - 1] + t.tarifa;
    como[i] = [...como[i - 1], 0];
    for (const p of t.paquetes) {
      if (p.h <= i && best[i - p.h] + p.precio <= best[i]) {
        best[i] = best[i - p.h] + p.precio;
        como[i] = [...como[i - p.h], p.h];
      }
    }
  }
  const fraccion = h - n;
  const precio = round2(best[n] + fraccion * t.tarifa);
  const paquetes = como[n].filter((x) => x > 0).sort((a, b) => b - a);
  const sueltas = como[n].filter((x) => x === 0).length;
  const partes = paquetes.map((x) => `${x} h`);
  if (sueltas) partes.push(sueltas === 1 ? "1 h suelta" : `${sueltas} h sueltas`);
  return { precio, partes };
}

// ── §5.5 Promociones por tiempo ─────────────────────────────────────────────

/** De las activas que alcanzan las horas, la de MAYOR descuento. */
export function promoPara(t: TipoMesa, horas: number, fijo = false): Promo | null {
  let mejor: Promo | null = null;
  for (const p of t.promos) {
    if (!p.activa || horas < p.desde || (fijo && !p.fijo)) continue;
    if (!mejor || p.pct > mejor.pct) mejor = p;
  }
  return mejor;
}

const MESA_ANTERIOR = "mesa anterior";

/**
 * La promo del tiempo libre, con lo traído de una mesa de otra tarifa. Copia
 * EXACTA de `promoDeLaCuenta` del backend (calculo.ts): si una cambia,
 * cambian las dos.
 *
 * Lo jugado allá conserva la promo que ya había ganado (`previa`, congelada
 * al cambiar), salvo que la de esta mesa le dé más; lo jugado acá lleva la de
 * acá, por el total de horas. Antes se miraba sólo la promo de la mesa nueva
 * sobre todo: 3 h de Pool con 10 % pasadas a una Carambola sin promociones
 * perdían el descuento que ya tenían ganado (revisión del 16-oct). Sin
 * `previa`, o si la de acá cubre lo de allá, da lo mismo que antes.
 */
export function promoDeLaCuenta(
  p: Promo | null,
  previoBs: number,
  bsMesa: number,
  bruto: number,
  previa: PromoPrevia | null | undefined,
): Cuenta["promo"] {
  const ganada = previa && previa.descuento > 0.005 ? previa : null;
  if (!ganada || (p && round2((previoBs * p.pct) / 100) >= ganada.descuento)) {
    return p ? { nombre: p.nombre, pct: p.pct, descuento: round2((bruto * p.pct) / 100) } : null;
  }
  const deAca = p ? round2((bsMesa * p.pct) / 100) : 0;
  return {
    // "+ mesa anterior": el % es el de acá y el descuento suma lo de allá.
    // El nombre no se encadena si la cuenta pasa por una tercera mesa.
    nombre: p
      ? `${p.nombre} + ${MESA_ANTERIOR}`
      : ganada.nombre.includes(MESA_ANTERIOR)
        ? ganada.nombre
        : `${ganada.nombre} (${MESA_ANTERIOR})`,
    pct: p ? p.pct : ganada.pct,
    descuento: round2(ganada.descuento + deAca),
  };
}

/** El precio de N horas de tiempo fijo, con la promo si la tiene "también en tiempo fijo". */
export function precioFijo(t: TipoMesa, h: number) {
  const base = precioHoras(t, h);
  const promo = promoPara(t, h, true);
  const descuento = promo ? round2((base.precio * promo.pct) / 100) : 0;
  return { ...base, bruto: base.precio, precio: round2(base.precio - descuento), promo, descuento };
}

// ── §5.4 + §5.6 La cuenta de la mesa ────────────────────────────────────────

export interface Cuenta {
  /** Jugados, contando lo traído de otra mesa. */
  secs: number;
  /** Tiempo fijo: segundos que quedan (negativo = excedente). null en libre. */
  restante: number | null;
  /** Minutos cobrados hasta ahora (en fijo: contratados + excedente). */
  cobradoMin: number;
  /** El tiempo, ya con la promo. */
  tiempoBs: number;
  /** Tiempo libre: la promo que aplica ahora. */
  promo: { nombre: string; pct: number; descuento: number } | null;
  /** Segundos jugados en que sube el precio (null si no sube: fijo en curso). */
  nextSecs: number | null;
  /** El tiempo después de subir, con la promo del bloque siguiente. */
  nextBs: number | null;
  excedenteMin: number;
  excedenteBs: number;
  consumosBs: number;
  total: number;
  pagado: number;
  saldo: number;
}

export function consumosDe(s: Pick<Sesion, "consumos">): number {
  return round2(s.consumos.filter((c) => !c.anulado).reduce((t, c) => t + c.precio * c.cant, 0));
}

export function pagadoDe(pagos: Pago[]): number {
  return round2(pagos.reduce((t, p) => t + p.monto, 0));
}

// ── Lo pagado de más ────────────────────────────────────────────────────────

/** El mismo criterio que `esEfectivo` del backend: el nombre lo dice. */
const esDeEfectivo = (metodo: string) => metodo.toLowerCase().includes("efectivo");

/**
 * Qué parte de cada pago previo cubre la cuenta y cuánto sobra: lo que no es
 * efectivo cubre primero, así lo que sobra es efectivo y sale del cajón. Es la
 * misma regla con que el backend arma los pagos de la venta (`imputarPagos` de
 * su calculo.ts): si una cambia, cambian las dos.
 *
 * En el orden en que se cobraron, el sobrante caía en el último pago fuera
 * cual fuera: con Bs 40 en efectivo y Bs 30 por QR y la cuenta en Bs 10, la
 * pantalla pedía devolver Bs 60 sin decir en qué, el cajero los sacaba del
 * cajón y al cerrar faltaban Bs 30 (prueba del 16-oct).
 */
export function imputarPagos<P extends Pick<Pago, "metodo" | "monto">>(
  pagos: P[],
  total: number,
): { pago: P; cubre: number; sobra: number }[] {
  const orden = [...pagos.filter((p) => !esDeEfectivo(p.metodo)), ...pagos.filter((p) => esDeEfectivo(p.metodo))];
  let resta = round2(Math.max(0, total));
  return orden.map((pago) => {
    const cubre = round2(Math.min(pago.monto, resta));
    resta = round2(resta - cubre);
    return { pago, cubre, sobra: round2(pago.monto - cubre) };
  });
}

/** Cuánto devolver y en qué. Con `total` 0 (mesa anulada) se devuelve todo. */
export function devolucionDe(pagos: Pick<Pago, "metodo" | "monto">[], total: number): Devolucion {
  let efectivo = 0;
  const otros = new Map<string, number>();
  for (const { pago, sobra } of imputarPagos(pagos, total)) {
    if (sobra <= 0.005) continue;
    if (esDeEfectivo(pago.metodo)) efectivo = round2(efectivo + sobra);
    else otros.set(pago.metodo, round2((otros.get(pago.metodo) ?? 0) + sobra));
  }
  return { efectivo, otros: [...otros].map(([metodo, monto]) => ({ metodo, monto })) };
}

/** "Bs 40,00 en efectivo y Bs 20,00 por QR". Vacío si no hay nada que devolver. */
export function textoDevolucion(d: Devolucion): string {
  const partes = [
    ...(d.efectivo > 0.005 ? [`${fmtMoney(d.efectivo)} en efectivo`] : []),
    ...d.otros.filter((o) => o.monto > 0.005).map((o) => `${fmtMoney(o.monto)} por ${o.metodo}`),
  ];
  return partes.length > 1 ? `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}` : (partes[0] ?? "");
}

export function cuentaDe(s: Sesion, t: TipoMesa, ahora: number): Cuenta {
  const secsMesa = segundosEnMesa(s, ahora);
  const secs = secsMesa + (s.prev?.secs ?? 0);
  const previoBs = s.prev?.bs ?? 0;
  const previoMin = s.prev?.min ?? 0;
  const consumosBs = consumosDe(s);
  const pagado = pagadoDe(s.pagos);

  let tiempoBs: number;
  let cobradoMin: number;
  let restante: number | null = null;
  let promo: Cuenta["promo"] = null;
  let nextSecs: number | null;
  let nextBs: number | null;
  let excedenteMin = 0;
  let excedenteBs = 0;

  if (s.prepago) {
    const lim = s.prepago.min * 60;
    restante = lim - secs;
    const exc = cobroTiempo(Math.max(0, secs - lim), t, false);
    excedenteMin = exc.min;
    excedenteBs = exc.bs;
    tiempoBs = round2(s.prepago.precio + exc.bs);
    cobradoMin = s.prepago.min + exc.min;
    // Mientras corre lo contratado el precio no sube; cumplido, sube por
    // fracción como el tiempo libre.
    nextSecs = lim + exc.nextSecs;
    nextBs = round2(s.prepago.precio + exc.nextBs);
  } else {
    // Lo traído de otra mesa ya pagó el mínimo allá.
    const c = cobroTiempo(secsMesa, t, !s.prev);
    cobradoMin = previoMin + c.min;
    const bruto = round2(previoBs + c.bs);
    const p = promoPara(t, cobradoMin / 60);
    promo = promoDeLaCuenta(p, previoBs, c.bs, bruto, s.prev?.promo);
    tiempoBs = round2(bruto - (promo?.descuento ?? 0));
    nextSecs = (s.prev?.secs ?? 0) + c.nextSecs;
    const brutoSig = round2(previoBs + c.nextBs);
    const pSig = promoPara(t, (cobradoMin + t.fraccion) / 60);
    nextBs = round2(brutoSig - (promoDeLaCuenta(pSig, previoBs, c.nextBs, brutoSig, s.prev?.promo)?.descuento ?? 0));
  }

  const total = round2(tiempoBs + consumosBs);
  return {
    secs,
    restante,
    cobradoMin,
    tiempoBs,
    promo,
    nextSecs,
    nextBs,
    excedenteMin,
    excedenteBs,
    consumosBs,
    total,
    pagado,
    saldo: Math.max(0, round2(total - pagado)),
  };
}

// ── §5.7 Estado visual ──────────────────────────────────────────────────────

export function estadoVisual(mesa: Mesa, ahora: number, avisos: number[]): EstadoVisual {
  if (mesa.estado !== "abierta") return mesa.estado;
  const s = mesa.sesion;
  if (!s) return "libre";
  if (s.pausedAt) return "pausada";
  if (s.prepago) {
    const r = s.prepago.min * 60 - segundosJugados(s, ahora);
    if (r <= 0) return "cumplido";
    if (r <= Math.max(0, ...avisos) * 60) return "vence";
  }
  return "juego";
}

// ── §5.8 Etiqueta de pago del tiempo fijo ───────────────────────────────────

export function etiquetaPagoFijo(s: Sesion): string {
  if (!s.prepago) return "";
  const pagado = pagadoDe(s.pagos);
  if (pagado >= s.prepago.precio) return "pagado";
  if (pagado > 0) return "parte por cobrar";
  return "cobrar al final";
}

// ── §5.9 Formatos ───────────────────────────────────────────────────────────

const dos = (n: number) => String(n).padStart(2, "0");

/** El cronómetro: `1:35:12`. Negativo no: el excedente se muestra aparte. */
export function fmtCrono(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  return `${Math.floor(s / 3600)}:${dos(Math.floor((s % 3600) / 60))}:${dos(s % 60)}`;
}

/** Lo cobrado: `1:30`. */
export function fmtCobrado(min: number): string {
  const m = Math.max(0, Math.round(min));
  return `${Math.floor(m / 60)}:${dos(m % 60)}`;
}

/** La cuenta regresiva corta de un aviso: `05:00`. */
export function fmtMinSeg(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  return `${dos(Math.floor(s / 60))}:${dos(s % 60)}`;
}

/** "27 min", "1 h 2 min": cuánto hace que la mesa está libre. */
export function fmtHace(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const resto = min % 60;
  return resto ? `${h} h ${resto} min` : `${h} h`;
}

/** La hora del billar (milisegundos) como la dice la app: "09:40 p. m.". */
export function horaDe(ms: number): string {
  return fmtHora(new Date(ms));
}

export function fechaDe(ms: number): string {
  return fmtFecha(new Date(ms));
}

/** "Bs 20/h" sin decimales cuando no hacen falta, como en las tarjetas. */
export function fmtTarifaCorta(bs: number): string {
  return `Bs ${Number.isInteger(bs) ? bs : bs.toLocaleString("es-BO", { minimumFractionDigits: 2 })}/h`;
}

// ── Simulador (Mesas de billar → Tarifas y paquetes) ────────────────────────

/**
 * Lo que se cobra por `secs` jugados en tiempo libre, con la promo si toca.
 * Arma una sesión vacía y la pasa por `cuentaDe`: así el simulador del
 * administrador no puede dar un número distinto al de la mesa.
 */
export function simularLibre(t: TipoMesa, secs: number) {
  const vacia: Sesion = {
    id: "",
    start: 0,
    pausedAt: null,
    pausedTotal: 0,
    prepago: null,
    prev: null,
    consumos: [],
    pagos: [],
  };
  const c = cuentaDe(vacia, t, Math.max(0, secs) * 1000);
  return {
    min: c.cobradoMin,
    /** Antes de la promo. */
    bruto: round2(c.tiempoBs + (c.promo?.descuento ?? 0)),
    promo: c.promo,
    total: c.tiempoBs,
  };
}

/** "1:32" (horas:minutos) o "92" (minutos) → segundos. null si no se entiende. */
export function parsearDuracion(texto: string): number | null {
  const t = texto.trim();
  const hm = /^(\d{1,2}):([0-5]?\d)$/.exec(t);
  if (hm) return (Number(hm[1]) * 60 + Number(hm[2])) * 60;
  const min = /^\d{1,4}$/.exec(t);
  return min ? Number(t) * 60 : null;
}
