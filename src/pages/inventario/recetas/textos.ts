import { fmtCantidad, fmtMoney } from "../../../lib/format";
import { round2 } from "../../../lib/recetas/calculo";
import type { AvisoPlato, CausaAviso, InsumoQueQueda, LineaRecetaPlato } from "../../../lib/recetas/tipos";
import { normalizar } from "../../../lib/texto";
import type { PartesInsumo } from "../../../types";

/**
 * Las frases de la receta del plato y de «Costos de platos»: plurales, el
 * bulto con su artículo («el quintal», «la bolsa»), lo que se avisa. Viven
 * aparte para que el editor y el tablero digan lo mismo con las mismas
 * palabras. Sin React ni red.
 */

/** «a», «a y b», «a, b y c» (o «ni» para lo que se quitó). */
export function unir(partes: string[], conjuncion = "y"): string {
  if (partes.length <= 1) return partes[0] ?? "";
  return `${partes.slice(0, -1).join(", ")} ${conjuncion} ${partes[partes.length - 1]}`;
}

const SIN_TILDE: Record<string, string> = { á: "a", é: "e", í: "i", ó: "o", ú: "u" };

/** El plural de una palabra de cocina: porción → porciones, presa → presas, bidón → bidones. */
export function plural(palabra: string): string {
  const p = palabra.trim();
  if (!p) return p;
  // Aguda con tilde terminada en n o s: pierde la tilde (porción → porciones).
  const aguda = p.match(/([áéíóú])([ns])$/i);
  if (aguda) return `${p.slice(0, -2)}${SIN_TILDE[aguda[1].toLowerCase()] ?? aguda[1]}${aguda[2]}es`;
  if (/[aeiouáéíóú]$/i.test(p)) return `${p}s`;
  if (/z$/i.test(p)) return `${p.slice(0, -1)}ces`;
  if (/[sx]$/i.test(p)) return p;
  return `${p}es`;
}

/** «1 porción», «2 porciones», «0,5 porciones». */
export function cantidadDe(n: number, palabra: string): string {
  return `${fmtCantidad(n)} ${n === 1 ? palabra : plural(palabra)}`;
}

/** La unidad base del insumo dicha en una frase: «kilo», «litro», «unidad». */
export function nombreDeUnidad(unidad: string | null | undefined): string {
  const u = normalizar(unidad ?? "").trim();
  if (!u) return "unidad";
  if (["kilogramo", "kilogramos", "kilo", "kilos", "kg"].includes(u)) return "kilo";
  if (["litro", "litros", "l", "lt", "lts"].includes(u)) return "litro";
  if (["unidad", "unidades", "u", "und", "unid"].includes(u)) return "unidad";
  if (["gramo", "gramos", "g", "gr"].includes(u)) return "gramo";
  return (unidad ?? "").trim().toLowerCase();
}

/** Con su artículo: «el quintal», «la bolsa», «el bidón», «la unidad». */
export function conArticulo(nombre: string): string {
  const n = nombre.trim().toLowerCase();
  return `${/(a|ad|ion)$/.test(normalizar(n)) ? "la" : "el"} ${n}`;
}

/**
 * Por qué cambió el costo de los platos, por insumo: «Arroz: el quintal pasó de
 * Bs 276,00 a Bs 289,80.» El costo del insumo viaja por unidad base; si se
 * compra por bulto, se dice lo que cuesta el bulto, que es el número que el
 * dueño conoce. Si el costo es el mismo, lo que cambió fue el rinde.
 */
export function textoCausa(c: CausaAviso): string {
  if (Math.abs(c.costoAhora - c.costoAntes) < 0.005) return `${c.nombre}: cambió lo que rinde.`;
  const conBulto = !!c.compraUnidad?.trim() && (c.compraContenido ?? 0) > 0;
  const que = conArticulo(conBulto ? c.compraUnidad! : nombreDeUnidad(c.unidad));
  const factor = conBulto ? c.compraContenido! : 1;
  return `${c.nombre}: ${que} pasó de ${fmtMoney(round2(c.costoAntes * factor))} a ${fmtMoney(round2(c.costoAhora * factor))}.`;
}

/** «Subió el costo de 3 platos» (o «Bajó», o «Cambió» si hay de las dos). */
export function tituloAviso(platos: Pick<AvisoPlato, "antes" | "ahora">[]): string {
  const suben = platos.filter((p) => p.ahora > p.antes).length;
  const verbo = suben === platos.length ? "Subió" : suben === 0 ? "Bajó" : "Cambió";
  return `${verbo} el costo de ${platos.length} ${platos.length === 1 ? "plato" : "platos"}`;
}

