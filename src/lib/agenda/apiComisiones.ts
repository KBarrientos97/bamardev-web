import { request } from "../api";
import type {
  Adelanto,
  AdelantoInput,
  ConfigComision,
  ConfigComisionInput,
  DetalleComisiones,
  EventoComision,
  Liquidacion,
  LiquidacionDetalle,
  LiquidarInput,
  PreviaLiquidacion,
  ReporteAgenda,
  ResumenComisiones,
} from "./tiposComisiones";

/**
 * Cliente de comisiones y liquidación (feature `comisiones`, permisos
 * `comisiones.ver` y `comisiones.liquidar`) y de los reportes de agenda
 * (`agenda.reportes`). El backend recorta lo del profesional (alcance PROPIO):
 * la pantalla no filtra nada por su cuenta.
 */

function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

const json = (cuerpo: unknown) => JSON.stringify(cuerpo);

export const apiComisiones = {
  resumen: (p: { desde: string; hasta: string; sucursalId?: number | null }) =>
    request<ResumenComisiones>(`/comisiones/resumen${qs(p)}`),
  detalle: (recursoId: number, p: { desde: string; hasta: string }) =>
    request<DetalleComisiones>(`/comisiones/recursos/${recursoId}/detalle${qs(p)}`),

  previa: (p: { recursoId: number; desde: string; hasta: string }) =>
    request<PreviaLiquidacion>(`/comisiones/liquidaciones/previa${qs(p)}`),
  liquidar: (input: LiquidarInput) =>
    request<LiquidacionDetalle>("/comisiones/liquidaciones", { method: "POST", body: json(input) }),
  liquidaciones: (p: { recursoId?: number | null } = {}) =>
    request<Liquidacion[]>(`/comisiones/liquidaciones${qs(p)}`),
  liquidacion: (id: number) => request<LiquidacionDetalle>(`/comisiones/liquidaciones/${id}`),

  adelantos: (p: { recursoId?: number | null; pendientes?: boolean } = {}) =>
    request<Adelanto[]>(`/comisiones/adelantos${qs(p)}`),
  crearAdelanto: (input: AdelantoInput) =>
    request<Adelanto>("/comisiones/adelantos", { method: "POST", body: json(input) }),
  anularAdelanto: (id: number) =>
    request<{ ok: true }>(`/comisiones/adelantos/${id}`, { method: "DELETE" }),

  config: () => request<ConfigComision[]>("/comisiones/config"),
  guardarConfig: (recursoId: number, input: ConfigComisionInput) =>
    request<ConfigComision>(`/comisiones/config/${recursoId}`, { method: "PUT", body: json(input) }),
  bitacora: (recursoId?: number | null) =>
    request<EventoComision[]>(`/comisiones/bitacora${qs({ recursoId })}`),

  reporteAgenda: (p: {
    desde: string;
    hasta: string;
    sucursalId?: number | null;
    diasRetencion?: number;
  }) => request<ReporteAgenda>(`/agenda/reportes${qs(p)}`),
};
