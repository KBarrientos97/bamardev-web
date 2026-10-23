import { request } from "../../lib/api";
import type { ConsumoVista, CreditoInput, FormaPago, PagoInput } from "../../types";
import type {
  AjustesBillar,
  CuentaSinMesa,
  Devolucion,
  EstadoMesa,
  Mesa,
  Pago,
  Prepago,
  ProductoBillar,
  Sesion,
  TiempoPrevio,
  TipoMesa,
  VentaBillar,
} from "./tipos";

/**
 * Las rutas del billar en el backend (`src/billar`) y la traducción de sus
 * respuestas a los tipos de las pantallas.
 *
 * El backend ya devuelve las mesas con los nombres de la web (horas en ms,
 * montos en número). Lo único que cambia es el id: las rutas usan el id
 * INTERNO de la mesa y de la sesión, y las pantallas el número que se ve
 * ("Mesa 5"), que es único en la sucursal. Por eso cada mesa guarda los dos
 * (`id` = número, `idInterno` = el de las rutas).
 */

// ── Lo que devuelve el backend ──────────────────────────────────────────────

interface PagoApi {
  id: number;
  hora: number;
  formaPagoId: number;
  metodo: string;
  monto: number;
  recibido: number;
  concepto: "PREPAGO" | "EXTENSION" | "ADELANTO";
  /** Desde el 16-oct: en qué caja entró y quién lo cobró. */
  cajaId?: number;
  cobradoPor?: string;
}

export interface SesionApi {
  id: number;
  version: number;
  start: number;
  /** Desde el 16-oct (backend del mismo día). */
  abierta?: number;
  pausedAt: number | null;
  pausedTotal: number;
  pauseMotivo?: string;
  /** Desde cuándo está en pausa de verdad (backend del 17-oct). */
  pausaDesde?: number;
  /** Los tramos pausados que ya terminaron, en ms (backend del 18-oct). */
  pausas?: { desde: number; hasta: number }[];
  cliente?: string;
  garantia?: string;
  nota?: string;
  prepago: Prepago | null;
  prev: TiempoPrevio | null;
  tarifa: TipoMesa;
  consumos: {
    id: number;
    productoId: number;
    nombre: string;
    precio: number;
    cant: number;
    hora: number;
    anulado: boolean;
    motivo?: string;
  }[];
  pagos: PagoApi[];
}

export interface MesaApi {
  id: number;
  numero: number;
  tipo: string;
  alias?: string;
  tarifaPropia?: number;
  estado: EstadoMesa;
  libreDesde?: number;
  fueraMotivo?: string;
  reserva?: { hora: number; nombre: string };
  inactiva?: boolean;
  sesion?: SesionApi;
}

/** Los ajustes del negocio: el silencio no viaja, es de cada equipo. */
export type AjustesApi = Omit<AjustesBillar, "silencio"> & { tieneTokenSalon: boolean };

/** Una cuenta abierta (sesión sin mesa, backend del 21-oct). */
export interface CuentaApi {
  id: number;
  nombre: string;
  sucursalId: number;
  /** Cobrada o anulada: la pantalla la saca del tablero. */
  estado: "abierta" | "cerrada" | "anulada";
  sesion: SesionApi;
}

export interface TableroApi {
  /** La hora del servidor: el cronómetro corre en el equipo, pero contado desde acá. */
  ahora: number;
  sucursal: { id: number; nombre: string };
  caja:
    | { abierta: false }
    | { abierta: true; id: number; desde: number; inicial: number; sucursalId: number | null };
  ajustes: AjustesApi;
  tipos: TipoMesa[];
  mesas: MesaApi[];
  /** Las cuentas abiertas del local. Un backend anterior al 21-oct no las manda. */
  cuentas?: CuentaApi[];
}

// ── Supervisión del administrador (backend del 21-oct) ─────────────────────

/** Una sesión con quién la abrió y quién cargó cada consumo: sólo la manda `/billar/supervision`. */
export type SesionSupervisionApi = Omit<SesionApi, "consumos"> & {
  abiertaPor: string;
  /** Si está en pausa: quién la pausó, quién autorizó y si fue desde Supervisión, sin PIN. */
  pausadaPor?: { quien: string; autorizo?: string; sinPin?: boolean };
  consumos: (SesionApi["consumos"][number] & { por: string; anuladoPor?: string })[];
};

