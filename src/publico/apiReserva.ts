/**
 * Cliente de la reserva online (PLAN-AGENDA-BELLEZA §8.6): la página pública
 * del negocio, sin sesión.
 *
 * Va aparte de `lib/api.ts` a propósito. Aquel cliente agrega el token, cierra
 * la sesión ante un 401 y corta por licencia ante un 403: nada de eso aplica a
 * un cliente final, y un 401 de acá no puede mandar a nadie al login de la
 * app. Además así esta página no arrastra el resto de la app al bundle.
 */

const BASE = import.meta.env.VITE_API_URL || "/api";
const TIMEOUT_MS = 20_000;

/** Un error con el `codigo` y el cuerpo que manda el backend. */
export class ErrorReserva extends Error {
  status: number;
  codigo?: string;
  detalle: Record<string, unknown>;
  constructor(mensaje: string, status: number, cuerpo: Record<string, unknown> = {}) {
    super(mensaje);
    this.name = "ErrorReserva";
    this.status = status;
    this.codigo = cuerpo.codigo as string | undefined;
    this.detalle = cuerpo;
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
      // El Content-Type sólo cuando hay cuerpo: en un GET convierte el pedido
      // en "no simple" y el navegador manda un OPTIONS antes de cada consulta
      // de horarios, el doble de idas y vueltas en 3G (B29).
      headers: { ...(opciones.body != null ? { "Content-Type": "application/json" } : {}), ...opciones.headers },
    });
  } catch {
    throw new ErrorReserva(
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
    if (res.status === 429) mensaje = "Demasiados intentos seguidos. Esperá un minuto y probá de nuevo.";
    if (res.status >= 500) mensaje = "Algo salió mal de nuestro lado. Probá de nuevo en un momento.";
    throw new ErrorReserva(mensaje, res.status, cuerpo);
  }
  return res.json() as Promise<T>;
}

// ── Tipos del contrato ──────────────────────────────────────────────────────

export interface TemaPublico {
  clave: string;
  tokens: unknown;
}

export interface ServicioPublico {
  id: number;
  nombre: string;
  categoria: string | null;
  duracionMin: number;
  /** null cuando el negocio no muestra precios online. */
  precio: number | null;
  /**
   * El rango entre los profesionales que lo hacen (precio y duración propios,
   * fase 2): con "cualquiera" se muestra "desde". Opcionales: un backend
   * anterior no los manda.
   */
  precioDesde?: number | null;
  precioHasta?: number | null;
  duracionDesde?: number | null;
  duracionHasta?: number | null;
}

export interface ProfesionalPublico {
  id: number;
  nombre: string;
  servicioIds: number[];
  /** Lo que cobra y tarda ESTE profesional en cada servicio (QA N2-06). */
  servicios?: { servicioId: number; precio: number | null; duracionMin: number }[];
}

export interface SucursalPublica {
  slug: string;
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  servicios: ServicioPublico[];
  profesionales: ProfesionalPublico[];
  reglas: {
    modoConfirmacion: "MANUAL" | "AUTOMATICA";
    anticipacionMinHoras: number;
    anticipacionMaxDias: number;
    ventanaCancelacionHoras: number;
    mostrarPrecios: boolean;
    primeraFecha: string;
    ultimaFecha: string;
  };
}

export interface NegocioPublico {
  negocio: {
    nombre: string;
    subdominio: string;
    rubro: string;
    telefono: string | null;
    direccion: string | null;
    tema: TemaPublico | null;
  };
  privacidadVersion: string;
  sucursales: SucursalPublica[];
}

export interface DiaDisponible {
  fecha: string;
  inicios: string[];
}

export type EstadoCitaPublica =
  | "SOLICITADA"
  | "RESERVADA"
  | "CONFIRMADA"
  | "EN_ESPERA"
  | "EN_COLA"
  | "EN_ATENCION"
  | "POR_COBRAR"
  | "COMPLETADA"
  | "CANCELADA"
  | "NO_ASISTIO"
  | "RECHAZADA"
  | "EXPIRADA"
  | "ABANDONADA"
  | "PENDIENTE_PAGO";

