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

/**
 * Quién hace la entrega de los pedidos de la página (PLAN-DELIVERY-EXTERNO §2.1):
 * repartidores propios con la app, un servicio de afuera (Yango) o sólo recoger.
 * Un backend viejo no lo manda: se lee como PROPIO.
 */
export type EntregaPedidosWeb = "PROPIO" | "EXTERNO" | "SOLO_RECOGER";

/** Lo que ve el cliente de la operativa de entrega: propia o externa con el nombre del servicio. */
export interface EntregaPublica {
  modo: "PROPIO" | "EXTERNO";
  /** El nombre del servicio; vacío = «Yango». */
  servicio: string | null;
}

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
  /** Con un servicio externo viene `null`: la página no calcula el envío por km (§2.2). */
  tarifa: TarifaEnvio | null;
  /**
   * Si ESTA sucursal ofrece delivery (§2.2). Un backend viejo no lo manda: se
   * deduce de las coordenadas, como siempre.
   */
  delivery?: boolean;
  /**
   * Los ítems de la carta (`itemId`) que ESE local no puede servir hoy (agotado a
   * mano o sin stock). Un backend viejo no lo manda: se lee como «ninguno».
   */
  agotados?: number[];
  /**
   * Las opciones de toppings (`productoId`) que ESE local no puede servir hoy
   * (PLAN-AGREGADOS §8.3). Un backend anterior no lo manda: se lee como «ninguna».
   */
  agotadosAgregados?: number[];
  /**
   * Cómo se paga ANTES por QR en esta sucursal (PLAN-PEDIDOS-QR): AUTOMATICO
   * (el banco confirma solo), FIJO (el QR del local, confirma la cajera) o null
   * (sólo efectivo). Un backend viejo no lo manda: no se ofrece pagar antes.
   */
  pagoAntes?: ModoPagoAntes | null;
}

/** Cómo se confirma un pago por QR hecho antes (PLAN-PEDIDOS-QR). */
export type ModoPagoAntes = "AUTOMATICO" | "FIJO";

/** `GET /publico/pedidos/:subdominio`. */
export interface InfoPedidos {
  recibe: boolean;
  motivo: MotivoSinPedidos | null;
  tipos: TipoPedidoWeb[];
  /** En el mismo orden que `CatalogoPublico.sucursales` de la página. */
  sucursales: SucursalPedido[];
  /** Quién entrega. Ausente (backend viejo) = repartidores propios. */
  entrega?: EntregaPublica;
}

