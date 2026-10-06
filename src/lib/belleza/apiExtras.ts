import { ApiError, qs, request, tokenStore } from "../api";

/**
 * Cliente de la fase 4 de belleza (PLAN-AGENDA-BELLEZA §2.5): gift cards,
 * propinas, consumo de insumos por servicio y ficha técnica. Pasa por el mismo
 * `request` que el resto de la app (401, licencia, reporte de 5xx); acá sólo
 * se arman las rutas. Toda la regla (saldos, arqueo, stock) vive en el backend.
 */

const BASE_API = import.meta.env.VITE_API_URL || "/api";

// ── Gift cards ──────────────────────────────────────────────────────────────

export type EstadoVale = "USABLE" | "AGOTADA" | "VENCIDA" | "ANULADA";
export type FiltroVales = "TODAS" | "USABLES" | "AGOTADAS" | "VENCIDAS" | "ANULADAS";

export interface Vale {
  id: number;
  codigo: string;
  montoInicial: number;
  saldo: number;
  venceEn: string | null;
  estado: EstadoVale;
  beneficiario: string | null;
  comprador: string | null;
  nota: string | null;
  formaPago: string | null;
  creadoEn: string;
  anuladaEn: string | null;
  motivoAnulacion: string | null;
}

export interface MovimientoVale {
  id: number;
  tipo: "EMISION" | "USO" | "DEVOLUCION" | "ANULACION";
  monto: number;
  saldoDespues: number;
  fecha: string;
  venta: { id: number; comprobante: string | null; estado: string } | null;
}

export interface ValeDetalle extends Vale {
  movimientos: MovimientoVale[];
}

export interface ListaVales {
  vales: Vale[];
  /** Lo que el negocio todavía debe en servicios (saldo de los usables). */
  saldoVigente: number;
  vigentes: number;
}

export interface EmitirValeInput {
  monto: number;
  formaPagoId: number;
  recibido?: number;
  venceEn?: string;
  beneficiario?: string;
  comprador?: string;
  nota?: string;
  clienteRequestId?: string;
}

/** Lo que el recibo de una venta trae de cada vale que la pagó. */
export interface ValeEnRecibo {
  codigo: string;
  usado: number;
  saldo: number;
}

// ── Propinas ────────────────────────────────────────────────────────────────

export interface PropinaInput {
  recursoId: number;
  monto: number;
  formaPagoId: number;
}

export interface PropinaEnRecibo {
  recursoId: number;
  recurso: string;
  monto: number;
  formaPago: string;
}

export interface FilaPropinas {
  recursoId: number;
  nombre: string;
  total: number;
  efectivo: number;
  otras: number;
  cantidad: number;
  /** Lo que hoy se le debe (de todo el tiempo, no sólo del período). */
  pendiente: number;
  /**
   * Lo pendiente según cómo entró: el efectivo está en un cajón; lo de QR o
   * tarjeta no, y entregarlo en efectivo es una decisión aparte (QA S2SEG-06).
   * Opcionales: un backend anterior no los manda.
   */
  pendienteEfectivo?: number;
  pendienteOtras?: number;
}

/** Lo que responde "Entregar". */
export interface PagoPropinas {
  recursoId: number;
  recurso: string;
  cantidad: number;
  total: number;
  desdeCaja: boolean;
  /** De qué caja salió cada egreso (la de origen, o la tuya si ya se cerró). */
  egresos?: { cajaId: number; monto: number }[];
  /** Lo de QR o tarjeta que quedó pendiente. */
  pendienteOtras?: number;
}

export interface ReportePropinas {
  desde: string;
  hasta: string;
  total: number;
  pendiente: number;
  profesionales: FilaPropinas[];
  detalle: {
    id: number;
    fecha: string;
    ventaId: number;
    comprobante: string | null;
    recursoId: number;
    recurso: string;
    monto: number;
    formaPago: string;
    pagadaEn: string | null;
  }[];
}

// ── Consumo de insumos ──────────────────────────────────────────────────────
// Los costos vienen en null sin `costos.ver` (QA S2SEG-04): el profesional y
// la recepción corrigen cantidades, no miran a cuánto compra el negocio.

