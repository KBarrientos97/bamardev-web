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
}

export type Entrega = "RETIRO" | "DELIVERY";

export interface DatosPedido {
  nombre: string;
  entrega: Entrega;
  direccion: string;
  nota: string;
}

export function agregarLinea(lineas: LineaPedido[], item: ItemCatalogoPublico): LineaPedido[] {
  const ya = lineas.find((l) => l.id === item.id);
  if (ya) return lineas.map((l) => (l.id === item.id ? { ...l, cantidad: Math.min(MAX_CANTIDAD, l.cantidad + 1) } : l));
  if (lineas.length >= MAX_LINEAS) return lineas;
  return [...lineas, { id: item.id, titulo: item.titulo, precio: item.precio, desde: item.precioDesde, cantidad: 1 }];
}

export function cambiarCantidad(lineas: LineaPedido[], id: number, delta: number): LineaPedido[] {
  return lineas
    .map((l) => (l.id === id ? { ...l, cantidad: Math.min(MAX_CANTIDAD, l.cantidad + delta) } : l))
    .filter((l) => l.cantidad > 0);
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
      total += l.precio * l.cantidad;
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
export function ajustarASucursal(lineas: LineaPedido[], items: ItemCatalogoPublico[], todos: ItemCatalogoPublico[]): LineaPedido[] {
  const ahora = new Map(items.map((it) => [it.id, it]));
  const conocidos = new Set(todos.map((it) => it.id));
  return lineas
    .filter((l) => ahora.has(l.id) || !conocidos.has(l.id))
    .map((l) => {
      const it = ahora.get(l.id);
      return it ? { ...l, precio: it.precio, desde: it.precioDesde } : l;
    });
}

/**
 * El mensaje de WhatsApp, prolijo y fácil de leer para quien atiende. Con la
 * sucursal elegida en el catálogo, la dice: los precios son los de ella.
 */
export function mensajePedido(negocio: string, lineas: LineaPedido[], d: DatosPedido, sucursal?: string | null): string {
  const filas = lineas.map((l) => {
    const unitario = formatoPrecio(l.precio, l.desde);
    const sub = l.precio != null && !l.desde ? ` = ${formatoPrecio(l.precio * l.cantidad)}` : "";
    return `• ${l.cantidad} × ${l.titulo}${unitario ? ` (${unitario})${sub}` : " (precio a consultar)"}`;
  });
  const { total, aConfirmar } = totalPedido(lineas);
  const totalTexto = total > 0 ? `${formatoPrecio(total)}${aConfirmar ? " + lo que confirmen" : ""}` : "a confirmar";
  const entrega =
    d.entrega === "DELIVERY" ? `Delivery a: ${d.direccion.trim() || "(te paso la dirección)"}` : "Paso a recoger";
  const partes = [`Hola ${negocio}, quiero hacer este pedido:`, "", ...filas, "", `Total: ${totalTexto}`];
  if (sucursal) partes.push(`Sucursal: ${sucursal}`);
  partes.push(entrega);
  if (d.nombre.trim()) partes.push(`A nombre de: ${d.nombre.trim()}`);
  if (d.nota.trim()) partes.push(`Nota: ${d.nota.trim()}`);
  return partes.join("\n");
}
