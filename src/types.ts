// Tipos del dominio, calcados de los DTOs del backend (bamardev-backend).
// Se mantienen los nombres del API en español para que no haya traducción
// mental entre lo que viaja por la red y lo que se lee acá.

// ── Sesión y permisos ───────────────────────────────────────────────────────

/** Roles de la app. El backend los devuelve en mayúsculas. */
export type Rol = "ADMIN" | "SUPERVISOR" | "CAJERO" | "REPARTIDOR" | "PLATAFORMA";

/**
 * Módulo del ROL (tabla Modulo): en MAYÚSCULAS. Es lo que la persona puede
 * hacer. No confundir con las features del PLAN (minúsculas), que son lo que
 * el negocio compró. El tipo admite cualquier string a propósito: el catálogo
 * crece desde el panel y un código nuevo no debe romper el build.
 */
export type ModuloConocido =
  | "INVENTARIO"
  | "POS"
  | "CAJA"
  | "REPORTES"
  | "USUARIOS"
  | "CONFIG";
export type Modulo = ModuloConocido | (string & {});

/** Feature del PLAN (tabla Feature): en minúsculas. Lo que el negocio compró. */
export type FeatureConocida =
  | "pos"
  | "caja"
  | "catalogo"
  | "usuarios"
  | "offline"
  | "inventario"
  | "multi_almacen"
  | "insumos"
  | "delivery"
  | "recoger"
  | "fiado"
  | "cocina"
  | "pago_qr_mixto"
  | "combos"
  | "mesa_llevar"
  | "movimientos_caja"
  | "autorizacion_pin"
  | "recibo_pdf"
  | "aprobacion_inventario"
  | "exportacion"
  | "reportes"
  | "reportes_operacion"
  | "reportes_rentabilidad";
export type Feature = FeatureConocida | (string & {});

export interface SesionUsuario {
  id: number;
  username: string;
  nombre?: string;
  rol: Rol;
  /** Módulos del ROL, en MAYÚSCULAS. */
  modulos: Modulo[];
}

export interface SesionNegocio {
  id: number;
  nombre: string;
  alias?: string;
  moneda?: string;
  tipoNegocio?: string;
  /** Features del PLAN, en minúsculas. */
  features?: Feature[];
}

export interface LoginResponse {
  accessToken: string;
  usuario: SesionUsuario;
  negocio: SesionNegocio;
  licencia?: EstadoLicencia;
}

/** GET /auth/me — el token ya resuelto por el backend. */
export interface Me {
  id: number;
  username: string;
  rol: Rol;
  negocioId: number | null;
  modulos: Modulo[];
  esPlataforma: boolean;
}

// ── Catálogo ────────────────────────────────────────────────────────────────

/**
 * Tipos de producto del backend. La app Android los muestra como
 * Producto / Elaborado / Combo:
 *   ALMACENABLE → "Producto"  (controla stock)
 *   SERVICIO    → "Elaborado" (no controla stock)
 *   COMPUESTO   → "Combo"     (receta que descuenta ingredientes al vender)
 */
export type TipoProducto = "ALMACENABLE" | "SERVICIO" | "COMPUESTO";

export interface Categoria {
  id: number;
  nombre: string;
  activo: boolean;
  esInsumo?: boolean;
}

export interface UnidadMedida {
  id: number;
  nombre: string;
  abreviatura: string | null;
  activo: boolean;
}

/** Componente de la receta de un COMPUESTO. */
export interface ComponenteProducto {
  ingredienteId: number;
  nombre?: string;
  cantidad: number;
}

export interface Producto {
  id: number;
  nombre: string;
  descripcion: string | null;
  codBarra: string | null;
  tipoProducto: TipoProducto;
  precio: number;
  costo: number;
  stockMinimo: number;
  habilitado: boolean;
  icono: string | null;
  categoria: Pick<Categoria, "id" | "nombre"> | null;
  unidadMedida: Pick<UnidadMedida, "id" | "nombre"> | null;
  stockTotal: number;
  componentes: ComponenteProducto[];
}

