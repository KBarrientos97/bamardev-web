import { request } from "./api";
import type { RolNegocio } from "../types";

/**
 * Personal (PLAN-ROLES §9): la gente del negocio, entre o no al sistema.
 * `Usuario` queda para el login (y el cupo del plan); lo de la persona vive
 * acá. Contrato de `GET/POST/PATCH /personal` del backend.
 */

/** El login de la persona, si tiene. */
export interface AccesoPersonal {
  usuarioId: number;
  username: string;
  /** Código legado (sólo para el APK viejo): no se decide nada con él. */
  rol: string | null;
  /** El rol del negocio con el que entra (PLAN-ROLES-NEGOCIO §8). */
  rolId?: number | null;
  rolNombre?: string | null;
  /** false = se le quitó el acceso (no ocupa cupo). */
  activo: boolean;
  ultimoLogin: string | null;
}

export interface Persona {
  id: number;
  nombre: string;
  /**
   * El cargo es un rol del negocio (PLAN-ROLES-NEGOCIO, decisión 7): sin login
   * es sólo descriptivo; al darle acceso, ese rol le da los permisos.
   */
  cargoRolId: number | null;
  /** El nombre de ese rol. Sólo lectura. */
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
  cargoRolId?: number | null;
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
  /** El rol del negocio con el que entra. */
  rolId?: number;
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

/**
 * Un cargo de `GET /personal/cargos`: un rol del negocio. El contrato sólo
 * promete que son "los roles del negocio"; lo seguro es el id y el nombre.
 */
export type CargoRol = Pick<RolNegocio, "id" | "nombre"> &
  Partial<Pick<RolNegocio, "esAdministrador" | "permisos">>;

export const apiPersonal = {
  listar: (f: { incluirInactivos?: boolean; sucursalId?: number | null; sinProfesional?: boolean } = {}) =>
    request<Persona[]>(`/personal${qs(f)}`),
  uno: (id: number) => request<Persona>(`/personal/${id}`),
  /** Los cargos que se pueden elegir: los roles del negocio. */
  cargos: () => request<CargoRol[]>("/personal/cargos"),
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