/** Una caja de la jornada: quién la abrió, cuándo, cuándo se cerró y lo vendido. */
export interface CajaSupervisionApi {
  id: number;
  abierta: boolean;
  cajero: string;
  desde: number;
  hasta: number | null;
  inicial: number;
  /** Cerrada: lo que contó el cajero y la diferencia contra lo esperado. */
  contado?: number;
  diferencia?: number;
  /** Quién la cerró, si no se sabe (cajas viejas) fue quien la abrió. Otro puede cerrar la caja de la cajera. */
  cerroPor?: string;
  nota?: string;
  ventas: number;
  vendido: number;
  anuladas: number;
}

/**
 * El turno que se mira (backend del 22-oct): lo que pasó desde que se abrió una
 * caja hasta que se cerró. La actividad y lo vendido de la pantalla son de él.
 */
export interface TurnoSupervisionApi {
  /** La caja del turno; null si nadie abrió caja (entonces se muestra la jornada de hoy). */
  cajaId: number | null;
  /** La caja que corresponde por defecto: la que trabaja ahora o, si todas cerraron, la última. */
  defectoId: number | null;
  desde: number;
  /** Cuándo se cerró; null si sigue abierta. */
  hasta: number | null;
  /** Lo vendido en el turno, de todas las cajas del local. */
  ventas: number;
  vendido: number;
}

/** Un renglón de la actividad del turno: quién hizo qué, cuándo y dónde. */
export interface ActividadApi {
  id: string;
  hora: number;
  quien: string;
  texto: string;
  /** "Mesa 3", "Cuenta «Juan»" o "Venta rápida"; sin lugar, algo de la caja. */
  lugar?: string;
  autorizo?: string;
  motivo?: string;
  /** La acción cruda (PAUSAR, VENTA, CAJA_ABIERTA…). */
  codigo: string;
}

export interface SupervisionApi {
  ahora: number;
  sucursal: { id: number; nombre: string };
  /** Cuándo empezó la jornada de hoy (la hora de corte del billar). */
  desde: number;
  /**
   * La semana de los turnos que se pueden elegir (backend del 23-oct): del lunes a las
   * 13:00 al lunes siguiente a la misma hora (`hasta`, cuando se reinicia). Un backend
   * anterior no la manda: ahí los turnos son los de hoy y ayer.
   */
  semana?: { desde: number; hasta: number };
  /** Lo vendido en la jornada, de todas las cajas del local (sin lo de días atrás). */
  hoy: { ventas: number; vendido: number };
  /** El turno que se mira. Un backend anterior al 22-oct no lo manda: ahí todo es "hoy". */
  turno?: TurnoSupervisionApi;
  ajustes: AjustesApi;
  tipos: TipoMesa[];
  mesas: (Omit<MesaApi, "sesion"> & { sesion?: SesionSupervisionApi })[];
  cuentas: (Omit<CuentaApi, "sesion"> & { sesion: SesionSupervisionApi })[];
  /** Las cajas abiertas y las de la semana (cada una es un turno que se puede mirar). */
  cajas: CajaSupervisionApi[];
  actividad: ActividadApi[];
}

/** Una mesa como la lista el administrador (también las guardadas sin usar). */
export interface MesaAdminApi {
  id: number;
  numero: number;
  alias?: string;
  tipo: string;
  tarifaPropia?: number;
  estado: EstadoMesa;
  fueraMotivo?: string;
  inactiva?: boolean;
  enJuego: boolean;
  /** Si está reservada: el formulario avisa que dejarla fuera de servicio la cancela. */
  reserva?: { hora: number; nombre: string };
}

export type VentaApi = Omit<VentaBillar, "pagos"> & {
  pagos: { id: string; hora: number; metodo: string; monto: number; nota?: string }[];
};

/** El reporte del billar (`GET /billar/reportes`). */
export interface ReporteApi {
  desde: number;
  hasta: number;
  jornadas: number;
  tiempoBs: number;
  consumosBs: number;
  horas: number;
  ocupacion: number;
  porMesa: { mesaId: number; horas: number; pct: number }[];
  porHora: { hora: number; ocupacion: number }[];
  fijos: { vendidos: number; monto: number; conExcedente: number; excedenteBs: number };
  rapidas: { cantidad: number; bs: number };
  /** Las cuentas abiertas cobradas (backend del 21-oct). */
  cuentas?: { cantidad: number; bs: number };
  productos: { nombre: string; cant: number; bs: number }[];
  auditoria: {
    id: number;
    hora: number;
    mesaId?: number;
    /** De una cuenta abierta: su nombre va donde iría la mesa. */
    cuenta?: string;
    accion: string;
    quien: string;
    motivo?: string;
    autorizo?: string;
  }[];
}

