import { fmtCantidad, fmtMoney, fmtNum } from "../format";
import { normalizar } from "../texto";
import type { Insumo, UnidadMedida } from "../../types";
import { costoPorcion, estaConfigurado, porcionesEnStock, round2 } from "./calculo";

/**
 * Cómo se compra un insumo y para cuánto alcanza (recetas del plato, 27-nov).
 *
 * El dueño no piensa en «kilogramos a Bs 6,30»: piensa «compro el arroz por
 * quintal, a Bs 290, y con un kilo sirvo 12 porciones». Acá viven las palabras
 * y las cuentas que traducen una cosa a la otra, para Insumos (el formulario
 * por bulto y rinde, la tarjeta) y Movimientos (la compra por quintal con el
 * total pagado). Las cuentas de plata son las de `calculo.ts`, las mismas del
 * backend. Sin React ni red.
 *
 * La unidad BASE del insumo es su unidad de siempre (Kilogramo, Litro,
 * Unidad): en ella van el stock, el costo de la ficha y el rinde. El bulto
 * («Quintal», 46 kg) sólo dice cómo se compra.
 */

/** La unidad en la que se lleva el insumo (su stock, su costo y su rinde). */
export type BaseInsumo = "KILO" | "LITRO" | "UNIDAD";

export const PALABRAS_BASE: Record<BaseInsumo, { singular: string; plural: string }> = {
  KILO: { singular: "kilo", plural: "kilos" },
  LITRO: { singular: "litro", plural: "litros" },
  UNIDAD: { singular: "unidad", plural: "unidades" },
};

/** Cómo puede llamarse cada unidad en un negocio (el kit de alta crea «Kilogramo», «Litro» y «Unidad»). */
const NOMBRES_BASE: Record<BaseInsumo, readonly string[]> = {
  KILO: ["kilogramo", "kilogramos", "kilo", "kilos", "kg", "kgs"],
  LITRO: ["litro", "litros", "lt", "lts", "l"],
  UNIDAD: ["unidad", "unidades", "und", "unid", "u", "un", "uds"],
};

const BASES = Object.keys(NOMBRES_BASE) as BaseInsumo[];

/** «Kilogramo», «kg», «Kilos» → KILO. Null si no es ninguna de las tres. */
export function baseDeNombre(nombre: string | null | undefined): BaseInsumo | null {
  const n = normalizar(nombre?.trim() ?? "").replace(/\.$/, "");
  if (!n) return null;
  return BASES.find((b) => NOMBRES_BASE[b].includes(n)) ?? null;
}

/** La base de una unidad del negocio: por su nombre y, si no, por su abreviatura. */
export function baseDeUnidad(u: { nombre?: string | null; abreviatura?: string | null } | null | undefined): BaseInsumo | null {
  return baseDeNombre(u?.nombre) ?? baseDeNombre(u?.abreviatura);
}

/** La unidad del negocio que es esa base, o null si el negocio no la tiene (ahí se elige a mano). */
export function unidadDeBase(unidades: readonly UnidadMedida[], base: BaseInsumo): UnidadMedida | null {
  const vigentes = unidades.filter((u) => u.activo !== false);
  return (
    vigentes.find((u) => baseDeNombre(u.nombre) === base) ??
    vigentes.find((u) => baseDeNombre(u.abreviatura) === base) ??
    null
  );
}

/**
 * «92 kg», «20 L», «30 unidades». Sin base conocida, con el nombre de la unidad
 * que tenga el negocio («3 Porción»).
 */
export function cantidadConUnidad(n: number, base: BaseInsumo | null, otraUnidad = ""): string {
  const c = fmtCantidad(n);
  if (base === "KILO") return `${c} kg`;
  if (base === "LITRO") return `${c} L`;
  if (base === "UNIDAD") return `${c} ${Math.abs(n) === 1 ? "unidad" : "unidades"}`;
  return otraUnidad ? `${c} ${otraUnidad}` : c;
}

// ── Cómo lo comprás ─────────────────────────────────────────────────────────

/** Un chip de «Cómo lo comprás». `nombre` es lo que se guarda en `compraUnidad`. */
export interface FormaCompra {
  nombre: string;
  femenino: boolean;
  /** La unidad base que fija; null = la elige quien carga (bolsa, bidón, paquete). */
  base: BaseInsumo | null;
  /** Con qué base arranca cuando la elige quien carga. */
  baseSugerida: BaseInsumo;
  /** Cuánto trae: el de siempre (quintal 46 kg, arroba 11,5 kg), o null si lo escribe quien carga. */
  contenido: number | null;
  /** Kilo, litro, unidad: el bulto es la unidad misma (trae 1), no se pregunta cuánto trae. */
  esLaBase: boolean;
}