export interface ProductoInput {
  /** Idempotencia: el backend deduplica un reintento con el mismo id. */
  clienteRequestId?: string;
  nombre: string;
  precio: number;
  unidadMedidaId: number;
  tipoProducto?: TipoProducto;
  costo?: number;
  stockMinimo?: number;
  /** El backend crea la "Carga inicial" con este monto. */
  stockInicial?: number;
  descripcion?: string;
  codBarra?: string;
  habilitado?: boolean;
  categoriaId?: number;
  icono?: string;
  componentes?: { ingredienteId: number; cantidad: number }[];
}

// ── Inventario ──────────────────────────────────────────────────────────────

export interface ArticuloDeAlmacen {
  id: number;
  nombre: string;
  unidad: string;
  stock: number;
  costo: number;
}

export interface Almacen {
  id: number;
  nombre: string;
  grupo: string | null;
  activo: boolean;
  totalArticulos?: number;
  totalUnidades?: number;
  valorTotal?: number;
  articulos?: ArticuloDeAlmacen[];
}

export interface AlmacenInput {
  nombre: string;
  grupo?: string;
  activo?: boolean;
}

export interface Insumo {
  id: number;
  nombre: string;
  codigo: string | null;
  categoria: Pick<Categoria, "id" | "nombre"> | null;
  categoriaId: number | null;
  unidad: Pick<UnidadMedida, "id" | "nombre" | "abreviatura"> | null;
  unidadMedidaId: number | null;
  stock: number;
  costoCompra: number;
  puntoReorden: number;
  proveedor: string | null;
  /** ISO yyyy-MM-dd. */
  vencimiento: string | null;
  almacen: Pick<Almacen, "id" | "nombre"> | null;
  habilitado: boolean;
}

export interface InsumoInput {
  nombre: string;
  unidadMedidaId: number;
  costoCompra: number;
  categoriaId?: number;
  puntoReorden?: number;
  proveedor?: string;
  vencimiento?: string;
  almacenId?: number;
}

export type TipoMovimiento = "ENTRADA" | "SALIDA" | "AJUSTE";
export type EstadoDocumento = "PENDIENTE" | "APROBADO" | "ANULADO";

export interface Movimiento {
  id: number;
  tipo: TipoMovimiento;
  comprobante: string | null;
  descripcion: string | null;
  estado: EstadoDocumento;
  fecha: string;
  fechaAprobacion: string | null;
  /** De dónde salen los artículos del movimiento. */
  origen: "PRODUCTO" | "INSUMO" | null;
  almacen: Pick<Almacen, "id" | "nombre"> | null;
  items: number;
  monto: number;
  detalles?: DetalleMovimiento[];
}

export interface DetalleMovimiento {
  id: number;
  productoId: number;
  producto: string;
  cantidad: number;
  costo: number;
  subtotal?: number;
  descripcion: string | null;
}

/** Artículo elegible en un movimiento (productos + insumos en una sola lista). */
export interface ArticuloMovimiento {
  id: number;
  nombre: string;
  esInsumo: boolean;
  costo: number;
  precio: number;
  stock: number;
  unidad: string;
}

export interface MovimientoInput {
  tipo: TipoMovimiento;
  almacenId: number;
  /** yyyy-MM-dd; si falta, el backend usa hoy. */
  fecha?: string;
  comprobante?: string;
  descripcion?: string;
  detalles?: DetalleMovimientoInput[];
}

export interface DetalleMovimientoInput {
  productoId: number;
  cantidad: number;
  costo?: number;
  descripcion?: string;
}

// ── Caja ────────────────────────────────────────────────────────────────────

export interface Caja {
  id: number;
  estado: "ABIERTA" | "CERRADA";
  fechaApertura: string;
  montoApertura: number;
  descripcion: string | null;
  usuarioAperturaId: number | null;
  fechaCierre: string | null;
  montoCierre: number | null;
  montoDiferencia: number | null;
  notaCierre: string | null;
}

export interface FormaPago {
  id: number;
  nombre: string;
}

export interface MovimientoCaja {
  id: number;
  cajaId?: number;
  tipo: "INGRESO" | "EGRESO";
  monto: number;
  descripcion: string | null;
  usuarioId?: number | null;
  fecha: string;
}

