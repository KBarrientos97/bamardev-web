import { firmaDeAgregados } from "../agregados/calculo";
import type { AgregadoElegido, CatalogoAgregados } from "../agregados/tipos";
import { vistaDeLinea, type HijaDeLinea } from "./agregadosPagina";
import { formatoPrecio } from "./catalogo";
import type { ItemCatalogoPublico } from "./tipos";

/**
 * "Pedí por WhatsApp" (IDEAS/6 #1): el cliente suma ítems del catálogo y la
 * página le arma el mensaje con el detalle y el total, para que el negocio no
 * tenga que copiar nada. No hay pedido en el backend: el negocio lo recibe
 * por su WhatsApp de siempre y lo carga en el POS.
 */

export const MAX_LINEAS = 30;
export const MAX_CANTIDAD = 99;

export interface LineaPedido {
  id: number;
  titulo: string;
  precio: number | null;
  /** "desde Bs X": el total queda "a confirmar". */
  desde: boolean;
  cantidad: number;
  /** Para la miniatura del carrito; opcionales porque un pedido viejo guardado no los trae. */
  fotoUrl?: string | null;
  /** La foto no tiene fondo: va entera sobre el tinte. Ausente (o un pedido viejo) = con fondo. */
  fotoSinFondo?: boolean;
  icono?: string | null;
  /** Un servicio (un corte): va una sola vez, sin cantidad. */
  servicio?: boolean;
  /**
   * Los toppings que el cliente eligió para UNA unidad del vaso, en el orden en
   * que los tocó (PLAN-AGREGADOS §8.3). Dos vasos con toppings distintos son dos
   * líneas: la identidad de la línea es `claveLinea`.
   */
  agregados?: AgregadoElegido[];
  /** Esos toppings ya repartidos entre incluidos y extras, para dibujarlos. */
  hijas?: HijaDeLinea[];
  /** Cuánto suman los extras por UNIDAD del vaso (Bs). */
  extra?: number;
}

/**
 * Lo que distingue una línea de otra: el ítem y, con toppings, cuáles. El mismo
 * ítem sin toppings sigue siendo `String(id)`, así que nada de lo anterior cambia.
 */
export function claveLinea(l: Pick<LineaPedido, "id" | "agregados">): string {
  const firma = firmaDeAgregados(l.agregados);
  return firma ? `${l.id}|${firma}` : String(l.id);
}

/** El precio de UNA unidad del vaso con sus extras (null si el vaso no tiene precio). */
export function precioConExtras(l: LineaPedido): number | null {
  return l.precio == null ? null : Math.round((l.precio + (l.extra ?? 0)) * 100) / 100;
}

/** Lo elegido en la hoja y el catálogo con que se calculó (los precios son los de la sucursal). */
export interface ToppingsElegidos {
  elegidos: AgregadoElegido[];
  catalogo: CatalogoAgregados | null;
}

export type Entrega = "RETIRO" | "DELIVERY";

export interface DatosPedido {
  nombre: string;
  entrega: Entrega;
  direccion: string;
  nota: string;
}

/**
 * Suma un ítem al pedido. Con toppings, la línea es la de ESE vaso con ESOS
 * toppings: otro vaso con otros toppings es otra línea; con los mismos, suma
 * cantidad. El límite de líneas cuenta sólo los vasos.
 */
