import type { ContextoPermisos } from "../lib/permisos";
import type { SesionUsuario } from "../types";
import { FEATURE_DE_PERMISO, PLANTILLAS } from "./plantillasRoles";

/**
 * Sesiones de prueba armadas con los permisos REALES de las plantillas del
 * backend (ver `plantillasRoles.ts`). Desde PLAN-ROLES-NEGOCIO la web decide
 * todo por permisos: un test que arma una sesión "de cajero" tiene que darle
 * los permisos de un cajero, no el nombre.
 */

export type Plantilla = keyof typeof PLANTILLAS;

/**
 * Los permisos nuevos de PLAN-ROLES-NEGOCIO §8. El Administrador los recibe
 * en la migración; van aparte de su plantilla para poder comparar lo que ve
 * hoy (sin ellos) con lo que ve después.
 */
export const PERMISOS_NUEVOS = ["roles.gestionar", "usuarios.asignar_pin", "sucursales.todas"];

/** El nombre con que el alta copia cada plantilla (§7). */
const NOMBRE: Record<Plantilla, string> = {
  ADMIN: "Administrador",
  SUPERVISOR: "Encargado",
  CAJERO: "Cajero",
  MESERO: "Mesero",
  REPARTIDOR: "Repartidor",
  PROFESIONAL: "Estilista",
};

export interface OpcionesPermisos {
  /** Las features del plan: el backend cruza los permisos con ellas. Vacío = todas. */
  features?: string[];
  /** Permisos de más (con `:PROPIO` para el alcance "sólo lo suyo"). */
  extra?: string[];
  /** Permisos de menos. */
  sin?: string[];
}

export function permisosDe(plantilla: Plantilla, opc: OpcionesPermisos = {}) {
  const permisos: string[] = [];
  const permisosPropios: string[] = [];
  for (const fila of [...PLANTILLAS[plantilla], ...(opc.extra ?? [])]) {
    const [codigo, alcance] = fila.split(":");
    if (opc.sin?.includes(codigo) || permisos.includes(codigo)) continue;
    const feature = FEATURE_DE_PERMISO[codigo];
    // Lo mismo que hace el backend: lo que el plan no incluye no viaja.
    if (opc.features?.length && feature && !opc.features.includes(feature)) continue;
    permisos.push(codigo);
    if (alcance === "PROPIO") permisosPropios.push(codigo);
  }
  return { permisos, permisosPropios };
}

/** El contexto de `puedeVer`/`rutaInicial` de alguien con esa plantilla. */
export function ctxDe(
  plantilla: Plantilla,
  rubro?: string,
  features?: string[],
  opc: Omit<OpcionesPermisos, "features"> = {},
): ContextoPermisos {
  return { rubro, features, ...permisosDe(plantilla, { ...opc, features }) };
}

/** Un `usuario` de sesión para los mocks de `useAuth`. */
export function usuarioDe(
  plantilla: Plantilla,
  datos: Partial<SesionUsuario> = {},
  opc: OpcionesPermisos = {},
): SesionUsuario {
  return {
    id: 1,
    username: plantilla.toLowerCase(),
    rol: plantilla,
    rolId: Object.keys(NOMBRE).indexOf(plantilla) + 1,
    rolNombre: NOMBRE[plantilla],
    esAdministrador: plantilla === "ADMIN",
    sucursalId: null,
    ...permisosDe(plantilla, opc),
    ...datos,
  };
}
