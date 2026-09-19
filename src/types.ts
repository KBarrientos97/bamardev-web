// Tipos del dominio, calcados de los DTOs del backend (bamardev-backend).
// Se mantienen los nombres del API en español para que no haya traducción
// mental entre lo que viaja por la red y lo que se lee acá.

// ── Sesión y permisos ───────────────────────────────────────────────────────

/** Roles de la app. El backend los devuelve en mayúsculas. */
export type Rol =
  | "ADMIN"
  | "SUPERVISOR"
  | "CAJERO"
  | "REPARTIDOR"
  /** Atiende el salón: abre mesas y manda comandas, pero NO cobra. */
  | "MESERO"
  | "PLATAFORMA";

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
  | "salon"
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
  /**
   * Sucursal del que entró. **`null` = toda la organización.**
   *
   * Opcional porque una sesión guardada ANTES de que el backend lo mandara se
   * rehidrata desde localStorage sin el campo: ahí vale `undefined`, que no es
   * lo mismo que `null`. Por eso se compara con `== null` donde importa.
   */
  sucursalId?: number | null;
  sucursal?: string | null;
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

/**
 * Qué hace falta para venderle un medicamento a alguien. Sale del Reglamento
 * de Farmacias, no de una preferencia del negocio: es lo que dice el registro
 * del producto.
 *
 * LIBRE es el valor de todo lo demás —un pañal, una leche, un termómetro— y de
 * los de venta libre. En Bolivia los antibióticos entran ahí: **no** exigen
 * receta, a diferencia de otros países.
 */
export type CondicionVenta =
  | "LIBRE"
  | "RECETA_MEDICA"
  /** La farmacia se queda la receta (psicotrópicos). */
  | "RECETA_ARCHIVADA"
  /** Formulario oficial numerado (estupefacientes). */
  | "RECETA_VALORADA";

/**
 * Ficha farmacéutica. Viaja en todos los productos: en un artículo de
 * restaurante son cinco nulos, venta libre y dos `false`.
 */
export interface FichaFarmaceutica {
  /** La droga: "Paracetamol". Es por lo que busca el farmacéutico. */
  principioActivo: string | null;
  /** "500 mg", "20 mg/ml". */
  concentracion: string | null;
  /** Comprimido, Cápsula, Jarabe… o "Paquete" para lo que no es remedio. */
  formaFarmaceutica: string | null;
  /** Laboratorio o marca: BAGÓ, IFA… y también Huggies. */
  laboratorio: string | null;
  registroSanitario: string | null;
  condicionVenta: CondicionVenta;
  /** Se compra y se vende por lote con vencimiento. */
  manejaLote: boolean;
  /** Psicotrópico o estupefaciente (Ley 1737). */
  controlado: boolean;
}

