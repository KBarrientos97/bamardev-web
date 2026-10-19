import type { Venta } from "../types";

/**
 * Ventas "a revisar": el backend las acepta igual (rechazarlas perdería una
 * venta que ya se cobró, casi siempre en un equipo sin señal), pero las marca
 * para que el dueño las mire. El código viaja tal cual; acá se traduce a lo
 * que pasó, en palabras de quien atiende el negocio.
 */
const TEXTO_MOTIVO: Record<string, string> = {
  PRECIO_NO_RECONOCIDO: "Precio que nunca existió en el catálogo",
  CUPO_EXCEDIDO: "Superó el cupo del plan",
  FIADO_SOBRE_LIMITE: "Fiado sobre el límite sin PIN",
  STOCK_NEGATIVO: "Dejó stock negativo",
};

/** Si la venta está marcada. Sin el campo (backend anterior) no lo está. */
export function requiereRevision(v: Pick<Venta, "requiereRevision">): boolean {
  return v.requiereRevision === true;
}

/**
 * Los motivos en texto humano. Un código que la web todavía no conoce se
 * muestra igual, crudo: es mejor un motivo feo que una marca sin porqué.
 */
export function motivosRevision(v: Pick<Venta, "motivosRevision">): string[] {
  return (v.motivosRevision ?? []).map((m) => TEXTO_MOTIVO[m] ?? m);
}
