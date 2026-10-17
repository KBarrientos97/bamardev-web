import { request } from "../../lib/api";
import type { CreditoInput, FormaPago, PagoInput } from "../../types";
import type {
  AjustesBillar,
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

interface SesionApi {
  id: number;
  version: number;
  start: number;
  /** Desde el 16-oct (backend del mismo día). */
  abierta?: number;
  pausedAt: number | null;
  pausedTotal: number;
  pauseMotivo?: string;
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
  productos: { nombre: string; cant: number; bs: number }[];
  auditoria: {
    id: number;
    hora: number;
    mesaId?: number;
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
  ) => enviar<MesaApi>(`/billar/mesas/${idInterno}/abrir`, cuerpo),
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
  corregirPago: (ventaId: number, pagos: PagoInput[], motivo: string, cred: Credenciales) =>
    enviar<{ corregida: boolean }>(`/billar/ventas/${ventaId}/pagos`, { pagos, motivo, ...cred }),
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
