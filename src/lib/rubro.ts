/**
 * El RUBRO del negocio: la tercera dimensión, después del rol y del plan.
 *
 *   • Rol   → qué puede hacer la persona   (`usuario.modulos`)
 *   • Plan  → qué compró el negocio        (`negocio.features`)
 *   • Rubro → **a qué se dedica**          (`negocio.tipoNegocio`)
 *
 * El rubro no se compra ni se asigna a una persona: se elige al dar de alta el
 * negocio y no cambia. Decide dos cosas y sólo dos: **qué secciones ni siquiera
 * existen** para ese tipo de negocio (una farmacia no tiene mesas de salón) y
 * **cómo se llaman las cosas** (lo que en una pollería es un "artículo", en una
 * farmacia es un "medicamento").
 *
 * Lo que NO decide: permisos ni precios. Si algo se vende aparte —los lotes, por
 * ejemplo— eso sigue siendo una feature del plan, no del rubro. Ver `permisos.ts`.
 *
 * El color también sale del rubro, pero vive aparte en `temas.ts` porque se
 * aplica de otra forma (variables CSS al iniciar sesión).
 */

/** Los rubros del backend (enum `TipoNegocio`). */
export type Rubro = "FARMACIA" | "MINIMARKET" | "RESTAURANTE" | "FERRETERIA" | "REPUESTOS";

export const RUBROS: Rubro[] = [
  "FARMACIA",
  "MINIMARKET",
  "RESTAURANTE",
  "FERRETERIA",
  "REPUESTOS",
];

export function esRubro(valor: string | null | undefined): valor is Rubro {
  return !!valor && (RUBROS as string[]).includes(valor);
}

/** Atajo, porque farmacia es el rubro con más piezas propias. */
export function esFarmacia(rubro: string | null | undefined): boolean {
  return rubro === "FARMACIA";
}

// ── Vocabulario ─────────────────────────────────────────────────────────────

/**
 * Palabras que cambian según el rubro. La clave es el concepto, no el texto:
 * `articulos` es "lo que el negocio vende", se llame como se llame.
 *
 * Son pocas a propósito. Renombrar media app por rubro termina en un
 * diccionario que nadie mantiene y en pantallas que hablan mitad en un idioma
 * y mitad en otro; acá sólo entran las palabras que de verdad suenan mal en el
 * otro rubro. Un farmacéutico no busca "artículos", busca medicamentos — pero
 * "Categorías", "Almacenes" o "Movimientos" son las mismas dos palabras en los
 * dos mostradores.
 */
export type Termino = "articulos" | "articulo" | "articuloCap";

const BASE: Record<Termino, string> = {
  articulos: "Artículos",
  articulo: "artículo",
  articuloCap: "Artículo",
};

/**
 * Sólo lo que se aparta de `BASE`. Un rubro que no está acá habla como siempre,
 * que es exactamente lo que tiene que pasar con los negocios que ya trabajan.
 */
const POR_RUBRO: Partial<Record<Rubro, Partial<Record<Termino, string>>>> = {
  FARMACIA: {
    articulos: "Medicamentos",
    articulo: "medicamento",
    articuloCap: "Medicamento",
  },
};

/**
 * La palabra que corresponde al rubro. Sin rubro (o con uno desconocido)
 * devuelve la de siempre: ante la duda, el producto habla como hoy.
 */
export function termino(rubro: string | null | undefined, clave: Termino): string {
  const propio = esRubro(rubro) ? POR_RUBRO[rubro]?.[clave] : undefined;
  return propio ?? BASE[clave];
}