export interface ItemReceta {
  insumoId: number;
  insumo: string;
  unidad: string | null;
  cantidad: number;
  costoUnitario: number | null;
  costo: number | null;
}

export interface RecetaServicio {
  servicioId: number;
  servicio: string;
  precio: number;
  habilitado: boolean;
  items: ItemReceta[];
  costo: number | null;
}

export interface InsumoElegible {
  id: number;
  nombre: string;
  costo: number | null;
  esInsumo: boolean;
  unidad: string | null;
}

export interface ConsumoCita {
  id: number;
  ventaId: number;
  citaId: number | null;
  servicioId: number;
  servicio: string;
  insumoId: number;
  insumo: string;
  unidad: string | null;
  recursoId: number | null;
  recurso: string | null;
  cantidadReceta: number;
  cantidad: number;
  costoUnitario: number | null;
  costo: number | null;
  ajustadoEn: string | null;
}

export interface ConsumosDeCita {
  citaId: number;
  ventas: { id: number; comprobante: string | null }[];
  consumos: ConsumoCita[];
}

export interface RentabilidadServicios {
  desde: string;
  hasta: string;
  ingreso: number;
  costoInsumos: number | null;
  margen: number | null;
  servicios: {
    servicioId: number;
    servicio: string;
    cantidad: number;
    ingreso: number;
    costoInsumos: number | null;
    costoPorServicio: number | null;
    margen: number | null;
    margenPct: number | null;
  }[];
}

// ── Ficha técnica ───────────────────────────────────────────────────────────

export interface FormulaColor {
  marca?: string;
  tono?: string;
  proporcion?: string;
  oxidante?: string;
  tiempoMin?: number;
  nota?: string;
}

export interface FotoFicha {
  id: number;
  momento: "ANTES" | "DESPUES";
  ancho: number;
  alto: number;
  bytes: number;
  /** Ruta relativa al API (con la sesión): se baja con `fotoComoUrl`. */
  url: string;
  creadoEn: string;
}

export interface FichaTecnica {
  id: number;
  clienteId: number;
  citaId: number | null;
  recursoId: number | null;
  recurso: string | null;
  fecha: string;
  servicio: string | null;
  formulas: FormulaColor[];
  nota: string | null;
  editable: boolean;
  fotos: FotoFicha[];
}

export interface FichasDeCliente {
  cliente: { id: number; nombre: string } | null;
  fichas: FichaTecnica[];
  citaId?: number;
}

export interface FichaInput {
  clienteId: number;
  citaId?: number;
  servicio?: string;
  formulas?: FormulaColor[];
  nota?: string;
}

const json = (body: unknown) => ({ body: JSON.stringify(body) });