/** Usuario y PIN de quien autoriza (los mismos campos que anular una venta). */
export interface Credenciales {
  autorizadorUsername?: string;
  autorizadorPin?: string;
}

// ── Las rutas ───────────────────────────────────────────────────────────────

const enviar = <T>(ruta: string, cuerpo: object = {}, method = "POST") =>
  request<T>(ruta, { method, body: JSON.stringify(cuerpo) });

const sesion = (id: string) => `/billar/sesiones/${id}`;

/**
 * `?sucursalId=` sólo si se eligió una. Sin elegir, el backend decide (la del
 * cajero; al dueño, la de su caja o la principal): un negocio de un solo local
 * pide exactamente lo mismo que antes.
 */
const deSucursal = (sucursalId?: number | null) => (sucursalId != null ? `?sucursalId=${sucursalId}` : "");

export const apiBillar = {
  tablero: (sucursalId?: number | null) => request<TableroApi>(`/billar/tablero${deSucursal(sucursalId)}`),
  productos: (sucursalId?: number | null) =>
    request<ProductoBillar[]>(`/billar/productos${deSucursal(sucursalId)}`),
  ventas: () => request<VentaApi[]>("/billar/ventas"),
  /**
   * Lo que hace la cajera, en vivo (sólo el administrador del billar,
   * `billar.admin`). `turno` es la caja que se quiere mirar; sin él, la que
   * trabaja ahora.
   */
  supervision: (sucursalId?: number | null, turno?: number | null) => {
    const q = [sucursalId != null && `sucursalId=${sucursalId}`, turno != null && `turno=${turno}`].filter(Boolean);
    return request<SupervisionApi>(`/billar/supervision${q.length ? `?${q.join("&")}` : ""}`);
  },
  /** Pausar desde Supervisión: sin PIN ni caja propia, a nombre del administrador. */
  pausarSupervision: (sesionId: number, motivo: string) =>
    enviar<MesaApi>(`/billar/supervision/sesiones/${sesionId}/pausar`, { motivo }),
  mesa: (idInterno: number) => request<MesaApi>(`/billar/mesas/${idInterno}`),
  reporte: (desde: string, hasta: string, sucursalId?: number) =>
    request<ReporteApi>(
      `/billar/reportes?desde=${desde}&hasta=${hasta}${sucursalId != null ? `&sucursalId=${sucursalId}` : ""}`,
    ),

  abrir: (
    idInterno: number,
    cuerpo: {
      modo: "libre" | "fijo";
      horas?: number;
      pagos?: PagoInput[];
      cliente?: string;
      garantia?: string;
      nota?: string;
      clienteRequestId: string;
    },
  ) =>
    // Plan Emprendedor (D29): abrir una mesa ocupa un lugar del cupo del día
    // y viene con `consumo`, como una venta. Sin cupo ni créditos, 403
    // `CUPO_AGOTADO`. Básico y Profesional no lo traen nunca.
    enviar<MesaApi & { consumo?: ConsumoVista }>(`/billar/mesas/${idInterno}/abrir`, cuerpo),
  reservar: (idInterno: number, hora: number, nombre: string) =>
    enviar<MesaApi>(`/billar/mesas/${idInterno}/reservar`, { hora: new Date(hora).toISOString(), nombre }),
  cancelarReserva: (idInterno: number) => enviar<MesaApi>(`/billar/mesas/${idInterno}/reserva`, {}, "DELETE"),
  fueraDeServicio: (idInterno: number, motivo: string) =>
    enviar<MesaApi>(`/billar/mesas/${idInterno}/fuera`, { motivo }),
  volverAServicio: (idInterno: number) => enviar<MesaApi>(`/billar/mesas/${idInterno}/servicio`),

  // `clienteRequestId` en las cuatro acciones que mueven plata o la cuenta: con
  // wifi malo el reintento de la misma acción no cobra ni carga dos veces
  // (ver reintentos.ts).
  consumos: (sesionId: string, items: { productoId: number; cantidad: number }[], clienteRequestId: string) =>
    enviar<MesaApi>(`${sesion(sesionId)}/consumos`, { items, clienteRequestId }),
  anularConsumo: (sesionId: string, consumoId: string, motivo: string, cred: Credenciales) =>
    enviar<MesaApi>(`${sesion(sesionId)}/consumos/${consumoId}/anular`, { motivo, ...cred }),
  pagar: (sesionId: string, pagos: PagoInput[], clienteRequestId: string) =>
    enviar<MesaApi>(`${sesion(sesionId)}/pagos`, { pagos, clienteRequestId }),
  pausar: (sesionId: string, motivo: string, cred: Credenciales) =>
    enviar<MesaApi>(`${sesion(sesionId)}/pausar`, { motivo, ...cred }),
  reanudar: (sesionId: string) => enviar<MesaApi>(`${sesion(sesionId)}/reanudar`),
  /** Corregir el medio de pago de una venta del turno (backend del 17-oct). `corregida`: false si ya estaba así. */
  corregirPago: (ventaId: number, pagos: PagoInput[], motivo: string, cred: Credenciales, operacion?: string) =>
    enviar<{ corregida: boolean }>(`/billar/ventas/${ventaId}/pagos`, {
      pagos,
      motivo,
      ...cred,
      ...(operacion ? { operacion } : {}),
    }),
  extender: (sesionId: string, horas: number, pagos: PagoInput[] | undefined, clienteRequestId: string) =>
    enviar<MesaApi>(`${sesion(sesionId)}/extender`, { horas, ...(pagos ? { pagos } : {}), clienteRequestId }),
  cambiar: (sesionId: string, destinoIdInterno: number) =>
    enviar<MesaApi>(`${sesion(sesionId)}/cambiar`, { mesaId: destinoIdInterno }),
  editarInicio: (sesionId: string, inicio: number, motivo: string, cred: Credenciales) =>
    enviar<MesaApi>(`${sesion(sesionId)}/inicio`, { inicio: new Date(inicio).toISOString(), motivo, ...cred }),
  anular: (sesionId: string, motivo: string, cred: Credenciales, clienteRequestId: string) =>
    // `devolverDetalle` llega desde el 16-oct (backend del mismo día): sin él,
    // la pantalla lo calcula con los pagos de la mesa.
    enviar<{ mesa: MesaApi; devolver: number; devolverDetalle?: Devolucion }>(`${sesion(sesionId)}/anular`, {
      motivo,
      ...cred,
      clienteRequestId,
    }),
  cerrar: (
    sesionId: string,
    cuerpo: {
      hasta: number;
      totalEsperado: number;
      pagos?: PagoInput[];
      credito?: CreditoInput;
      clienteRequestId: string;
    },
  ) =>
    // Sin `mesa` cuando es el reintento de un cobro que ya había entrado.
    enviar<{ venta: { id: number; comprobante: string | null }; mesa?: MesaApi }>(`${sesion(sesionId)}/cerrar`, {
      ...cuerpo,
      hasta: new Date(cuerpo.hasta).toISOString(),
    }),

  // ── Cuentas abiertas (sin mesa ni tiempo, 21-oct) ──
  // Las mismas acciones que la cuenta de una mesa, por `/billar/cuentas/:id`
  // (el id de la sesión). Cada una devuelve la cuenta entera.
  cuenta: (id: number) => request<CuentaApi>(`/billar/cuentas/${id}`),
  abrirCuenta: (nombre: string, sucursalId: number | null, clienteRequestId: string) =>
    // Plan Emprendedor: como abrir una mesa, ocupa un lugar del cupo (`consumo`).
    enviar<CuentaApi & { consumo?: ConsumoVista }>("/billar/cuentas", {
      nombre,
      ...(sucursalId != null ? { sucursalId } : {}),
      clienteRequestId,
    }),
  consumosCuenta: (id: number, items: { productoId: number; cantidad: number }[], clienteRequestId: string) =>
    enviar<CuentaApi>(`/billar/cuentas/${id}/consumos`, { items, clienteRequestId }),
  anularConsumoCuenta: (id: number, consumoId: string, motivo: string, cred: Credenciales) =>
    enviar<CuentaApi>(`/billar/cuentas/${id}/consumos/${consumoId}/anular`, { motivo, ...cred }),
  pagarCuenta: (id: number, pagos: PagoInput[], clienteRequestId: string) =>
    enviar<CuentaApi>(`/billar/cuentas/${id}/pagos`, { pagos, clienteRequestId }),
  anularCuenta: (id: number, motivo: string, cred: Credenciales, clienteRequestId: string) =>
    enviar<{ cuenta: CuentaApi; devolver: number; devolverDetalle?: Devolucion }>(`/billar/cuentas/${id}/anular`, {
      motivo,
      ...cred,
      clienteRequestId,
    }),
  cerrarCuenta: (
    id: number,
    cuerpo: { totalEsperado: number; pagos?: PagoInput[]; clienteRequestId: string },
  ) =>
    // Sin `cuenta` cuando es el reintento de un cobro que ya había entrado.
    enviar<{ venta: { id: number; comprobante: string | null }; cuenta?: CuentaApi }>(
      `/billar/cuentas/${id}/cerrar`,
      cuerpo,
    ),

  // ── Administración (Mesas de billar) ──
  adminMesas: (sucursalId?: number | null) => request<MesaAdminApi[]>(`/billar/admin/mesas${deSucursal(sucursalId)}`),
  // Las tarifas y los ajustes por su lado y no del tablero: el tablero pide
  // atender el billar (`billar.operar`) y quien sólo lo administra se quedaba
  // afuera de Mesas de billar (13-oct).
  adminTipos: () => request<TipoMesa[]>("/billar/admin/tipos"),
  adminAjustes: () => request<AjustesApi>("/billar/admin/ajustes"),
  crearMesa: (cuerpo: DatosMesaApi) => enviar<{ id: number }>("/billar/admin/mesas", cuerpo),
  editarMesa: (idInterno: number, cuerpo: DatosMesaApi) =>
    enviar<{ id: number }>(`/billar/admin/mesas/${idInterno}`, cuerpo, "PATCH"),
  eliminarMesa: (idInterno: number) => enviar<{ id: number }>(`/billar/admin/mesas/${idInterno}`, {}, "DELETE"),
  guardarTipos: (tipos: TipoMesaApi[]) => enviar<TipoMesa[]>("/billar/admin/tipos", { tipos }, "PUT"),
  guardarAjustes: (cuerpo: {
    avisos: number[];
    sonido: boolean;
    voz: boolean;
    pinAnularConsumo: boolean;
    pinAnularMesa: boolean;
    /** Si pausar pide PIN. Sin él, el backend no lo toca. */
    pinPausar?: boolean;
    /** A qué hora termina la jornada (minutos, 0 a 720). Sin él, el backend no lo toca. */
    horaCorteMin?: number;
  }) => enviar<AjustesApi>("/billar/admin/ajustes", cuerpo, "PUT"),
  /** La llave de la TV del salón que está andando (null si nunca se generó). */
  llaveSalon: () => request<{ token: string | null }>("/billar/admin/pantalla-salon"),
  nuevaLlaveSalon: () => enviar<{ token: string }>("/billar/admin/pantalla-salon"),
};

