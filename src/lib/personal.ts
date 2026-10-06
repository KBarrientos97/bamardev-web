import { request } from "./api";

/**
 * Personal (PLAN-ROLES §9): la gente del negocio, entre o no al sistema.
 * `Usuario` queda para el login (y el cupo del plan); lo de la persona vive
 * acá. Contrato de `GET/POST/PATCH /personal` del backend.
 */

/** El login de la persona, si tiene. */
export interface AccesoPersonal {
  usuarioId: number;
  username: string;
  rol: string | null;
  /** false = se le quitó el acceso (no ocupa cupo). */
  activo: boolean;
  ultimoLogin: string | null;
}

export interface Persona {
  id: number;
  nombre: string;
  cargo: string | null;
  activo: boolean;
  color: string | null;
  sucursalIds: number[];
  usuarioId: number | null;
  /** Entra al sistema hoy: es lo que cuenta para el cupo. */
  conAcceso: boolean;
  /** Su columna en la agenda, si es profesional. */
  recursoId: number | null;
  profesional: { recursoId: number; nombre: string; activo: boolean } | null;
  // Lo que sigue sólo viene con `personal.gestionar` (quien sólo configura la
  // agenda ve lo de arriba).
  ci?: string | null;
  telefono?: string | null;
  fechaIngreso?: string | null;
  comisionPct?: number | null;
  notas?: string | null;
  zona?: string | null;
  vehiculo?: string | null;
  acceso?: AccesoPersonal | null;
}

export interface PersonaInput {
  nombre?: string;
  ci?: string | null;
  telefono?: string | null;
  cargo?: string | null;
  fechaIngreso?: string | null;
  color?: string | null;
  comisionPct?: number | null;
  notas?: string | null;
  zona?: string | null;
  vehiculo?: string | null;
  sucursalIds?: number[];
  activo?: boolean;
}

export interface DarAccesoInput {
  username?: string;
  password?: string;
  rol?: string;
  email?: string;
  sucursalId?: number;
}

function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "" && v !== false) p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

const json = (cuerpo: unknown) => JSON.stringify(cuerpo);

export const apiPersonal = {
  listar: (f: { incluirInactivos?: boolean; sucursalId?: number | null; cargo?: string; sinProfesional?: boolean } = {}) =>
    request<Persona[]>(`/personal${qs(f)}`),
  uno: (id: number) => request<Persona>(`/personal/${id}`),
  cargos: () => request<{ sugeridos: string[] }>("/personal/cargos"),
  crear: (input: PersonaInput) => request<Persona>("/personal", { method: "POST", body: json(input) }),
  editar: (id: number, input: PersonaInput) =>
    request<Persona>(`/personal/${id}`, { method: "PATCH", body: json(input) }),
  /** "Darle acceso": crea su login (o lo reactiva), con el cupo del plan. */
  darAcceso: (id: number, input: DarAccesoInput) =>
    request<Persona>(`/personal/${id}/acceso`, { method: "POST", body: json(input) }),
  /** "Quitar acceso": desactiva el login; la persona sigue. */
  quitarAcceso: (id: number) => request<Persona>(`/personal/${id}/acceso`, { method: "DELETE" }),
  vincular: (id: number, usuarioId: number) =>
    request<Persona>(`/personal/${id}/vincular`, { method: "POST", body: json({ usuarioId }) }),
};
