import { fmtMoney } from "../format";
import type { AgregadoElegido, AgregadoInput, CatalogoAgregados, GrupoCatalogo } from "./tipos";

/**
 * La regla de precio de los agregados (PLAN-AGREGADOS §7.3), la MISMA del
 * backend (`src/agregados/regla.ts`): la hoja del POS tiene que mostrar lo que
 * el servidor va a cobrar, porque los pagos deben sumar exactamente su total.
 *
 * Por cada unidad del vaso, los primeros `incluidos` agregados que el cliente
 * tocó —en ese orden y contando las repeticiones— van gratis; el resto se
 * cobra a `precioExtra` del grupo o, si no tiene, al precio de cada opción.
 */

const redondear = (n: number) => Math.round(n * 100) / 100;

export interface EleccionDeAgregado {
  productoId: number;
  cantidad: number;
}

/** Una hija del vaso: un topping, o la parte incluida o la parte extra de uno. */
export interface HijaCalculada {
  productoId: number;
  /** Por UNIDAD del vaso (el backend la multiplica por la cantidad del vaso). */
  cantidad: number;
  /** Bs 0 si va dentro de lo incluido. */
  precio: number;
  subtotal: number;
  incluido: boolean;
}

/** Cuántos agregados trae una unidad del vaso: lo que el máximo acota y lo que cuenta «2 de 2 incluidos». */
export function totalPorUnidad(elecciones: EleccionDeAgregado[]): number {
  return elecciones.reduce((n, e) => n + e.cantidad, 0);
}

/** Reparte lo elegido entre incluido y extra. Una unidad del vaso; el llamador escala. */
export function repartirAgregados(p: {
  incluidos: number;
  precioExtra: number | null;
  elecciones: EleccionDeAgregado[];
  precioDe: (productoId: number) => number;
}): HijaCalculada[] {
  let restantes = Math.max(0, p.incluidos);
  const filas: HijaCalculada[] = [];
  // Una fila por (producto, tramo, precio): el mismo topping tocado dos veces
  // no parte la línea en dos, igual que en el servidor.
  const porClave = new Map<string, HijaCalculada>();
  const sumar = (productoId: number, cantidad: number, incluido: boolean, unitario: number) => {
    if (cantidad <= 0) return;
    const clave = `${productoId}|${incluido ? "i" : "e"}|${unitario}`;
    const previa = porClave.get(clave);
    if (previa) {
      previa.cantidad += cantidad;
      previa.subtotal = redondear(previa.precio * previa.cantidad);
      return;
    }
    const fila: HijaCalculada = {
      productoId,
      cantidad,
      precio: incluido ? 0 : unitario,
      subtotal: incluido ? 0 : redondear(unitario * cantidad),
      incluido,
    };
    porClave.set(clave, fila);
    filas.push(fila);
  };
  for (const e of p.elecciones) {
    const gratis = Math.min(e.cantidad, restantes);
    restantes -= gratis;
    sumar(e.productoId, gratis, true, 0);
    const extra = e.cantidad - gratis;
    if (extra > 0) sumar(e.productoId, extra, false, redondear(p.precioExtra != null ? p.precioExtra : p.precioDe(e.productoId)));
  }
  return filas;
}

/** Los incluidos que le tocan a un producto en un grupo (ya con el override de producto o categoría). */
export function incluidosDe(catalogo: CatalogoAgregados | null | undefined, productoId: number, grupoId: number): number | null {
  const p = catalogo?.productos.find((x) => x.productoId === productoId);
  const g = p?.grupos.find((x) => x.grupoId === grupoId);
  return g ? g.incluidos : null;
}

/** Los grupos que lleva un producto, con sus incluidos; vacío si no lleva (o el ajuste está apagado). */
export function gruposDelProducto(
  catalogo: CatalogoAgregados | null | undefined,
  productoId: number,
): { grupo: GrupoCatalogo; incluidos: number }[] {
  if (!catalogo?.activo) return [];
  const p = catalogo.productos.find((x) => x.productoId === productoId);
  if (!p) return [];
  const salida: { grupo: GrupoCatalogo; incluidos: number }[] = [];
  for (const g of p.grupos) {
    const grupo = catalogo.grupos.find((x) => x.id === g.grupoId);
    if (grupo) salida.push({ grupo, incluidos: g.incluidos });
  }
  return salida;
}

/** Lo que el POS sabe de las elecciones de UNA unidad del vaso. */
export interface VistaAgregados {
  /** Las hijas por unidad, con su nombre, en el orden del servidor. */
  hijas: (HijaCalculada & { nombre: string; grupoId: number })[];
  /** Cuánto suman los extras por UNIDAD del vaso. */
  extraPorUnidad: number;
}

