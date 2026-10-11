import { request } from "../api";
import type {
  Bloqueo,
  BloqueoCreado,
  BloqueoInput,
  CambioRegla,
  ExcepcionCreada,
  ExcepcionHorario,
  ExcepcionInput,
  HorariosGuardados,
  Recurso,
  RecursoInput,
  Reglas,
  ReglasInput,
  Servicio,
  ServicioCambios,
  ServicioInput,
  TramoHorario,
} from "./tiposConfigAgenda";

/**
 * Cliente de la configuración de la agenda (A8) y de las reglas del negocio
 * (A11): PLAN-DESARROLLO-BELLEZA §10.1. Pasa por el mismo `request` que el
 * resto de la app (token, sesión vencida, licencia y PostHog).
 *
 * Todo exige `@RequiereFeature('agenda')` en el backend y ningún guard de rol
 * (D23): quién ve cada pantalla lo decide `permisos.ts`.
 */

/** Query string sin lo que no se mandó (null/undefined/""). */
function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

const json = (cuerpo: unknown) => JSON.stringify(cuerpo);

export const apiConfigAgenda = {
  // ── Servicios ─────────────────────────────────────────────────────────────
  servicios: () => request<Servicio[]>("/agenda/servicios"),
  crearServicio: (input: ServicioInput) =>
    request<Servicio>("/agenda/servicios", { method: "POST", body: json(input) }),
  actualizarServicio: (productoId: number, cambios: ServicioCambios) =>
    request<Servicio>(`/agenda/servicios/${productoId}`, {
      method: "PATCH",
      body: json(cambios),
    }),

  // ── Profesionales y espacios ──────────────────────────────────────────────
  recursos: (incluirInactivos = false) =>
    request<Recurso[]>(`/agenda/recursos${qs({ incluirInactivos: incluirInactivos || undefined })}`),
  crearRecurso: (input: RecursoInput) =>
    request<Recurso>("/agenda/recursos", { method: "POST", body: json(input) }),
  actualizarRecurso: (id: number, input: RecursoInput) =>
    request<Recurso>(`/agenda/recursos/${id}`, { method: "PATCH", body: json(input) }),
  /**
   * Fase 2: qué servicios hace y, en cada uno, su duración y su precio
   * propios (null = los del servicio). Reemplaza la lista.
   */
  guardarServiciosRecurso: (
    id: number,
    servicios: { servicioId: number; duracionMin: number | null; precio: number | null }[],
  ) =>
    request<Recurso>(`/agenda/recursos/${id}/servicios`, {
      method: "PUT",
      body: json({ servicios }),
    }),

  // ── Horarios (semana tipo) ────────────────────────────────────────────────
  /**
   * El contrato dice `{ tramos }` para el GET y el PUT. Se acepta también la
   * lista pelada por si el GET termina devolviendo sólo el arreglo: es la
   * misma información y no vale la pena una pantalla rota por la envoltura.
   */
  horarios: async (recursoId: number): Promise<TramoHorario[]> => {
    const r = await request<{ tramos: TramoHorario[] } | TramoHorario[]>(
      `/agenda/recursos/${recursoId}/horarios`,
    );
    return Array.isArray(r) ? r : (r?.tramos ?? []);
  },
  /** Reemplaza TODA la semana del recurso, en todas sus sucursales. */
  guardarHorarios: (recursoId: number, tramos: TramoHorario[]) =>
    request<HorariosGuardados | TramoHorario[]>(`/agenda/recursos/${recursoId}/horarios`, {
      method: "PUT",
      body: json({ tramos }),
    }),

  // ── Excepciones ───────────────────────────────────────────────────────────
  excepciones: (recursoId: number, desde?: string, hasta?: string) =>
    request<ExcepcionHorario[]>(
      `/agenda/recursos/${recursoId}/excepciones${qs({ desde, hasta })}`,
    ),
  crearExcepcion: (recursoId: number, input: ExcepcionInput) =>
    request<ExcepcionCreada>(`/agenda/recursos/${recursoId}/excepciones`, {
      method: "POST",
      body: json(input),
    }),
  borrarExcepcion: (id: number) =>
    request<unknown>(`/agenda/excepciones/${id}`, { method: "DELETE" }),

  // ── Bloqueos ──────────────────────────────────────────────────────────────
  bloqueos: (p: { desde?: string; hasta?: string; sucursalId?: number | null }) =>
    request<Bloqueo[]>(`/agenda/bloqueos${qs(p)}`),
  /** No cancela nada: devuelve las citas que quedaron adentro (§7.3). */
  crearBloqueo: (input: BloqueoInput) =>
    request<BloqueoCreado>("/agenda/bloqueos", { method: "POST", body: json(input) }),
  borrarBloqueo: (id: number) =>
    request<unknown>(`/agenda/bloqueos/${id}`, { method: "DELETE" }),

  // ── Reglas del negocio (A11) ──────────────────────────────────────────────
  /** Ya resueltas: sucursal → negocio → defecto del rubro, con su `origen`. */
  reglas: (sucursalId?: number | null) =>
    request<Reglas>(`/agenda/reglas${qs({ sucursalId })}`),
  guardarReglas: (input: ReglasInput) =>
    request<Reglas>("/agenda/reglas", { method: "PUT", body: json(input) }),
  historialReglas: () => request<CambioRegla[]>("/agenda/reglas/historial"),
};
