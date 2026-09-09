/**
 * El pedido que el mesero arma antes de mandarlo a cocina.
 *
 * Es otro carrito que el del POS y no se comparte a propósito: acá cada línea
 * lleva su propio id y **no se identifica por producto**, porque el mismo
 * plato puede ir dos veces con indicaciones distintas ("una sin sal y otra
 * normal"), y agruparlas por producto obligaría a la cocina a adivinar cuál es
 * cuál.
 */

export interface LineaPedido {
  /** Id de la línea, no del producto: ver el comentario del módulo. */
  id: number;
  productoId: number;
  nombre: string;
  precio: number;
  cantidad: number;
  /** Indicación para cocina: "sin cebolla". */
  nota?: string;
}

/**
 * Las indicaciones que se repiten en cualquier cocina.
 *
 * Están acá y no en el componente para que el mismo juego sirva en el carrito
 * y en cualquier pantalla futura. El dueño todavía no las configura.
 */
export const INDICACIONES = [
  "Sin cebolla",
  "Sin sal",
  "Sin picante",
  "Para llevar",
  "Poco cocido",
  "Bien cocido",
  "Aderezo aparte",
  "Sin hielo",
] as const;

export function totalPedido(lineas: LineaPedido[]): number {
  return lineas.reduce((a, l) => a + l.precio * l.cantidad, 0);
}

export function cantidadPedido(lineas: LineaPedido[]): number {
  return lineas.reduce((a, l) => a + l.cantidad, 0);
}

/** Cuánto hay de un producto sumando TODAS sus líneas. */
export function cantidadDeProducto(lineas: LineaPedido[], productoId: number): number {
  return lineas
    .filter((l) => l.productoId === productoId)
    .reduce((a, l) => a + l.cantidad, 0);
}

/**
 * Suma uno de un producto.
 *
 * Si ya hay una línea de ese producto **sin nota**, suma ahí: tocar tres veces
 * "Coca-Cola" tiene que dar "3× Coca-Cola" y no tres renglones iguales en la
 * comanda. Las líneas con indicación nunca se tocan — esa nota es de esa
 * unidad concreta.
 */
export function agregar(
  lineas: LineaPedido[],
  producto: { id: number; nombre: string; precio: number },
  siguienteId: number,
): LineaPedido[] {
  const i = lineas.findIndex((l) => l.productoId === producto.id && !l.nota);
  if (i >= 0) {
    const copia = [...lineas];
    copia[i] = { ...copia[i], cantidad: copia[i].cantidad + 1 };
    return copia;
  }
  return [
    ...lineas,
    {
      id: siguienteId,
      productoId: producto.id,
      nombre: producto.nombre,
      precio: producto.precio,
      cantidad: 1,
    },
  ];
}

/**
 * Resta uno de un producto desde la grilla.
 *
 * Descuenta primero de la línea SIN nota, y después de la última con nota
 * hacia atrás: las que llevan nota son de una unidad concreta ("sin cebolla")
 * y borrar esa antes que la genérica sería tirar el dato que costó anotar.
 */
export function quitarUno(lineas: LineaPedido[], productoId: number): LineaPedido[] {
  const sinNota = lineas.findIndex((l) => l.productoId === productoId && !l.nota);
  let i = sinNota;
  if (i < 0) {
    for (let k = lineas.length - 1; k >= 0; k--) {
      if (lineas[k].productoId === productoId) {
        i = k;
        break;
      }
    }
  }
  if (i < 0) return lineas;
  const linea = lineas[i];
  if (linea.cantidad <= 1) return lineas.filter((_, k) => k !== i);
  const copia = [...lineas];
  copia[i] = { ...linea, cantidad: linea.cantidad - 1 };
  return copia;
}

/** Cambia la cantidad de UNA línea. En cero, la línea desaparece. */
export function setCantidadLinea(
  lineas: LineaPedido[],
  id: number,
  cantidad: number,
): LineaPedido[] {
  if (cantidad <= 0) return lineas.filter((l) => l.id !== id);
  return lineas.map((l) => (l.id === id ? { ...l, cantidad } : l));
}

/**
 * Pone o saca la indicación de una línea.
 *
 * Pasar la misma que ya tenía la quita: es el gesto que espera cualquiera
 * cuando se equivocó de chip.
 */
export function setNotaLinea(
  lineas: LineaPedido[],
  id: number,
  nota: string,
): LineaPedido[] {
  return lineas.map((l) => {
    if (l.id !== id) return l;
    const limpia = nota.trim();
    if (!limpia || l.nota === limpia) return { ...l, nota: undefined };
    return { ...l, nota: limpia };
  });
}

/** Lo que viaja al backend al mandar la comanda. */
export function aItemsDeComanda(lineas: LineaPedido[]) {
  return lineas.map((l) => ({
    productoId: l.productoId,
    cantidad: l.cantidad,
    ...(l.nota ? { nota: l.nota } : {}),
  }));
}
