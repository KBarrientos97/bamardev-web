import { parsearMonto } from "../../../lib/dinero";
import { fmtMoney } from "../../../lib/format";
import { precioHoras, round2 } from "../calculo";
import { errorDeNumero, type DatosMesa, type EstadoBillar } from "../store";
import type { AjustesBillar, Mesa, Paquete, PinesBillar, Promo, TipoMesa } from "../tipos";

/**
 * Lo que se edita en Mesas de billar, como texto mientras se escribe ("2,5",
 * un campo vacío) y la conversión a lo que se guarda, con sus errores. Puro a
 * propósito: los mismos chequeos los repite el backend (`PUT /billar/tipos`).
 */

// ── Números ─────────────────────────────────────────────────────────────────

/** Entero sin signo, o null. "30" sí; "30,5", "" y "-1" no. */
export function entero(texto: string): number | null {
  const t = texto.trim();
  return /^\d{1,4}$/.test(t) ? Number(t) : null;
}

/** Un número que puede tener coma decimal ("2,5" horas, "7,5" %). */
export function decimal(texto: string): number | null {
  return parsearMonto(texto);
}

// ── La mesa (Nueva mesa / Editar) ───────────────────────────────────────────

export type EstadoAdmin = DatosMesa["estado"];

export interface BorradorMesa {
  numero: string;
  alias: string;
  tipo: string;
  /** null = usa la tarifa del tipo. */
  tarifaPropia: string | null;
  estado: EstadoAdmin;
  motivo: string;
}

export function estadoAdminDe(m: Mesa): EstadoAdmin {
  if (m.inactiva) return "inactiva";
  return m.estado === "fuera" ? "fuera" : "activa";
}

export function borradorMesa(m: Mesa | null, numeroSugerido: number, tipoPorDefecto: string): BorradorMesa {
  if (!m) {
    return { numero: String(numeroSugerido), alias: "", tipo: tipoPorDefecto, tarifaPropia: null, estado: "activa", motivo: "" };
  }
  return {
    numero: String(m.id),
    alias: m.alias ?? "",
    tipo: m.tipo,
    tarifaPropia: m.tarifaPropia ? String(m.tarifaPropia) : null,
    estado: estadoAdminDe(m),
    motivo: m.fueraMotivo ?? "",
  };
}

export interface ErroresMesa {
  numero?: string;
  tarifa?: string;
}

/** `editando`: el número que tenía la mesa (para no chocar consigo misma). */
export function erroresMesa(b: BorradorMesa, e: EstadoBillar, editando: number | null): ErroresMesa {
  const out: ErroresMesa = {};
  const n = entero(b.numero);
  if (n === null) out.numero = "Poné un número de 1 a 999.";
  else if (n !== editando) {
    const error = errorDeNumero(e, n);
    if (error) out.numero = error;
  }
  if (b.tarifaPropia !== null) {
    const t = decimal(b.tarifaPropia);
    if (t === null || t <= 0) out.tarifa = "Poné cuánto cobra por hora.";
  }
  return out;
}

export function datosMesa(b: BorradorMesa): DatosMesa {
  return {
    numero: entero(b.numero) ?? 0,
    alias: b.alias.trim() || undefined,
    tipo: b.tipo,
    tarifaPropia: b.tarifaPropia === null ? undefined : (decimal(b.tarifaPropia) ?? undefined),
    estado: b.estado,
    motivo: b.estado === "fuera" ? b.motivo.trim() || undefined : undefined,
  };
}

// ── Tarifas y paquetes ──────────────────────────────────────────────────────

/** Los bloques de cobro que se ofrecen (1 = por minuto). */
export const FRACCIONES = [1, 5, 10, 15, 30] as const;

/** Los minutos de aviso que se pueden prender, de más lejos a más cerca. */
export const MINUTOS_AVISO = [15, 10, 5, 3, 1] as const;

export interface BorradorPromo {
  id: string;
  nombre: string;
  desde: string;
  pct: string;
  activa: boolean;
  fijo: boolean;
}

export interface BorradorTipo {
  id: string;
  nombre: string;
  tarifa: string;
  fraccion: number;
  minimo: string;
  tolerancia: string;
  paquetes: Paquete[];
  promos: BorradorPromo[];
}

export interface BorradorTarifas {
  tipos: BorradorTipo[];
  avisos: number[];
  sonido: boolean;
  voz: boolean;
  pin: PinesBillar;
}

const texto = (n: number) => String(n).replace(".", ",");

export function borradorTarifas(tipos: Record<string, TipoMesa>, ajustes: AjustesBillar): BorradorTarifas {
  return {
    tipos: Object.values(tipos).map((t) => ({
      id: t.id,
      nombre: t.nombre,
      tarifa: texto(t.tarifa),
      fraccion: t.fraccion,
      minimo: String(t.minimo),
      tolerancia: String(t.tolerancia),
      paquetes: [...t.paquetes].sort((a, b) => a.h - b.h),
      promos: t.promos.map((p) => ({ ...p, desde: texto(p.desde), pct: texto(p.pct) })),
    })),
    avisos: [...ajustes.avisos].sort((a, b) => b - a),
    sonido: ajustes.sonido,
    voz: ajustes.voz,
    pin: { ...ajustes.pin },
  };
}