export function agregarLinea(lineas: LineaPedido[], item: ItemCatalogoPublico, toppings?: ToppingsElegidos): LineaPedido[] {
  const elegidos = toppings && toppings.elegidos.length > 0 ? toppings.elegidos : undefined;
  const clave = claveLinea({ id: item.id, agregados: elegidos });
  const ya = lineas.find((l) => claveLinea(l) === clave);
  // Un servicio no se pide de a tres: ya está, queda como está.
  if (ya && (ya.servicio || item.servicioId != null)) return lineas;
  if (ya) return lineas.map((l) => (claveLinea(l) === clave ? { ...l, cantidad: Math.min(MAX_CANTIDAD, l.cantidad + 1) } : l));
  if (lineas.length >= MAX_LINEAS) return lineas;
  const vista = elegidos && toppings ? vistaDeLinea(elegidos, item.id, toppings.catalogo) : null;
  return [
    ...lineas,
    {
      id: item.id,
      ...(elegidos && vista ? { agregados: elegidos, hijas: vista.hijas, extra: vista.extra } : {}),
      titulo: item.titulo,
      precio: item.precio,
      desde: item.precioDesde,
      cantidad: 1,
      fotoUrl: item.fotoUrl,
      ...(item.fotoUrl && item.fotoSinFondo ? { fotoSinFondo: true } : {}),
      icono: item.icono ?? null,
      ...(item.servicioId != null ? { servicio: true } : {}),
    },
  ];
}

/** Cuántos de ese ítem lleva el pedido (0 si no está). */
export function cantidadDe(lineas: LineaPedido[], id: number): number {
  return lineas.find((l) => l.id === id)?.cantidad ?? 0;
}

/** El subtotal de la línea, si se puede calcular (con precio fijo): el vaso más sus extras, por la cantidad. */
export function subtotalLinea(l: LineaPedido): number | null {
  return l.precio != null && !l.desde ? Math.round((l.precio + (l.extra ?? 0)) * l.cantidad * 100) / 100 : null;
}

/** `ref` es la clave de la línea (`claveLinea`) o, para una sin toppings, el id del ítem. */
export function cambiarCantidad(lineas: LineaPedido[], ref: number | string, delta: number): LineaPedido[] {
  const clave = String(ref);
  return lineas
    .map((l) => (claveLinea(l) === clave ? { ...l, cantidad: Math.min(l.servicio ? 1 : MAX_CANTIDAD, l.cantidad + delta) } : l))
    .filter((l) => l.cantidad > 0);
}

/**
 * Cambia los toppings de una línea (tocarla en el carrito reabre la hoja). Si
 * quedan iguales a los de otra línea del mismo vaso, las dos se juntan en una
 * con la suma de cantidades.
 */
export function cambiarAgregados(lineas: LineaPedido[], ref: string, toppings: ToppingsElegidos): LineaPedido[] {
  const actual = lineas.find((l) => claveLinea(l) === ref);
  if (!actual) return lineas;
  const elegidos = toppings.elegidos.length > 0 ? toppings.elegidos : undefined;
  const vista = elegidos ? vistaDeLinea(elegidos, actual.id, toppings.catalogo) : null;
  const { agregados: _a, hijas: _h, extra: _e, ...base } = actual;
  const nueva: LineaPedido = { ...base, ...(elegidos && vista ? { agregados: elegidos, hijas: vista.hijas, extra: vista.extra } : {}) };
  const claveNueva = claveLinea(nueva);
  const gemela = lineas.find((l) => l !== actual && claveLinea(l) === claveNueva);
  return lineas.flatMap((l) => {
    if (l === actual) return gemela ? [] : [nueva];
    if (l === gemela) return [{ ...l, cantidad: Math.min(MAX_CANTIDAD, l.cantidad + actual.cantidad) }];
    return [l];
  });
}

export function cantidadTotal(lineas: LineaPedido[]): number {
  return lineas.reduce((n, l) => n + l.cantidad, 0);
}

/** El total con precio; `aConfirmar` si algún ítem no tiene precio o es "desde". */
export function totalPedido(lineas: LineaPedido[]): { total: number; aConfirmar: boolean } {
  let total = 0;
  let aConfirmar = false;
  for (const l of lineas) {
    if (l.precio == null) aConfirmar = true;
    else {
      total += (l.precio + (l.extra ?? 0)) * l.cantidad;
      if (l.desde) aConfirmar = true;
    }
  }
  return { total: Math.round(total * 100) / 100, aConfirmar };
}

/**
 * Al cambiar de sucursal (13-oct): cada línea toma el precio de esa sucursal,
 * y lo que ahí no se ofrece sale del pedido. Lo que no está en el catálogo
 * (una línea vieja de otra visita) se deja como estaba.
 */
