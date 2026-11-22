import { ApiError, qs, request } from "../api";
import type {
  AltaPacienteInput,
  Catalogo,
  ControlInput,
  EdicionPacienteInput,
  ListaPacientes,
  Paciente,
} from "./tipos";

/**
 * Todas las llamadas de la evaluación de pacientes
 * (CONTRATO-nutricion-evaluacion-22nov §3.3). Pasan por `request`, que no
 * manda a la telemetría ni el cuerpo ni el texto buscado: sólo la ruta sin ids
 * y sólo los 5xx (dato sensible de salud, §0.2).
 */

/**
 * Los códigos de error del backend (§3.3 y §3.4). Todos traen su mensaje en
 * castellano y las pantallas lo muestran tal cual; además, el carnet repetido
 * ofrece abrir la ficha del otro paciente y los «no encontrado» dicen que ya
 * no existe.
 */
export const CODIGOS_NUTRICION = {
  CI_DUPLICADO: "CI_DUPLICADO",
  CONTROL_VACIO: "CONTROL_VACIO",
  FECHA_FUTURA: "FECHA_FUTURA",
  DATO_DUPLICADO: "DATO_DUPLICADO",
  PACIENTE_NO_ENCONTRADO: "PACIENTE_NO_ENCONTRADO",
  CONTROL_NO_ENCONTRADO: "CONTROL_NO_ENCONTRADO",
} as const;

/** El paciente que ya tiene ese carnet (409 CI_DUPLICADO), o null si el error es otro. */
export function pacienteDelCarnet(e: unknown): number | null {
  if (!(e instanceof ApiError) || e.codigo !== CODIGOS_NUTRICION.CI_DUPLICADO) return null;
  const id = Number(e.detalle.pacienteId);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/** ¿El paciente no existe (o es de otro negocio)? */
export function esNoEncontrado(e: unknown): boolean {
  return e instanceof ApiError && (e.status === 404 || e.codigo === CODIGOS_NUTRICION.PACIENTE_NO_ENCONTRADO);
}

const json = (cuerpo: unknown) => JSON.stringify(cuerpo);

export const apiNutricion = {
  catalogo: () => request<Catalogo>("/nutricion/catalogo"),

  /**
   * La lista. Recibe `page`/`pageSize` para andar con `usePaginado` y los
   * manda como los pide el backend (`pagina`/`porPagina`). Sin `archivados`,
   * sólo los activos.
   */
  pacientes: (f: { q?: string; archivados?: boolean; page: number; pageSize: number }) =>
    request<ListaPacientes>(
      `/nutricion/pacientes${qs({ q: f.q?.trim() || undefined, archivados: f.archivados ? 1 : undefined, pagina: f.page, porPagina: f.pageSize })}`,
    ),

  paciente: (id: number) => request<Paciente>(`/nutricion/pacientes/${id}`),

  crear: (cuerpo: AltaPacienteInput) => request<Paciente>("/nutricion/pacientes", { method: "POST", body: json(cuerpo) }),

  /** Cambia sólo lo que viene; `null` borra el dato. */
  editar: (id: number, cambios: EdicionPacienteInput) =>
    request<Paciente>(`/nutricion/pacientes/${id}`, { method: "PATCH", body: json(cambios) }),

  /** No borra nada: deja de salir en la lista (`activo: false`). */
  archivar: (id: number) => request<Paciente>(`/nutricion/pacientes/${id}`, { method: "DELETE" }),

  desarchivar: (id: number) =>
    request<Paciente>(`/nutricion/pacientes/${id}`, { method: "PATCH", body: json({ activo: true }) }),

  crearControl: (pacienteId: number, cuerpo: ControlInput) =>
    request<Paciente>(`/nutricion/pacientes/${pacienteId}/controles`, { method: "POST", body: json(cuerpo) }),

  editarControl: (id: number, cambios: ControlInput) =>
    request<Paciente>(`/nutricion/controles/${id}`, { method: "PATCH", body: json(cambios) }),

  borrarControl: (id: number) => request<Paciente>(`/nutricion/controles/${id}`, { method: "DELETE" }),
};
