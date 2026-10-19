import type { Cuota, EstadoPagoModulo, EstadoPlanilla, EventoInscripcion, FormaPago, Ref } from "./tipos";
import { fechaCorta, textoCubre } from "./formato";
import { ApiError } from "../api";
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
export function rutaCobroInscripcion(inscripcionId: number, sede?: string | Ref | null, monto?: number): string {
  const params = new URLSearchParams({ inscripcion: String(inscripcionId) });
  if (monto != null && monto > 0) params.set("monto", String(monto));
  if (sede && typeof sede !== "string") {
    params.set("sede", String(sede.id));
    params.set("sedeNombre", sede.nombre);
  } else if (typeof sede === "string" && sede) {
    params.set("sedeNombre", sede);
  }
  return `/pos?${params.toString()}`;
}

/**
 * Lo único de plata que ve el docente (D6): si el estudiante pagó el módulo
 * actual. Rojo sólo "Sin pagar", que es lo que pide atención.
 */
export function textoEstadoPago(estado: EstadoPagoModulo | null | undefined): { texto: string; tono: "normal" | "ambar" | "rojo" | "gris" } {
  switch (estado) {
    case "PAGADO":
      return { texto: "Pagado", tono: "normal" };
    case "ABONO":
      return { texto: "Abonó", tono: "ambar" };
    case "SIN_PAGAR":
      return { texto: "Sin pagar", tono: "rojo" };
    default:
      return { texto: "—", tono: "gris" };
  }
}

/** "Mes a mes", "Pago completo", o el nombre del plan a medida. */
export function textoFormaPago(forma: FormaPago | null | undefined, plan?: string | null): string {
  if (forma === "MES_A_MES") return "Mes a mes";
  if (forma === "COMPLETO") return "Pago completo";
  return plan ?? "—";
}

/** Cómo se dice el estado de una planilla. */
export const TEXTO_ESTADO_PLANILLA: Record<EstadoPlanilla, string> = {
  EN_CURSO: "en curso",
  CERRADA: "cerrada",
  PAGADA: "pagada",
};

/**
 * Lo que se cuenta de una retención: el monto si el instituto la confirmó
 * (D9: hoy está apagada) o "por confirmar".
 */
export function textoRetencion(activa: boolean, monto: number | null): string {
  return activa && monto != null ? `− ${fmtMoney(monto)}` : "por confirmar";
}

// ── Historial de la ficha ───────────────────────────────────────────────────

const TITULO_EVENTO: Record<string, string> = {
  INSCRIBIR: "Inscripción",
  CONVERSION: "Inscripción online confirmada",
  PREINSCRIBIR: "Inscripción online",
  BECA: "Beca",
  PROMO: "Promoción",
  RETIRO: "Retiro",
  DESCARTE: "Inscripción online descartada",
  CAMBIO_GRUPO: "Cambio de grupo",
  CAMBIO_PLAN: "Cambio de forma de pago",
  NOTA: "Nota corregida",
};

const num = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);
const txt = (x: unknown): string | null => (typeof x === "string" && x.trim() ? x.trim() : null);
const cantidad = (x: unknown, una: string, varias: string): string | null =>
  Array.isArray(x) && x.length ? `${x.length} ${x.length === 1 ? una : varias}` : null;

/**
 * Un evento del historial en palabras: "Beca 50 % · rendimiento". El
 * `detalle` es el JSON que guardó el backend y cambia con la acción; antes
 * se pintaba tal cual y salía "[object Object]" (QA ronda 2, B-17). Lo que no
 * se conoce se lee igual, clave por clave, sin los ids (que no le dicen nada
 * a nadie). Los montos vienen sólo si el backend los manda a ese usuario.
 */