export interface LineaPedidoEnvio {
  /** El `id` del ítem del catálogo público (la fila fijada), no el del producto. */
  itemId: number;
  cantidad: number;
  /**
   * Los toppings de ESTE vaso (PLAN-AGREGADOS §8.3), por unidad y en el orden en
   * que el cliente los eligió. El backend los recalcula con la regla del punto de
   * venta: el precio no viaja.
   */
  agregados?: { productoId: number; cantidad: number; grupoId: number }[];
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
  /** Con QR: se pagan los productos ANTES y el pedido llega al local ya pagado (PLAN-PEDIDOS-QR). */
  pagarAntes?: boolean;
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
  /** Se paga por QR antes y el pago todavía no se confirmó (PLAN-PEDIDOS-QR). */
  | "ESPERANDO_PAGO"
  | "RECIBIDO"
  | "ACEPTADO"
  | "EN_CAMINO"
  | "ENTREGADO"
  | "RECHAZADO"
  | "VENCIDO"
  | "CANCELADO";

export interface LineaSeguimiento {
  /** Con toppings (PLAN-AGREGADOS §8.3): el id de la línea, para ubicar a sus hijas. */
  id?: number;
  titulo: string;
  cantidad: number;
  precio: number;
  subtotal: number;
  /** Un topping de otra línea (el vaso): se dibuja debajo de ella. */
  lineaPadreId?: number | null;
  /** Va dentro de lo incluido: Bs 0. */
  incluido?: boolean;
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
  /** Quién entrega este pedido. Ausente = repartidores propios. */
  entrega?: EntregaPublica;
  /** Con un servicio externo: el enlace para seguir el pedido allá (sólo `https://`). */
  enlaceSeguimiento?: string | null;
  /**
   * Con un servicio externo, mientras el pedido está aceptado y sin pagar: lo
   * que hay que pagar y el QR del local (§2.5). Si no, no viene.
   */
  pago?: { pendiente: true; monto: number; qrUrl: string } | null;
  /**
   * Pagar antes por QR (PLAN-PEDIDOS-QR): cuánto (sólo los productos; el envío
   * se paga al recibir), cómo se confirma, si ya entró y hasta cuándo se espera.
   */
  prepago?: { modo: ModoPagoAntes; monto: number; pagado: boolean; venceEn: string } | null;
  /** Cuándo se confirmó el pago por QR (externo o pagado antes). */
  pagoConfirmadoEn?: string | null;
}

// ── Privado (bandeja) ───────────────────────────────────────────────────

export type EstadoPedidoWeb = "ESPERANDO_PAGO" | "NUEVO" | "ACEPTADO" | "RECHAZADO" | "CANCELADO" | "VENCIDO";

export type CodigoRechazo = "AGOTADO" | "FUERA_DE_ZONA" | "CERRADO" | "PEDIDO_FALSO" | "OTRO";

export interface LineaPedidoWeb {
  id?: number;
  productoId?: number;
  titulo: string;
  cantidad: number;
  precio: number;
  subtotal: number;
  /**
   * Un topping del vaso (PLAN-AGREGADOS §8.3): la bandeja lo dibuja indentado
   * debajo de `lineaPadreId`. `incluido` = va dentro de lo que trae el vaso (Bs 0).
   */
  lineaPadreId?: number | null;
  incluido?: boolean;
  grupoAgregadosId?: number | null;
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
  /** Quién hace la entrega de ESTE pedido (§2.4). Ausente (backend viejo) = repartidores propios. */
  modoEntrega?: "PROPIO" | "EXTERNO";
  /** El nombre del servicio externo; vacío = «Yango». */
  servicio?: string | null;
  /** Cuándo la caja confirmó que el cliente pagó por QR (sólo servicio externo). */
  pagoConfirmadoEn?: string | null;
  /** El enlace con que el cliente sigue el pedido en el servicio externo. */
  enlaceSeguimiento?: string | null;
  /**
   * La venta ya está cobrada (en caja, o el QR del servicio externo ya se confirmó):
   * un RECOGER así se entrega sin cobrar. Un backend anterior no lo manda: se cobra al entregar.
   */
  pagado?: boolean;
  /** Pagar antes por QR (PLAN-PEDIDOS-QR). Un backend viejo no lo manda. */
  pagoAntes?: boolean;
  modoPago?: ModoPagoAntes | null;
  /** Lo que el cliente paga antes: sólo los productos. */
  montoPrepago?: number | null;
  /** Ya pagado por QR antes de aceptarlo. */
  pagadoAntes?: boolean;
  /** Rechazado ya pagado: cuánto hay que devolverle al cliente. */
  devolver?: number | null;
  /** Cuándo se entregó (el detalle de uno de «Hoy»): ya no hay nada que avanzar. */
  entregadoEn?: string | null;
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
  /** Pagar antes con el QR fijo: esperan que la cajera vea el pago (PLAN-PEDIDOS-QR). Un backend viejo no lo manda. */
  porCobrar?: PedidoWeb[];
}

/** `GET /pedidos-web/contador`. */
export interface ContadorPedidos {
  nuevos: number;
  masViejoEn: string | null;
  /** Los que esperan que la cajera confirme el pago por QR fijo. Un backend viejo no lo manda. */
  porCobrar?: number;
}

export interface CuerpoAceptar {
  /** Con un servicio externo no va: el backend responde 400 si viene. */
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
