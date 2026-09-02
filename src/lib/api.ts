import type {
  AbonoInput,
  Almacen,
  AlmacenInput,
  AnularVentaInput,
  ArticuloMovimiento,
  ActualizarUsuarioInput,
  Caja,
  Categoria,
  ClienteCredito,
  Credito,
  CrearUsuarioInput,
  Dashboard,
  DetalleMovimiento,
  DetalleMovimientoInput,
  EstadoLicencia,
  FiltroCredito,
  FormaPago,
  Insumo,
  InsumoInput,
  LoginResponse,
  Me,
  Movimiento,
  MovimientoCaja,
  MovimientoInput,
  Producto,
  ProductoInput,
  RangoReporte,
  Repartidor,
  ResumenCaja,
  UnidadMedida,
  Usuario,
  Venta,
  VentaInput,
} from "../types";

// URL del backend. En los builds la fija VITE_API_URL (QA o PROD); en `npm run
// dev` queda vacía a propósito y pegamos a /api, que el proxy de Vite reenvía
// a QA: el navegador ve un mismo origen y no hay preflight que CORS_ORIGINS
// del VPS tenga que permitir.
const BASE = import.meta.env.VITE_API_URL || "/api";

const TOKEN_KEY = "bamardev_web_token";
export const USER_KEY = "bamardev_web_usuario";
export const NEGOCIO_KEY = "bamardev_web_negocio";

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

/** Rutas donde un 401 significa "credenciales mal", no "sesión vencida". */
const RUTAS_LOGIN = ["/auth/login", "/auth/panel/login"];

/** Error del API con el status y, si el backend lo mandó, el código de negocio. */
export class ApiError extends Error {
  status: number;
  /** LICENCIA_VENCIDA | LICENCIA_SUSPENDIDA cuando el 403 es por licencia. */
  codigo?: string;
  urlPago?: string;

  constructor(mensaje: string, status: number, extra?: Record<string, unknown>) {
    super(mensaje);
    this.name = "ApiError";
    this.status = status;
    this.codigo = extra?.codigo as string | undefined;
    this.urlPago = extra?.urlPago as string | undefined;
  }
}

function limpiarSesion() {
  tokenStore.clear();
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(NEGOCIO_KEY);
}

/**
 * Sesión vencida o token inválido: se borra todo rastro local y se vuelve al
 * login. El token de la app dura 7 días y no hay refresh, así que esto pasa
 * de verdad; sin este manejo cada acción mostraría "ocurrió un error" hasta
 * que el usuario adivinara que tiene que salir y entrar.
 */
function cerrarSesionVencida() {
  limpiarSesion();
  window.location.assign("/");
}

