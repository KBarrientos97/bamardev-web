import { request } from "../api";
import { BASE_API } from "../pagina/apiPagina";

/**
 * El asistente de la página, del lado del dueño (extra `asistente_pagina`):
 * preguntas frecuentes, lo que no entendió, los mensajes que le dejaron y el
 * uso del mes. Y del lado del visitante, "dejar un mensaje".
 */

export interface PreguntaAsistente {
  id: number;
  pregunta: string;
  palabrasClave: string;
  respuesta: string;
  orden: number;
}

export interface PreguntaAsistenteInput {
  pregunta: string;
  palabrasClave: string;
  respuesta: string;
}

export interface ConsultaSinRespuesta {
  id: number;
  texto: string;
  veces: number;
  ultimaVez: string;
}

export interface MensajeAsistente {
  id: number;
  nombre: string;
  telefono: string;
  mensaje: string;
  leido: boolean;
  creadoEn: string;
}

export interface UsoAsistente {
  conversaciones: number;
  mensajes: number;
  sinRespuesta: number;
  conHoras: number;
  mensajesDejados: number;
}

export interface ResumenAsistente {
  preguntas: PreguntaAsistente[];
  sinRespuesta: ConsultaSinRespuesta[];
  mensajes: MensajeAsistente[];
  noLeidos: number;
  uso: { mes: UsoAsistente; dias: (UsoAsistente & { fecha: string })[] };
}

const json = (cuerpo: unknown) => JSON.stringify(cuerpo);

export const apiAsistente = {
  resumen: () => request<ResumenAsistente>("/asistente"),
  crearPregunta: (p: PreguntaAsistenteInput) =>
    request<PreguntaAsistente>("/asistente/preguntas", { method: "POST", body: json(p) }),
  editarPregunta: (id: number, p: PreguntaAsistenteInput) =>
    request<PreguntaAsistente>(`/asistente/preguntas/${id}`, { method: "PATCH", body: json(p) }),
  borrarPregunta: (id: number) => request<void>(`/asistente/preguntas/${id}`, { method: "DELETE" }),
  descartarConsulta: (id: number) => request<void>(`/asistente/sin-respuesta/${id}/descartar`, { method: "POST" }),
  marcarLeido: (id: number) => request<void>(`/asistente/mensajes/${id}/leido`, { method: "POST" }),
  borrarMensaje: (id: number) => request<void>(`/asistente/mensajes/${id}`, { method: "DELETE" }),
};

/**
 * "Dejar un mensaje" desde el chat de la página pública: va directo al
 * backend (no por el servicio del chat), sin sesión, con captcha.
 */
export async function dejarMensaje(
  subdominio: string,
  datos: { nombre: string; telefono: string; mensaje: string; captcha?: string; sitioWeb?: string },
): Promise<void> {
  let r: Response;
  try {
    r = await fetch(`${BASE_API}/publico/pagina/${encodeURIComponent(subdominio)}/asistente/mensajes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(datos),
    });
  } catch {
    throw new Error("Sin conexión. Probá de nuevo.");
  }
  if (!r.ok) {
    const cuerpo = (await r.json().catch(() => ({}))) as { message?: string | string[] };
    const m = Array.isArray(cuerpo.message) ? cuerpo.message[0] : cuerpo.message;
    throw new Error(m ?? "No se pudo enviar el mensaje");
  }
}
