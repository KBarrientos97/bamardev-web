import type { Venta } from "../types";

/**
 * «No se pudo entregar» (20-nov, regla del dueño): el repartidor ya no cancela
 * pedidos. Si no puede entregar avisa con un motivo, el pedido queda «en
 * espera» y la caja decide: reintentar, pasárselo a otro o cancelarlo.
 *
 * Contrato (`POST /ventas/:id/no-entregado`): el motivo es uno de estos cuatro
 * códigos y la nota, opcional, de hasta 200 letras. «En espera» es
 * `entregaFallidaEn != null`; lo limpian «Reintentar» y «Reasignar».
 */
export const MOTIVOS_ENTREGA_FALLIDA = ["NO_CONTESTA", "DIRECCION", "RECHAZADO", "OTRO"] as const;
export type MotivoEntregaFallida = (typeof MOTIVOS_ENTREGA_FALLIDA)[number];

/** Lo mismo que el backend: más largo, lo rechaza con un 400. */
export const MAX_NOTA_ENTREGA_FALLIDA = 200;

/** Cómo lo lee el repartidor al elegir, y la caja al decidir. */
export const TEXTO_MOTIVO: Record<MotivoEntregaFallida, string> = {
  NO_CONTESTA: "No contesta",
  DIRECCION: "Dirección equivocada o no la encuentro",
  RECHAZADO: "El cliente lo rechazó",
  OTRO: "Otro",
};

/** ¿El pedido está esperando que la caja decida? */
export function enEspera(v: Pick<Venta, "estadoEntrega"> & { entregaFallidaEn?: string | null }): boolean {
  return v.estadoEntrega === "PENDIENTE" && !!v.entregaFallidaEn;
}

/** «No contesta», o el código tal cual si llega uno que esta versión no conoce. */
export function textoMotivo(m: string | null | undefined): string {
  if (!m) return "Sin motivo";
  return (TEXTO_MOTIVO as Record<string, string>)[m] ?? m;
}

/**
 * Lo que se manda: la nota sin espacios de más y, vacía, fuera del body. Con
 * «Otro» la nota es obligatoria: sin ella la caja no sabe qué pasó.
 */
export function cuerpoNoEntregado(
  motivo: MotivoEntregaFallida,
  nota: string,
): { ok: true; body: { motivo: MotivoEntregaFallida; nota?: string } } | { ok: false; error: string } {
  const limpia = nota.trim().replace(/\s+/g, " ");
  if (motivo === "OTRO" && !limpia) return { ok: false, error: "Contá qué pasó: con «Otro» la caja necesita saberlo." };
  if (limpia.length > MAX_NOTA_ENTREGA_FALLIDA) {
    return { ok: false, error: `La nota puede tener hasta ${MAX_NOTA_ENTREGA_FALLIDA} letras.` };
  }
  return { ok: true, body: limpia ? { motivo, nota: limpia } : { motivo } };
}
