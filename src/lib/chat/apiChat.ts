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
      /** Cada hora lleva a la reserva con el servicio y la hora ya elegidos. */
      horas: { hora: string; url: string }[];
      /** La reserva con el servicio elegido, para ver el resto de los horarios. */
      masUrl: string;
    }
  | { tipo: "ubicacion"; nombre: string; direccion: string | null; mapaUrl: string | null }
  | { tipo: "enlace"; etiqueta: string; url: string }
  | { tipo: "opciones"; opciones: string[] }
  /** "Dejar un mensaje al negocio": la web muestra el formulario. */
  | { tipo: "dejarMensaje" };

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
 * El saludo y las opciones del negocio, sin sesión ni captcha; null si el
 * chat no atiende a este negocio o está caído. La burbuja sólo aparece con
 * respuesta: si no, la página queda exactamente como antes.
 */
export async function inicioChat(subdominio: string): Promise<BloqueChat[] | null> {
  try {
    const r = await fetch(`${baseChat()}/${encodeURIComponent(subdominio)}/inicio`);
    if (!r.ok) return null;
    const datos = (await r.json()) as { bloques?: BloqueChat[] };
    return datos.bloques?.length ? datos.bloques : null;
  } catch {
    return null;
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