/** En el orden del formulario. */
export const FORMAS_COMPRA: readonly FormaCompra[] = [
  { nombre: "Kilo", femenino: false, base: "KILO", baseSugerida: "KILO", contenido: 1, esLaBase: true },
  { nombre: "Quintal", femenino: false, base: "KILO", baseSugerida: "KILO", contenido: 46, esLaBase: false },
  { nombre: "Arroba", femenino: true, base: "KILO", baseSugerida: "KILO", contenido: 11.5, esLaBase: false },
  { nombre: "Bolsa", femenino: true, base: null, baseSugerida: "KILO", contenido: null, esLaBase: false },
  { nombre: "Litro", femenino: false, base: "LITRO", baseSugerida: "LITRO", contenido: 1, esLaBase: true },
  { nombre: "Bidón", femenino: false, base: null, baseSugerida: "LITRO", contenido: null, esLaBase: false },
  { nombre: "Unidad", femenino: true, base: "UNIDAD", baseSugerida: "UNIDAD", contenido: 1, esLaBase: true },
  { nombre: "Paquete", femenino: false, base: null, baseSugerida: "UNIDAD", contenido: null, esLaBase: false },
];

/** El chip de un `compraUnidad` guardado («quintal», «Bidon» también valen). Null si no es ninguno. */
export function formaCompra(nombre: string | null | undefined): FormaCompra | null {
  const n = normalizar(nombre?.trim() ?? "");
  if (!n) return null;
  return FORMAS_COMPRA.find((f) => normalizar(f.nombre) === n) ?? null;
}

/** «Un quintal», «Una arroba». */
export function unBulto(f: FormaCompra): string {
  return `${f.femenino ? "Una" : "Un"} ${f.nombre.toLowerCase()}`;
}

/** «El quintal», «La bolsa». */
export function elBulto(f: FormaCompra): string {
  return `${f.femenino ? "La" : "El"} ${f.nombre.toLowerCase()}`;
}

/** «Un kilo», «Una unidad»: el sujeto de «te alcanza para…» cuando se compra suelto. */
export function unaBase(base: BaseInsumo): string {
  return `${base === "UNIDAD" ? "Una" : "Un"} ${PALABRAS_BASE[base].singular}`;
}

// ── Lo que sirvo ────────────────────────────────────────────────────────────

/** Los chips de «Lo que sirvo se llama»: en singular, como se guarda en `porcionNombre`. */
export const NOMBRES_PORCION = [
  { nombre: "porción", plural: "porciones" },
  { nombre: "presa", plural: "presas" },
  { nombre: "unidad", plural: "unidades" },
  { nombre: "plato", plural: "platos" },
  { nombre: "vaso", plural: "vasos" },
] as const;

/** «porción» → «porciones». Un nombre que no es de los chips, con la regla de siempre. */
export function pluralPorcion(nombre: string): string {
  const limpio = nombre.trim();
  const conocido = NOMBRES_PORCION.find((p) => normalizar(p.nombre) === normalizar(limpio));
  if (conocido) return conocido.plural;
  if (/[aeiouáéíóú]$/i.test(limpio)) return `${limpio}s`;
  if (/ón$/i.test(limpio)) return `${limpio.slice(0, -2)}ones`;
  return `${limpio}es`;
}

/**
 * «552 porciones», «1 presa»; lo que no da justo, para abajo («unas 107
 * porciones»): es lo que alcanza, no lo que sobra.
 */
export function textoPorciones(n: number, nombre: string | null | undefined): string {
  const singular = nombre?.trim() || "porción";
  const plural = pluralPorcion(singular);
  if (Math.abs(n - Math.round(n)) < 0.001) {
    const entero = Math.round(n);
    return `${fmtNum(entero)} ${Math.abs(entero) === 1 ? singular : plural}`;
  }
  if (n > 2) return `unas ${fmtNum(Math.floor(n))} ${plural}`;
  return `${fmtCantidad(n, 2)} ${plural}`;
}

// ── Lo que se ve de un insumo ───────────────────────────────────────────────

/** «Quintal de 46 kg», «Por kilo», o null si no se dijo cómo se compra. */
export function textoCompra(
  compraUnidad: string | null | undefined,
  compraContenido: number | null | undefined,
  unidad: { nombre?: string | null; abreviatura?: string | null } | null | undefined,
): string | null {
  const nombre = compraUnidad?.trim();
  if (!nombre) return null;
  const forma = formaCompra(nombre);
  if (forma?.esLaBase) return `Por ${forma.nombre.toLowerCase()}`;
  if (!compraContenido || !(compraContenido > 0)) return nombre;
  return `${nombre} de ${cantidadConUnidad(compraContenido, baseDeUnidad(unidad), unidad?.abreviatura ?? unidad?.nombre ?? "")}`;
}

