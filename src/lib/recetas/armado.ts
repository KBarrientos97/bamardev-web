import type { Armado, GuarnicionPos, PiezaPollo, Producto, RecetaPlatoPos, SesionRecetas } from "../../types";

/**
 * El armado de un plato con receta en el punto de venta (CONTRATO-recetas-plato
 * §4.1 y §4.2): qué presa eligió el cliente, qué quitó de la guarnición y cuál
 * pidió «puro», y cómo se dice eso en el carrito, el recibo y la comanda.
 *
 * `textoDelArmado` es la MISMA regla con la que el backend arma `armadoTexto`,
 * letra por letra: el carrito y el ticket de la cola sin señal dicen lo mismo
 * que después dice el recibo que manda el servidor.
 *
 * Nada de esto frena una venta: el armado es lo que se descuenta de los
 * insumos, y el stock de un insumo puede quedar en negativo.
 */

/** Las presas en el orden de la hoja y de la firma de la línea. */
export const PIEZAS: readonly PiezaPollo[] = ["ala", "pecho", "pierna", "contra"];

/** El orden en que se escriben (§4.1): «Pecho y ala», «Pierna y contra». */
const ORDEN_DEL_TEXTO: readonly PiezaPollo[] = ["pecho", "ala", "pierna", "contra"];

/** Cómo se llama cada presa, una y varias. */
export const NOMBRE_PIEZA: Record<PiezaPollo, { una: string; varias: string }> = {
  ala: { una: "ala", varias: "alas" },
  pecho: { una: "pecho", varias: "pechos" },
  pierna: { una: "pierna", varias: "piernas" },
  contra: { una: "contra", varias: "contras" },
};

/** Hasta cuántas de una misma presa acepta el backend. */
const MAX_PIEZA = 8;

/** La tarjeta del plato dice «N disp.» desde estos platos para abajo (§4.2). */
export const POCOS_PLATOS = 20;

type Piezas = Partial<Record<PiezaPollo, number>>;

const entero = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

/** Un número que puede venir como texto (un decimal de la base); NaN si no se entiende. */
function numero(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "") return Number(v);
  return Number.NaN;
}

const minuscula = (t: string) => t.trim().toLowerCase();
const conMayuscula = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);

/** «a», «a y b», «a, b y c» (o con «ni»: «arroz, papa ni fideo»). */
export function unir(partes: readonly string[], y: "y" | "ni"): string {
  if (partes.length <= 1) return partes[0] ?? "";
  return `${partes.slice(0, -1).join(", ")} ${y} ${partes[partes.length - 1]}`;
}

/** Cuántas presas suman. */
export function totalDePiezas(piezas: Piezas | null | undefined): number {
  return PIEZAS.reduce((s, k) => s + (piezas?.[k] ?? 0), 0);
}

/** Si dos juegos de presas son el mismo (las que faltan valen 0). */
export function mismasPiezas(a: Piezas | null | undefined, b: Piezas | null | undefined): boolean {
  return PIEZAS.every((k) => (a?.[k] ?? 0) === (b?.[k] ?? 0));
}

/**
 * El armado limpio: sólo las presas que van (de 1 a 8), lo quitado sin repetir
 * y en orden, y el «puro». `undefined` si no queda nada: el plato de siempre.
 * Lo que llega de afuera (la venta guardada en la pestaña) pasa por acá.
 */