export interface DatosMesaApi {
  numero: number;
  alias?: string;
  tipo: string;
  tarifaPropia?: number | null;
  estado: "activa" | "fuera" | "inactiva";
  motivo?: string;
  /** Sólo al crear, y sólo la elige el usuario de organización (el backend fuerza la del cajero). */
  sucursalId?: number;
}

export interface TipoMesaApi {
  codigo: string;
  nombre: string;
  tarifa: number;
  fraccion: number;
  tolerancia: number;
  minimo: number;
  paquetes: { h: number; precio: number }[];
  promos: TipoMesa["promos"];
}

// ── Traducción a los tipos de las pantallas ─────────────────────────────────

const NOTA_PAGO: Record<PagoApi["concepto"], string> = {
  PREPAGO: "Tiempo fijo",
  EXTENSION: "Extensión",
  ADELANTO: "Adelanto",
};

function aSesion(s: SesionApi): Sesion {
  return {
    id: String(s.id),
    start: s.start,
    abierta: s.abierta,
    pausedAt: s.pausedAt,
    pausedTotal: s.pausedTotal,
    pauseMotivo: s.pauseMotivo,
    pausaDesde: s.pausaDesde,
    pausas: s.pausas,
    cliente: s.cliente,
    garantia: s.garantia,
    nota: s.nota,
    prepago: s.prepago,
    prev: s.prev,
    tarifa: s.tarifa,
    consumos: s.consumos.map((c) => ({
      id: String(c.id),
      productoId: c.productoId,
      nombre: c.nombre,
      precio: c.precio,
      cant: c.cant,
      hora: c.hora,
      anulado: c.anulado || undefined,
    })),
    pagos: s.pagos.map(
      (p): Pago => ({
        id: String(p.id),
        hora: p.hora,
        metodo: aMetodo(p.metodo),
        monto: p.monto,
        recibido: p.recibido > p.monto ? p.recibido : undefined,
        nota: NOTA_PAGO[p.concepto],
        cajaId: p.cajaId,
        cobradoPor: p.cobradoPor,
      }),
    ),
  };
}