/** Serializa un query string omitiendo lo que no se mandó. */
function qs(params: Record<string, unknown> = {}): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** Llama al backend agregando el token y traduciendo errores a ApiError. */
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = tokenStore.get();
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (res.status === 401 && !RUTAS_LOGIN.includes(path)) {
    cerrarSesionVencida();
    throw new ApiError("La sesión venció, volvé a iniciar sesión", 401);
  }

  if (!res.ok) {
    let mensaje = "Ocurrió un error";
    let cuerpo: Record<string, unknown> = {};
    try {
      cuerpo = await res.json();
      const m = cuerpo.message;
      mensaje = Array.isArray(m) ? m.join(", ") : ((m as string) ?? mensaje);
    } catch {
      /* respuesta sin cuerpo JSON */
    }
    throw new ApiError(mensaje, res.status, cuerpo);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  // ── Sesión ────────────────────────────────────────────────────────────────
  /** El alias del negocio es obligatorio en la práctica: sin él responde 401. */
  login: (username: string, password: string, negocio: string) =>
    request<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password, negocio }),
    }),
  me: () => request<Me>("/auth/me"),
  licencia: () => request<EstadoLicencia>("/licencia/estado"),

  // ── Catálogo ──────────────────────────────────────────────────────────────
  getProductos: (eliminados?: boolean) =>
    request<Producto[]>(`/productos${qs({ eliminados: eliminados ? 1 : undefined })}`),
  getProducto: (id: number) => request<Producto>(`/productos/${id}`),
  crearProducto: (input: ProductoInput) =>
    request<Producto>("/productos", { method: "POST", body: JSON.stringify(input) }),
  actualizarProducto: (id: number, input: Partial<ProductoInput>) =>
    request<Producto>(`/productos/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  /** Baja lógica si el producto ya tiene historia (lo dice `archivado`). */
  eliminarProducto: (id: number) =>
    request<{ mensaje: string; archivado: boolean }>(`/productos/${id}`, { method: "DELETE" }),
  restaurarProducto: (id: number) =>
    request<{ mensaje: string }>(`/productos/${id}/restaurar`, { method: "POST" }),

  getCategorias: (esInsumo?: boolean) =>
    request<Categoria[]>(`/categorias${qs({ esInsumo })}`),
  crearCategoria: (input: { nombre: string; esInsumo?: boolean }) =>
    request<Categoria>("/categorias", { method: "POST", body: JSON.stringify(input) }),
  actualizarCategoria: (id: number, input: { nombre?: string; activo?: boolean }) =>
    request<Categoria>(`/categorias/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  eliminarCategoria: (id: number) =>
    request<{ mensaje: string }>(`/categorias/${id}`, { method: "DELETE" }),

  getUnidades: () => request<UnidadMedida[]>("/unidades-medida"),

  // ── Inventario ────────────────────────────────────────────────────────────
  getAlmacenes: () => request<Almacen[]>("/almacenes"),
  getAlmacen: (id: number) => request<Almacen>(`/almacenes/${id}`),
  crearAlmacen: (input: AlmacenInput) =>
    request<Almacen>("/almacenes", { method: "POST", body: JSON.stringify(input) }),
  actualizarAlmacen: (id: number, input: Partial<AlmacenInput>) =>
    request<Almacen>(`/almacenes/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  eliminarAlmacen: (id: number) =>
    request<{ mensaje: string }>(`/almacenes/${id}`, { method: "DELETE" }),

  getInsumos: () => request<Insumo[]>("/insumos"),
  crearInsumo: (input: InsumoInput) =>
    request<Insumo>("/insumos", { method: "POST", body: JSON.stringify(input) }),
  actualizarInsumo: (id: number, input: Partial<InsumoInput>) =>
    request<Insumo>(`/insumos/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  eliminarInsumo: (id: number) =>
    request<{ mensaje: string }>(`/insumos/${id}`, { method: "DELETE" }),

  getMovimientos: () => request<Movimiento[]>("/movimientos"),
  getMovimiento: (id: number) => request<Movimiento>(`/movimientos/${id}`),
  /** Productos e insumos juntos, con su stock en el almacén indicado. */
  getArticulosMovimiento: (almacenId?: number) =>
    request<ArticuloMovimiento[]>(`/movimientos/articulos${qs({ almacenId })}`),
  crearMovimiento: (input: MovimientoInput) =>
    request<Movimiento>("/movimientos", { method: "POST", body: JSON.stringify(input) }),
  actualizarMovimiento: (id: number, input: Partial<MovimientoInput>) =>
    request<Movimiento>(`/movimientos/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  agregarDetalleMovimiento: (id: number, input: DetalleMovimientoInput) =>
    request<DetalleMovimiento>(`/movimientos/${id}/detalles`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  actualizarDetalleMovimiento: (detId: number, input: Partial<DetalleMovimientoInput>) =>
    request<DetalleMovimiento>(`/movimientos/detalles/${detId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  eliminarDetalleMovimiento: (detId: number) =>
    request<{ mensaje: string }>(`/movimientos/detalles/${detId}`, { method: "DELETE" }),
  /** Aprobar es lo que realmente mueve el stock. */
  aprobarMovimiento: (id: number) =>
    request<Movimiento>(`/movimientos/${id}/aprobar`, { method: "POST" }),
  anularMovimiento: (id: number) =>
    request<Movimiento>(`/movimientos/${id}/anular`, { method: "POST" }),
  eliminarMovimiento: (id: number) =>
    request<{ mensaje: string }>(`/movimientos/${id}`, { method: "DELETE" }),

  getDashboard: () => request<Dashboard>("/dashboard"),

  // ── Caja ──────────────────────────────────────────────────────────────────
  getFormasPago: () => request<FormaPago[]>("/formas-pago"),
  /** Devuelve `{ caja: null }` cuando el usuario no tiene turno abierto. */
  cajaActual: () => request<{ caja: Caja | null }>("/caja/actual"),
  abrirCaja: (input: { montoApertura: number; descripcion?: string }) =>
    request<Caja>("/caja/abrir", { method: "POST", body: JSON.stringify(input) }),
  resumenCaja: (id: number) => request<ResumenCaja>(`/caja/${id}/resumen`),
  cerrarCaja: (id: number, input: { montoCierre: number; notaCierre?: string }) =>
    request<Caja>(`/caja/${id}/cerrar`, { method: "POST", body: JSON.stringify(input) }),
  getMovimientosCaja: (id: number) => request<MovimientoCaja[]>(`/caja/${id}/movimientos`),
  /** Sólo ADMIN y SUPERVISOR: el backend lo exige con RolesGuard. */
  crearMovimientoCaja: (
    id: number,
    input: { tipo: "INGRESO" | "EGRESO"; monto: number; descripcion: string },
  ) =>
    request<MovimientoCaja>(`/caja/${id}/movimientos`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  // ── Ventas ────────────────────────────────────────────────────────────────
  crearVenta: (input: VentaInput) =>
    request<Venta>("/ventas", { method: "POST", body: JSON.stringify(input) }),
  getVentas: (cajaId?: number) => request<Venta[]>(`/ventas${qs({ cajaId })}`),
  getVenta: (id: number) => request<Venta>(`/ventas/${id}`),
  anularVenta: (id: number, input: AnularVentaInput = {}) =>
    request<Venta>(`/ventas/${id}/anular`, { method: "POST", body: JSON.stringify(input) }),
  getRepartidores: () => request<Repartidor[]>("/ventas/repartidores"),
  /** Un REPARTIDOR ve sólo los suyos; cajera y encargado ven todos. */
  getPedidosPendientes: () => request<Venta[]>("/ventas/pendientes"),
  getMisEntregas: () => request<Venta[]>("/ventas/mis-entregas"),
  /** Sin pagos si el pedido ya venía prepagado en caja. */
  entregarPedido: (id: number, pagos?: PagoEntrega[]) =>
    request<Venta>(`/ventas/${id}/entregar`, {
      method: "POST",
      body: JSON.stringify(pagos?.length ? { pagos } : {}),
    }),
  cancelarPedido: (id: number) =>
    request<Venta>(`/ventas/${id}/cancelar`, { method: "POST" }),

  // ── Créditos (fiado) ──────────────────────────────────────────────────────
  getCreditos: (params: { filtro?: FiltroCredito; q?: string; clienteId?: number } = {}) =>
    request<Credito[]>(`/creditos${qs(params)}`),
  getCredito: (id: number) => request<Credito>(`/creditos/${id}`),
  getClientesCredito: () => request<ClienteCredito[]>("/creditos/clientes"),
  getResumenCreditos: () => request<Record<string, unknown>>("/creditos/resumen"),
  /** La caja donde entra el abono la resuelve el backend (la del cobrador). */
  registrarAbono: (id: number, input: AbonoInput) =>
    request<Credito>(`/creditos/${id}/abonos`, { method: "POST", body: JSON.stringify(input) }),

  // ── Usuarios ──────────────────────────────────────────────────────────────
  getUsuarios: () => request<Usuario[]>("/usuarios"),
  crearUsuario: (input: CrearUsuarioInput) =>
    request<Usuario>("/usuarios", { method: "POST", body: JSON.stringify(input) }),
  actualizarUsuario: (id: number, input: ActualizarUsuarioInput) =>
    request<Usuario>(`/usuarios/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  cambiarPassword: (id: number, password: string) =>
    request<{ mensaje: string }>(`/usuarios/${id}/password`, {
      method: "PATCH",
      body: JSON.stringify({ password }),
    }),
  cambiarPin: (id: number, pin: string) =>
    request<{ mensaje: string }>(`/usuarios/${id}/pin`, {
      method: "PATCH",
      body: JSON.stringify({ pin }),
    }),
  cambiarEstadoUsuario: (id: number, activo: boolean) =>
    request<Usuario>(`/usuarios/${id}/estado`, {
      method: "PATCH",
      body: JSON.stringify({ activo }),
    }),

  // ── Reportes ──────────────────────────────────────────────────────────────
  // Todos aceptan ?desde&hasta en ISO; sin ellos el backend usa 7 días.
  reporte: <T = unknown>(nombre: string, rango: RangoReporte = {}, extra = {}) =>
    request<T>(`/reportes/${nombre}${qs({ ...rango, ...extra })}`),
};

/** Pago con el que el repartidor cobra un pedido contra entrega. */
export interface PagoEntrega {
  formaPagoId: number;
  monto: number;
  recibido?: number;
}

export { limpiarSesion };