export interface ResumenCaja {
  cajaId: number;
  estado: "ABIERTA" | "CERRADA";
  montoApertura: number;
  cantidadVentas: number;
  totalVentas: number;
  anuladas: number;
  porFormaPago: { nombre: string; monto: number }[];
  efectivo: number;
  cambioEntregado: number;
  ingresos: number;
  egresos: number;
  movimientos: MovimientoCaja[];
  creditoOtorgado: number;
  abonosCredito: number;
  abonosEfectivo: number;
  abonosPorFormaPago: { nombre: string; monto: number }[];
  saldoEsperado: number;
}

// ── Ventas ──────────────────────────────────────────────────────────────────

export type TipoPedido = "LOCAL" | "DELIVERY" | "RECOGER";
export type EstadoEntrega = "PENDIENTE" | "ENTREGADO" | "CANCELADO";
/** Marca por línea para la comanda: se consume en mesa o se lleva. */
export type Consumo = "MESA" | "LLEVAR";

export interface PagoVenta {
  formaPagoId: number;
  formaPago?: string;
  monto: number;
  recibido?: number;
  entregado?: number;
}

export interface DetalleVenta {
  productoId: number;
  producto: string;
  cantidad: number;
  precio: number;
  subtotal: number;
  nota: string | null;
  consumo: Consumo;
}

export interface Venta {
  id: number;
  comprobante: string | null;
  estado: EstadoDocumento;
  fecha: string;
  fechaAprobacion?: string | null;
  cajaId?: number;
  almacenId?: number;
  cajero?: string | null;
  total: number;
  cambio?: number;
  items?: number;
  detalles?: DetalleVenta[];
  pagos?: PagoVenta[];
  formasPago?: string[];
  anuladaEn?: string | null;
  anulacionAutorizadaPor?: string | null;
  // Bloque de entrega (delivery / recoger)
  tipoPedido: TipoPedido;
  estadoEntrega: EstadoEntrega | null;
  prepagado: boolean;
  clienteNombre: string | null;
  clienteDireccion: string | null;
  clienteTelefono: string | null;
  tarifaEnvio: number;
  minutosEstimados: number | null;
  notaPedido: string | null;
  entregadoEn: string | null;
  repartidor?: { id: number; nombre: string } | null;
  /** Lo que se cobra al entregar (0 si ya se pagó en caja). */
  totalACobrar?: number;
  /** Lo que el repartidor entrega al negocio (sin su tarifa de envío). */
  montoRendicion?: number;
  credito?: Credito | null;
}

export interface DetalleVentaInput {
  productoId: number;
  cantidad: number;
  /** Informativo: el backend cobra el precio del catálogo. */
  precio?: number;
  nota?: string;
  consumo?: Consumo;
}

export interface PagoInput {
  formaPagoId: number;
  monto: number;
  recibido?: number;
}

/** Datos del fiado cuando la venta se cobra a crédito. */
export interface CreditoInput {
  clienteId?: number;
  clienteNombre?: string;
  clienteTelefono?: string;
  /** ISO 8601 con offset (el backend lo exige así). */
  fechaCompromiso: string;
  nota?: string;
}

export interface VentaInput {
  clienteRequestId?: string;
  almacenId?: number;
  detalles: DetalleVentaInput[];
  /** Vacío/ausente en un pedido contra entrega: todavía no se cobró nada. */
  pagos?: PagoInput[];
  tipoPedido?: TipoPedido;
  clienteNombre?: string;
  clienteDireccion?: string;
  clienteTelefono?: string;
  repartidorId?: number;
  tarifaEnvio?: number;
  prepagado?: boolean;
  minutosEstimados?: number;
  notaPedido?: string;
  credito?: CreditoInput;
}

export interface Repartidor {
  id: number;
  nombre: string;
  zona: string | null;
  vehiculo: string | null;
}

/** Anular pide el PIN siempre; el cajero además manda el usuario que autoriza. */
export interface AnularVentaInput {
  autorizadorUsername?: string;
  autorizadorPin?: string;
}

