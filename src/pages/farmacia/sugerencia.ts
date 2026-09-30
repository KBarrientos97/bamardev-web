import type { ItemSugerencia, MotivoCompra } from "../../types";

/**
 * Lo que la pantalla de sugerencia de compra dice de cada artículo, y las
 * cuentas con lo que el dueño ajustó a mano. La sugerencia la calcula el
 * servidor; acá sólo se presenta y se suma.
 */

/** Sin laboratorio cargado: van juntos al final del pedido. */
export const SIN_LABORATORIO = "Sin laboratorio";

/** Cómo se anuncia el motivo: el color dice qué tan urgente es. */
export function textoMotivo(
  i: Pick<ItemSugerencia, "motivo" | "alcanzaDias">,
): { texto: string; tono: "rojo" | "amarillo" | "azul" | "gris" } {
  const porMotivo: Record<MotivoCompra, () => { texto: string; tono: "rojo" | "amarillo" | "azul" | "gris" }> = {
    AGOTADO: () => ({ texto: "Agotado", tono: "rojo" }),
    BAJO_MINIMO: () => ({ texto: "Bajo el mínimo", tono: "amarillo" }),
    SE_ACABA: () => ({
      texto:
        i.alcanzaDias == null
          ? "Se acaba"
          : i.alcanzaDias <= 1
            ? "Se acaba mañana"
            : `Alcanza ${i.alcanzaDias} días`,
      tono: "azul",
    }),
    ENCARGO: () => ({ texto: "Encargado", tono: "gris" }),
  };
  return porMotivo[i.motivo]();
}

/**
 * Lo que se va a pedir de cada artículo: lo sugerido, o lo que el dueño
 * escribió encima. Cero = no se pide.
 */
export function cantidadPedida(i: ItemSugerencia, ajustes: ReadonlyMap<number, number>): number {
  return ajustes.get(i.productoId) ?? i.sugerido;
}

/** Totales del pedido con los ajustes a mano. */
export function totalesPedido(items: ItemSugerencia[], ajustes: ReadonlyMap<number, number>) {
  let articulos = 0;
  let unidades = 0;
  let inversion = 0;
  for (const i of items) {
    const n = cantidadPedida(i, ajustes);
    if (n <= 0) continue;
    articulos += 1;
    unidades += n;
    inversion += n * i.costo;
  }
  return { articulos, unidades, inversion: Math.round(inversion * 100) / 100 };
}

/**
 * El pedido por laboratorio: en una farmacia se le pide a la droguería de cada
 * uno. Los grupos van por nombre, y los que no tienen laboratorio al final.
 * Dentro de cada grupo se respeta el orden de urgencia que trae el servidor.
 */
export function porLaboratorio(items: ItemSugerencia[]): { laboratorio: string; items: ItemSugerencia[] }[] {
  const grupos = new Map<string, ItemSugerencia[]>();
  for (const i of items) {
    const lab = i.laboratorio?.trim() || SIN_LABORATORIO;
    grupos.set(lab, [...(grupos.get(lab) ?? []), i]);
  }
  return [...grupos.entries()]
    .sort(([a], [b]) =>
      a === SIN_LABORATORIO ? 1 : b === SIN_LABORATORIO ? -1 : a.localeCompare(b, "es"),
    )
    .map(([laboratorio, items]) => ({ laboratorio, items }));
}