export const apiExtras = {
  // Gift cards
  vales: (estado: FiltroVales = "TODAS", q?: string) =>
    request<ListaVales>(`/gift-cards${qs({ estado, q })}`),
  vale: (id: number) => request<ValeDetalle>(`/gift-cards/${id}`),
  consultarVale: (codigo: string) =>
    request<Vale>(`/gift-cards/codigo/${encodeURIComponent(codigo.trim())}`),
  formaPagoVale: () => request<{ id: number; nombre: string }>("/gift-cards/forma-pago"),
  emitirVale: (input: EmitirValeInput) =>
    request<Vale & { cambio: number }>("/gift-cards", { method: "POST", ...json(input) }),
  anularVale: (id: number, motivo?: string) =>
    request<
      ValeDetalle & {
        devolucion: { monto: number; desdeCaja: boolean; cajaId?: number | null; formaPago: string | null };
      }
    >(
      `/gift-cards/${id}/anular`,
      { method: "POST", ...json(motivo ? { motivo } : {}) },
    ),

  // Propinas
  propinas: (p: { desde?: string; hasta?: string; recursoId?: number } = {}) =>
    request<ReportePropinas>(`/propinas${qs(p)}`),
  pagarPropinas: (recursoId: number, desdeCaja = true, incluirOtras = false) =>
    request<PagoPropinas>("/propinas/pagar", {
      method: "POST",
      ...json({ recursoId, desdeCaja, incluirOtras }),
    }),

  // Consumo de insumos
  recetas: () => request<RecetaServicio[]>("/consumo-servicio/recetas"),
  insumos: () => request<InsumoElegible[]>("/consumo-servicio/insumos"),
  guardarReceta: (servicioId: number, items: { insumoId: number; cantidad: number }[]) =>
    request<RecetaServicio>(`/consumo-servicio/recetas/${servicioId}`, {
      method: "PUT",
      ...json({ items }),
    }),
  rentabilidadServicios: (p: { desde?: string; hasta?: string } = {}) =>
    request<RentabilidadServicios>(`/consumo-servicio/reporte${qs(p)}`),
  consumosDeCita: (citaId: number) => request<ConsumosDeCita>(`/consumo-servicio/citas/${citaId}`),
  ajustarConsumo: (id: number, cantidad: number) =>
    request<ConsumoCita>(`/consumo-servicio/consumos/${id}`, { method: "PATCH", ...json({ cantidad }) }),
  agregarConsumo: (ventaId: number, input: { insumoId: number; cantidad: number; servicioId?: number }) =>
    request<ConsumoCita>(`/consumo-servicio/ventas/${ventaId}/consumos`, { method: "POST", ...json(input) }),

  // Ficha técnica
  fichasDeCliente: (clienteId: number) =>
    request<FichasDeCliente>(`/ficha-tecnica/clientes/${clienteId}`),
  fichasDeCita: (citaId: number) => request<FichasDeCliente>(`/ficha-tecnica/citas/${citaId}`),
  crearFicha: (input: FichaInput) =>
    request<FichaTecnica>("/ficha-tecnica", { method: "POST", ...json(input) }),
  editarFicha: (id: number, input: Partial<Omit<FichaInput, "clienteId" | "citaId">>) =>
    request<FichaTecnica>(`/ficha-tecnica/${id}`, { method: "PATCH", ...json(input) }),
  borrarFicha: (id: number) => request<void>(`/ficha-tecnica/${id}`, { method: "DELETE" }),
  borrarFoto: (fotoId: number) => request<void>(`/ficha-tecnica/fotos/${fotoId}`, { method: "DELETE" }),

  /**
   * Sube una foto (multipart, campo `archivo`). No pasa por `request` porque
   * ese fija `Content-Type: application/json` y el navegador tiene que poner
   * el suyo con el separador del multipart.
   */
  async subirFoto(fichaId: number, momento: "ANTES" | "DESPUES", archivo: Blob): Promise<FichaTecnica> {
    const datos = new FormData();
    datos.append("archivo", archivo, `${momento.toLowerCase()}.webp`);
    const token = tokenStore.get();
    let res: Response;
    try {
      res = await fetch(`${BASE_API}/ficha-tecnica/${fichaId}/fotos?momento=${momento}`, {
        method: "POST",
        body: datos,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch {
      throw new ApiError("No se pudo conectar con el servidor. Probá en un momento.", 0);
    }
    const cuerpo = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const m = cuerpo.message;
      const mensaje =
        res.status === 413
          ? "La foto pesa demasiado."
          : Array.isArray(m)
            ? m.join(", ")
            : String(m ?? "No se pudo subir la foto");
      throw new ApiError(mensaje, res.status, cuerpo);
    }
    return cuerpo as unknown as FichaTecnica;
  },

  /**
   * La foto como URL de objeto para un `<img>`. La foto es dato sensible y no
   * tiene ruta pública: se baja con la sesión y se muestra como blob. Quien la
   * pide tiene que liberar la URL (`URL.revokeObjectURL`) al desmontar.
   */
  async fotoComoUrl(ruta: string): Promise<string> {
    const token = tokenStore.get();
    const res = await fetch(`${BASE_API}${ruta}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new ApiError("No se pudo cargar la foto", res.status);
    return URL.createObjectURL(await res.blob());
  },
};