export function textoEvento(e: Pick<EventoInscripcion, "accion" | "detalle">): { titulo: string; detalle: string } {
  const d = e.detalle;
  const o = d && typeof d === "object" && !Array.isArray(d) ? (d as Record<string, unknown>) : null;
  // Una acción nueva que todavía no está en la tabla: "CAMBIO_SEDE" → "Cambio sede".
  let titulo =
    TITULO_EVENTO[e.accion] ??
    (/^[A-Z_]+$/.test(e.accion) ? e.accion.charAt(0) + e.accion.slice(1).toLowerCase().replace(/_/g, " ") : e.accion);
  if (typeof d === "string" || typeof d === "number") return { titulo, detalle: String(d) };
  if (!o) return { titulo, detalle: "" };

  const partes: (string | null)[] = [];
  switch (e.accion) {
    case "INSCRIBIR":
    case "CONVERSION": {
      const total = num(o.total);
      const lista = num(o.precioLista);
      if (total != null) partes.push(`total ${fmtMoney(total)}`);
      if (lista != null && total != null && lista > total) partes.push(`precio de lista ${fmtMoney(lista)}`);
      break;
    }
    case "PREINSCRIBIR": {
      const fotos = Array.isArray(o.fotos) ? o.fotos.length : null;
      if (o.origen === "ONLINE") partes.push("desde la página");
      if (num(o.edad) != null) partes.push(`${num(o.edad)} años`);
      if (fotos != null) partes.push(fotos === 0 ? "sin fotos" : fotos === 3 ? "con las 3 fotos" : `con ${fotos} de 3 fotos`);
      break;
    }
    case "BECA":
    case "PROMO": {
      const pct = num(o.pct);
      const monto = num(o.monto);
      if (pct != null) titulo = `${titulo} ${String(pct).replace(".", ",")} %`;
      if (monto != null) partes.push(`− ${fmtMoney(monto)}`);
      partes.push(txt(o.motivo));
      break;
    }
    case "RETIRO":
    case "DESCARTE":
      partes.push(txt(o.motivo), cantidad(o.cuotasAnuladas, "cuota anulada", "cuotas anuladas"));
      break;
    case "CAMBIO_PLAN": {
      const total = num(o.totalNuevo);
      if (total != null) partes.push(`total nuevo ${fmtMoney(total)}`);
      partes.push(cantidad(o.cuotasAnuladas, "cuota anulada", "cuotas anuladas"));
      break;
    }
    case "CAMBIO_GRUPO":
      break;
    case "NOTA":
      if (o.reabierta) {
        titulo = "Notas reabiertas";
        partes.push(txt(o.motivo));
      } else {
        const antes = num(o.anterior);
        const ahora = num(o.nueva);
        if (antes != null || ahora != null) partes.push(`de ${antes ?? "—"} a ${ahora ?? "sin nota"}`);
      }
      break;
    default:
      for (const [k, v] of Object.entries(o)) {
        if (/id$/i.test(k) || v == null || typeof v === "object") continue;
        partes.push(typeof v === "boolean" ? (v ? k : null) : `${k} ${v}`);
      }
  }
  return { titulo, detalle: partes.filter(Boolean).join(" · ") };
}

export type FueraDeAlcance = "OTRA_SEDE" | "NO_EXISTE";

/**
 * Un rechazo por alcance (QA ronda 2, N-3; contrato #36 y #44): la recepción
 * pidió algo de otra sede (403 `OTRA_SEDE`) o el docente, algo que no es de
 * sus grupos (404, como si no existiera). Reintentar no cambia nada: la
 * pantalla dice qué pasa y ofrece volver. `SIN_CLASE` es otro 404 que no es
 * de alcance ("ese día no toca") y lo maneja la lista.
 */
export function fueraDeAlcance(e: unknown): FueraDeAlcance | null {
  if (!(e instanceof ApiError)) return null;
  if (e.status === 403 && e.codigo === "OTRA_SEDE") return "OTRA_SEDE";
  if (e.status === 404 && e.codigo !== "SIN_CLASE") return "NO_EXISTE";
  return null;
}
