/**
 * Pedidos desde la página directo al sistema (MVP 1, 13-nov-2026): los tipos
 * del contrato (CONTRATO-PEDIDOS-WEB.md §3, §4 y §5). El backend y Android se
 * programan en paralelo contra el mismo documento: si algo cambia, se cambia
 * acá y en el contrato, no a ojo en cada pantalla.
 */

/** Un tramo de la tarifa: el primero trae `base`; los demás, `porKm`. `hastaKm: null` = sin tope. */
export interface TramoTarifa {
  hastaKm: number | null;
  base?: number;
  porKm?: number;
}

export interface TarifaEnvio {
  tramos: TramoTarifa[];
  maxKm: number;
}

export type TipoPedidoWeb = "DELIVERY" | "RECOGER";
export type FormaPagoWeb = "EFECTIVO" | "QR";

export type MotivoSinPedidos = "SIN_DELIVERY" | "APAGADO" | "CATALOGO_MANUAL";

/** Una sucursal tal como la ve el cliente antes de armar el pedido. */
export interface SucursalPedido {
  id: number;
  nombre: string;
  /** Dónde queda, para quien pasa a retirar. Un backend viejo no lo manda. */
  direccion?: string | null;
  /** Sin coordenadas sólo admite RECOGER. */
  latitud: number | null;
  longitud: number | null;
  /** Tiene una caja abierta: si no, no recibe pedidos. */
  abierta: boolean;
  tarifa: TarifaEnvio;
  /**
   * Los ítems de la carta (`itemId`) que ESE local no puede servir hoy (agotado a
   * mano o sin stock). Un backend viejo no lo manda: se lee como «ninguno».
   */
  agotados?: number[];
}

/** `GET /publico/pedidos/:subdominio`. */
export interface InfoPedidos {
  recibe: boolean;
  motivo: MotivoSinPedidos | null;
  tipos: TipoPedidoWeb[];
  /** En el mismo orden que `CatalogoPublico.sucursales` de la página. */
  sucursales: SucursalPedido[];
}

export interface LineaPedidoEnvio {
  /** El `id` del ítem del catálogo público (la fila fijada), no el del producto. */
  itemId: number;
  cantidad: number;
}

/** `POST /publico/pedidos/:subdominio`. */
export interface CuerpoPedido {
  captcha?: string;
  clienteRequestId: string;
  almacenId: number;
  tipo: TipoPedidoWeb;
  nombre: string;
  telefono: string;
  direccion?: string;
  referencia?: string;
  latitud?: number;
  longitud?: number;
  precisionM?: number;
  formaPago: FormaPagoWeb;
  pagaCon?: number;
  nota?: string;
  lineas: LineaPedidoEnvio[];
  /** Campo trampa (honeypot): siempre vacío; un bot lo llena y el pedido «sale bien» sin crearse. */
  sitioWeb?: string;
}

export interface RespuestaCrear {
  token: string;
  numero: number;
  estado: "RECIBIDO";
}

/** El estado que ve el cliente (no es el del backend: ver §4). */
export type EstadoSeguimiento =
  | "RECIBIDO"
  | "ACEPTADO"
  | "EN_CAMINO"
  | "ENTREGADO"
  | "RECHAZADO"
  | "VENCIDO"
  | "CANCELADO";

export interface LineaSeguimiento {
  titulo: string;
  cantidad: number;
  precio: number;
  subtotal: number;
}

