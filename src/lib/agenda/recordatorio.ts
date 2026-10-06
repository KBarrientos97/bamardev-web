import { Telefono } from "../telefono";
import { fechaLarga, fechaNegocio, horaNegocio } from "./horaAgenda";
import type { Cita } from "./tiposAgenda";

/**
 * Avisarle al cliente sin integrar nada (PLAN-AGENDA-BELLEZA §9.2): un texto
 * armado que recepción copia, comparte o manda por `wa.me`. No hay API de
 * WhatsApp ni costo: el enlace abre la app con el mensaje escrito y la persona
 * decide si lo manda.
 *
 * El enlace de gestión y la dirección llegan con la reserva online (fase 2);
 * hasta entonces el texto lleva lo que la cita sabe.
 */
export function textoRecordatorio(
  cita: Cita,
  opc: { negocio?: string | null; sucursal?: string | null } = {},
): string {
  const nombre = cita.cliente.nombre.trim().split(/\s+/)[0] || cita.cliente.nombre;
  const servicios = [...new Set(cita.lineas.map((l) => l.servicio))].join(", ");
  const profesionales = [...new Set(cita.lineas.map((l) => l.recurso))].join(" y ");
  const donde = [opc.negocio, opc.sucursal].filter(Boolean).join(" · ");

  if (!cita.inicio) {
    return `Hola ${nombre}, ya estás en la lista de espera${donde ? ` de ${donde}` : ""}. Te avisamos cuando te toque.`;
  }
  const cuando = `el ${fechaLarga(fechaNegocio(cita.inicio))} a las ${horaNegocio(cita.inicio)}`;
  let frase = `Hola ${nombre}, te recordamos tu cita${donde ? ` en ${donde}` : ""} ${cuando}`;
  if (servicios) frase += `: ${servicios}${profesionales ? ` con ${profesionales}` : ""}`;
  // "con Carla R." ya termina en punto: no se le agrega otro.
  if (!frase.endsWith(".")) frase += ".";
  return `${frase} Si no podés venir, avisanos. ¡Te esperamos!`;
}

/**
 * `https://wa.me/591…?text=…`, o null si la cita no tiene teléfono (el
 * profesional sin permiso lo recibe en null): sin número sólo queda copiar.
 */
export function enlaceWhatsApp(telefono: string | null | undefined, texto: string): string | null {
  const numero = Telefono.paraWhatsApp(telefono);
  if (!numero) return null;
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

/** Copia al portapapeles; con el permiso negado cae al truco del textarea. */
export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch {
    // Sigue abajo: http sin TLS o el permiso negado.
  }
  try {
    const area = document.createElement("textarea");
    area.value = texto;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand?.("copy") ?? false;
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

/** ¿El navegador abre el menú de compartir del sistema? (casi sólo celulares). */
export function puedeCompartirTexto(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

/** Abre el menú de compartir. Cancelarlo no es un error. */
export async function compartirTexto(texto: string, titulo: string): Promise<boolean> {
  if (!puedeCompartirTexto()) return false;
  try {
    await navigator.share({ title: titulo, text: texto });
    return true;
  } catch {
    return false;
  }
}