/** «1 kg rinde 12 porciones», o null si el rinde no está completo. */
export function textoRinde(
  i: { rindeCantidad?: number | null; rindePorciones?: number | null; porcionNombre?: string | null },
  unidad: { nombre?: string | null; abreviatura?: string | null } | null | undefined,
): string | null {
  if (!estaConfigurado(i)) return null;
  const cantidad = cantidadConUnidad(i.rindeCantidad!, baseDeUnidad(unidad), unidad?.abreviatura ?? unidad?.nombre ?? "");
  return `${cantidad} rinde ${textoPorciones(i.rindePorciones!, i.porcionNombre)}`;
}

/**
 * Lo que la tarjeta y el detalle de un insumo dicen con las recetas prendidas.
 * Lo que manda el backend gana (`configurado`, `porciones`, `costoPorcion`); si
 * no vino (un backend que todavía no lo calcula), sale de las mismas cuentas.
 */
export function resumenInsumo(i: Insumo) {
  const configurado = i.configurado ?? estaConfigurado(i);
  const costo = typeof i.costoCompra === "number" && i.costoCompra > 0 ? i.costoCompra : null;
  return {
    configurado,
    /** Nunca se compró (el costo entra sólo por las compras). */
    sinCosto: costo == null,
    compra: textoCompra(i.compraUnidad, i.compraContenido, i.unidad),
    rinde: textoRinde(i, i.unidad),
    porciones: i.porciones !== undefined ? i.porciones : porcionesEnStock(i.stock, i),
    /** Cómo se llama lo que sirve, en singular («porción» si todavía no se dijo). */
    porcion: i.porcionNombre?.trim() || "porción",
    costoPorcion:
      i.costoPorcion !== undefined
        ? i.costoPorcion
        : costoPorcion({ rindeCantidad: i.rindeCantidad, rindePorciones: i.rindePorciones, porcionNombre: i.porcionNombre, costo }),
  };
}

// ── La compra por bulto (Movimientos) ───────────────────────────────────────

/** A los 3 decimales con que se guardan el stock y las cantidades (Decimal(12,3)): 0,1 × 3 no es 0,30000000000000004. */
export function redondear3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export interface CuentaCompra {
  /** Lo que entra, en la unidad del insumo (2 quintales → 92 kg). Null si la cantidad no es un número mayor a 0. */
  cantidadBase: number | null;
  /** Cada kilo: el total ÷ lo que entra, a centavos (lo mismo que calcula el servidor). Null sin total. */
  costoUnitario: number | null;
  /** Para cuántas porciones alcanza lo que entra. Null sin rinde. */
  porciones: number | null;
  /** Lo que sale cada porción con el costo de esta compra. Null sin total o sin rinde. */
  costoPorcion: number | null;
}

/**
 * Las cuentas de una línea comprada por bulto: `cantidad` está en la unidad
 * elegida, y `contenido` es cuánto trae esa unidad (46 si es el quintal, 1 si
 * es el kilo).
 */
export function cuentaCompra(p: {
  cantidad: number | null;
  contenido: number;
  total: number | null;
  rindeCantidad?: number | null;
  rindePorciones?: number | null;
  porcionNombre?: string | null;
}): CuentaCompra {
  const cantidadBase = p.cantidad != null && p.cantidad > 0 && p.contenido > 0 ? redondear3(p.cantidad * p.contenido) : null;
  if (cantidadBase == null || !(cantidadBase > 0)) {
    return { cantidadBase: null, costoUnitario: null, porciones: null, costoPorcion: null };
  }
  const rinde = { rindeCantidad: p.rindeCantidad, rindePorciones: p.rindePorciones, porcionNombre: p.porcionNombre ?? "porción" };
  const costoUnitario = p.total != null && p.total > 0 ? round2(p.total / cantidadBase) : null;
  return {
    cantidadBase,
    costoUnitario,
    porciones: porcionesEnStock(cantidadBase, rinde),
    costoPorcion: costoUnitario != null ? costoPorcion({ ...rinde, costo: costoUnitario }) : null,
  };
}

/** «Entran 92 kg, unas 1.104 porciones. Cada porción te sale Bs 0,53.» */
export function textoCompraQueEntra(
  c: CuentaCompra,
  base: BaseInsumo | null,
  unidad: string,
  porcionNombre: string | null | undefined,
): string {
  if (c.cantidadBase == null) return "";
  let texto = `Entran ${cantidadConUnidad(c.cantidadBase, base, unidad)}`;
  const nombre = porcionNombre?.trim();
  if (c.porciones != null && nombre) {
    const n = Math.round(c.porciones);
    texto += n === 1 ? `, 1 ${nombre}` : `, unas ${fmtNum(n)} ${pluralPorcion(nombre)}`;
  }
  texto += ".";
  if (c.costoPorcion != null && nombre) texto += ` Cada ${nombre} te sale ${fmtMoney(c.costoPorcion)}.`;
  return texto;
}
