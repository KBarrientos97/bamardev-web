import type { SesionNegocio } from "../types";

/**
 * Cómo se ve y cómo cobra el punto de venta (Configuración › Punto de venta,
 * 16-nov). El dueño vio otra caja que deja elegir esto y lo pidió TODO
 * configurable, sin tocar lo de hoy: los valores de fábrica dejan el POS
 * exactamente como estaba.
 *
 * Viaja en la sesión (`negocio.pos`, en el login y en `/licencia/estado`, igual
 * que `usaAgregados`) y se cambia con `PATCH /pos/config`. Una sesión guardada
 * antes, o un backend que todavía no lo manda, no lo trae: ahí vale lo de
 * fábrica. Todo el POS lo lee por `configPosDe` y no del campo crudo, así un
 * dato raro (un valor que el backend sumó después, un `null`) nunca deja la
 * caja a medio dibujar.
 */

/** Cómo se ven los productos: en tarjetas (lo de siempre) o una columna por categoría. */
export type VistaPos = "TARJETAS" | "COLUMNAS";
/** Dónde se cobra: en la pantalla de cobro (lo de siempre) o al lado de los productos. */
export type CobroPos = "APARTE" | "EN_VENTA";

export interface ConfigPos {
  vista: VistaPos;
  cobro: CobroPos;
  /** El ícono de cada producto en las tarjetas y en las filas. */
  iconos: boolean;
  /** La fila de chips de categoría arriba del catálogo. El buscador queda siempre. */
  filtros: boolean;
  /** Ids de categoría en el orden elegido; vacío = el orden en que llegan. */
  ordenCategorias: number[];
}

/*
 * Mesa o para llevar NO es un ajuste (decisión del dueño, 16-nov): «se queda
 * tal cual está trabajándose hoy en día, es muy práctico». Cada línea del local
 * nace en mesa y el carrito tiene sus «Todo en mesa / Todo para llevar» y el
 * chip de cada línea, en los dos modos de cobro.
 */

/** Lo de fábrica: el POS de siempre. Nadie lo modifica: `normalizarConfigPos` devuelve copias. */
export const CONFIG_POS_DE_SIEMPRE: Readonly<ConfigPos> = {
  vista: "TARJETAS",
  cobro: "APARTE",
  iconos: true,
  filtros: true,
  ordenCategorias: [],
};

/**
 * Lee lo que vino de la red (o de la sesión guardada) campo por campo: lo que
 * falta o no se entiende vale lo de fábrica, y lo demás se respeta. Un campo
 * roto no tira abajo a los otros: si mañana el backend manda una vista nueva
 * que esta versión no conoce, el cobro elegido sigue valiendo.
 */
export function normalizarConfigPos(crudo: unknown): ConfigPos {
  const d = CONFIG_POS_DE_SIEMPRE;
  if (!crudo || typeof crudo !== "object") return { ...d, ordenCategorias: [] };
  const c = crudo as Record<string, unknown>;
  return {
    vista: c.vista === "COLUMNAS" || c.vista === "TARJETAS" ? c.vista : d.vista,
    cobro: c.cobro === "EN_VENTA" || c.cobro === "APARTE" ? c.cobro : d.cobro,
    iconos: typeof c.iconos === "boolean" ? c.iconos : d.iconos,
    filtros: typeof c.filtros === "boolean" ? c.filtros : d.filtros,
    ordenCategorias: Array.isArray(c.ordenCategorias)
      ? // Sin repetidos ni basura: un id que aparece dos veces no puede ocupar dos lugares.
        [...new Set(c.ordenCategorias.filter((x): x is number => Number.isInteger(x)))]
      : [],
  };
}

/**
 * La configuración del punto de venta de ESTE negocio, lista para usar.
 *
 * Sólo el restaurante la tiene: la pantalla para cambiarla existe sólo ahí
 * (`config_pos`, ver permisos.ts). Si un backend la mandara en otro rubro (un
 * negocio que cambió de rubro después de elegir algo), el POS sigue siendo el
 * de siempre: la farmacia arma su catálogo aparte y el salón de belleza cobra
 * con sus propinas y sus vales, y ninguno de los dos pidió esto.
 */
export function configPosDe(negocio: Pick<SesionNegocio, "pos" | "tipoNegocio"> | null | undefined): ConfigPos {
  if (negocio?.tipoNegocio !== "RESTAURANTE") return normalizarConfigPos(null);
  return normalizarConfigPos(negocio.pos);
}

/** Si dos configuraciones dicen lo mismo (para no reescribir la sesión en cada chequeo). */
export function mismaConfigPos(a: ConfigPos, b: ConfigPos): boolean {
  return (
    a.vista === b.vista &&
    a.cobro === b.cobro &&
    a.iconos === b.iconos &&
    a.filtros === b.filtros &&
    a.ordenCategorias.length === b.ordenCategorias.length &&
    a.ordenCategorias.every((id, i) => id === b.ordenCategorias[i])
  );
}

/**
 * Las categorías en el orden que eligió el dueño. Las que no están en la lista
 * (una categoría nueva, creada después de ordenar) van después, en el orden en
 * que llegan: así aparecen igual, sin que nadie tenga que volver a ordenar. Lo
 * de la lista que ya no existe (una categoría borrada) no deja hueco.
 *
 * Sin orden elegido devuelve el MISMO arreglo: el POS de siempre ni se entera.
 */
export function ordenarCategorias<T extends { id: number }>(categorias: T[], orden: readonly number[]): T[] {
  if (orden.length === 0) return categorias;
  const posicion = new Map(orden.map((id, i) => [id, i]));
  // `sort` es estable: las que no están en la lista conservan entre sí el orden de llegada.
  return [...categorias].sort(
    (a, b) => (posicion.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (posicion.get(b.id) ?? Number.MAX_SAFE_INTEGER),
  );
}
