/**
 * Los toppings de una venta o de un pedido de plataforma llegan como líneas
 * HIJAS del vaso (`lineaPadreId`, PLAN-AGREGADOS §7.3): son líneas como
 * cualquier otra para el stock y los reportes, pero el recibo, la comanda y el
 * historial las dibujan debajo de su vaso. Esto las agrupa.
 */

/** Lo mínimo que hace falta de una línea para agruparla. */
export interface LineaConPadre {
  /** Ausente en un recibo local de la cola sin señal (todavía no tiene id). */
  id?: number | null;
  lineaPadreId?: number | null;
  incluido?: boolean;
}

export interface LineaConHijas<L> {
  linea: L;
  /** Vacío en una línea sin toppings. */
  hijas: L[];
}

/**
 * Cada vaso con sus hijas, en el orden de las líneas. Una hija cuyo padre no
 * está en la lista (no debería pasar) se dibuja como línea suelta: perder un
 * renglón de un recibo es peor que mostrarlo mal ubicado.
 */
export function agruparHijas<L extends LineaConPadre>(lineas: L[]): LineaConHijas<L>[] {
  const ids = new Set(lineas.map((l) => l.id).filter((id): id is number => id != null));
  const hijasDe = new Map<number, L[]>();
  const raices: L[] = [];
  for (const l of lineas) {
    if (l.lineaPadreId != null && ids.has(l.lineaPadreId)) {
      const lista = hijasDe.get(l.lineaPadreId) ?? [];
      lista.push(l);
      hijasDe.set(l.lineaPadreId, lista);
    } else {
      raices.push(l);
    }
  }
  return raices.map((linea) => ({ linea, hijas: linea.id != null ? (hijasDe.get(linea.id) ?? []) : [] }));
}

/** ¿Alguna línea es hija de otra? Modificar una venta así lo rechaza el backend. */
export function tieneHijas(lineas: LineaConPadre[] | undefined): boolean {
  return (lineas ?? []).some((l) => l.lineaPadreId != null);
}
