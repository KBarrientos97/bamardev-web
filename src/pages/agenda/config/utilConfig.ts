import { etiquetaRol } from "../../../lib/permisos";
import { useAuth } from "../../../store/AuthContext";
import type { Recurso } from "../../../lib/agenda/tiposConfigAgenda";

/**
 * Lo que no es componente de las pantallas de configuración de agenda: tipos,
 * textos y el hook del nombre del profesional. Aparte de `comun.tsx` para que
 * el refresco en caliente de Vite siga funcionando (sólo funciona con archivos
 * que exportan componentes).
 */

/** Las pestañas de la configuración de agenda (A8). */
export type Pestana = "servicios" | "recursos" | "horarios" | "excepciones" | "bloqueos";

/** Una sucursal que atiende (los depósitos no tienen agenda). */
export interface Sucursal {
  id: number;
  nombre: string;
}

/** "Barbero" → "Barberos"; "Profesional" → "Profesionales". */
export function plural(palabra: string): string {
  if (!palabra) return palabra;
  return /[aeiouáéíóú]$/i.test(palabra) ? `${palabra}s` : `${palabra}es`;
}

/**
 * Cómo se llama el profesional en este negocio: "Barbero", "Estilista"… Sale
 * del perfil del rubro (`etiquetasRol.PROFESIONAL`), con el respaldo de
 * siempre.
 */
export function useNombreProfesional(): { singular: string; plural: string } {
  const { negocio } = useAuth();
  const singular = etiquetaRol("PROFESIONAL", negocio);
  return { singular, plural: plural(singular) };
}

/** Nombre de un recurso para listas: el interno, con el público si difiere. */
export function nombreRecurso(r: Pick<Recurso, "nombre" | "nombrePublico">): string {
  return r.nombrePublico && r.nombrePublico !== r.nombre
    ? `${r.nombre} (${r.nombrePublico})`
    : r.nombre;
}

/** El mensaje de un error de la API, o uno genérico. */
export function mensajeDe(e: unknown, generico = "No se pudo guardar"): string {
  return e instanceof Error && e.message ? e.message : generico;
}

/** El código de negocio de un ApiError (`HORARIO_SUPERPUESTO`…). */
export function codigoDe(e: unknown): string | undefined {
  return (e as { codigo?: string } | null)?.codigo;
}