/** El nombre de la forma de pago como lo agrupan las pantallas. */
function aMetodo(nombre: string): Pago["metodo"] {
  if (nombre === "Efectivo") return "Efectivo";
  if (nombre.toLowerCase() === "qr") return "QR";
  return nombre as Pago["metodo"];
}

export function aMesa(m: MesaApi): Mesa {
  return {
    id: m.numero,
    idInterno: m.id,
    tipo: m.tipo,
    alias: m.alias,
    tarifaPropia: m.tarifaPropia,
    estado: m.estado,
    libreDesde: m.libreDesde,
    fueraMotivo: m.fueraMotivo,
    reserva: m.reserva,
    inactiva: m.inactiva,
    sesion: m.sesion ? aSesion(m.sesion) : undefined,
  };
}

/**
 * Una cuenta abierta. Sus pagos son cobros parciales (para el backend son
 * "adelantos", como los de una mesa): se nombran así.
 */
export function aCuenta(c: CuentaApi): CuentaSinMesa {
  const sesion = aSesion(c.sesion);
  return {
    id: c.id,
    nombre: c.nombre,
    sesion: { ...sesion, pagos: sesion.pagos.map((p) => ({ ...p, nota: "Cobro parcial" })) },
  };
}

export function aMesaAdmin(m: MesaAdminApi): Mesa {
  return {
    id: m.numero,
    idInterno: m.id,
    tipo: m.tipo,
    alias: m.alias,
    tarifaPropia: m.tarifaPropia,
    // "abierta" sin la sesión: en la administración sólo importa que está en juego.
    estado: m.enJuego ? "abierta" : m.estado,
    fueraMotivo: m.fueraMotivo,
    inactiva: m.inactiva,
    // Sin esto el aviso de FormMesa ("se cancela al guardar") no salía nunca y
    // la reserva se borraba en silencio al dejar la mesa fuera de servicio.
    reserva: m.reserva,
  };
}