export interface Producto extends FichaFarmaceutica {
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

/** Lo que devuelve `GET /productos/buscar`: una página, no el catálogo. */
export interface PaginaProductos {
  items: Producto[];
  /** Cuántos hay en total con ese filtro, para decir "30 de 412". */
  total: number;
  limite: number;
  offset: number;
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
  // Ficha farmacéutica: la manda el formulario de farmacia y nadie más.
  principioActivo?: string;
  concentracion?: string;
  formaFarmaceutica?: string;
  laboratorio?: string;
  registroSanitario?: string;
  condicionVenta?: CondicionVenta;
  manejaLote?: boolean;
  controlado?: boolean;
}

// ── Inventario ──────────────────────────────────────────────────────────────

export interface ArticuloDeAlmacen {
  id: number;
  nombre: string;
  unidad: string;
  stock: number;
  costo: number;
}

/**
 * SUCURSAL vende (tiene caja y usuarios) · DEPOSITO sólo guarda y despacha.
 *
 * Un depósito no aparece en el POS y no cuenta para el cupo de sucursales del
 * plan: cobrarle al negocio por un lugar que no vende no se sostiene.
 */
export type TipoAlmacen = "SUCURSAL" | "DEPOSITO";

export interface Almacen {
  id: number;
  nombre: string;
  grupo: string | null;
  activo: boolean;
  tipo: TipoAlmacen;
  /**
   * La sucursal por defecto del negocio: la que se usa cuando una operación no
   * dice de cuál se trata. Hay exactamente una por negocio.
   */
  esPrincipal: boolean;
  direccion: string | null;
  telefono: string | null;
  totalArticulos?: number;
  totalUnidades?: number;
  valorTotal?: number;
  articulos?: ArticuloDeAlmacen[];
}

export interface AlmacenInput {
  nombre: string;
  grupo?: string;
  activo?: boolean;
  tipo?: TipoAlmacen;
  direccion?: string;
  telefono?: string;
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

export type TipoMovimiento = "ENTRADA" | "SALIDA" | "AJUSTE" | "TRANSFERENCIA";
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
  /** En una TRANSFERENCIA es el almacén de ORIGEN. */
  almacen: Pick<Almacen, "id" | "nombre"> | null;
  /** Sólo en TRANSFERENCIA: a dónde va la mercadería. */
  almacenDestino?: Pick<Almacen, "id" | "nombre"> | null;
  items: number;
  /**
   * Nombres de lo que se movió, sin repetir. Opcional: un backend anterior no
   * lo manda y la pantalla vuelve a "3 artículos".
   */
  productos?: string[];
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
  /** Rubro farmacia: la partida que entró en esta línea. */
  loteCodigo?: string | null;
  loteVencimiento?: string | null;
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
  /**
   * Si se compra y se vende por lote con vencimiento (rubro farmacia). El
   * formulario de ingreso pide lote y fecha sólo en estas líneas.
   */
  manejaLote?: boolean;
}

export interface MovimientoInput {
  tipo: TipoMovimiento;
  /** En una TRANSFERENCIA es el almacén de ORIGEN. */
  almacenId: number;
  /** Obligatorio en TRANSFERENCIA, rechazado en los demás tipos. */
  almacenDestinoId?: number;
  /** yyyy-MM-dd; si falta, el backend usa hoy. */
  fecha?: string;
  comprobante?: string;
  descripcion?: string;
  detalles?: DetalleMovimientoInput[];
}

/**
 * Lo que un producto tiene DISTINTO en una sucursal.
 *
 * Sólo existen filas para las EXCEPCIONES: si no hay fila, manda el precio del
 * catálogo. Por eso un negocio de un solo local nunca ve nada acá.
 */
export interface PrecioSucursal {
  productoId: number;
  producto: string | null;
  /** El del catálogo, para poder mostrar "Bs 12 → 15" sin otra consulta. */
  precioLista: number | null;
  /** null = usa el del catálogo. */
  precio: number | null;
  costo: number | null;
  stockMinimo: number | null;
  disponible: boolean;
  orden: number | null;
}

export interface PrecioSucursalInput {
  productoId: number;
  precio?: number | null;
  costo?: number | null;
  stockMinimo?: number | null;
  disponible?: boolean;
  orden?: number | null;
}

/** Por qué se movió el stock. Alimenta la bitácora. */
export type MotivoStock =
  | "VENTA"
  | "ANULACION"
  | "ENTRADA"
  | "SALIDA"
  | "AJUSTE"
  | "TRANSFERENCIA_SALIDA"
  | "TRANSFERENCIA_ENTRADA"
  | "COMBO";

/**
 * Una línea de la bitácora de stock.
 *
 * `cantidad` va CON SIGNO (positivo entra, negativo sale) y `saldoDespues` es lo
 * que quedó: juntos contestan "¿por qué este producto tiene 7 y no 10?".
 */
export interface ApunteStock {
  id: number;
  cantidad: number;
  saldoDespues: number;
  motivo: MotivoStock;
  fecha: string;
  producto: { id: number; nombre: string } | null;
  almacen: { id: number; nombre: string } | null;
  /** Null = proceso automático (el armado de un combo, por ejemplo). */
  usuario: { id: number; username: string; nombre: string | null } | null;
  referenciaTipo: string | null;
  referenciaId: number | null;
}

export interface DetalleMovimientoInput {
  productoId: number;
  cantidad: number;
  costo?: number;
  descripcion?: string;
  /**
   * Lote y vencimiento (rubro farmacia). Sólo se mandan en una ENTRADA: es lo
   * que dice el papel de la compra. Una salida no elige lote — sale el más
   * próximo a vencer, que es la regla del depósito.
   */
  loteCodigo?: string;
  /** yyyy-MM-dd */
  loteVencimiento?: string;
}

// ── Lotes y vencimientos (rubro farmacia) ───────────────────────────────────

/** En qué tramo del semáforo cae un vencimiento. */
export type TramoVencimiento =
  | "VENCIDO"
  | "HASTA_30"
  | "HASTA_60"
  | "HASTA_90"
  | "LEJOS";

export interface LoteConSaldo {
  loteId: number;
  codigo: string;
  vencimiento: string | null;
  /** Negativo = ya venció. Null si el lote no tiene fecha. */
  diasRestantes: number | null;
  tramo: TramoVencimiento | null;
  cantidad: number;
  costoUnitario: number | null;
  almacen: { id: number; nombre: string };
}

export interface LotePorVencer extends LoteConSaldo {
  diasRestantes: number;
  tramo: TramoVencimiento;
  /** Cantidad × costo: la plata parada en este lote. */
  valor: number;
  producto: { id: number; nombre: string; laboratorio: string | null };
}

// ── Encargos (rubro farmacia) ───────────────────────────────────────────────

/**
 * Por dónde va un encargo. El flujo es lineal: alguien pide algo que no hay →
 * se le pide al proveedor → llega → se entrega.
 */
export type EstadoEncargo =
  | "ANOTADO"
  | "PEDIDO"
  | "LLEGO"
  | "ENTREGADO"
  | "CANCELADO";

export interface Encargo {
  id: number;
  /** Lo que pidió, tal como se escribió. */
  descripcion: string;
  cantidad: number;
  estado: EstadoEncargo;
  clienteNombre: string | null;
  clienteTelefono: string | null;
  nota: string | null;
  /** El artículo del catálogo, si está. Null = algo que todavía no se vende. */
  producto: { id: number; nombre: string; laboratorio: string | null } | null;
  almacen: { id: number; nombre: string } | null;
  /** Quién lo anotó. */
  usuario: string | null;
  creadoEn: string;
  llegoEn: string | null;
  entregadoEn: string | null;
  /** Cuántas personas están esperando este mismo producto. */
  pedidoPor: number;
  /** Varios lo esperan: vale la pena traer más de uno. */
  muyPedido: boolean;
  /** Ya hay stock de lo encargado: se le puede avisar. */
  hayStock: boolean;
  diasEsperando: number;
}

export interface ListaEncargos {
  anotados: number;
  pedidos: number;
  llegaron: number;
  entregados: number;
  cancelados: number;
  /** Lo que sigue esperando: el número que dice si hay trabajo. */
  abiertos: number;
  items: Encargo[];
}

export interface EncargoInput {
  productoId?: number;
  descripcion: string;
  cantidad?: number;
  clienteNombre?: string;
  clienteTelefono?: string;
  nota?: string;
}

export interface ContadorTramo {
  lotes: number;
  unidades: number;
  valor: number;
}

export interface Vencimientos {
  vencidos: ContadorTramo;
  hasta30: ContadorTramo;
  hasta60: ContadorTramo;
  hasta90: ContadorTramo;
  /** Lo que cuesta todo lo que está por vencer o ya venció. */
  valorEnRiesgo: number;
  detalle: LotePorVencer[];
}

// ── Caja ────────────────────────────────────────────────────────────────────

export interface Caja {
  id: number;
  estado: "ABIERTA" | "CERRADA";
  fechaApertura: string;
  montoApertura: number;
  descripcion: string | null;
  usuarioAperturaId: number | null;
  /**
   * En qué sucursal se abrió. La caja fija el local de TODO el turno: de ahí
   * sale el stock que se descuenta y los precios que se cobran.
   */
  almacenId: number | null;
  /** Nombre de esa sucursal, para mostrarlo en el POS sin pedir la lista. */
  almacen: string | null;
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
  /** Techo con el que nace la ficha de un cliente nuevo. */
  limiteCredito?: number;
  /** Firma del encargado cuando la venta pasa el techo del cliente. */
  autorizadorUsername?: string;
  autorizadorPin?: string;
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
  /** Días que lleva pasado el compromiso. Es el nombre que usa el backend. */
  diasAtraso?: number;
  /** Días que faltan para vencer. 0 = vence hoy. */
  diasParaVencer?: number;
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
  /** Techo de deuda que le fijó el dueño. null = sin límite. */
  limiteCredito: number | null;
  /** Cuánto más se le puede fiar hoy. null cuando no tiene límite. */
  disponible: number | null;
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
  /**
   * A qué sucursal pertenece. **`null` = toda la organización** (el dueño, que
   * ve el consolidado), no "sin asignar" — mostrarlo como un dato faltante
   * invitaría a "arreglarlo" atando al dueño a un solo local.
   */
  sucursalId: number | null;
  /** Nombre de esa sucursal, para no tener que cruzarlo con la lista. */
  sucursal: string | null;
  sucursalDesde: string | null;
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
  /** null u omitido = toda la organización. Sólo lo fija un admin de negocio. */
  sucursalId?: number | null;
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
  /**
   * Acá `null` SÍ es un valor: "pasalo a toda la organización". Es la
   * excepción a la regla de la cadena vacía de arriba, porque el campo es un
   * id y no un texto — el backend distingue ausente (no tocar) de null.
   */
  sucursalId?: number | null;
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
  /**
   * Código de activación del negocio (BMD-XXXX). Es con lo que la pantalla de
   * pago pide el QR: la licencia bloqueada rechaza todo request autenticado,
   * así que no se puede pedir con el token.
   */
  codigoActivacion?: string | null;
}

// -- Pago de la licencia por QR (pantalla pública /pagar) --------------------

/** El QR con el que un negocio paga su licencia. */
export interface CobroQr {
  alias: string;
  monto: number;
  moneda: string;
  /** MENSUAL | SEMESTRAL | ANUAL */
  periodo: string;
  /** Meses que cubre el cobro (1, 6 o 12). */
  meses: number;
  /** PENDIENTE | PAGADO | ANULADO | VENCIDO */
  estado: string;
  venceEn: string;
  /** Data URL de la imagen. Sólo viene al generarlo, no al consultar estado. */
  imagenQr?: string;
}

/** Períodos que el cliente puede elegir al pagar su licencia. */
export type PeriodoCobrable = "MENSUAL" | "SEMESTRAL" | "ANUAL";

/**
 * Una opción de pago, tal como la calcula el BACKEND.
 *
 * Los montos no se calculan en el front a propósito: si la pantalla armara el
 * total, cualquiera podría pagar lo que quisiera.
 */
export interface OpcionPago {
  periodo: PeriodoCobrable;
  meses: number;
  total: number;
  /** Lo que "sale por mes" con ese plazo, para comparar de un vistazo. */
  mensualEquivalente: number;
  /** Cuánto se ahorra contra pagar mes por mes. 0 en el mensual. */
  ahorro: number;
  /** Fracción: 0.075 = 7,5 %. */
  descuento: number;
  /**
   * Hasta cuándo queda cubierto el negocio si paga ESTE plazo ("yyyy-MM-dd").
   *
   * Lo calcula el backend con la misma función que aplica el pago
   * (`baseDeExtension` + `avanzarVencimiento`): si el front lo estimara por su
   * cuenta, podría prometer una fecha y aplicarse otra.
   */
  cubreHasta: string;
}

export interface OpcionesPagoLicencia {
  plan: string;
  moneda: string;
  /** Hasta cuándo está cubierto hoy ("yyyy-MM-dd"), o null si nunca tuvo. */
  vencimientoActual: string | null;
  /** Si ya venció: cambia el texto ("vencida el…" en vez de "vence el…"). */
  vencida: boolean;
  opciones: OpcionPago[];
}

/** Lo que devuelve el sondeo mientras se espera el pago. */
export interface EstadoCobroQr {
  alias: string;
  estado: string;
  monto: number;
  venceEn: string;
  pagadoEn: string | null;
}

// ── Reportes ────────────────────────────────────────────────────────────────

/** Rango que aceptan todos los reportes (ISO). Sin él, últimos 7 días. */
export interface RangoReporte {
  desde?: string;
  hasta?: string;
  /**
   * Sucursal de la que se piden los numeros. **Ausente = todas**, el
   * consolidado del negocio.
   *
   * Viaja con el rango y no aparte porque es el otro filtro que TODOS los
   * reportes comparten: como cada llamada hace `qs({ ...rango })`, agregarlo
   * aca lo mando a los 23 endpoints de una.
   */
  sucursalId?: number;
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

// ── Historial de costos de un artículo ──────────────────────────────────────

/** Una compra de este artículo: a cuánto llegó y contra qué se compara. */
export interface CompraCosto {
  movimientoId: number;
  fecha: string;
  comprobante: string | null;
  descripcion: string | null;
  almacen: string | null;
  cantidad: number;
  costoUnitario: number;
  total: number;
  /** A cuánto venía antes de esta compra; null en la más vieja de la lista. */
  costoAnterior: number | null;
  /** % contra la compra anterior: + llegó más caro, − más barato. */
  variacion: number | null;
  /** Es la compra que dejó el costo que hoy muestra la ficha. */
  esCostoActual: boolean;
}

/** `GET /productos/:id/costos` — vale también para insumos. */
export interface HistorialCostos {
  productoId: number;
  nombre: string;
  esInsumo: boolean;
  unidad: string | null;
  /** El que está cargado hoy en la ficha del artículo. */
  costoActual: number;
  /** El de la compra más reciente; null si nunca se compró con costo. */
  ultimoCosto: number | null;
  costoMinimo: number | null;
  costoMaximo: number | null;
  /** Promedio ponderado por cantidad (no simple): plata / unidades. */
  costoPromedio: number | null;
  cantidadTotal: number;
  montoTotal: number;
  compras: CompraCosto[];
}

// ── Finanzas: historial de ventas y compras ─────────────────────────────────
// Los ocho reportes de la sección Finanzas de la app. Los contratos salen de
// `reportes.service.ts`; los montos ya vienen redondeados y las fechas como
// ISO 8601 UTC.

/** Paginación común a los cinco reportes paginados. Siempre bajo `pagina`. */
export interface PaginaMeta {
  page: number;
  limite: number;
  /** Filas del rango COMPLETO, no de la página. */
  total: number;
  totalPaginas: number;
}

export interface ReporteVentasGeneral {
  totales: {
    ventas: number;
    ingresos: number;
    ticketPromedio: number;
    anuladas: number;
    pendientes: number;
  };
  vendedores: { id: number; nombre: string }[];
  items: {
    id: number;
    comprobante: string;
    fecha: string;
    cliente: string;
    vendedor: string;
    estado: EstadoDocumento;
    /** Nombre de la forma de pago, o "Mixto" / "Sin cobrar". */
    metodoPago: string;
    articulos: number;
    /**
     * De que local salio. Null en las respuestas viejas y en negocios de una
     * sola sucursal, donde la columna no se muestra.
     */
    sucursal?: string | null;
    total: number;
  }[];
  pagina: PaginaMeta;
}

export interface ReporteVentasDetalle {
  totales: {
    /** Unidades: puede ser fraccionario (venta por peso). */
    productos: number;
    recaudado: number;
    precioPromedio: number;
    lineas: number;
  };
  items: {
    ventaId: number;
    comprobante: string;
    fecha: string;
    vendedor: string;
    producto: string;
    codigo: string | null;
    cantidad: number;
    precio: number;
    subtotal: number;
    /** De que local salio (ver ReporteVentasGeneral). */
    sucursal?: string | null;
  }[];
  pagina: PaginaMeta;
}

/** FUTURO se pinta distinto de un 0 real: todavía no pasó. */
export type EstadoMesVentas = "FUTURO" | "CON_VENTAS" | "SIN_VENTAS";

export interface ReporteVentasMensual {
  anio: number;
  /** Años del selector, ascendente. */
  anios: number[];
  /** Siempre 12, enero a diciembre. */
  meses: {
    mes: number;
    nombre: string;
    ventas: number;
    total: number;
    estado: EstadoMesVentas;
  }[];
  totales: {
    ventas: number;
    total: number;
    mesesConVentas: number;
    /** Sobre los meses CON ventas, no dividido por 12. */
    promedioMensual: number;
    mejorMes: { nombre: string; total: number } | null;
  };
}

/** De qué son las líneas de la compra. VACIO = el movimiento no tiene líneas. */
export type OrigenCompra = "INSUMO" | "PRODUCTO" | "MIXTO" | "VACIO";

export interface ReporteComprasGeneral {
  totales: {
    compras: number;
    invertido: number;
    promedioCompra: number;
    anuladas: number;
    pendientes: number;
  };
  items: {
    id: number;
    comprobante: string;
    fecha: string;
    almacen: string;
    descripcion: string | null;
    estado: EstadoDocumento;
    origen: OrigenCompra;
    articulos: number;
    total: number;
  }[];
  pagina: PaginaMeta;
}

export interface ReporteComprasDetalle {
  totales: {
    articulos: number;
    costoTotal: number;
    costoPromedio: number;
    lineas: number;
  };
  items: {
    compraId: number;
    comprobante: string;
    fecha: string;
    almacen: string;
    producto: string;
    codigo: string | null;
    esInsumo: boolean;
    unidad: string | null;
    cantidad: number;
    costo: number;
    subtotal: number;
  }[];
  pagina: PaginaMeta;
}

export type EstadoMesCompras = "FUTURO" | "CON_COMPRAS" | "SIN_COMPRAS";

export interface ReporteComprasMensual {
  anio: number;
  anios: number[];
  meses: {
    mes: number;
    nombre: string;
    compras: number;
    total: number;
    estado: EstadoMesCompras;
  }[];
  totales: {
    compras: number;
    total: number;
    mesesConCompras: number;
    promedioMensual: number;
    mayorMes: { nombre: string; total: number } | null;
  };
}

/** El documento de una compra: para nosotros, un movimiento de ENTRADA. */
export interface ReporteCompraDocumento {
  id: number;
  comprobante: string;
  fecha: string;
  fechaAprobacion: string | null;
  almacen: string;
  descripcion: string | null;
  estado: EstadoDocumento;
  origen: OrigenCompra;
  articulos: number;
  total: number;
  items: {
    producto: string;
    codigo: string | null;
    esInsumo: boolean;
    unidad: string | null;
    cantidad: number;
    costo: number;
    subtotal: number;
    descripcion: string | null;
  }[];
}

/** COBRO_CREDITO no es un movimiento de caja: es un abono de fiado en efectivo. */
export type ClaseMovimientoCaja = "INGRESO" | "EGRESO" | "COBRO_CREDITO";

export interface ReporteMovimientosCaja {
  /**
   * Siempre de los dos sentidos y del período completo, aunque haya filtro
   * puesto: si no, el neto mentiría.
   */
  totales: {
    entradas: number;
    salidas: number;
    neto: number;
    movimientos: number;
    cobrosCredito: number;
  };
  items: {
    /** OJO: colisiona entre clases (dos tablas distintas). Ver la key de la lista. */
    id: number;
    clase: ClaseMovimientoCaja;
    fecha: string;
    concepto: string;
    detalle: string | null;
    usuario: string | null;
    /** El turno (caja) al que pertenece. */
    turnoId: number;
    /** Siempre positivo: el signo lo da `clase`. */
    monto: number;
  }[];
  pagina: PaginaMeta;
}

/** Lo que salió del mostrador en un turno, agrupado por categoría. */
export interface ReporteCierreProductos {
  categorias: {
    nombre: string;
    unidades: number;
    total: number;
    items: { nombre: string; cantidad: number; precio: number; total: number }[];
  }[];
  unidades: number;
  total: number;
  /** Productos DISTINTOS, no suma de unidades. */
  lineas: number;
}
