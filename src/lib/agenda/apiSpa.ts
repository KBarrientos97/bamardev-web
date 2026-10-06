import { ApiError, request } from "../api";
import type { Cita } from "./tiposAgenda";
import type {
  ConsentimientoDetalle,
  ConsentimientoFaltante,
  FichaSalud,
  FichaSaludInput,
  FirmarInput,
  Paquete,
  PaqueteDelCliente,
  PaqueteInput,
  PlantillaConsentimiento,
  SaludCliente,
  TipoEspacio,
  TipoEspacioInput,
} from "./tiposSpa";

/**
 * Cliente del spa completo (agenda fase 3). Pasa por el mismo `request` que
 * el resto: token, sesión vencida y el reporte de 5xx (sólo ruta y mensaje,
 * nunca el cuerpo: la ficha de salud no viaja a PostHog).
 */
const json = (cuerpo: unknown) => JSON.stringify(cuerpo);

export const apiSpa = {
  // ── Espacios ──────────────────────────────────────────────────────────────
  tiposEspacio: () => request<TipoEspacio[]>("/agenda/tipos-espacio"),
  crearTipoEspacio: (input: { nombre: string }) =>
    request<TipoEspacio>("/agenda/tipos-espacio", { method: "POST", body: json(input) }),
  editarTipoEspacio: (id: number, input: TipoEspacioInput) =>
    request<TipoEspacio>(`/agenda/tipos-espacio/${id}`, { method: "PATCH", body: json(input) }),

  // ── Paquetes ──────────────────────────────────────────────────────────────
  paquetes: () => request<Paquete[]>("/paquetes"),
  crearPaquete: (input: PaqueteInput) =>
    request<Paquete>("/paquetes", { method: "POST", body: json(input) }),
  editarPaquete: (productoId: number, input: PaqueteInput) =>
    request<Paquete>(`/paquetes/${productoId}`, { method: "PATCH", body: json(input) }),
  paquetesDelCliente: (clienteId: number) =>
    request<PaqueteDelCliente[]>(`/paquetes/clientes/${clienteId}`),

  // ── Consentimientos ───────────────────────────────────────────────────────
  plantillasConsentimiento: () =>
    request<PlantillaConsentimiento[]>("/consentimientos/servicios"),
  configurarConsentimiento: (servicioId: number, input: { requiere: boolean; texto?: string }) =>
    request<PlantillaConsentimiento>(`/consentimientos/servicios/${servicioId}`, {
      method: "PUT",
      body: json(input),
    }),
  pendientesDeCita: (citaId: number) =>
    request<{ faltan: ConsentimientoFaltante[] }>(`/consentimientos/citas/${citaId}/pendientes`),
  saludDelCliente: (clienteId: number) =>
    request<SaludCliente>(`/consentimientos/clientes/${clienteId}`),
  guardarFichaSalud: (clienteId: number, input: FichaSaludInput) =>
    request<FichaSalud>(`/consentimientos/clientes/${clienteId}/ficha`, {
      method: "PUT",
      body: json(input),
    }),
  firmar: (input: FirmarInput) =>
    request<{ id: number; servicioId: number; version: number; firmadoEn: string }>(
      "/consentimientos",
      { method: "POST", body: json(input) },
    ),
  consentimiento: (id: number) => request<ConsentimientoDetalle>(`/consentimientos/${id}`),

  /** "Atender igual" cuando falta la firma: queda en la bitácora de la cita. */
  atenderSinConsentimiento: (citaId: number) =>
    request<Cita>(`/agenda/citas/${citaId}/estado`, {
      method: "POST",
      body: json({ accion: "ATENDER", sinConsentimiento: true }),
    }),
};

/** ¿Es el 409 de "falta el consentimiento"? Devuelve lo que falta firmar. */
export function faltantesDelConflicto(e: unknown): ConsentimientoFaltante[] | null {
  if (!(e instanceof ApiError) || e.codigo !== "CONSENTIMIENTO_FALTANTE") return null;
  const faltan = e.detalle.faltan;
  return Array.isArray(faltan) ? (faltan as ConsentimientoFaltante[]) : [];
}
