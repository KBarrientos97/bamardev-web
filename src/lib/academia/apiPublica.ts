import { formularioConFotos } from "./fotos";
import type {
  CursoPublico,
  EstadoCuentaPublico,
  FotosInscripcion,
  InscripcionDeMiCuenta,
  OpcionPagoClave,
  PreinscripcionEnviada,
  PreinscripcionInput,
} from "./tipos";

/**
 * Lo público de la academia (P1–P3): los cursos de la página y la
 * preinscripción, sin sesión. Va aparte de `lib/api.ts` por lo mismo que la
 * reserva online: aquel cliente agrega el token y cierra la sesión ante un
 * 401, y nada de eso aplica a quien llega desde Instagram. Además así la
 * página no arrastra el resto de la app.
 */

const BASE = import.meta.env.VITE_API_URL || "/api";
const TIMEOUT_MS = 20_000;

/** Un rechazo con el `codigo` del backend (TUTOR_REQUERIDO, el 429 de los topes…). */
export class ErrorPublico extends Error {
  status: number;
  codigo?: string;
  /** El cuerpo entero: `FOTOS_REQUERIDAS` trae cuáles `faltan`. */
  detalle: Record<string, unknown>;
  constructor(mensaje: string, status: number, codigo?: string, detalle: Record<string, unknown> = {}) {
    super(mensaje);
    this.name = "ErrorPublico";
    this.status = status;
    this.codigo = codigo;
    this.detalle = detalle;
  }
}

async function pedir<T>(ruta: string, opciones: RequestInit = {}): Promise<T> {
  const corte = new AbortController();
  const alarma = setTimeout(() => corte.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${BASE}${ruta}`, {
      ...opciones,
      signal: corte.signal,
      // Content-Type sólo con cuerpo JSON: en un GET dispararía un OPTIONS de
      // más, y en el multipart de las fotos lo pone el navegador (con el
      // separador).
      headers: {
        ...(opciones.body != null && !(opciones.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
        ...opciones.headers,
      },
    });
  } catch {
    throw new ErrorPublico(
      typeof navigator !== "undefined" && navigator.onLine === false
        ? "Sin internet. Revisá tu conexión y probá de nuevo."
        : "No pudimos conectar. Probá de nuevo en un momento.",
      0,
    );
  } finally {
    clearTimeout(alarma);
  }
  if (!res.ok) {
    let cuerpo: Record<string, unknown> = {};
    try {
      cuerpo = await res.json();
    } catch {
      /* sin cuerpo JSON */
    }
    const m = cuerpo.message;
    const codigo = typeof cuerpo.codigo === "string" ? cuerpo.codigo : undefined;
    let mensaje = Array.isArray(m) ? m.join(". ") : typeof m === "string" ? m : "Algo salió mal. Probá de nuevo.";
    // El tope por teléfono trae su `codigo` y su texto (TOPE_PREINSCRIPCIONES);
    // el 429 pelado es el tope por IP del Throttle.
    if (res.status === 429 && !codigo) mensaje = "Demasiados intentos seguidos. Probá mañana o escribinos por WhatsApp.";
    if (res.status === 413) mensaje = "Las fotos pesan demasiado. Probá sacarlas de nuevo.";
    if (res.status >= 500) mensaje = "Algo salió mal de nuestro lado. Probá de nuevo en un momento.";
    throw new ErrorPublico(mensaje, res.status, codigo, cuerpo);
  }
  return res.json() as Promise<T>;
}

const sub = (s: string) => encodeURIComponent(s);

export const apiAcademiaPublica = {
  /** Las carreras publicadas con sus próximos inicios. */
  cursos: (subdominio: string) => pedir<CursoPublico[]>(`/publico/academia/${sub(subdominio)}/carreras`),
  /**
   * La misma respuesta haya o no cupo (antiabuso, como la reserva). Desde la
   * ronda 2 va en multipart: el JSON en `datos` y las 3 fotos.
   */
  preinscribir: (subdominio: string, input: PreinscripcionInput, fotos: FotosInscripcion = {}) =>
    pedir<PreinscripcionEnviada>(`/publico/academia/${sub(subdominio)}/preinscripcion`, {
      method: "POST",
      body: formularioConFotos(input, fotos),
    }),
  /**
   * Derick, 04-nov: si el carnet ya es de un estudiante, su nombre de pila
   * (para saludarlo y no pedirle los datos otra vez); si no, null.
   */
  carnet: (subdominio: string, input: { ci: string; captcha?: string }) =>
    pedir<{ nombre: string | null }>(`/publico/academia/${sub(subdominio)}/carnet`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  /**
   * M5 · «Pagar mi inscripción»: sólo el carnet (desde el 03-nov). Si es de
   * alguien con algo vigente, el enlace de cada inscripción; si no, siempre el
   * mismo 404 (la página no cuenta quién estudia ahí).
   */
  identificar: (subdominio: string, input: { ci: string; captcha?: string }) =>
    pedir<{ inscripciones: InscripcionDeMiCuenta[] }>(`/publico/academia/${sub(subdominio)}/mi-cuenta`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  /**
   * M5: el comprobante del QR fijo. El monto no viaja: el servidor lo calcula
   * a partir de la opción elegida. Multipart: `datos` y la foto en `comprobante`.
   */
  subirComprobante: (subdominio: string, token: string, input: { opcion: OpcionPagoClave; monto?: number; captcha?: string }, foto: Blob) => {
    const f = new FormData();
    f.append("datos", JSON.stringify(input));
    f.append("comprobante", foto, `comprobante.${foto.type === "image/jpeg" ? "jpg" : "webp"}`);
    return pedir<{ ok: true; monto: number; etiqueta: string }>(
      `/publico/academia/${sub(subdominio)}/pagar/${encodeURIComponent(token)}/comprobante`,
      { method: "POST", body: f },
    );
  },
  /** P6: el estado de cuenta del enlace que se manda por WhatsApp. */
  estadoCuenta: (subdominio: string, token: string) =>
    pedir<EstadoCuentaPublico>(`/publico/academia/${sub(subdominio)}/pagar/${encodeURIComponent(token)}`),
};