// ── Créditos (fiado) ────────────────────────────────────────────────────────

export type EstadoCredito = "PENDIENTE" | "ABONADO" | "PAGADO" | "ANULADO";

export interface Credito {
  id: number;
  codigo: string | null;
  ventaId: number;
  comprobante?: string | null;
  fechaVenta?: string;
  clienteId: number;
  clienteNombre: string;
  clienteTelefono: string | null;
  montoTotal: number;
  adelanto: number;
  pagado?: number;
  saldo: number;
  /** 0..1 — cuánto del total ya se abonó. */
  progreso?: number;
  fechaCompromiso: string;
  estado: EstadoCredito;
  abonos?: number;
  vencido: boolean;
  diasVencido?: number;
  nota?: string | null;
}

export interface ClienteCredito {
  id: number;
  nombre: string;
  telefono: string | null;
  nota: string | null;
  saldoTotal: number;
  montoVencido: number;
  creditosAbiertos: number;
  vecesFiado: number;
}

/** Un abono simple lleva monto+forma; uno mixto reparte en varias formas. */
export interface AbonoInput {
  monto?: number;
  formaPagoId?: number;
  pagos?: { monto: number; formaPagoId: number }[];
  nota?: string;
}

export type FiltroCredito = "por_cobrar" | "vencidos" | "vencen_pronto" | "pagados";

// ── Usuarios ────────────────────────────────────────────────────────────────

export interface Usuario {
  id: number;
  nombre: string;
  /** El backend devuelve el username bajo la clave `usuario`. */
  usuario: string;
  rol: Rol;
  activo: boolean;
  email: string | null;
  telefono: string | null;
  notas: string | null;
  zona: string | null;
  vehiculo: string | null;
  creado: string;
  ultimoLogin: string | null;
  /** El PIN nunca sale del backend; sólo se sabe si tiene uno cargado. */
  tienePin: boolean;
}

export interface CrearUsuarioInput {
  nombre: string;
  username: string;
  password: string;
  rol: Rol;
  email?: string;
  telefono?: string;
  notas?: string;
  zona?: string;
  vehiculo?: string;
}

/**
 * Los opcionales viajan como cadena vacía cuando se quieren borrar: mandar
 * null sería indistinguible de "no tocar este campo" y el dato quedaría
 * pegado para siempre (misma convención que la app Android).
 */
export interface ActualizarUsuarioInput {
  nombre?: string;
  rol?: Rol;
  email?: string;
  telefono?: string;
  notas?: string;
  zona?: string;
  vehiculo?: string;
}

// ── Dashboard y licencia ────────────────────────────────────────────────────

export interface Dashboard {
  articulos: number;
  almacenes: number;
  totalInventario: number;
  bajoStock: number;
  stockCritico: { id: number; nombre: string; stock: number; stockMinimo: number }[];
  movimientos: {
    id: number;
    comprobante: string | null;
    tipo: TipoMovimiento;
    estado: EstadoDocumento;
    fecha: string;
    almacen: string;
    items: number;
    monto: number;
  }[];
}

export type SituacionLicencia =
  | "activa"
  | "prueba"
  | "por_vencer"
  | "en_gracia"
  | "vencida"
  | "suspendida"
  | "plataforma";

export interface EstadoLicencia {
  vencimiento: string | null;
  diasGracia: number;
  urlPago: string;
  situacion: SituacionLicencia;
  vigente: boolean;
  diasRestantes: number | null;
  diasParaBloqueo: number | null;
  mensaje: string;
}

// ── Reportes ────────────────────────────────────────────────────────────────

/** Rango que aceptan todos los reportes (ISO). Sin él, últimos 7 días. */
export interface RangoReporte {
  desde?: string;
  hasta?: string;
}

export interface ResumenReportes {
  totales?: {
    ventas: number;
    ingresos: number;
    ticketPromedio: number;
    anuladas: number;
    pendientes: number;
  };
  [k: string]: unknown;
}

export interface TopProducto {
  id: number;
  nombre: string;
  cantidad: number;
  total: number;
  [k: string]: unknown;
}