export function ajustarASucursal(
  lineas: LineaPedido[],
  items: ItemCatalogoPublico[],
  todos: ItemCatalogoPublico[],
  /** Los toppings con los precios de la sucursal nueva: los extras se recalculan. */
  catalogoAgregados?: CatalogoAgregados | null,
): LineaPedido[] {
  const ahora = new Map(items.map((it) => [it.id, it]));
  const conocidos = new Set(todos.map((it) => it.id));
  return lineas
    .filter((l) => ahora.has(l.id) || !conocidos.has(l.id))
    .map((l) => {
      const it = ahora.get(l.id);
      if (!it) return l;
      const nueva = { ...l, precio: it.precio, desde: it.precioDesde };
      if (!l.agregados?.length || !catalogoAgregados) return nueva;
      const vista = vistaDeLinea(l.agregados, l.id, catalogoAgregados);
      return { ...nueva, hijas: vista.hijas, extra: vista.extra };
    });
}

/**
 * Lo que dice el aviso cuando, al cambiar de local, salen productos del pedido:
 * los nombra (antes decía «Sacamos 1 producto» y el cliente no sabía cuál). Sin
 * nada que decir, null.
 */
export function avisoDeQuitados(antes: LineaPedido[], ahora: LineaPedido[]): string | null {
  const quedan = new Set(ahora.map((l) => l.id));
  const fuera = antes.filter((l) => !quedan.has(l.id)).map((l) => l.titulo);
  if (!fuera.length) return null;
  const lista = fuera.length === 1 ? `«${fuera[0]}»` : `${fuera.slice(0, -1).map((t) => `«${t}»`).join(", ")} y «${fuera[fuera.length - 1]}»`;
  return fuera.length === 1 ? `Sacamos ${lista} porque ese local no lo ofrece.` : `Sacamos ${lista} porque ese local no los ofrece.`;
}

/**
 * El mensaje de WhatsApp, prolijo y fácil de leer para quien atiende. Con la
 * sucursal elegida en el catálogo, la dice: los precios son los de ella.
 * `etiqueta` es como la llama el rubro: «Sede» en el instituto (Lista 2 #9).
 */
export function mensajePedido(
  negocio: string,
  lineas: LineaPedido[],
  d: DatosPedido,
  sucursal?: string | null,
  etiqueta = "Sucursal",
): string {
  const filas = lineas.map((l) => {
    const unitario = formatoPrecio(precioConExtras(l), l.desde);
    const sub = l.precio != null && !l.desde ? ` = ${formatoPrecio(subtotalLinea(l))}` : "";
    const principal = `• ${l.cantidad} × ${l.titulo}${unitario ? ` (${unitario})${sub}` : " (precio a consultar)"}`;
    // Los toppings, una línea debajo del vaso: «+ Oreo, 2 × Chubi (extra)».
    const toppings = (l.hijas ?? []).map((h) => `${h.cantidad > 1 ? `${h.cantidad} × ` : ""}${h.nombre}${h.incluido ? "" : " (extra)"}`);
    return toppings.length ? `${principal}\n   + ${toppings.join(", ")}` : principal;
  });
  const { total, aConfirmar } = totalPedido(lineas);
  const totalTexto = total > 0 ? `${formatoPrecio(total)}${aConfirmar ? " + lo que confirmen" : ""}` : "a confirmar";
  const entrega =
    d.entrega === "DELIVERY" ? `Delivery a: ${d.direccion.trim() || "(te paso la dirección)"}` : "Paso a recoger";
  const partes = [`Hola ${negocio}, quiero hacer este pedido:`, "", ...filas, "", `Total: ${totalTexto}`];
  if (sucursal) partes.push(`${etiqueta}: ${sucursal}`);
  partes.push(entrega);
  if (d.nombre.trim()) partes.push(`A nombre de: ${d.nombre.trim()}`);
  if (d.nota.trim()) partes.push(`Nota: ${d.nota.trim()}`);
  return partes.join("\n");
}