export interface CitaPublica {
  codigo: string;
  estado: EstadoCitaPublica;
  inicio: string;
  fin: string;
  primerNombre: string;
  servicios: { id: number; nombre: string; duracionMin: number }[];
  profesional: { id: number; nombre: string } | null;
  sucursal: { slug: string; nombre: string; direccion: string | null; telefono: string | null };
  negocio: { nombre: string; telefono: string | null };
  motivoRechazo: string | null;
  canceladaPorCliente: boolean;
  borradoSolicitado: boolean;
  ventanaCancelacionHoras: number;
  limiteCambiosEn: string;
  puede: { confirmar: boolean; cancelar: boolean; reprogramar: boolean; pedirBorrado: boolean };
}

export interface ReservaInput {
  sucursal: string;
  servicioIds: number[];
  profesionalId: number | null;
  inicio: string;
  nombre: string;
  telefono: string;
  nota?: string;
  aceptaPrivacidad: boolean;
  privacidadVersion: string;
  /** El campo trampa: una persona nunca lo ve ni lo llena. */
  sitioWeb?: string;
}

const base = (sub: string) => `/publico/reservas/${encodeURIComponent(sub)}`;
const cita = (sub: string, token: string) => `${base(sub)}/citas/${encodeURIComponent(token)}`;
const json = (cuerpo: unknown) => JSON.stringify(cuerpo);

export const apiReserva = {
  negocio: (sub: string) => pedir<NegocioPublico>(base(sub)),

  disponibilidad: (
    sub: string,
    p: { sucursal: string; servicios: number[]; profesional: number | null; desde: string; dias?: number; token?: string },
  ) => {
    const q = new URLSearchParams({
      sucursal: p.sucursal,
      servicios: p.servicios.join(","),
      desde: p.desde,
      dias: String(p.dias ?? 7),
    });
    if (p.profesional != null) q.set("profesional", String(p.profesional));
    if (p.token) q.set("token", p.token);
    return pedir<{ desde: string; ultimaFecha: string; dias: DiaDisponible[] }>(
      `${base(sub)}/disponibilidad?${q.toString()}`,
    );
  },

  reservar: (sub: string, input: ReservaInput) =>
    pedir<{ token: string; cita: CitaPublica }>(`${base(sub)}/citas`, { method: "POST", body: json(input) }),

  ver: (sub: string, token: string) => pedir<CitaPublica>(cita(sub, token)),
  confirmar: (sub: string, token: string) => pedir<CitaPublica>(`${cita(sub, token)}/confirmar`, { method: "POST" }),
  cancelar: (sub: string, token: string) => pedir<CitaPublica>(`${cita(sub, token)}/cancelar`, { method: "POST" }),
  reprogramar: (sub: string, token: string, input: { inicio: string; profesionalId: number | null }) =>
    pedir<CitaPublica>(`${cita(sub, token)}/reprogramar`, { method: "POST", body: json(input) }),
  pedirBorrado: (sub: string, token: string) =>
    pedir<CitaPublica>(`${cita(sub, token)}/borrar-datos`, { method: "POST" }),

  /** El .ics va por enlace directo: así el teléfono lo abre con su calendario. */
  urlIcs: (sub: string, token: string) => `${BASE}${cita(sub, token)}/ics`,
};

/** Los huecos recalculados que trae un 409 HUECO_OCUPADO (o null si no es eso). */
export function huecosDelConflicto(e: unknown): string[] | null {
  if (!(e instanceof ErrorReserva) || e.codigo !== "HUECO_OCUPADO") return null;
  const h = e.detalle.huecos;
  return Array.isArray(h) ? (h as string[]) : [];
}
