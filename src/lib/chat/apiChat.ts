import { BASE_API } from "../pagina/apiPagina";

/**
 * El asistente de la página (repo `Bamardev/bamardev-chat`, IDEAS/3b). Es un
 * servicio aparte, sin base de datos, publicado al lado del API:
 * `https://api-qa.bamardev.com/api` → `https://api-qa.bamardev.com/chat`.
 * En desarrollo, `/api` → `/chat` (lo reenvía el proxy de Vite).
 */
export function baseChat(): string {
  return `${BASE_API.replace(/\/api\/?$/, "")}/chat`;
}

/** Lo que responde el chat: bloques que la pantalla pinta, nunca HTML. */
export type BloqueChat =
  | { tipo: "texto"; texto: string }
  | {
      tipo: "items";
      items: { nombre: string; precio: string | null; duracion: string | null; reservable: boolean }[];
    }
  | {
      tipo: "horas";
      servicio: string;
      sucursal: string;
      fecha: string;
      etiquetaFecha: string;
      horas: string[];
      reservarUrl: string;
    }
  | { tipo: "ubicacion"; nombre: string; direccion: string | null; mapaUrl: string | null }
  | { tipo: "enlace"; etiqueta: string; url: string }
  | { tipo: "opciones"; opciones: string[] };

export interface RespuestaChat {
  sesionId: string;
  bloques: BloqueChat[];
}

export class ErrorChat extends Error {
  readonly estado: number;
  /** El servicio pide captcha (sesión nueva o vencida). */
  readonly captcha: boolean;

  constructor(estado: number, captcha: boolean, mensaje: string) {
    super(mensaje);
    this.estado = estado;
    this.captcha = captcha;
  }
}

/**
 * ¿Está andando el servicio? La burbuja sólo aparece si responde: con el chat
 * apagado o sin desplegar, la página queda exactamente como antes.
 */
export async function chatDisponible(): Promise<boolean> {
  try {
    const r = await fetch(`${baseChat()}/salud`);
    return r.ok;
  } catch {
    return false;
  }
}

export async function enviarMensaje(
  subdominio: string,
  cuerpo: { sesionId?: string; texto?: string; captcha?: string },
): Promise<RespuestaChat> {
  let r: Response;
  try {
    r = await fetch(`${baseChat()}/${encodeURIComponent(subdominio)}/mensajes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
  } catch {
    throw new ErrorChat(0, false, "Sin conexión");
  }
  const datos = (await r.json().catch(() => ({}))) as Partial<RespuestaChat> & {
    mensaje?: string;
    captcha?: boolean;
  };
  // El tope de la conversación viene con bloques (cómo seguir por WhatsApp).
  if (r.status === 429 && datos.bloques && datos.sesionId) return datos as RespuestaChat;
  if (!r.ok || !datos.bloques || !datos.sesionId) {
    throw new ErrorChat(r.status, !!datos.captcha, datos.mensaje ?? "El asistente no respondió");
  }
  return datos as RespuestaChat;
}

/**
 * Los enlaces vienen del servicio, pero algunos los cargó el dueño (mapa,
 * WhatsApp): sólo se pintan como enlace si son http(s) o tel:.
 */
export function urlSegura(url: string): boolean {
  return /^(https?:\/\/|tel:)/i.test(url.trim());
}
