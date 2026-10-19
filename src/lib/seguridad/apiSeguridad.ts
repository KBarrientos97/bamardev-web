import { request } from "../api";

/** Quién: el que operaba, el dueño del PIN probado, quien lo vio. */
export interface PersonaIntento {
  id: number;
  nombre: string;
  usuario?: string;
  rol?: string | null;
}

/**
 * Un intento de PIN de autorización (backend `IntentoPin`, 18-oct-2026).
 * Nunca trae el PIN tecleado.
 */
export interface IntentoPin {
  id: number;
  /** FALLO: no pasó · BLOQUEADO: siguió con el PIN frenado · ACIERTO: pasó después de fallos · HABILITADO: el administrador lo destrabó. */
  tipo: "FALLO" | "BLOQUEADO" | "ACIERTO" | "HABILITADO";
  creadoEn: string;
  /** El usuario de la sesión (se sabe qué sesión, no quién tecleó). */
  operador: PersonaIntento;
  /** Probó su propio PIN (no escribió usuario). */
  propio: boolean;
  /** El usuario que escribió para autorizar; null si eran números o si fue el propio. */
  tecleado: string | null;
  /** De quién era el PIN (en ACIERTO, quién autorizó; en HABILITADO, quién habilitó). */
  autorizador: PersonaIntento | null;
  /** FALLO: por qué no pasó. BLOQUEADO: CORTO (freno de 15 min) o DEL_DIA (el de 24 h). */
  motivo:
    | "PIN_INCORRECTO"
    | "USUARIO_DESCONOCIDO"
    | "USUARIO_INACTIVO"
    | "SIN_PIN"
    | "SIN_PERMISO"
    | "CORTO"
    | "DEL_DIA"
    | null;
  accion: string | null;
  /** "Pausar la Mesa 3". */
  descripcion: string | null;
  sucursalId: number | null;
  seguidos: number | null;
  delDia: number | null;
  alarma: "TRES_SEGUIDOS" | "BLOQUEO" | "ACIERTO_TRAS_FALLOS" | "GOTEO" | "BLOQUEO_DIA" | null;
  bloqueadoHasta: string | null;
  avisado: boolean;
  visto: boolean;
  vistoPor: PersonaIntento | null;
}

/** Alguien frenado del día (10 fallos en 24 h) que nadie habilitó todavía. */
export interface Frenado {
  usuarioId: number;
  nombre: string;
  rol: string | null;
  desde: string;
  /** Se levanta solo a esta hora, si nadie lo habilita antes. */
  hasta: string;
}

export interface RespuestaIntentos {
  /** La hora del servidor: contra esta se miden los 45 s del "error de tipeo". */
  ahora: string;
  hayMas: boolean;
  /** Un backend de antes del freno del día no lo manda. */
  frenados?: Frenado[];
  intentos: IntentoPin[];
}

/** Módulo aparte para poder mockearlo en los tests de la franja. */
export const apiSeguridad = {
  /** Lo que no se vio (la franja) o los últimos días (el historial). */
  intentos: (q: { sinVer: true } | { dias: number }) =>
    request<RespuestaIntentos>(`/seguridad/intentos-pin?${"sinVer" in q ? "sinVer=true" : `dias=${q.dias}`}`),
  /** "Ya lo vi", hasta el último mostrado. */
  marcarVistos: (hastaId: number) =>
    request<{ marcados: number }>("/seguridad/intentos-pin/vistos", {
      method: "POST",
      body: JSON.stringify({ hastaId }),
    }),
  /**
   * Vuelve a dejar pedir autorizaciones con PIN a quien quedó frenado.
   * Habilitarse a uno mismo pide la contraseña de la cuenta.
   */
  habilitar: (usuarioId: number, password?: string) =>
    request<{ habilitado: boolean; mensaje: string }>(`/seguridad/intentos-pin/habilitar/${usuarioId}`, {
      method: "POST",
      body: JSON.stringify(password ? { password } : {}),
    }),
};