export function aVenta(v: VentaApi): VentaBillar {
  return { ...v, pagos: v.pagos.map((p) => ({ ...p, metodo: aMetodo(p.metodo) })) };
}

/**
 * Un cobro de la pantalla como pagos del backend: el mixto son dos filas
 * (efectivo y QR), igual que en el POS. Sin la forma de pago dada de alta en
 * el negocio no se puede cobrar: avisa cuál falta.
 */
export function aPagos(
  pago: { metodo: "Efectivo" | "QR" | "Mixto"; monto: number; partes?: { efectivo: number; qr: number }; recibido?: number },
  formas: FormaPago[],
): PagoInput[] {
  const efectivo = formas.find((f) => f.nombre.toLowerCase() === "efectivo");
  const qr = formas.find((f) => f.nombre.toLowerCase() === "qr");
  const falta = (cual: string) =>
    new Error(`El negocio no tiene la forma de pago "${cual}". Cargala en Configuración para cobrar así.`);
  if (pago.metodo === "Efectivo") {
    if (!efectivo) throw falta("Efectivo");
    return [{ formaPagoId: efectivo.id, monto: pago.monto, ...(pago.recibido ? { recibido: pago.recibido } : {}) }];
  }
  if (pago.metodo === "QR") {
    if (!qr) throw falta("QR");
    return [{ formaPagoId: qr.id, monto: pago.monto }];
  }
  if (!efectivo) throw falta("Efectivo");
  if (!qr) throw falta("QR");
  return [
    { formaPagoId: efectivo.id, monto: pago.partes?.efectivo ?? 0 },
    { formaPagoId: qr.id, monto: pago.partes?.qr ?? 0 },
  ];
}
