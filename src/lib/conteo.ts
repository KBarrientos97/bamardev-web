import type { ConfigConteo, ItemConteoCaja } from "../types";

/**
 * Conteo por categoría (17-nov): la cuenta de vasos, cajas o envases por
 * tamaño, por sucursal. Un negocio que vende por tamaño (C, M, L, XL) lleva
 * cuántos vasos de cada uno le quedan: el cajero los cuenta al abrir la caja,
 * cada venta descuenta y al cerrar se ve cuánto queda.
 *
 * Acá vive sólo lo puro: leer lo que llega, armar las frases y decidir qué
 * viaja en la apertura. Las pantallas no repiten esas cuentas.
 */

/** Lo que se lee cuando el admin no escribió qué se cuenta. */
export const NOMBRE_CONTEO_POR_DEFECTO = "Unidades";

/** Lo de fábrica: apagado. Ninguna pantalla cambia hasta que el dueño lo prenda. */
export const CONTEO_APAGADO: Readonly<ConfigConteo> = {
  activo: false,
  nombre: NOMBRE_CONTEO_POR_DEFECTO,
  categorias: [],
};

/** Lo que se cuenta, con su nombre; vacío o en blanco se lee «Unidades». */
export function nombreConteo(nombre: string | null | undefined): string {
  const limpio = typeof nombre === "string" ? nombre.trim() : "";
  return limpio || NOMBRE_CONTEO_POR_DEFECTO;
}

/** «Contar » + el nombre con la primera letra en minúscula: «Vasos» → «Contar vasos». */
export function fraseContar(nombre: string | null | undefined): string {
  const n = nombreConteo(nombre);
  return `Contar ${n.charAt(0).toLocaleLowerCase("es")}${n.slice(1)}`;
}

/**
 * Lee la configuración que vino de la red (o de la sesión guardada) campo por
 * campo, como `normalizarConfigPos`: lo que falta o no se entiende vale
 * «apagado». Un backend viejo que no manda `conteo` no puede dejar la caja a
 * medio dibujar.
 */
export function normalizarConfigConteo(crudo: unknown): ConfigConteo {
  if (!crudo || typeof crudo !== "object") return { ...CONTEO_APAGADO, categorias: [] };
  const c = crudo as Record<string, unknown>;
  const categorias = Array.isArray(c.categorias)
    ? c.categorias.flatMap((x) => {
        if (!x || typeof x !== "object") return [];
        const { id, nombre } = x as Record<string, unknown>;
        return Number.isInteger(id) && typeof nombre === "string" ? [{ id: id as number, nombre }] : [];
      })
    : [];
  return {
    activo: c.activo === true,
    nombre: nombreConteo(typeof c.nombre === "string" ? c.nombre : null),
    categorias,
  };
}

/** Si dos configuraciones dicen lo mismo (para no reescribir la sesión en cada chequeo). */
export function mismoConteo(a: ConfigConteo, b: ConfigConteo): boolean {
  return (
    a.activo === b.activo &&
    a.nombre === b.nombre &&
    a.categorias.length === b.categorias.length &&
    a.categorias.every((x, i) => x.id === b.categorias[i].id && x.nombre === b.categorias[i].nombre)
  );
}

/**
 * Prendido y con algo que contar: recién ahí la apertura, el cierre y la
 * Supervisión lo muestran. Prendido sin categorías no cuenta nada (el backend
 * ni lo deja prender), así que se lee como apagado.
 */
export function conteoEnUso(c: ConfigConteo): boolean {
  return c.activo && c.categorias.length > 0;
}

/** Una fila de la apertura: lo que quedaba y lo que el cajero dejó escrito. */
export interface FilaApertura {
  categoriaId: number;
  /** Lo que quedaba del turno anterior; null = nunca se contó en esta sucursal. */
  quedaban: number | null;
  /** Lo que hay ahora según el cajero; null = no escribió nada. */
  cantidad: number | null;
}

/**
 * Qué viaja con la apertura: sólo las filas que el cajero cambió respecto de lo
 * que quedaba, o las que nunca se contaron y ahora tienen número.
 *
 * Mandar todo pisaría el saldo con la foto que la pantalla bajó hace un rato:
 * si otro cajero vendió mientras tanto, la apertura le borraría esas ventas.
 * Una fila sin tocar no se manda y el saldo sigue su cuenta.
 */
export function lineasCambiadas(filas: FilaApertura[]): { categoriaId: number; cantidad: number }[] {
  return filas.flatMap((f) => {
    if (f.cantidad == null || !Number.isFinite(f.cantidad) || f.cantidad < 0) return [];
    if (f.quedaban != null && f.cantidad === f.quedaban) return [];
    return [{ categoriaId: f.categoriaId, cantidad: Math.floor(f.cantidad) }];
  });
}

/**
 * Si `alAbrir + repuesto − vendido` da lo que quedan. No siempre: «quedan» es
 * lo del LOCAL, y cuenta también lo vendido en otras cajas del mismo local y
 * lo repuesto fuera de este turno. Sin alguno de los dos extremos no hay nada
 * que comparar.
 */
export function cuadra(item: Pick<ItemConteoCaja, "alAbrir" | "repuesto" | "vendido" | "quedan">): boolean {
  if (item.alAbrir == null || item.quedan == null) return true;
  return Math.abs(item.alAbrir + item.repuesto - item.vendido - item.quedan) < 0.0005;
}
