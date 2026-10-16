import type { Cuota, Ref } from "./tipos";
import { fechaCorta, textoCubre } from "./formato";
import { fmtMoney } from "../format";

/**
 * Cómo se leen en pantalla las cuotas y las inscripciones, con las reglas de
 * la versión limpia (PLAN-ACADEMIAS §5 y §7): rojo sólo lo vencido, gris lo
 * normal. Aparte de los componentes para probarlo sin pantalla.
 */

/** Un renglón del estado de cuenta: rojo sólo lo vencido, gris lo demás. */
export function textoCuota(c: Cuota): { texto: string; urgente: boolean; apagado: boolean } {
  if (c.estado === "ANULADA") return { texto: "anulada", urgente: false, apagado: true };
  if (c.estado === "PAGADA") return { texto: `${fmtMoney(c.monto)} pagado`, urgente: false, apagado: false };
  if (c.vencida) {
    const falta = c.estado === "PARCIAL" ? `faltan ${fmtMoney(c.saldo)}` : fmtMoney(c.saldo);
    return { texto: `${falta} · vencida ${c.diasAtraso} d`, urgente: true, apagado: false };
  }
  if (c.estado === "PARCIAL") return { texto: `faltan ${fmtMoney(c.saldo)} · vence ${fechaCorta(c.vence)}`, urgente: false, apagado: true };
  return { texto: `${fmtMoney(c.saldo)} · vence ${fechaCorta(c.vence)}`, urgente: false, apagado: true };
}

/** "Cuota 2 · M2–M3": cómo se nombra una cuota en las listas. */
export function nombreCuota(c: Pick<Cuota, "concepto" | "numero" | "materiaOrdenes">): string {
  const cubre = c.materiaOrdenes.length ? ` · ${textoCubre(c.materiaOrdenes)}` : "";
  return `${c.concepto || `Cuota ${c.numero}`}${cubre}`;
}

/** Abre un `wa.me` en otra pestaña. */
export function abrirWhatsapp(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

/** Los estados de la inscripción como los lee la secretaría (PA §7). */
export function textoEstadoInscripcion(estado: string): { texto: string; tono: "ambar" | "normal" | "gris" | "verde" } {
  switch (estado) {
    case "OBSERVACION":
    case "EN_OBSERVACION":
      return { texto: "En observación", tono: "ambar" };
    case "RETIRADA":
      return { texto: "Retirado", tono: "gris" };
    case "CONCLUIDA":
      return { texto: "Concluido", tono: "verde" };
    case "PREINSCRITA":
      return { texto: "Preinscrito", tono: "gris" };
    case "DESCARTADA":
      return { texto: "Descartado", tono: "gris" };
    default:
      return { texto: "Activo", tono: "normal" };
  }
}

/**
 * A dónde lleva "Cobrar": el POS, que abre las cuotas de esa inscripción. La
 * sede del grupo va en la dirección para avisar si se cobra en otra caja (el
 * carrito de la inscripción no la trae).
 */
export function rutaCobroInscripcion(inscripcionId: number, sede?: string | Ref | null): string {
  const params = new URLSearchParams({ inscripcion: String(inscripcionId) });
  if (sede && typeof sede !== "string") {
    params.set("sede", String(sede.id));
    params.set("sedeNombre", sede.nombre);
  } else if (typeof sede === "string" && sede) {
    params.set("sedeNombre", sede);
  }
  return `/pos?${params.toString()}`;
}