/** `GET /publico/pedidos/:subdominio/:token`. */
export interface Seguimiento {
  numero: number;
  tipo: TipoPedidoWeb;
  estado: EstadoSeguimiento;
  motivoRechazo: string | null;
  creadoEn: string;
  aceptadoEn: string | null;
  salioEn: string | null;
  entregadoEn: string | null;
  lineas: LineaSeguimiento[];
  subtotal: number;
  envio: number;
  total: number;
  formaPago: FormaPagoWeb;
  pagaCon: number | null;
  cambio: number | null;
  /** Si la caja subió el envío y el billete ya no alcanza: cuánto falta. Un backend viejo no lo manda. */
  faltan?: number | null;
  /** Quién canceló (sólo en CANCELADO): el cliente o el local. Un backend viejo no lo manda. */
  canceladoPor?: "CLIENTE" | "LOCAL" | null;
  /** Por qué canceló el local, si dejó un motivo. */
  motivoCancelacion?: string | null;
  /** El envío con el que el cliente hizo el pedido: si la caja lo cambió al aceptar, es distinto de `envio`. */
  envioPedido?: number | null;
  /** Por qué la caja cambió el envío, si lo dijo. */
  motivoEnvio?: string | null;
  direccion: string | null;
  referencia: string | null;
  destino: { latitud: number; longitud: number } | null;
  sucursal: { nombre: string; latitud: number | null; longitud: number | null };
  repartidor: { nombre: string } | null;
  /** Sólo en EN_CAMINO y con menos de 2 minutos; si no, null. */
  posicion: { latitud: number; longitud: number; en: string } | null;
  whatsappLocal: string | null;
}

// ── Privado (bandeja) ───────────────────────────────────────────────────

export type EstadoPedidoWeb = "NUEVO" | "ACEPTADO" | "RECHAZADO" | "CANCELADO" | "VENCIDO";

export type CodigoRechazo = "AGOTADO" | "FUERA_DE_ZONA" | "CERRADO" | "PEDIDO_FALSO" | "OTRO";

export interface LineaPedidoWeb {
  id?: number;
  productoId?: number;
  titulo: string;
  cantidad: number;
  precio: number;
  subtotal: number;
}

/** Una fila de la bandeja y, con más campos, el detalle. */
export interface PedidoWeb {
  id: number;
  numero: number;
  estado: EstadoPedidoWeb;
  tipo: TipoPedidoWeb;
  almacenId: number;
  sucursal?: string | null;
  nombre: string;
  telefono: string;
  direccion: string | null;
  referencia: string | null;
  nota: string | null;
  latitud: number | null;
  longitud: number | null;
  precisionM: number | null;
  distanciaKm: number | null;
  formaPago: FormaPagoWeb;
  pagaCon: number | null;
  subtotal: number;
  envioSugerido: number;
  lineas: LineaPedidoWeb[];
  motivoRechazo: string | null;
  ventaId: number | null;
  /** Quién lo aceptó: el backend manda `{ id, nombre }` y, aparte, `aceptadoPorNombre`. */
  aceptadoPor?: { id: number; nombre: string } | string | null;
  aceptadoPorNombre?: string | null;
  /** Lo que el cliente paga: el envío confirmado si ya hay venta, y el total con él. */
  envio?: number;
  total?: number;
  repartidor?: { id: number; nombre: string } | null;
  /** Dónde está el repartidor (la última posición que mandó). Sólo lo trae el detalle. */
  posicion?: { latitud: number; longitud: number; en: string } | null;
  creadoEn: string;
  /** Cuándo vence si nadie lo atiende (sólo NUEVO): la cuenta atrás sale de acá, no del reloj de la PC. */
  venceEn?: string | null;
  aceptadoEn: string | null;
  salioEn: string | null;
}

/** `GET /pedidos-web/bandeja`. */
export interface Bandeja {
  /** La hora del servidor: con ella se corrige el reloj de la PC para contar la espera. */
  ahora?: string;
  nuevos: PedidoWeb[];
  aceptados: PedidoWeb[];
  enCamino: PedidoWeb[];
  entregadosHoy: PedidoWeb[];
  noTomadosHoy: PedidoWeb[];
}

/** `GET /pedidos-web/contador`. */
export interface ContadorPedidos {
  nuevos: number;
  masViejoEn: string | null;
}

export interface CuerpoAceptar {
  repartidorId?: number;
  tarifaEnvio: number;
  motivoTarifa?: string;
}

export interface CuerpoRechazar {
  codigo: CodigoRechazo;
  motivo?: string;
}

/** Lo que `GET /ventas/mis-entregas` suma a una entrega que vino de la página. */
export interface PedidoWebDeEntrega {
  id: number;
  numero: number;
  latitud: number | null;
  longitud: number | null;
  referencia: string | null;
  formaPago: FormaPagoWeb;
  pagaCon: number | null;
  salioEn: string | null;
}
