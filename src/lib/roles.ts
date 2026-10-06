import { ApiError, request } from "./api";
import type {
  Alcance,
  DominioPermisos,
  EventoRol,
  PermisoDeRol,
  RolInput,
  RolNegocio,
  SesionUsuario,
} from "../types";

/**
 * Roles del negocio (PLAN-ROLES-NEGOCIO §8): cada negocio crea, renombra,
 * edita y borra los suyos. Contrato de `/roles` del backend.
 */

const json = (cuerpo: unknown) => JSON.stringify(cuerpo);

export const apiRoles = {
  /** Los roles activos, con cuántos usuarios y personas los tienen. */
  listar: () => request<RolNegocio[]>("/roles"),
  /** Los que quien está mirando puede asignar (nunca más de lo que él tiene). */
  asignables: () => request<RolNegocio[]>("/roles/asignables"),
  /** Todos los permisos, por dominio, con lo que el plan incluye y lo que el actor puede dar. */
  catalogo: () => request<DominioPermisos[]>("/roles/catalogo"),
  crear: (input: RolInput & { nombre: string }) =>
    request<RolNegocio>("/roles", { method: "POST", body: json(input) }),
  editar: (id: number, input: RolInput) =>
    request<RolNegocio>(`/roles/${id}`, { method: "PATCH", body: json(input) }),
  /** Borrado lógico. Con usuarios o personal, `reasignarA` es obligatorio (409 si falta). */
  borrar: (id: number, reasignarA?: number) =>
    request<unknown>(`/roles/${id}`, {
      method: "DELETE",
      body: json(reasignarA != null ? { reasignarA } : {}),
    }),
  bitacora: () => request<EventoRol[]>("/roles/bitacora"),
  bitacoraDe: (id: number) => request<EventoRol[]>(`/roles/${id}/bitacora`),
};

/** ¿El rol trae este permiso? El Administrador los tiene todos. */
export function rolTiene(rol: Pick<RolNegocio, "esAdministrador" | "permisos"> | null | undefined, codigo: string) {
  if (!rol) return false;
  return rol.esAdministrador || rol.permisos.some((p) => p.codigo === codigo);
}

/**
 * ¿Quien tenga este rol ve sólo su agenda? (el profesional, se llame como se
 * llame): `agenda.ver` sólo sobre lo suyo y sin gestionar la de todos.
 */
export function veSoloSuAgendaRol(rol: RolNegocio | null | undefined): boolean {
  if (!rol || rol.esAdministrador) return false;
  const ver = rol.permisos.find((p) => p.codigo === "agenda.ver");
  return ver?.alcance === "PROPIO" && !rol.permisos.some((p) => p.codigo === "agenda.gestionar");
}

/** Nombre y dominio de cada permiso, sacados del catálogo. */
export type NombresPermisos = Map<string, { nombre: string; dominio: string }>;

export function nombresDelCatalogo(catalogo: DominioPermisos[] | null | undefined): NombresPermisos {
  const mapa: NombresPermisos = new Map();
  for (const d of catalogo ?? []) {
    for (const p of d.permisos) mapa.set(p.codigo, { nombre: p.nombre, dominio: d.nombre || d.dominio });
  }
  return mapa;
}

/**
 * Los permisos de un rol agrupados por dominio, con su nombre. El nombre sale
 * del propio permiso si el backend lo manda, si no del catálogo, y como último
 * recurso del código ("ventas.vender"): mejor un código que un renglón vacío.
 */
export function agruparPorDominio(
  permisos: PermisoDeRol[],
  nombres: NombresPermisos,
): { dominio: string; permisos: (PermisoDeRol & { nombre: string })[] }[] {
  const grupos = new Map<string, (PermisoDeRol & { nombre: string })[]>();
  for (const p of permisos) {
    const delCatalogo = nombres.get(p.codigo);
    const dominio = p.dominio ?? delCatalogo?.dominio ?? "Otros";
    const nombre = p.nombre ?? delCatalogo?.nombre ?? p.codigo;
    grupos.set(dominio, [...(grupos.get(dominio) ?? []), { ...p, nombre }]);
  }
  return [...grupos.entries()].map(([dominio, lista]) => ({ dominio, permisos: lista }));
}

/**
 * Hasta dónde puede dar un permiso quien edita: nadie da lo que no tiene, y
 * "general" cubre "sólo lo suyo" (quien ve toda la agenda puede dar "ver su
 * agenda"; quien ve sólo la suya, no puede dar la de todos). Se calcula con la
 * sesión porque `otorgable` del catálogo es un sí/no y no dice el alcance.
 */
export function alcanceOtorgable(
  actor: Pick<SesionUsuario, "permisos" | "permisosPropios" | "esAdministrador"> | null | undefined,
  codigo: string,
): Alcance | null {
  if (actor?.esAdministrador) return "GENERAL";
  if (!actor?.permisos?.includes(codigo)) return null;
  return actor.permisosPropios?.includes(codigo) ? "PROPIO" : "GENERAL";
}

/** Texto de la cantidad de gente de un rol: "3 usuarios · 1 en personal". */
export function resumenGente(rol: Pick<RolNegocio, "usuarios" | "personal">): string {
  const partes = [`${rol.usuarios} ${rol.usuarios === 1 ? "usuario" : "usuarios"}`];
  // Las personas sin login (el ayudante con el rol como cargo) cuentan aparte:
  // también hay que reasignarlas antes de borrar el rol.
  if (rol.personal > 0) partes.push(`${rol.personal} en personal`);
  return partes.join(" · ");
}

/**
 * Tonos para las etiquetas de rol. El Administrador va siempre en morado (el
 * mismo que tenía el ADMIN); el resto, por su lugar en la lista, así un mismo
 * rol tiene el mismo color en la tarjeta y en el filtro.
 */
const TONOS = ["azul", "verde", "amarillo", "gris"] as const;
export type TonoRol = "morado" | (typeof TONOS)[number];

export function tonoDeRol(rol: Pick<RolNegocio, "id" | "esAdministrador"> | null | undefined, roles: RolNegocio[]): TonoRol {
  if (!rol) return "gris";
  if (rol.esAdministrador) return "morado";
  const resto = roles.filter((r) => !r.esAdministrador);
  const i = resto.findIndex((r) => r.id === rol.id);
  return i < 0 ? "gris" : TONOS[i % TONOS.length];
}

/** Los rechazos del backend, en palabras del dueño (contrato §8). */
export function mensajeDeError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.codigo === "NOMBRE_REPETIDO") return "Ya hay un rol con ese nombre.";
    if (e.codigo === "PERMISO_NO_OTORGABLE") return "Hay permisos que no tenés: no los podés dar.";
    if (e.codigo === "ROL_BLOQUEADO") return "El Administrador no se edita ni se borra.";
    if (e.codigo === "REASIGNAR_REQUERIDO") return "El rol tiene gente: elegí a qué rol pasarla.";
  }
  return e instanceof Error && e.message ? e.message : "No se pudo guardar";
}
