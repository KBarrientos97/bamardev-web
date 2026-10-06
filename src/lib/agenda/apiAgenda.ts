import { ApiError, qs, request } from "../api";
import type {
  AccionCita,
  AgendaDia,
  AgendaHoy,
  AvisoAgenda,
  CarritoCita,
  Cita,
  ClienteFicha,
  ClienteFichaDetalle,
  EditarClienteInput,
  ColaInput,
  CrearCitaInput,
  LineaPedida,
  LineaReservada,
  MiAgendaRespuesta,
  Propuesta,
  Recurso,
  ReglasAgenda,
  Servicio,
} from "./tiposAgenda";

/**
 * Cliente de la agenda (PLAN-DESARROLLO-BELLEZA §10.2 y §10.3). Pasa por el
 * mismo `request` que el resto de la app, así que el 401, la licencia y el
 * reporte de 5xx funcionan igual; acá sólo se arman las rutas y los cuerpos.
 *
 * Toda la lógica (huecos, estados, doble reserva) vive en el backend: estas
 * funciones no calculan nada, piden.
 */
export const apiAgenda = {
  // ── Lo que se lee de la configuración (§10.1) ──────────────────────────────
  servicios: () => request<Servicio[]>("/agenda/servicios"),
  recursos: () => request<Recurso[]>("/agenda/recursos"),
  reglas: (sucursalId?: number | null) =>
    request<ReglasAgenda>(`/agenda/reglas${qs({ sucursalId })}`),

  // ── Agenda y citas (§10.2) ─────────────────────────────────────────────────
  dia: (fecha: string, sucursalId?: number | null) =>
    request<AgendaDia>(`/agenda/dia${qs({ fecha, sucursalId })}`),

  huecos: (input: { fecha: string; sucursalId: number; lineas: LineaPedida[] }) =>
    request<{ huecos: Propuesta[] }>("/agenda/huecos", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  crearCita: (input: CrearCitaInput) =>
    request<Cita>("/agenda/citas", { method: "POST", body: JSON.stringify(input) }),

  cita: (id: number) => request<Cita>(`/agenda/citas/${id}`),

  /** Mover o cambiar servicios: reemplaza las líneas, con las mismas reglas y el mismo 409. */
  moverCita: (id: number, input: { lineas?: LineaReservada[]; nota?: string }) =>
    request<Cita>(`/agenda/citas/${id}`, { method: "PATCH", body: JSON.stringify(input) }),

  cambiarEstado: (id: number, accion: AccionCita, motivo?: string) =>
    request<Cita>(`/agenda/citas/${id}/estado`, {
      method: "POST",
      body: JSON.stringify(motivo ? { accion, motivo } : { accion }),
    }),

  agregarACola: (input: ColaInput) =>
    request<Cita>("/agenda/cola", { method: "POST", body: JSON.stringify(input) }),

  atenderAhora: (id: number) =>
    request<Cita>(`/agenda/citas/${id}/atender-ahora`, { method: "POST" }),

  hoy: (sucursalId?: number | null) =>
    request<AgendaHoy>(`/agenda/hoy${qs({ sucursalId })}`),

  miAgenda: (desde: string, hasta: string) =>
    request<MiAgendaRespuesta>(`/agenda/mi-agenda${qs({ desde, hasta })}`),

  // ── Ficha de cliente (§10.3) ───────────────────────────────────────────────
  buscarClientes: (q: string) =>
    request<ClienteFicha[]>(`/agenda/clientes${qs({ q })}`),

  crearCliente: (input: { nombre: string; telefono: string }) =>
    request<ClienteFicha>("/agenda/clientes", { method: "POST", body: JSON.stringify(input) }),

  /** La ficha con su historial de citas y compras (A7). */
  cliente: (id: number) => request<ClienteFichaDetalle>(`/agenda/clientes/${id}`),

  editarCliente: (id: number, input: EditarClienteInput) =>
    request<ClienteFicha>(`/agenda/clientes/${id}`, { method: "PATCH", body: JSON.stringify(input) }),

  // ── Cobro y avisos (ola B) ─────────────────────────────────────────────────
  /** Lo que el POS precarga para cobrar la cita, al precio vigente. */
  carrito: (citaId: number) => request<CarritoCita>(`/agenda/citas/${citaId}/carrito`),

  /** Lo que pasó en la agenda desde `desde` (ISO), para la campana. */
  avisos: (desde?: string) =>
    request<{ ahora: string; avisos: AvisoAgenda[] }>(`/agenda/avisos${qs({ desde })}`),
};

/** Los `codigo` de error de la agenda que las pantallas manejan aparte. */
export const CODIGOS_AGENDA = {
  HUECO_OCUPADO: "HUECO_OCUPADO",
  SIN_RECURSO_LIBRE: "SIN_RECURSO_LIBRE",
  TELEFONO_EXISTE: "TELEFONO_EXISTE",
  FUERA_DE_HORARIO: "FUERA_DE_HORARIO",
  TRANSICION_INVALIDA: "TRANSICION_INVALIDA",
} as const;

/** ¿Es un 409 de hueco tomado? Devuelve los huecos recalculados que trae. */
export function huecosDelConflicto(e: unknown): Propuesta[] | null {
  if (!(e instanceof ApiError) || e.codigo !== CODIGOS_AGENDA.HUECO_OCUPADO) return null;
  const huecos = e.detalle.huecos;
  return Array.isArray(huecos) ? (huecos as Propuesta[]) : [];
}

/** La espera que trae un 409 SIN_RECURSO_LIBRE, en minutos (o null). */
export function esperaDelConflicto(e: unknown): number | null {
  if (!(e instanceof ApiError) || e.codigo !== CODIGOS_AGENDA.SIN_RECURSO_LIBRE) return null;
  const min = Number(e.detalle.esperaEstimadaMin);
  return Number.isFinite(min) ? min : null;
}

/**
 * El cliente que ya existía, en un 409 TELEFONO_EXISTE. El contrato dice "con
 * el existente" sin nombrar el campo: se acepta `cliente` o `existente`.
 */
export function clienteDelConflicto(e: unknown): ClienteFicha | null {
  if (!(e instanceof ApiError) || e.codigo !== CODIGOS_AGENDA.TELEFONO_EXISTE) return null;
  const c = (e.detalle.cliente ?? e.detalle.existente) as ClienteFicha | undefined;
  return c && typeof c.id === "number" ? c : null;
}

/** El mensaje que trae el error, en español y listo para mostrar. */
export function mensajeDe(e: unknown, porDefecto = "No se pudo completar"): string {
  return e instanceof Error && e.message ? e.message : porDefecto;
}
