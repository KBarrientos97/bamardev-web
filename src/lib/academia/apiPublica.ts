import type { CursoPublico, PreinscripcionEnviada, PreinscripcionInput } from "./tipos";

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
  constructor(mensaje: string, status: number, codigo?: string) {
    super(mensaje);
    this.name = "ErrorPublico";
    this.status = status;
    this.codigo = codigo;
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
      // Content-Type sólo con cuerpo: en un GET dispararía un OPTIONS de más.
      headers: { ...(opciones.body != null ? { "Content-Type": "application/json" } : {}), ...opciones.headers },
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
    let mensaje = Array.isArray(m) ? m.join(". ") : typeof m === "string" ? m : "Algo salió mal. Probá de nuevo.";
    if (res.status === 429) mensaje = "Ya recibimos varias preinscripciones desde este teléfono hoy. Probá mañana o escribinos por WhatsApp.";
    if (res.status >= 500) mensaje = "Algo salió mal de nuestro lado. Probá de nuevo en un momento.";
    throw new ErrorPublico(mensaje, res.status, cuerpo.codigo as string | undefined);
  }
  return res.json() as Promise<T>;
}

const sub = (s: string) => encodeURIComponent(s);

export const apiAcademiaPublica = {
  /** Las carreras publicadas con sus próximos inicios. */
  cursos: (subdominio: string) => pedir<CursoPublico[]>(`/publico/academia/${sub(subdominio)}/carreras`),
  /** La misma respuesta haya o no cupo (antiabuso, como la reserva). */
  preinscribir: (subdominio: string, input: PreinscripcionInput) =>
    pedir<PreinscripcionEnviada>(`/publico/academia/${sub(subdominio)}/preinscripcion`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
};
