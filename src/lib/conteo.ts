import { fmtCantidad } from "./format";
import type { ConfigConteo, EstadoConteoSucursal, ItemConteoCaja } from "../types";

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

/**
 * El nombre para ir dentro de una frase: la primera letra en minúscula y el
 * resto como lo escribió el admin («Vasos PET» → «vasos PET»).
 */
export function nombreEnFrase(nombre: string | null | undefined): string {
  const n = nombreConteo(nombre);
  return `${n.charAt(0).toLocaleLowerCase("es")}${n.slice(1)}`;
}

/** «Contar » + el nombre con la primera letra en minúscula: «Vasos» → «Contar vasos». */
export function fraseContar(nombre: string | null | undefined): string {
  return `Contar ${nombreEnFrase(nombre)}`;
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
 * lo del LOCAL, y cuenta también lo vendido en otras cajas del mismo local, lo
 * repuesto fuera de este turno y, desde el 18-nov, los pedidos por cobrar
 * (delivery o para recoger) que todavía no se entregaron: el vaso sale al
 * tomar el pedido, pero «vendido» es «Productos vendidos» de la caja, que los
 * suma recién al entregarlos. Sin alguno de los dos extremos no hay nada que
 * comparar.
 */
export function cuadra(item: Pick<ItemConteoCaja, "alAbrir" | "repuesto" | "vendido" | "quedan">): boolean {
  if (item.alAbrir == null || item.quedan == null) return true;
  return Math.abs(item.alAbrir + item.repuesto - item.vendido - item.quedan) < 0.0005;
}

// ── El tope en el punto de venta (18-nov) ──────────────────────────────────────
//
// El dueño contó 100 vasos L al abrir y el POS le dejó vender 101: el conteo
// existía, pero la caja no lo miraba. Desde acá la caja sabe cuántos vasos de
// cada tamaño quedan en su local, lo dice en cada producto de ese tamaño y no
// deja cargar más de lo que queda. El tope es del VASO, no del producto: un
// «Dulce de leche C» y un «Nutella C» gastan el mismo vaso C.

/**
 * Desde cuántos libres el rótulo del POS sale en tono de aviso: quedan diez
 * vasos (o menos) de ese tamaño y es hora de pedirle al encargado que reponga.
 */
export const QUEDA_POCO = 10;

/** Categoría contada → cuántos quedan en el local; null = nunca se contó ahí (sin tope). */
export type SaldosConteo = ReadonlyMap<number, number | null>;

/** De qué categoría es un artículo del catálogo; null o undefined = no se sabe. */
export type CategoriaDe = (productoId: number) => number | null | undefined;

/**
 * Una línea del carrito como la mira el conteo: `LineaCarrito` sirve tal cual.
 * `vista` son los toppings de UNA unidad, ya repartidos en incluidos y extras
 * (`vistaDeAgregados`).
 */
export interface LineaParaConteo {
  producto: { id: number; categoria?: { id: number } | null };
  cantidad: number;
  vista?: { hijas: readonly { productoId: number; cantidad: number; incluido: boolean }[] };
}

/** Tres decimales, como el saldo del servidor: 0,1 + 0,2 no deja un vaso de más ni de menos. */
const redondear = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Lo que la caja mira del conteo de su local: categoría → cuántos quedan (null
 * = sin contar). Vacío con el conteo apagado o mientras no llegó nada: es el
 * punto de venta de siempre.
 */
export function saldosDeConteo(estado: EstadoConteoSucursal | null | undefined): Map<number, number | null> {
  const saldos = new Map<number, number | null>();
  if (!estado?.activo || !Array.isArray(estado.items)) return saldos;
  for (const i of estado.items) saldos.set(i.categoriaId, i.quedan ?? null);
  return saldos;
}

/**
 * Cuánto gasta UNA unidad de la línea de cada categoría contada: el vaso de su
 * tamaño y, si el catálogo dice de qué categoría es, cada topping EXTRA. El
 * topping incluido va dentro del vaso y no gasta nada, igual que en el saldo
 * del servidor (que tampoco lo cuenta). Sin `categoriaDe` sólo cuenta el vaso.
 */
export function gastoPorUnidad(
  linea: LineaParaConteo,
  saldos: SaldosConteo,
  categoriaDe?: CategoriaDe,
): Map<number, number> {
  const gasto = new Map<number, number>();
  const sumar = (categoriaId: number | null | undefined, n: number) => {
    if (categoriaId == null || !saldos.has(categoriaId) || !(n > 0)) return;
    gasto.set(categoriaId, redondear((gasto.get(categoriaId) ?? 0) + n));
  };
  sumar(linea.producto.categoria?.id, 1);
  if (categoriaDe) {
    for (const h of linea.vista?.hijas ?? []) if (!h.incluido) sumar(categoriaDe(h.productoId), h.cantidad);
  }
  return gasto;
}

/**
 * Las unidades del carrito de cada categoría contada, sumando TODOS sus
 * productos: es lo que se resta de lo que queda en cada tarjeta de ese tamaño.
 */
export function unidadesPorCategoria(
  lineas: readonly LineaParaConteo[],
  saldos: SaldosConteo,
  categoriaDe?: CategoriaDe,
): Map<number, number> {
  const total = new Map<number, number>();
  if (saldos.size === 0) return total;
  for (const l of lineas) {
    for (const [categoriaId, u] of gastoPorUnidad(l, saldos, categoriaDe)) {
      total.set(categoriaId, redondear((total.get(categoriaId) ?? 0) + u * l.cantidad));
    }
  }
  return total;
}

/**
 * Cuánto MÁS se puede cargar de una categoría: lo que queda menos lo que ya
 * lleva el carrito, nunca menos de 0. Sin tope (`Infinity`) si la categoría no
 * se cuenta o nunca se contó en este local.
 */
export function libreDeConteo(categoriaId: number | null | undefined, saldos: SaldosConteo, enCarrito: number): number {
  if (categoriaId == null) return Infinity;
  const quedan = saldos.get(categoriaId);
  if (quedan == null) return Infinity;
  return Math.max(0, redondear(quedan - enCarrito));
}

/** Si entra una unidad más que gasta `gasto`, con lo que ya lleva el carrito. */
export function entraOtra(
  gasto: ReadonlyMap<number, number>,
  saldos: SaldosConteo,
  enCarrito: ReadonlyMap<number, number>,
): boolean {
  for (const [categoriaId, u] of gasto) {
    if (libreDeConteo(categoriaId, saldos, enCarrito.get(categoriaId) ?? 0) < u) return false;
  }
  return true;
}

/**
 * Hasta cuántas unidades puede llevar una línea sin pasarse de lo que queda,
 * contando lo que ya gastan las OTRAS líneas de las mismas categorías.
 * `Infinity` si nada de lo que gasta se cuenta. Puede dar menos de lo que la
 * línea ya tiene (otra caja vendió mientras tanto): qué hacer con eso lo
 * decide el carrito.
 */
export function topeDeLinea(
  linea: LineaParaConteo,
  saldos: SaldosConteo,
  enCarrito: ReadonlyMap<number, number>,
  categoriaDe?: CategoriaDe,
): number {
  let tope = Infinity;
  for (const [categoriaId, u] of gastoPorUnidad(linea, saldos, categoriaDe)) {
    const quedan = saldos.get(categoriaId);
    if (quedan == null) continue;
    const otras = (enCarrito.get(categoriaId) ?? 0) - u * linea.cantidad;
    tope = Math.min(tope, Math.floor(redondear((quedan - otras) / u)));
  }
  return tope;
}

/**
 * «Vasos L»: lo que se cuenta, tal cual lo escribió el admin, y la categoría.
 * Va adelante, como rótulo, en el aviso y en la etiqueta: así nunca hay que
 * poner en singular un nombre que es texto libre («Vasos», «Cajas»…).
 */
function rotuloDeConteo(nombre: string | null | undefined, categoria: string): string {
  return `${nombreConteo(nombre)} ${categoria}`;
}

/**
 * Por qué no se puede cargar más (§1 del contrato, el mismo texto en la web,
 * la app y el backend). El nombre va adelante, como rótulo y tal cual lo
 * escribió el admin, para no tener que ponerlo en singular.
 */
export function avisoDeConteo(nombre: string | null | undefined, categoria: string, quedan: number): string {
  const rotulo = rotuloDeConteo(nombre, categoria);
  const n = redondear(quedan);
  if (n <= 0) return `${rotulo}: no quedan. Avisale al encargado para que reponga.`;
  if (n === 1) return `${rotulo}: sólo queda 1.`;
  return `${rotulo}: sólo quedan ${fmtCantidad(n)}.`;
}

/** Lo que el conteo le dice a la pantalla de venta de una categoría: la tarjeta, la fila y su cabecera. */
export interface ConteoDeCategoria {
  /** Lo que queda en el local (puede ser negativo: se vendió más de lo contado). */
  quedan: number;
  /** Lo que todavía se puede cargar: lo que queda menos lo que ya lleva el carrito. */
  libre: number;
  /** No queda nada: se ve y se frena como el agotado del stock. */
  agotado: boolean;
  /** Queda, pero el carrito ya lleva todo: no se suma otro de ese tamaño. */
  lleno: boolean;
  /** Quedan `QUEDA_POCO` libres o menos: el rótulo sale en tono de aviso. */
  poco: boolean;
  /**
   * «Vasos C: quedan 45» (con uno, «Vasos XL: queda 1»): el `title` y lo que
   * lee el lector de pantalla. Con la forma de los avisos: antes decía
   * «Quedan 1 vasos XL», y el nombre es texto libre, no se puede poner en
   * singular (18-nov, tras la prueba en QA).
   */
  etiqueta: string;
  /** Por qué no suma (agotado o lleno), con el texto de §1; ausente si suma. */
  aviso?: string;
}

/**
 * Lo que el conteo dice de una categoría en la pantalla de venta. null = nada
 * que decir: el producto no tiene categoría, la suya no se cuenta o nunca se
 * contó en este local. Ahí la pantalla queda como siempre.
 */
export function conteoDeCategoria(
  categoria: { id: number; nombre: string } | null | undefined,
  nombre: string | null | undefined,
  saldos: SaldosConteo,
  enCarrito: ReadonlyMap<number, number>,
): ConteoDeCategoria | null {
  if (!categoria) return null;
  const quedan = saldos.get(categoria.id);
  if (quedan == null) return null;
  const libre = libreDeConteo(categoria.id, saldos, enCarrito.get(categoria.id) ?? 0);
  const agotado = redondear(quedan) <= 0;
  // «Lleno» es que no entra un vaso entero más: el mismo criterio que usa el carrito.
  const lleno = !agotado && libre < 1;
  return {
    quedan,
    libre,
    agotado,
    lleno,
    poco: libre <= QUEDA_POCO,
    etiqueta: `${rotuloDeConteo(nombre, categoria.nombre)}: ${libre === 1 ? "queda 1" : `quedan ${fmtCantidad(libre)}`}`,
    ...(agotado || lleno ? { aviso: avisoDeConteo(nombre, categoria.nombre, quedan) } : {}),
  };
}

/**
 * El estado con lo vendido ya bajado, para la venta o el pedido que el
 * servidor todavía no conoce (quedó en la cola sin señal): `quedan` baja y
 * `vendido` sube en las categorías con saldo; las sin contar quedan igual.
 */
export function descontarDelConteo(
  estado: EstadoConteoSucursal,
  porCategoria: ReadonlyMap<number, number>,
): EstadoConteoSucursal {
  if (porCategoria.size === 0) return estado;
  return {
    ...estado,
    items: estado.items.map((i) => {
      const n = porCategoria.get(i.categoriaId);
      if (!n || i.quedan == null) return i;
      return { ...i, quedan: redondear(i.quedan - n), vendido: redondear(i.vendido + n) };
    }),
  };
}