export function normalizarArmado(crudo: unknown): Armado | undefined {
  if (!crudo || typeof crudo !== "object") return undefined;
  const a = crudo as Record<string, unknown>;
  const fuente = a.piezas && typeof a.piezas === "object" ? (a.piezas as Record<string, unknown>) : {};
  const piezas: Piezas = {};
  for (const k of PIEZAS) {
    const n = fuente[k];
    if (entero(n) && n > 0 && n <= MAX_PIEZA) piezas[k] = n;
  }
  const puro = entero(a.puro) && a.puro > 0 ? a.puro : undefined;
  const sin = Array.isArray(a.sin)
    ? [...new Set(a.sin.filter((x): x is number => entero(x) && x > 0 && x !== puro))].sort((x, y) => x - y)
    : [];
  const out: Armado = {};
  if (Object.keys(piezas).length > 0) out.piezas = piezas;
  if (sin.length > 0) out.sin = sin;
  if (puro !== undefined) out.puro = puro;
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Una firma estable del armado, para la clave de la línea del carrito
 * (§4.2): las presas en orden fijo, lo quitado ordenado y el «puro». Vacía sin
 * armado: la línea de siempre.
 */
export function firmaDeArmado(armado: Armado | undefined): string {
  const a = normalizarArmado(armado);
  if (!a) return "";
  const partes: string[] = [];
  if (a.piezas) partes.push(`p${PIEZAS.map((k) => a.piezas?.[k] ?? 0).join(".")}`);
  if (a.sin) partes.push(`s${a.sin.join(".")}`);
  if (a.puro !== undefined) partes.push(`u${a.puro}`);
  return partes.join("/");
}

/**
 * La receta del plato como la usa el punto de venta, o null: el plato no es
 * «Con receta», o el backend no la mandó (las recetas apagadas, un backend
 * viejo). Se queda sólo con lo que sirve. Quien la usa para dibujar ya miró que
 * las recetas estén prendidas (`recetasActivas`).
 */
export function recetaDelPlato(p: Pick<Producto, "conReceta" | "receta"> | null | undefined): RecetaPlatoPos | null {
  const r = p?.conReceta === true ? (p.receta as unknown) : undefined;
  if (!r || typeof r !== "object") return null;
  const c = r as Record<string, unknown>;
  const guarnicion = (Array.isArray(c.guarnicion) ? (c.guarnicion as unknown[]) : []).flatMap((x): GuarnicionPos[] => {
    if (!x || typeof x !== "object") return [];
    const g = x as Record<string, unknown>;
    const nombre = typeof g.nombre === "string" ? g.nombre.trim() : "";
    return entero(g.insumoId) && nombre ? [{ insumoId: g.insumoId, nombre, puro: g.puro === true }] : [];
  });
  const presas = numero(c.presas);
  const alcanza = c.alcanza == null ? Number.NaN : numero(c.alcanza);
  return {
    presas: Number.isFinite(presas) && presas > 0 ? presas : 0,
    partes: c.partes === "POLLO_8" ? "POLLO_8" : null,
    guarnicion,
    alcanza: Number.isFinite(alcanza) ? alcanza : null,
  };
}

/**
 * Si tocar el plato abre la hoja de la presa (§4.2): el pollo en 8, con 1 o 2
 * presas, y el local pidió que el punto de venta pregunte cuál (Configuración).
 * Si no, el plato se agrega directo, como siempre.
 */
export function pideLaPresa(
  receta: RecetaPlatoPos | null | undefined,
  sesion: Pick<SesionRecetas, "elegirPresa"> | null | undefined,
): boolean {
  return (
    !!receta &&
    sesion?.elegirPresa === true &&
    receta.partes === "POLLO_8" &&
    (receta.presas === 1 || receta.presas === 2)
  );
}

/** Si en el carrito hay algo para cambiar del plato: la guarnición, o la presa para elegir. */
export function tieneQueElegir(
  receta: RecetaPlatoPos | null | undefined,
  sesion: Pick<SesionRecetas, "elegirPresa"> | null | undefined,
): boolean {
  return !!receta && (receta.guarnicion.length > 0 || pideLaPresa(receta, sesion));
}

/**
 * «N disp.» en la tarjeta del plato: cuántos platos salen con lo que se cuenta,
 * sólo cuando son pocos (§4.2). Nunca «Agotado» ni nada que frene: un plato
 * que no alcanza dice «0 disp.» y se vende igual. null = no se dice nada.
 */
export function disponiblesDelPlato(receta: RecetaPlatoPos | null | undefined): number | null {
  if (!receta || receta.alcanza == null || receta.alcanza > POCOS_PLATOS) return null;
  return Math.max(0, Math.floor(receta.alcanza));
}

// ── El texto (§4.1) ─────────────────────────────────────────────────────────

/** Las presas del armado si calzan con el plato (el pollo en 8 y suman sus presas); si no, el backend las ignora. */
function piezasQueCalzan(a: Armado | undefined, receta: RecetaPlatoPos | null | undefined): Piezas | null {
  if (!a?.piezas || !receta || receta.partes !== "POLLO_8") return null;
  return totalDePiezas(a.piezas) === receta.presas ? a.piezas : null;
}

/**
 * «Pecho y ala», «Pierna y contra», «Ala y contra», «2 piernas»: las presas en
 * el orden pecho, ala, pierna, contra. Las de siempre repartidas parejo (medio
 * pollo, uno entero) no dicen nada. null = nada que decir.
 */
export function textoDePiezas(armado: Armado | undefined, receta: RecetaPlatoPos | null | undefined): string | null {
  const piezas = piezasQueCalzan(normalizarArmado(armado), receta);
  if (!piezas) return null;
  const total = totalDePiezas(piezas);
  if (total % 4 === 0 && PIEZAS.every((k) => (piezas[k] ?? 0) === total / 4)) return null;
  const partes = ORDEN_DEL_TEXTO.flatMap((k) => {
    const n = piezas[k] ?? 0;
    if (n <= 0) return [];
    return [n === 1 ? NOMBRE_PIEZA[k].una : `${n} ${NOMBRE_PIEZA[k].varias}`];
  });
  return conMayuscula(unir(partes, "y")) || null;
}

/** «Pura papa», «Puro arroz»: «Pura» si el nombre termina en «a». */
export function nombrePuro(nombre: string): string {
  const n = minuscula(nombre);
  return `${n.endsWith("a") ? "Pura" : "Puro"} ${n}`;
}

/**
 * «Sin fideo», «Sin arroz ni fideo», «Sin arroz, papa ni fideo», «Pura papa»,
 * «Pura papa, sin plátano»: con «puro», las otras que pueden ir puro ya salen
 * solas y sólo se dice lo demás que se quitó. En el orden de la receta. null =
 * va completa.
 */
export function textoDeGuarnicion(armado: Armado | undefined, receta: RecetaPlatoPos | null | undefined): string | null {
  const a = normalizarArmado(armado);
  if (!a || !receta) return null;
  const puro = a.puro !== undefined ? receta.guarnicion.find((g) => g.insumoId === a.puro && g.puro) : undefined;
  const sin = new Set(a.sin ?? []);
  const quitadas = receta.guarnicion.filter((g) => sin.has(g.insumoId) && g !== puro && !(puro && g.puro));
  const partes: string[] = [];
  if (puro) partes.push(nombrePuro(puro.nombre));
  if (quitadas.length > 0) partes.push(`${puro ? "sin" : "Sin"} ${unir(quitadas.map((g) => minuscula(g.nombre)), "ni")}`);
  return partes.length > 0 ? partes.join(", ") : null;
}

/**
 * El `armadoTexto` de la línea (§4.1): las presas y la guarnición unidas con
 * « · » («Pierna y contra · Sin fideo»). null si el plato va como siempre.
 */
export function textoDelArmado(armado: Armado | undefined, receta: RecetaPlatoPos | null | undefined): string | null {
  const partes = [textoDePiezas(armado, receta), textoDeGuarnicion(armado, receta)].filter((t): t is string => !!t);
  return partes.length > 0 ? partes.join(" · ") : null;
}

/** «Va completa: arroz, papa y plátano.»: la franja verde de la hoja. */
export function textoVaCompleta(receta: RecetaPlatoPos): string {
  return `Va completa: ${unir(receta.guarnicion.map((g) => minuscula(g.nombre)), "y")}.`;
}

// ── La hoja de la presa (§4.2) ──────────────────────────────────────────────

/** Una presa para tocar en la hoja. */
export interface OpcionPresa {
  nombre: string;
  /** Lo que lleva, si no lo dice el nombre («pecho y ala»). */
  detalle?: string;
  piezas: Piezas;
}

/**
 * Las presas de la hoja: con 1, las cuatro (2×2); con 2, «Ala» (pecho y ala) y
 * «Pierna» (pierna y contra). Lo demás, en «Otra combinación».
 */
export function opcionesDePresa(presas: number): OpcionPresa[] {
  if (presas === 1) {
    return [
      { nombre: "Ala", piezas: { ala: 1 } },
      { nombre: "Pecho", piezas: { pecho: 1 } },
      { nombre: "Pierna", piezas: { pierna: 1 } },
      { nombre: "Contra", piezas: { contra: 1 } },
    ];
  }
  if (presas === 2) {
    return [
      { nombre: "Ala", detalle: "pecho y ala", piezas: { ala: 1, pecho: 1 } },
      { nombre: "Pierna", detalle: "pierna y contra", piezas: { pierna: 1, contra: 1 } },
    ];
  }
  return [];
}

/** Lo marcado en la hoja. */
export interface MarcasHoja {
  /** Las guarniciones que no van; con «puro», también las otras que pueden ir puro. */
  fuera: number[];
  puro: number | null;
  piezas: Piezas | null;
}

const puedeIrPuro = (receta: RecetaPlatoPos, id: number | null | undefined) =>
  id != null && receta.guarnicion.some((g) => g.insumoId === id && g.puro);

/** La hoja de una línea que ya tenía su armado (o ninguno: va completa, sin presa elegida). */
export function marcasDelArmado(armado: Armado | undefined, receta: RecetaPlatoPos): MarcasHoja {
  const a = normalizarArmado(armado);
  const puro = puedeIrPuro(receta, a?.puro) ? (a?.puro ?? null) : null;
  const sin = new Set(a?.sin ?? []);
  const fuera = receta.guarnicion
    .filter((g) => g.insumoId !== puro && (sin.has(g.insumoId) || (puro !== null && g.puro)))
    .map((g) => g.insumoId);
  return { fuera, puro, piezas: a?.piezas ?? null };
}

/**
 * Lo marcado, como viaja: lo quitado sin las que ya salen por el «puro» (el
 * backend las saca solo), en orden. `undefined` si va todo como siempre.
 */
export function armadoDeMarcas(m: MarcasHoja, receta: RecetaPlatoPos): Armado | undefined {
  const puro = puedeIrPuro(receta, m.puro) ? (m.puro ?? undefined) : undefined;
  const fuera = new Set(m.fuera);
  const sin = receta.guarnicion
    .filter((g) => fuera.has(g.insumoId) && !(puro !== undefined && g.puro))
    .map((g) => g.insumoId);
  return normalizarArmado({ piezas: m.piezas ?? undefined, sin, puro });
}

/**
 * Tocar una guarnición: la saca o la vuelve a poner. Sacar la que iba «puro»
 * deja de ser «puro»; volver a poner una que podía ir puro también.
 */
export function alternarGuarnicion(m: MarcasHoja, g: GuarnicionPos): MarcasHoja {
  const fuera = new Set(m.fuera);
  let puro = m.puro;
  if (fuera.has(g.insumoId)) {
    fuera.delete(g.insumoId);
    if (g.puro) puro = null;
  } else {
    fuera.add(g.insumoId);
    if (puro === g.insumoId) puro = null;
  }
  return { ...m, fuera: [...fuera], puro };
}

/**
 * El atajo «Pura papa»: saca las otras que pueden ir puro. Tocar el que ya está
 * vuelve a la guarnición completa.
 */
export function elegirPuro(m: MarcasHoja, g: GuarnicionPos, receta: RecetaPlatoPos): MarcasHoja {
  if (m.puro === g.insumoId) return { ...m, fuera: [], puro: null };
  return {
    ...m,
    fuera: receta.guarnicion.filter((o) => o.puro && o.insumoId !== g.insumoId).map((o) => o.insumoId),
    puro: g.insumoId,
  };
}