/**
 * Calcula lo elegido contra el catálogo. Una elección de un grupo que el
 * catálogo ya no tiene (lo apagaron mientras la venta estaba armada) no suma
 * nada: el backend la rechazará al cobrar con su mensaje.
 */
export function vistaDeAgregados(
  elegidos: AgregadoElegido[] | undefined,
  productoId: number,
  catalogo: CatalogoAgregados | null | undefined,
): VistaAgregados {
  const vacia: VistaAgregados = { hijas: [], extraPorUnidad: 0 };
  if (!elegidos || elegidos.length === 0 || !catalogo) return vacia;
  const hijas: VistaAgregados["hijas"] = [];
  // Los grupos en el orden en que aparecen en lo elegido.
  const orden: number[] = [];
  for (const e of elegidos) if (!orden.includes(e.grupoId)) orden.push(e.grupoId);
  for (const grupoId of orden) {
    const grupo = catalogo.grupos.find((g) => g.id === grupoId);
    const incluidos = incluidosDe(catalogo, productoId, grupoId);
    if (!grupo || incluidos == null) continue;
    const nombre = new Map(grupo.opciones.map((o) => [o.productoId, o.nombre]));
    const precio = new Map(grupo.opciones.map((o) => [o.productoId, o.precio]));
    const filas = repartirAgregados({
      incluidos,
      precioExtra: grupo.precioExtra,
      elecciones: elegidos.filter((e) => e.grupoId === grupoId).map((e) => ({ productoId: e.productoId, cantidad: e.cantidad })),
      precioDe: (id) => precio.get(id) ?? 0,
    });
    for (const f of filas) hijas.push({ ...f, nombre: nombre.get(f.productoId) ?? `Artículo ${f.productoId}`, grupoId });
  }
  return { hijas, extraPorUnidad: redondear(hijas.reduce((s, h) => s + h.subtotal, 0)) };
}

/**
 * El arreglo `agregados` de una línea de venta o de pedido. Cada elección
 * viaja con el precio unitario del extra cuando lo hay: la cola sin señal lo
 * necesita (el servidor no tiene cómo saber lo que el equipo cobró), y fuera
 * de la cola es sólo informativo.
 */
export function agregadosParaEnviar(elegidos: AgregadoElegido[] | undefined, vista: VistaAgregados): AgregadoInput[] | undefined {
  if (!elegidos || elegidos.length === 0) return undefined;
  return elegidos.map((e) => {
    const extra = vista.hijas.find((h) => h.productoId === e.productoId && h.grupoId === e.grupoId && !h.incluido);
    return {
      productoId: e.productoId,
      cantidad: e.cantidad,
      grupoId: e.grupoId,
      ...(extra ? { precio: extra.precio } : {}),
    };
  });
}

/** Una firma estable de lo elegido: dos vasos con lo mismo comparten línea. */
export function firmaDeAgregados(elegidos: AgregadoElegido[] | undefined): string {
  if (!elegidos || elegidos.length === 0) return "";
  return elegidos.map((e) => `${e.grupoId}.${e.productoId}x${e.cantidad}`).join(",");
}

/**
 * «Incluye 2 toppings»: el rótulo de la tarjeta y de la hoja, con el nombre del
 * grupo en minúscula («Incluye 2 extras»). Con 1 incluido se singulariza lo que
 * termina en «s» para no leer «Incluye 1 toppings».
 */
export function textoIncluye(nombreGrupo: string, incluidos: number): string {
  const palabra = nombreGrupo.trim().toLowerCase() || "agregados";
  if (incluidos <= 0) return `Con ${palabra}`;
  const nombre = incluidos === 1 && palabra.endsWith("s") && palabra.length > 3 ? palabra.slice(0, -1) : palabra;
  return `Incluye ${incluidos} ${nombre}`;
}

/** «+ Oreo, Chubi, 2 × Canela (Bs 10,00)»: los toppings de un vaso en una línea de texto, para los diálogos. */
export function textoDeAgregados(vista: VistaAgregados | undefined): string | undefined {
  if (!vista || vista.hijas.length === 0) return undefined;
  return (
    "+ " +
    vista.hijas
      .map((h) => `${h.cantidad > 1 ? `${h.cantidad} × ` : ""}${h.nombre}${h.incluido ? "" : ` (${fmtMoney(h.subtotal)})`}`)
      .join(", ")
  );
}
