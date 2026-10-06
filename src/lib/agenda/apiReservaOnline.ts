import { request } from "../api";
import type { Cita } from "./tiposAgenda";

/**
 * Lo del negocio en la reserva online (PLAN-AGENDA-BELLEZA §8.3 y §8.9): la
 * bandeja de solicitudes (A9), su contador para el menú y qué se publica.
 * Pasa por el `request` de siempre (token, sesión vencida, licencia).
 */

/** Una cita de la bandeja: la del contrato más cuándo vence si nadie responde. */
export type CitaSolicitud = Cita & { venceEn: string | null };

export interface BandejaSolicitudes {
  /** SOLICITADAS por aprobar, las más próximas primero. */
  solicitudes: CitaSolicitud[];
  /** Online que entraron solas (modo automático) y nadie miró todavía. */
  nuevas: CitaSolicitud[];
  contador: ContadorSolicitudes;
}

export interface ContadorSolicitudes {
  pendientes: number;
  nuevas: number;
}

export interface SucursalReservas {
  id: number;
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  publicaReservas: boolean;
  slugReservas: string | null;
}

export interface ConfigReservaOnline {
  /** null: el negocio no tiene subdominio (no se puede armar el enlace). */
  subdominio: string | null;
  negocio: string;
  /** El negocio tiene la feature `reserva_online` (se prende desde el panel). */
  habilitada: boolean;
  modoConfirmacion: "MANUAL" | "AUTOMATICA" | "ANTICIPO_QR";
  serviciosPublicados: number;
  profesionalesPublicados: number;
  sucursales: SucursalReservas[];
}

const json = (cuerpo: unknown) => JSON.stringify(cuerpo);
const conSucursal = (sucursalId?: number | null) => (sucursalId != null ? `?sucursalId=${sucursalId}` : "");

export const apiReservaOnline = {
  bandeja: (sucursalId?: number | null) =>
    request<BandejaSolicitudes>(`/agenda/solicitudes${conSucursal(sucursalId)}`),
  contador: (sucursalId?: number | null) =>
    request<ContadorSolicitudes>(`/agenda/solicitudes/contador${conSucursal(sucursalId)}`),
  aprobar: (id: number) => request<CitaSolicitud>(`/agenda/solicitudes/${id}/aprobar`, { method: "POST" }),
  rechazar: (id: number, motivo?: string) =>
    request<CitaSolicitud>(`/agenda/solicitudes/${id}/rechazar`, {
      method: "POST",
      body: json(motivo ? { motivo } : {}),
    }),
  revisar: (id: number) => request<CitaSolicitud>(`/agenda/solicitudes/${id}/revisar`, { method: "POST" }),

  configuracion: () => request<ConfigReservaOnline>("/agenda/reserva-online"),
  publicarSucursal: (id: number, cambios: { publicaReservas?: boolean; slugReservas?: string | null }) =>
    request<SucursalReservas>(`/agenda/reserva-online/sucursales/${id}`, {
      method: "PATCH",
      body: json(cambios),
    }),
};

/**
 * El enlace público de reservas del negocio (PLAN-DESARROLLO-BELLEZA §11:
 * vive en la misma app, `…/r/<subdominio>`). Con sucursal, va directo a ella.
 */
export function enlaceReservas(subdominio: string, sucursalSlug?: string | null, origen = window.location.origin) {
  return `${origen}/r/${subdominio}${sucursalSlug ? `/reservar/${sucursalSlug}` : ""}`;
}
