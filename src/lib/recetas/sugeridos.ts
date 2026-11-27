import { normalizar } from "../texto";
import type { PartesInsumo } from "../../types";
import type { BaseInsumo } from "./unidades";

/**
 * «Lista sugerida» de Insumos (recetas del plato, 27-nov): los insumos típicos
 * de una cocina, con lo de fábrica ya puesto para no arrancar de cero.
 *
 * Son un punto de partida, no un dato del negocio: tocar uno abre el
 * formulario con estos valores, y quien carga los cambia antes de guardar si
 * compra distinto (otro bulto, otro rinde). Es el único lugar donde un campo
 * del formulario llega lleno: porque el usuario eligió la plantilla.
 */
export interface InsumoSugerido {
  nombre: string;
  /** Cómo se compra: el `nombre` de un chip de `FORMAS_COMPRA`. */
  compra: string;
  /** Cuánto trae el bulto que no tiene uno de siempre (bolsa, bidón, paquete). */
  contenido?: number;
  /** En qué viene ese bulto, si no es el que sugiere el chip. */
  base?: BaseInsumo;
  /** «Con cuánto…», en la unidad base. */
  rindeCantidad: number;
  /** «…sirvo cuántas». */
  rindePorciones: number;
  /** En singular, como se guarda: «porción», «presa», «unidad». */
  porcion: string;
  /** «Lo cuento» (true) o «lo estimo» (false). */
  seCuenta: boolean;
  partes?: PartesInsumo;
}

export const INSUMOS_SUGERIDOS: readonly InsumoSugerido[] = [
  { nombre: "Pollo", compra: "Unidad", rindeCantidad: 1, rindePorciones: 8, porcion: "presa", seCuenta: true, partes: "POLLO_8" },
  { nombre: "Arroz", compra: "Quintal", rindeCantidad: 1, rindePorciones: 12, porcion: "porción", seCuenta: false },
  { nombre: "Fideo", compra: "Arroba", rindeCantidad: 1, rindePorciones: 10, porcion: "porción", seCuenta: false },
  { nombre: "Papa", compra: "Quintal", rindeCantidad: 1, rindePorciones: 5, porcion: "porción", seCuenta: false },
  { nombre: "Plátano", compra: "Unidad", rindeCantidad: 1, rindePorciones: 2, porcion: "porción", seCuenta: false },
  { nombre: "Yuca", compra: "Arroba", rindeCantidad: 1, rindePorciones: 5, porcion: "porción", seCuenta: false },
  {
    nombre: "Aceite",
    compra: "Bidón",
    contenido: 20,
    base: "LITRO",
    rindeCantidad: 20,
    rindePorciones: 500,
    porcion: "porción",
    seCuenta: false,
  },
  // La garrafa entera: lo que dura se estima en platos, como el aceite.
  { nombre: "Gas", compra: "Unidad", rindeCantidad: 1, rindePorciones: 200, porcion: "porción", seCuenta: false },
  { nombre: "Sal", compra: "Kilo", rindeCantidad: 1, rindePorciones: 200, porcion: "porción", seCuenta: false },
  { nombre: "Comino", compra: "Kilo", rindeCantidad: 1, rindePorciones: 500, porcion: "porción", seCuenta: false },
  { nombre: "Ajo", compra: "Kilo", rindeCantidad: 1, rindePorciones: 100, porcion: "porción", seCuenta: false },
  { nombre: "Cebolla", compra: "Arroba", rindeCantidad: 1, rindePorciones: 10, porcion: "porción", seCuenta: false },
  { nombre: "Tomate", compra: "Arroba", rindeCantidad: 1, rindePorciones: 10, porcion: "porción", seCuenta: false },
  {
    nombre: "Huevo",
    compra: "Paquete",
    contenido: 30,
    base: "UNIDAD",
    rindeCantidad: 1,
    rindePorciones: 1,
    porcion: "unidad",
    seCuenta: true,
  },
  { nombre: "Harina", compra: "Arroba", rindeCantidad: 1, rindePorciones: 20, porcion: "porción", seCuenta: false },
  { nombre: "Carne molida", compra: "Kilo", rindeCantidad: 1, rindePorciones: 8, porcion: "porción", seCuenta: false },
  { nombre: "Queso", compra: "Kilo", rindeCantidad: 1, rindePorciones: 20, porcion: "porción", seCuenta: false },
  { nombre: "Pan", compra: "Unidad", rindeCantidad: 1, rindePorciones: 1, porcion: "unidad", seCuenta: true },
  {
    nombre: "Bandeja",
    compra: "Paquete",
    contenido: 100,
    base: "UNIDAD",
    rindeCantidad: 1,
    rindePorciones: 1,
    porcion: "unidad",
    seCuenta: true,
  },
  {
    nombre: "Bolsa",
    compra: "Paquete",
    contenido: 100,
    base: "UNIDAD",
    rindeCantidad: 1,
    rindePorciones: 1,
    porcion: "unidad",
    seCuenta: true,
  },
];

/**
 * ¿Ya hay un insumo que es éste? Sin tildes ni mayúsculas, en plural también, y
 * con apellido: «Pollo para broaster» ya es el pollo, «Papas fritas» ya es la
 * papa. «Papaya» no es la papa, ni «Gaseosa» el gas.
 */
function yaEsta(existente: string, sugerido: string): boolean {
  const e = normalizar(existente).trim().replace(/\s+/g, " ");
  const s = normalizar(sugerido);
  return [s, `${s}s`, `${s}es`].some((forma) => e === forma || e.startsWith(`${forma} `));
}

/** Los de la lista que el negocio todavía no tiene, en el orden de la lista. */
export function sugeridosQueFaltan(existentes: readonly string[]): InsumoSugerido[] {
  return INSUMOS_SUGERIDOS.filter((s) => !existentes.some((e) => yaEsta(e, s.nombre)));
}