/** Clave del error: "tarifa", "minimo", "tolerancia", "promo:<id>:desde"… */
export type ErroresTipo = Record<string, string>;

export function erroresTipo(b: BorradorTipo): ErroresTipo {
  const out: ErroresTipo = {};
  const tarifa = decimal(b.tarifa);
  if (tarifa === null || tarifa <= 0) out.tarifa = "Poné el precio por hora.";
  const minimo = entero(b.minimo);
  if (minimo === null || minimo > 600) out.minimo = "De 0 a 600 min.";
  const tol = entero(b.tolerancia);
  if (tol === null) out.tolerancia = "Poné los minutos de gracia (0 si no hay).";
  else if (b.fraccion === 1 && tol > 0) out.tolerancia = "Cobrando por minuto no hay tolerancia: dejala en 0.";
  else if (tol >= b.fraccion) out.tolerancia = `Tiene que ser menos que la fracción (${b.fraccion} min).`;
  for (const p of b.promos) {
    if (!p.nombre.trim()) out[`promo:${p.id}:nombre`] = "Ponele un nombre.";
    const desde = decimal(p.desde);
    if (desde === null || desde <= 0 || desde > 24) out[`promo:${p.id}:desde`] = "De 1 a 24 h.";
    const pct = decimal(p.pct);
    if (pct === null || pct <= 0 || pct > 90) out[`promo:${p.id}:pct`] = "De 1 a 90 %.";
  }
  return out;
}

/** El tipo tal como se guarda, o null si tiene errores. */
export function tipoDeBorrador(b: BorradorTipo): TipoMesa | null {
  if (Object.keys(erroresTipo(b)).length) return null;
  return {
    id: b.id,
    nombre: b.nombre,
    tarifa: decimal(b.tarifa)!,
    fraccion: b.fraccion,
    minimo: entero(b.minimo)!,
    tolerancia: entero(b.tolerancia)!,
    paquetes: [...b.paquetes].sort((a, c) => a.h - c.h),
    promos: b.promos.map(
      (p): Promo => ({
        id: p.id,
        nombre: p.nombre.trim(),
        desde: decimal(p.desde)!,
        pct: decimal(p.pct)!,
        activa: p.activa,
        fijo: p.fijo,
      }),
    ),
  };
}

/** El error al agregar un paquete, o null. */
export function errorPaquete(horas: string, precio: string, paquetes: Paquete[]): string | null {
  const h = entero(horas);
  if (h === null || h < 1 || h > 24) return "Las horas van de 1 a 24.";
  const p = decimal(precio);
  if (p === null || p <= 0) return "Poné el precio del paquete.";
  if (paquetes.some((x) => x.h === h)) return `Ya hay un paquete de ${h} h: quitalo primero.`;
  return null;
}

/**
 * Los paquetes que nunca se van a usar: el tiempo fijo cobra la combinación
 * más barata (§5.3), así que uno más caro que sus horas sueltas (u otra
 * combinación) no sale nunca. Se avisa para que no parezca que no anda.
 */
export function paquetesQueNoConvienen(tarifa: number, paquetes: Paquete[]): { h: number; mejor: number }[] {
  const out: { h: number; mejor: number }[] = [];
  for (const p of paquetes) {
    const sinEl = precioHoras(
      { id: "", nombre: "", tarifa, fraccion: 15, tolerancia: 0, minimo: 0, promos: [], paquetes: paquetes.filter((x) => x !== p) },
      p.h,
    ).precio;
    if (sinEl < p.precio) out.push({ h: p.h, mejor: sinEl });
  }
  return out;
}

/** "Promo 3 h o más": el nombre que se sugiere y que sigue a las horas mientras no se lo cambie. */
export function nombrePromo(desde: string): string {
  return `Promo ${desde.trim() || "?"} h o más`;
}

export function nuevaPromo(promos: BorradorPromo[], id: string): BorradorPromo {
  const mayor = Math.max(2, ...promos.map((p) => decimal(p.desde) ?? 0));
  const desde = String(Math.min(24, Math.floor(mayor) + 1));
  return { id, nombre: nombrePromo(desde), desde, pct: "10", activa: true, fijo: false };
}

/** "Ej.: 3 h a Bs 20,00/h = Bs 60,00 →" y "Bs 54,00" (el resultado va resaltado). */
export function ejemploPromo(tarifa: number | null, p: BorradorPromo): { cuenta: string; total: string } | null {
  const desde = decimal(p.desde);
  const pct = decimal(p.pct);
  if (tarifa === null || desde === null || pct === null || desde <= 0 || pct <= 0 || pct > 90) return null;
  const bruto = round2(tarifa * desde);
  return {
    cuenta: `Ej.: ${texto(desde)} h a ${fmtMoney(tarifa)}/h = ${fmtMoney(bruto)} →`,
    total: fmtMoney(round2(bruto - (bruto * pct) / 100)),
  };
}
