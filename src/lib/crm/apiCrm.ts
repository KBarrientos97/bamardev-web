import { request } from "../api";
import { descargar } from "../promociones/apiPromociones";

/** Contrato de `/crm` (PLAN-CRM-Y-PROMOCIONES §3). */

export type Segmento = "NUEVO" | "FRECUENTE" | "OCASIONAL" | "EN_RIESGO" | "PERDIDO" | "SIN_VISITAS";

export const SEGMENTOS: { valor: Segmento; texto: string; tono: "verde" | "azul" | "gris" | "amarillo" | "rojo" }[] = [
  { valor: "NUEVO", texto: "Nuevos", tono: "azul" },
  { valor: "FRECUENTE", texto: "Frecuentes", tono: "verde" },
  { valor: "OCASIONAL", texto: "Ocasionales", tono: "gris" },
  { valor: "EN_RIESGO", texto: "En riesgo", tono: "amarillo" },
  { valor: "PERDIDO", texto: "Perdidos", tono: "rojo" },
  { valor: "SIN_VISITAS", texto: "Sin visitas", tono: "gris" },
];

export interface FilaCliente {
  id: number;
  nombre: string;
  telefono: string | null;
  /** Número para wa.me: sólo con consentimiento y teléfono útil. */
  whatsapp: string | null;
  visitas: number;
  gastoTotal: number;
  ticketMedio: number | null;
  primeraVisita: string | null;
  ultimaVisita: string | null;
  diasSinVenir: number | null;
  frecuenciaDias: number | null;
  umbralDias: number;
  segmento: Segmento;
  marketingAcepta: boolean | null;
  contactable: boolean;
}

export interface ListaClientes {
  resumen: Record<Segmento, number>;
  clientes: FilaCliente[];
}

export interface FiltroRetencion {
  dias?: number;
  modo?: "RECURRENCIA" | "FIJO";
  segmento?: Segmento;
  q?: string;
}

export interface ResumenCliente {
  id: number;
  nombre: string;
  segmento: Segmento;
  metricas: {
    visitas: number;
    gastoTotal: number;
    ticketMedio: number | null;
    primeraVisita: string | null;
    ultimaVisita: string | null;
    diasSinVenir: number | null;
    frecuenciaDias: number | null;
    umbralDias: number;
    noShows: number;
    deudaFiado: number;
  };
  marketing: { acepta: boolean | null; en: string | null; canal: string | null };
  whatsapp: string | null;
  compras: {
    tipo: "VENTA" | "FIADO";
    ventaId: number;
    comprobante: string | null;
    fecha: string;
    total: number;
    descuento: number;
    estado: string;
  }[];
  promociones: { promocion: string; codigo: string | null; monto: number; estado: string; fecha: string }[];
}

export interface Exportacion {
  id: number;
  lista: string;
  filtros: string | null;
  filas: number;
  usuario: string | null;
  creadoEn: string;
}

function qs(p: object): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== null && v !== "") u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : "";
}

export const apiCrm = {
  clientes: (f: FiltroRetencion = {}) => request<ListaClientes>(`/crm/clientes${qs(f)}`),
  noVuelven: (f: FiltroRetencion = {}) =>
    request<ListaClientes>(`/crm/no-vuelven${qs({ dias: f.dias, modo: f.modo })}`),
  resumen: (id: number) => request<ResumenCliente>(`/crm/clientes/${id}/resumen`),
  marketing: (id: number, acepta: boolean) =>
    request<ResumenCliente["marketing"]>(`/crm/clientes/${id}/marketing`, {
      method: "PATCH",
      body: JSON.stringify({ acepta, canal: "LOCAL" }),
    }),
  exportaciones: () => request<Exportacion[]>("/crm/exportaciones"),
  /** Queda en la bitácora del negocio. */
  exportar: (f: FiltroRetencion & { lista: "NO_VUELVEN" | "SEGMENTO" }) =>
    descargar(`/crm/exportar.csv${qs(f)}`, "clientes.csv"),
};

/**
 * "hoy", "ayer", "hace 5 días". Nunca "hace -1 días": una cita completada
 * antes de su hora no es una visita del futuro (QA DIA-05; el backend ya no
 * lo manda negativo, esto cubre a uno viejo).
 */
export function haceDias(dias: number | null): string {
  if (dias == null) return "—";
  if (dias <= 0) return "hoy";
  if (dias === 1) return "ayer";
  return `hace ${dias} días`;
}
