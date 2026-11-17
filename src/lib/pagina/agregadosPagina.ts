import { textoIncluye, vistaDeAgregados } from "../agregados/calculo";
import type { AgregadoElegido, CatalogoAgregados } from "../agregados/tipos";
import type { AgregadosPublicos } from "./tipos";

/**
 * Los toppings de la página del cliente (PLAN-AGREGADOS §8.3). La hoja, el
 * carrito y el pedido usan la MISMA regla de precio que el punto de venta
 * (`lib/agregados/calculo`, espejo de `regla.ts` del backend): lo que el
 * cliente ve es lo que el servidor va a cobrar.
 *
 * Para no duplicar esa regla, el JSON público se traduce a la forma del
 * catálogo del POS. Allá un producto se identifica por su `productoId`; acá, por
 * el `itemId` de la carta (la fila de «Mis productos» publicada), así que el
 * `itemId` ocupa el lugar del `productoId` en `productos`.
 */

/** Lo que el carrito guarda de cada topping de un vaso, para dibujarlo sin volver a calcular. */
export interface HijaDeLinea {
  nombre: string;
  /** Por UNIDAD del vaso. */
  cantidad: number;
  incluido: boolean;
  /** Por unidad del vaso: Bs 0 si va incluido. */
  subtotal: number;
}

/** El índice de sucursal que vale: uno que no existe (la página cambió) cae en la primera. */
const indiceValido = (a: AgregadosPublicos, indice: number): number => {
  const n = Math.max(0, ...a.grupos.flatMap((g) => g.opciones.map((o) => o.enSucursal?.length ?? 0)));
  return indice >= 0 && indice < n ? indice : 0;
};

/**
 * El catálogo de toppings con los precios de UNA sucursal. Una opción que esa
 * sucursal no ofrece (`disponible: false`) sale de la lista de precios pero se
 * reporta en `noOfrecidas`, para que la hoja la muestre deshabilitada.
 */
export function catalogoDePagina(
  a: AgregadosPublicos | null | undefined,
  sucursal: number,
): { catalogo: CatalogoAgregados; noOfrecidas: Set<number> } | null {
  if (!a || a.grupos.length === 0 || a.items.length === 0) return null;
  const i = indiceValido(a, sucursal);
  const noOfrecidas = new Set<number>();
  const catalogo: CatalogoAgregados = {
    activo: true,
    grupos: a.grupos.map((g) => ({
      id: g.id,
      nombre: g.nombre,
      incluidos: g.incluidos,
      precioExtra: g.precioExtra,
      maximo: g.maximo,
      opciones: g.opciones.map((o) => {
        const en = o.enSucursal?.[i];
        if (en && !en.disponible) noOfrecidas.add(o.productoId);
        return { productoId: o.productoId, nombre: o.nombre, precio: en ? (en.precio ?? 0) : (o.precio ?? 0), icono: o.icono ?? null, foto: o.foto ?? null };
      }),
    })),
    productos: a.items.map((x) => ({ productoId: x.itemId, grupos: x.grupos })),
  };
  return { catalogo, noOfrecidas };
}

/** ¿Este ítem de la carta lleva toppings? */
export function itemLlevaAgregados(a: AgregadosPublicos | null | undefined, itemId: number): boolean {
  return !!a && a.items.some((x) => x.itemId === itemId && x.grupos.some((g) => a.grupos.some((gr) => gr.id === g.grupoId)));
}

/**
 * «Incluye 2 toppings»: lo que dice la tarjeta del vaso. Con más de un grupo, uno
 * por grupo («Incluye 2 toppings · Incluye 1 salsa»). Null si el ítem no lleva.
 */
export function textoIncluyeDeItem(a: AgregadosPublicos | null | undefined, itemId: number): string | null {
  if (!a) return null;
  const x = a.items.find((i) => i.itemId === itemId);
  if (!x) return null;
  const partes: string[] = [];
  for (const g of x.grupos) {
    const grupo = a.grupos.find((gr) => gr.id === g.grupoId);
    if (grupo) partes.push(textoIncluye(grupo.nombre, g.incluidos));
  }
  return partes.length ? partes.join(" · ") : null;
}

/** Las hijas y el extra por unidad de lo elegido para un vaso, con los precios de la sucursal. */
export function vistaDeLinea(
  elegidos: AgregadoElegido[] | undefined,
  itemId: number,
  catalogo: CatalogoAgregados | null | undefined,
): { hijas: HijaDeLinea[]; extra: number } {
  const v = vistaDeAgregados(elegidos, itemId, catalogo);
  return {
    hijas: v.hijas.map((h) => ({ nombre: h.nombre, cantidad: h.cantidad, incluido: h.incluido, subtotal: h.subtotal })),
    extra: v.extraPorUnidad,
  };
}