/** «+ Bs 0,91» / «− Bs 0,91». */
export function textoDiferencia(antes: number, ahora: number): string {
  const d = round2(ahora - antes);
  return `${d < 0 ? "−" : "+"} ${fmtMoney(Math.abs(d))}`;
}

/** «Ganás Bs 13,19» / «Perdés Bs 2,00». */
export function textoGanancia(ganancia: number): string {
  return `${ganancia < 0 ? "Perdés" : "Ganás"} ${fmtMoney(Math.abs(ganancia))}`;
}

/** «Alcanza para 120 platos»; null si nada de la receta se cuenta. */
export function textoAlcanza(alcanza: number | null): string | null {
  if (alcanza == null) return null;
  if (alcanza <= 0) return "Ya no alcanza para ningún plato";
  return `Alcanza para ${fmtCantidad(alcanza)} ${alcanza === 1 ? "plato" : "platos"}`;
}

/** Es un insumo que sirve presas (el pollo): va en «Presas», no en lo de siempre. */
export function esDePresas(i: { porcionNombre: string | null; partes: PartesInsumo | null }): boolean {
  return i.partes === "POLLO_8" || normalizar(i.porcionNombre ?? "").trim() === "presa";
}

/**
 * Qué pasa al vender según cuántas presas lleva. Las presas se reparten solas
 * sólo en un pollo entero (`POLLO_8`); el cajero elige la presa sólo si el
 * ajuste «Elegir la presa al vender» está prendido, y sólo en los de 1 o 2.
 */
export function textoPresas(cuantas: number | null, partes: PartesInsumo | null, elegirPresa: boolean): string {
  const pollo = partes === "POLLO_8";
  if (pollo && cuantas === 4) return "Una de cada una: ala, pecho, pierna y contra. No se pregunta al vender.";
  if (pollo && cuantas === 8) return "Las ocho: dos alas, dos pechos, dos piernas y dos contras. No se pregunta al vender.";
  if (pollo && elegirPresa && cuantas === 1) return "Al vender, el cajero toca cuál salió: ala, pecho, pierna o contra.";
  if (pollo && elegirPresa && cuantas === 2)
    return "Al vender: «Ala» es pecho y ala; «Pierna» es pierna y contra. Si el cliente pide otra (contra y ala), el cajero la arma.";
  return "No se pregunta al vender: sale de la presa que haya.";
}

/**
 * La receta en una línea, para el bloque «Receta» de Artículos: «Lleva siempre
 * Aceite y Bandeja · Guarnición: Arroz, Papa y Plátano · 2 presas de Pollo».
 */
export function resumenReceta(lineas: Pick<LineaRecetaPlato, "nombre" | "grupo" | "porciones">[]): string {
  const de = (g: LineaRecetaPlato["grupo"]) => lineas.filter((l) => l.grupo === g).map((l) => l.nombre);
  const partes: string[] = [];
  const fijo = de("FIJO");
  if (fijo.length) partes.push(`Lleva siempre ${unir(fijo)}`);
  const guarnicion = de("GUARNICION");
  if (guarnicion.length) partes.push(`Guarnición: ${unir(guarnicion)}`);
  const presa = lineas.find((l) => l.grupo === "PRESA");
  if (presa) partes.push(`${cantidadDe(presa.porciones, "presa")} de ${presa.nombre}`);
  return partes.length ? partes.join(" · ") : "Todavía no lleva ningún insumo.";
}

/**
 * Cuánto queda de un insumo: «Quedan 30 unidades, 240 presas.» (lo que se
 * cuenta) o «Deberían quedar 46 kilos, unas 552 porciones.» (lo que se
 * estima). Las porciones van enteras: media porción no se sirve.
 */
export function textoQueQueda(i: InsumoQueQueda): string {
  const unidad = nombreDeUnidad(i.unidad);
  if (i.stock < 0) {
    return `${i.seCuenta ? "Faltan" : "Deberían faltar"} ${cantidadDe(-i.stock, unidad)}: se vendió más de lo que entró.`;
  }
  if (i.stock === 0) return i.seCuenta ? "No queda nada." : "No debería quedar nada.";
  let cola = "";
  if (i.porciones != null && i.porciones >= 0 && i.porcionNombre?.trim()) {
    const porciones = Math.floor(i.porciones + 1e-9);
    // «Quedan 12 unidades, 12 unidades» no dice nada nuevo.
    const repite = normalizar(i.porcionNombre).trim() === unidad && Math.abs(porciones - i.stock) < 1e-9;
    if (!repite) cola = `, ${i.seCuenta ? "" : "unas "}${cantidadDe(porciones, i.porcionNombre.trim())}`;
  }
  return `${i.seCuenta ? "Quedan" : "Deberían quedar"} ${cantidadDe(i.stock, unidad)}${cola}.`;
}
