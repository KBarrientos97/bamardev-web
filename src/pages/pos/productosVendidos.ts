import { aCentavos, esCero } from "../../lib/dinero";
import { fmtCantidad, fmtMoney } from "../../lib/format";
import type { ReporteCierreProductos } from "../../types";

/**
 * Las cuentas de la lista de lo vendido (`ListaProductosVendidos`) antes de
 * dibujarla: qué es tiempo de mesa y qué es producto, qué precio se puede
 * mostrar y cómo se dice cada cantidad. La lista la usan el cierre de caja de
 * todos los rubros, Reportes › Cierres y la Supervisión del billar.
 */

type ItemVendido = ReporteCierreProductos["categorias"][number]["items"][number];

/** Un producto de la lista, listo para dibujar. */
export interface RenglonVendido {
  /** La key de la fila. */
  clave: string;
  nombre: string;
  cantidad: number;
  /** El precio por unidad si `cantidad × precio` da el total; null si se vendió a varios precios. */
  precio: number | null;
  total: number;
}

/** El tiempo de mesa cobrado en el turno (billar): un renglón por mesa cerrada. */
export interface TiempoDeMesa {
  mesas: number;
  total: number;
}

/** Las cantidades se guardan con 3 decimales (lo que se vende por peso), la plata con 2. */
export const redondearCantidad = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Saca el "Tiempo de mesa" de lo vendido (billar, 25-oct). El backend lo manda
 * como un producto más, marcado con `tiempoMesa` y dentro de su categoría y de
 * los totales (el APK lee esa forma y su total tiene que cerrar con el
 * arqueo). Así se leía "9 unidades · 4 productos" con dos de esas unidades
 * siendo mesas cobradas, en "Sin categoría" al lado de una cerveza, y con un
 * precio que era el promedio por mesa ("2 × Bs 25" por una mesa de Bs 10 y
 * otra de Bs 40).
 *
 * Devuelve lo vendido sin él (sus unidades, su total y sus productos
 * descontados; la categoría que queda vacía no se muestra) y el tiempo aparte.
 * Las categorías se vuelven a ordenar por total, el criterio del backend: la
 * que lo tenía estaba arriba por la plata del tiempo. Sin tiempo de mesa (los
 * demás rubros) devuelve lo mismo que recibió.
 */
export function separarTiempoDeMesa(d: ReporteCierreProductos): {
  tiempo: TiempoDeMesa | null;
  productos: ReporteCierreProductos;
} {
  let mesas = 0;
  let total = 0;
  let lineas = 0;
  const categorias: ReporteCierreProductos["categorias"] = [];
  for (const c of d.categorias) {
    const deTiempo = c.items.filter((i) => i.tiempoMesa);
    if (deTiempo.length === 0) {
      categorias.push(c);
      continue;
    }
    const cant = deTiempo.reduce((t, i) => t + i.cantidad, 0);
    const bs = deTiempo.reduce((t, i) => t + i.total, 0);
    mesas += cant;
    total += bs;
    lineas += deTiempo.length;
    const items = c.items.filter((i) => !i.tiempoMesa);
    if (items.length > 0) {
      categorias.push({ ...c, unidades: redondearCantidad(c.unidades - cant), total: aCentavos(c.total - bs), items });
    }
  }
  if (lineas === 0) return { tiempo: null, productos: d };
  return {
    tiempo: { mesas: redondearCantidad(mesas), total: aCentavos(total) },
    productos: {
      categorias: categorias.sort((a, b) => b.total - a.total),
      unidades: redondearCantidad(d.unidades - mesas),
      total: aCentavos(d.total - total),
      lineas: d.lineas - lineas,
    },
  };
}

/**
 * El precio por unidad que se puede escribir como "3 u × Bs 10,00". El del
 * backend es un promedio (total ÷ cantidad): si el producto se vendió a dos
 * precios en el turno (le cambiaron el precio, o una venta tuvo descuento),
 * "3 × Bs 9,33" daba Bs 27,99 contra un total de Bs 28,00. Si no multiplica
 * (con medio centavo de tolerancia) es null y la pantalla dice "varios precios".
 *
 * Con la marca del backend (`variosPrecios`) es null aunque multiplique: 1 a
 * Bs 10 y 1 a Bs 12 dan "2 u × Bs 11,00", un precio que no existió. La cuenta
 * queda para un backend anterior, que no la manda.
 */
export function precioQueMultiplica(i: Pick<ItemVendido, "cantidad" | "precio" | "total" | "variosPrecios">): number | null {
  if (i.variosPrecios) return null;
  return esCero(i.cantidad * i.precio - i.total) ? i.precio : null;
}

/** Un producto del backend como renglón. La key es el artículo: dos artículos distintos pueden llamarse igual. */
export function renglonVendido(i: ItemVendido, indice: number): RenglonVendido {
  return {
    clave: i.productoId != null ? `p${i.productoId}` : `${i.nombre}-${indice}`,
    nombre: i.nombre,
    cantidad: i.cantidad,
    precio: precioQueMultiplica(i),
    total: i.total,
  };
}

/** "1 unidad", "3 unidades", "0,5 unidades": sin ",00" (Kevin, 25-oct) y en singular sólo si es una. */
export function textoUnidades(n: number): string {
  const t = fmtCantidad(n);
  return `${t} ${t === "1" ? "unidad" : "unidades"}`;
}

/** "1 producto", "3 productos": productos distintos, no unidades. */
export function textoProductos(n: number): string {
  return `${fmtCantidad(n)} ${n === 1 ? "producto" : "productos"}`;
}

/** "1 mesa cobrada", "4 mesas cobradas". */
export function textoMesasCobradas(n: number): string {
  const t = fmtCantidad(n);
  return `${t} ${t === "1" ? "mesa cobrada" : "mesas cobradas"}`;
}

/** "3 u × Bs 10,00", o "3 u · varios precios" si no hay un precio que multiplique. */
export function textoCantidadPorPrecio(cantidad: number, precio: number | null): string {
  return precio == null ? `${fmtCantidad(cantidad)} u · varios precios` : `${fmtCantidad(cantidad)} u × ${fmtMoney(precio)}`;
}

/**
 * Cuántos renglones de cada grupo se ven con un tope: los primeros `limite` en
 * el orden en que vienen (lo que más salió, primero). Sin tope, o si sobra uno
 * solo, se ven todos: el botón para mostrarlo ocupa el mismo renglón.
 */
export function renglonesVisibles(porGrupo: number[], limite?: number): { visibles: number[]; ocultos: number } {
  const total = porGrupo.reduce((t, n) => t + n, 0);
  if (limite == null || total <= limite + 1) return { visibles: porGrupo, ocultos: 0 };
  let quedan = limite;
  const visibles = porGrupo.map((n) => {
    const v = Math.min(n, quedan);
    quedan -= v;
    return v;
  });
  return { visibles, ocultos: total - limite };
}
