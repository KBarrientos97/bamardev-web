import type {
  ApunteStock,
  PrecioSucursal,
  PrecioSucursalInput,
  AbonoInput,
  Almacen,
  AlmacenInput,
  AnularVentaInput,
  ArticuloMovimiento,
  ActualizarUsuarioInput,
  Caja,
  Categoria,
  ClienteCredito,
  CobroQr,
  OpcionesPagoLicencia,
  PeriodoCobrable,
  Credito,
  CrearUsuarioInput,
  Dashboard,
  HistorialCostos,
  DetalleMovimiento,
  DetalleMovimientoInput,
  Encargo,
  EncargoInput,
  EstadoCobroQr,
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
  ListaEncargos,
  LoteConSaldo,
  PaginaProductos,
  Producto,
  ProductoInput,
  RangoReporte,
  ReporteCierreProductos,
  ReporteCompraDocumento,
  ReporteComprasDetalle,
  ReporteComprasGeneral,
  ReporteComprasMensual,
  ReporteMovimientosCaja,
  ReporteVentasDetalle,
  ReporteVentasGeneral,
  ReporteVentasMensual,
  Repartidor,
  ResumenCaja,
  UnidadMedida,
  Usuario,
  Vencimientos,
  Venta,
  VentaInput,
  CategoriaGasto,
  FiltroGasto,
  Gasto,
  GastoInput,
  PagoGastoInput,
  PlantillaGasto,
  PlantillaGastoInput,
  ResumenGastos,
  TipoCostoGasto,
} from "../types";

import type {
  EntregasMesero,
  Mesa,
  Salon,
  TurnoMesero,
  ZonaSalon,
} from "../types/salon";
import { reportarError } from "./telemetria";
import { rangoParaApi, tzOffsetMin } from "./rangoApi";

// URL del backend. En los builds la fija VITE_API_URL (QA o PROD); en `npm run
// dev` queda vacía a propósito y pegamos a /api, que el proxy de Vite reenvía
// a QA: el navegador ve un mismo origen y no hay preflight que CORS_ORIGINS
// del VPS tenga que permitir.
const BASE = import.meta.env.VITE_API_URL || "/api";

const TOKEN_KEY = "bamardev_web_token";
export const USER_KEY = "bamardev_web_usuario";
export const NEGOCIO_KEY = "bamardev_web_negocio";
/** Último estado de licencia conocido: sobrevive al F5 (ver AuthContext). */
export const LICENCIA_KEY = "bamardev_web_licencia";
/**
 * Motivo del bloqueo por licencia, escrito justo antes de recargar hacia el
 * login. Es lo único que sobrevive a `window.location.assign`, y sin esto el
 * cajero volvería a una pantalla de login limpia sin saber por qué lo echó.
 */
export const BLOQUEO_KEY = "bamardev_web_bloqueo";

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
  localStorage.removeItem(LICENCIA_KEY);
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

/**
 * Cuánto se espera una respuesta antes de darla por perdida. El backend
 * responde en decenas de ms; 20 s ya es una red que no está.
 */
const TIMEOUT_MS = 20_000;

/**
 * Qué decirle al cajero según por qué falló. "No se pudo conectar" para todo
 * lo manda a revisar donde no es: no es lo mismo estar sin internet que tener
 * el servidor caído durante un despliegue. Port de `ErroresRed.kt`.
 */
function mensajeDeRed(e: unknown): string {
  if (e instanceof DOMException && e.name === "AbortError") {
    return "El servidor está tardando demasiado. Probá de nuevo en un momento.";
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "Sin internet. Revisá la conexión del local.";
  }
  return "No se pudo conectar con el servidor. Puede estar reiniciándose: probá en un momento.";
}

/** Códigos con los que el backend marca un 403 de licencia (ver vigencia.ts). */
const CODIGOS_LICENCIA = ["LICENCIA_VENCIDA", "LICENCIA_SUSPENDIDA"];

/**
 * Licencia vencida (pasada la gracia) o suspendida. El backend lo responde en
 * CADA request (`jwt.strategy`), no sólo al login, así que un token de 7 días
 * no sirve de escape — y por eso hay que cortar acá, en el interceptor, y no
 * en cada pantalla.
 *
 * Se guarda el motivo antes de recargar porque `assign` borra todo el estado
 * de React: es lo que la pantalla de login lee para explicar el bloqueo en vez
 * de dejar al cajero frente a un formulario que no sabe por qué lo expulsó.
 */
function bloquearPorLicencia(cuerpo: Record<string, unknown>) {
  const motivo = {
    codigo: String(cuerpo.codigo ?? ""),
    mensaje: String(cuerpo.message ?? "La licencia del negocio no está vigente"),
    urlPago: (cuerpo.urlPago as string | undefined) ?? null,
  };
  limpiarSesion();
  try {
    localStorage.setItem(BLOQUEO_KEY, JSON.stringify(motivo));
  } catch {
    /* modo privado sin storage: se pierde el detalle, el bloqueo igual corta */
  }
  window.location.assign("/");
}

/** Serializa un query string omitiendo lo que no se mandó. */
/**
 * El parámetro va como objeto plano y no como `Record<string, unknown>`: una
 * interfaz declarada (RangoReporte y sus variantes) no es asignable a Record
 * porque no lleva index signature, y tiparlo así obligaba a castear en cada
 * llamada.
 */
function qs(params: object = {}): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

/**
 * Llama al backend agregando el token y traduciendo errores a ApiError.
 *
 * Es el único punto por el que pasa todo el tráfico, así que acá viven las tres
 * reglas transversales: cerrar sesión si el token murió, cortar si la licencia
 * dejó de estar vigente, y reportar a PostHog lo que falló. Ponerlas en cada
 * pantalla sería garantizar que alguna quede afuera.
 */
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = tokenStore.get();
  const metodo = options.method ?? "GET";
  // La ruta sin ids: "/productos/42" y "/productos/7" son el mismo endpoint, y
  // agrupados en PostHog cuentan como un problema y no como veinte.
  const donde = `${metodo} ${path.split("?")[0].replace(/\/\d+/g, "/:id")}`;

  // Sin timeout, un fetch colgado deja el botón en "Registrando…" para
  // siempre: el cajero no sabe si la venta entró y toca de nuevo.
  const corte = new AbortController();
  const alarma = setTimeout(() => corte.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...options,
      signal: corte.signal,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch (e) {
    // Se cayó la red o el backend no responde. Es el error que más sufre el
    // local (wifi del negocio) y el que nunca deja rastro si no se reporta.
    reportarError(donde, e, { tipo: "red" });
    throw new ApiError(mensajeDeRed(e), 0);
  } finally {
    clearTimeout(alarma);
  }

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

    // Licencia vencida o suspendida: no es un error a mostrar en un cartelito,
    // es el fin de la sesión. Se corta acá para que ninguna pantalla siga
    // trabajando contra un backend que ya no la deja operar.
    if (res.status === 403 && CODIGOS_LICENCIA.includes(String(cuerpo.codigo))) {
      bloquearPorLicencia(cuerpo);
      throw new ApiError(mensaje, 403, cuerpo);
    }

    // 502/503/504 es el servidor no disponible, típico durante un despliegue:
    // el cuerpo viene en HTML y el mensaje genérico no ayudaba a esperar.
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      mensaje = "El servidor no está disponible en este momento. Probá en unos segundos.";
    }

    // Un 5xx es un bug nuestro; un 4xx suele ser una validación esperable
    // ("stock insuficiente") y llenaría PostHog de ruido. Sólo van los 5xx.
    if (res.status >= 500) {
      reportarError(donde, new Error(mensaje), {
        tipo: "http",
        status: res.status,
        codigo: cuerpo.codigo ?? null,
      });
    }

    throw new ApiError(mensaje, res.status, cuerpo);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/**
 * Llamada a un endpoint público, sin token y sin las reglas de sesión.
 *
 * Existe sólo para el pago de la licencia: esa pantalla se usa JUSTO cuando la
 * licencia venció, o sea con la sesión ya cerrada. Si pasara por `request`, un
 * 401 o un 403 dispararía "cerrar sesión" y recargaría la página encima del QR
 * que el dueño está por escanear.
 */
async function publico<T>(path: string, options: RequestInit = {}): Promise<T> {
  const corte = new AbortController();
  const alarma = setTimeout(() => corte.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...options,
      signal: corte.signal,
      headers: { "Content-Type": "application/json", ...options.headers },
    });
  } catch (e) {
    throw new ApiError(mensajeDeRed(e), 0);
  } finally {
    clearTimeout(alarma);
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

  // ── Pago de la licencia por QR ────────────────────────────────────────────
  // Sin token y por fuera de `request`: son los únicos endpoints que se usan
  // con la sesión ya cerrada. Pasando por el interceptor, su manejo de 401/403
  // volvería a "cerrar sesión" y recargaría la página encima del QR.
  /** Las opciones de 1, 6 y 12 meses con su total (las calcula el backend). */
  opcionesPagoLicencia: (alias: string) =>
    publico<OpcionesPagoLicencia>(
      `/activacion/${encodeURIComponent(alias)}/opciones`,
    ),

  generarQrLicencia: (alias: string, periodo?: PeriodoCobrable) =>
    publico<CobroQr>(`/activacion/${encodeURIComponent(alias)}/qr`, {
      method: "POST",
      // Sólo el período: el monto lo pone el backend con el precio pactado de
      // ese negocio.
      body: JSON.stringify(periodo ? { periodo } : {}),
    }),
  estadoQrLicencia: (alias: string) =>
    publico<EstadoCobroQr>(`/activacion/qr/${encodeURIComponent(alias)}`),

  // ── Finanzas ──────────────────────────────────────────────────────────────
  // Los reportes paginados aceptan `page` y `limite`; los mensuales no llevan
  // rango, sólo el año.
  // Todos los rangos pasan por `rangoParaApi`: con el día pelado el backend
  // dejaba afuera el último día y cortaba en UTC (ver lib/rangoApi.ts).
  reporteVentas: (p: RangoReporte & { usuarioId?: number; page?: number; limite?: number }) =>
    request<ReporteVentasGeneral>(`/reportes/ventas${qs(rangoParaApi(p))}`),
  reporteVentasDetalle: (
    p: RangoReporte & { usuarioId?: number; page?: number; limite?: number },
  ) => request<ReporteVentasDetalle>(`/reportes/ventas-detalle${qs(rangoParaApi(p))}`),
  // El mes se corta en el reloj del negocio: sin el offset el backend usaba
  // la zona del servidor y una venta de la noche del 31 caía en el mes
  // siguiente.
  reporteVentasMensual: (anio?: number) =>
    request<ReporteVentasMensual>(
      `/reportes/ventas-mensual${qs({ anio, tzOffsetMin: tzOffsetMin() })}`,
    ),
  reporteCompras: (
    p: RangoReporte & { tipo?: string; page?: number; limite?: number },
  ) => request<ReporteComprasGeneral>(`/reportes/compras${qs(rangoParaApi(p))}`),
  reporteComprasDetalle: (
    p: RangoReporte & { tipo?: string; page?: number; limite?: number },
  ) => request<ReporteComprasDetalle>(`/reportes/compras-detalle${qs(rangoParaApi(p))}`),
  reporteComprasMensual: (anio?: number) =>
    request<ReporteComprasMensual>(
      `/reportes/compras-mensual${qs({ anio, tzOffsetMin: tzOffsetMin() })}`,
    ),
  reporteCompra: (id: number) =>
    request<ReporteCompraDocumento>(`/reportes/compras/${id}`),
  reporteCaja: (p: RangoReporte & { tipo?: string; page?: number; limite?: number }) =>
    request<ReporteMovimientosCaja>(`/reportes/caja${qs(rangoParaApi(p))}`),
  /** Lo que salió del mostrador en un turno. Baja del arqueo, no del período. */
  reporteCierreProductos: (cierreId: number) =>
    request<ReporteCierreProductos>(`/reportes/cierres/${cierreId}/productos`),

  // ── Catálogo ──────────────────────────────────────────────────────────────
  /**
    * El catálogo. `sucursalId` decide de qué local salen el PRECIO y el STOCK:
    * sin él, el POS mostraba el precio de lista y la venta cobraba el de la
    * sucursal, así que el cobro fallaba con "los pagos no suman el total".
    */
  getProductos: (eliminados?: boolean, sucursalId?: number | null) =>
    request<Producto[]>(
      `/productos${qs({
        eliminados: eliminados ? 1 : undefined,
        sucursalId: sucursalId ?? undefined,
      })}`,
    ),
  getProducto: (id: number, sucursalId?: number | null) =>
    request<Producto>(`/productos/${id}${qs({ sucursalId: sucursalId ?? undefined })}`),
  /**
   * La búsqueda del mostrador: filtra y pagina en el servidor.
   *
   * `getProductos` sigue existiendo y trae el catálogo entero — está bien para
   * 40 artículos. Con un catálogo de farmacia (2.000) hay que usar esto, que
   * busca por nombre, principio activo, laboratorio, descripción y código de
   * barras exacto, y devuelve una página con el total.
   */
  buscarProductos: (params: {
    q?: string;
    limite?: number;
    offset?: number;
    soloHabilitados?: boolean;
  }) =>
    request<PaginaProductos>(
      `/productos/buscar${qs({
        q: params.q,
        limite: params.limite,
        offset: params.offset,
        soloHabilitados: params.soloHabilitados ? "true" : undefined,
      })}`,
    ),
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
  /**
   * Los locales SIN números: id, nombre, tipo y si es el principal.
   *
   * Para los selectores de sucursal, que sólo necesitan nombres. `getAlmacenes`
   * devuelve además la valorización del inventario y el detalle de artículos —y
   * exige ser ADMIN/SUPERVISOR—, así que traía de más y, desde que el listado
   * completo pide rol, le respondía 403 a un cajero.
   */
  getSucursales: () => request<Almacen[]>("/almacenes/mias"),
  getAlmacenes: () => request<Almacen[]>("/almacenes"),
  /**
   * Hace de este almacén la sucursal principal: la que el backend usa cuando una
   * operación no dice de cuál se trata.
   */
  marcarAlmacenPrincipal: (id: number) =>
    request<{ mensaje: string }>(`/almacenes/${id}/principal`, {
      method: "PATCH",
    }),
  // ── Encargos (rubro farmacia) ───────────────────────────────────────────
  /** Sin filtro trae sólo lo que sigue abierto. */
  getEncargos: (params: { estado?: string; incluirCerrados?: boolean } = {}) =>
    request<ListaEncargos>(
      `/encargos${qs({
        estado: params.estado,
        incluirCerrados: params.incluirCerrados ? "true" : undefined,
      })}`,
    ),
  crearEncargo: (input: EncargoInput) =>
    request<Encargo>("/encargos", { method: "POST", body: JSON.stringify(input) }),
  /** Mueve el encargo al paso siguiente, o lo cancela. */
  cambiarEstadoEncargo: (id: number, estado: string) =>
    request<Encargo>(`/encargos/${id}/estado`, {
      method: "POST",
      body: JSON.stringify({ estado }),
    }),
  /** Sólo se puede con lo que nunca avanzó; lo demás se cancela. */
  eliminarEncargo: (id: number) =>
    request<{ mensaje: string }>(`/encargos/${id}`, { method: "DELETE" }),

  // ── Lotes y vencimientos (rubro farmacia) ───────────────────────────────
  /**
   * El semáforo: qué vence y cuánta plata hay parada ahí.
   *
   * No hay alta de lotes a propósito — nacen al aprobar una entrada de
   * mercadería. Un lote que existe sin que haya entrado nada al depósito es un
   * número que después nadie puede explicar.
   */
  vencimientos: (params: { almacenId?: number; dias?: number } = {}) =>
    request<Vencimientos>(
      `/lotes/vencimientos${qs({ almacenId: params.almacenId, dias: params.dias })}`,
    ),
  /** Los lotes con saldo de un producto, en el orden en que se van a vender. */
  lotesDeProducto: (productoId: number, almacenId?: number) =>
    request<LoteConSaldo[]>(`/lotes/producto/${productoId}${qs({ almacenId })}`),

  /** Lo que los productos tienen distinto en esta sucursal (sólo excepciones). */
  getPreciosSucursal: (almacenId: number) =>
    request<PrecioSucursal[]>(`/almacenes/${almacenId}/precios`),
  fijarPrecioSucursal: (almacenId: number, input: PrecioSucursalInput) =>
    request<{ mensaje: string }>(`/almacenes/${almacenId}/precios`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  /** Saca la excepción: el producto vuelve al precio del catálogo. */
  quitarPrecioSucursal: (almacenId: number, productoId: number) =>
    request<{ mensaje: string }>(
      `/almacenes/${almacenId}/precios/${productoId}`,
      { method: "DELETE" },
    ),
  /** Bitácora de stock: el historial de todo lo que se movió. */
  getBitacoraStock: (params: {
    productoId?: number;
    almacenId?: number;
    desde?: string;
    hasta?: string;
    limite?: number;
  } = {}) => request<ApunteStock[]>(`/almacenes/bitacora${qs(params)}`),
  getAlmacen: (id: number) => request<Almacen>(`/almacenes/${id}`),
  crearAlmacen: (input: AlmacenInput) =>
    request<Almacen>("/almacenes", { method: "POST", body: JSON.stringify(input) }),
  actualizarAlmacen: (id: number, input: Partial<AlmacenInput>) =>
    request<Almacen>(`/almacenes/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  eliminarAlmacen: (id: number) =>
    request<{ mensaje: string }>(`/almacenes/${id}`, { method: "DELETE" }),

  /** El catálogo de insumos; con `eliminados`, la papelera. */
  /** Con `sucursalId`, el `stock` es el de ESE almacén y no la suma del negocio. */
  getInsumos: (eliminados?: boolean, sucursalId?: number | null) =>
    request<Insumo[]>(
      `/insumos${qs({
        eliminados: eliminados ? 1 : undefined,
        sucursalId: sucursalId ?? undefined,
      })}`,
    ),
  /**
   * A cuánto llegó este artículo en cada compra. Vale también para insumos: son
   * Producto con esInsumo=true y comparten endpoint.
   */
  historialCostos: (id: number) => request<HistorialCostos>(`/productos/${id}/costos`),
  restaurarInsumo: (id: number) =>
    request<{ mensaje: string }>(`/insumos/${id}/restaurar`, { method: "POST" }),
  crearInsumo: (input: InsumoInput) =>
    request<Insumo>("/insumos", { method: "POST", body: JSON.stringify(input) }),
  actualizarInsumo: (id: number, input: Partial<InsumoInput>) =>
    request<Insumo>(`/insumos/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  eliminarInsumo: (id: number) =>
    request<{ mensaje: string }>(`/insumos/${id}`, { method: "DELETE" }),

  /** Con `sucursalId`, sólo los de ese local (por origen O destino). */
  getMovimientos: (sucursalId?: number | null) =>
    request<Movimiento[]>(`/movimientos${qs({ sucursalId: sucursalId ?? undefined })}`),
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

  getDashboard: (sucursalId?: number | null) =>
    request<Dashboard>(`/dashboard${qs({ sucursalId: sucursalId ?? undefined })}`),

  // ── Caja ──────────────────────────────────────────────────────────────────
  getFormasPago: () => request<FormaPago[]>("/formas-pago"),
  /** Devuelve `{ caja: null }` cuando el usuario no tiene turno abierto. */
  cajaActual: () => request<{ caja: Caja | null }>("/caja/actual"),
  /** `almacenId` sólo lo manda un usuario de organización: al resto el backend
   *  se lo rechaza porque trabaja en su sucursal asignada. */
  abrirCaja: (input: {
    montoApertura: number;
    descripcion?: string;
    almacenId?: number;
  }) =>
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
  /** `sucursalId` acota a lo fiado por ese local. */
  getCreditos: (
    params: {
      filtro?: FiltroCredito;
      q?: string;
      clienteId?: number;
      sucursalId?: number | null;
    } = {},
  ) =>
    request<Credito[]>(`/creditos${qs(params)}`),
  getCredito: (id: number) => request<Credito>(`/creditos/${id}`),
  /** Con `sucursalId`, el saldo del cliente es lo que le debe A ESE local. */
  getClientesCredito: (sucursalId?: number | null) =>
    request<ClienteCredito[]>(`/creditos/clientes${qs({ sucursalId: sucursalId ?? undefined })}`),
  /**
   * Techo de deuda del cliente. `null` explícito = sacarle el límite, y por eso
   * el body lo manda siempre (omitirlo y mandar null son cosas distintas).
   */
  actualizarLimiteCredito: (clienteId: number, limiteCredito: number | null) =>
    request<ClienteCredito>(`/creditos/clientes/${clienteId}/limite`, {
      method: "PATCH",
      body: JSON.stringify({ limiteCredito }),
    }),
  getResumenCreditos: () => request<Record<string, unknown>>("/creditos/resumen"),
  /** La caja donde entra el abono la resuelve el backend (la del cobrador). */
  registrarAbono: (id: number, input: AbonoInput) =>
    request<Credito>(`/creditos/${id}/abonos`, { method: "POST", body: JSON.stringify(input) }),

  // ── Gastos operativos ─────────────────────────────────────────────────────
  //
  // `sucursalId` acota al local; omitido, el consolidado del negocio. A quien
  // esta atado a una sucursal el backend le fuerza la suya, mande lo que mande.

  /** El hero: total, pagado y pendiente del periodo. Viaja aparte de la lista
   *  porque es del periodo entero y no cambia con la pestana. */
  getResumenGastos: (params: {
    desde: string;
    hasta: string;
    sucursalId?: number | null;
  }) => request<ResumenGastos>(`/gastos/resumen${qs(params)}`),

  getGastos: (
    params: {
      desde: string;
      hasta: string;
      filtro?: FiltroGasto;
      q?: string;
      categoria?: string;
      sucursalId?: number | null;
    },
  ) => request<Gasto[]>(`/gastos${qs(params)}`),

  crearGasto: (input: GastoInput) =>
    request<Gasto>("/gastos", { method: "POST", body: JSON.stringify(input) }),

  /** El PATCH corrige lo que el gasto DICE (concepto, categoria, monto). Lo
   *  que SALIO se corrige con un pago o deshaciendolo: `pagado` es la suma de
   *  los pagos registrados y pisarlo lo separaria de su historial. */
  actualizarGasto: (id: number, input: GastoInput) =>
    request<Gasto>(`/gastos/${id}`, { method: "PATCH", body: JSON.stringify(input) }),

  /** `monto` omitido = saldar lo que falte. Se manda asi y no el numero del
   *  saldo: entre que se abrio la pantalla y se confirma pudo entrar otro pago,
   *  y el saldo viejo lo sobrepagaria. */
  pagarGasto: (id: number, input: PagoGastoInput) =>
    request<Gasto>(`/gastos/${id}/pagos`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  /** Deshace el ULTIMO pago. Es lo que arregla haberlo cargado por error. */
  deshacerUltimoPagoGasto: (id: number) =>
    request<Gasto>(`/gastos/${id}/pagos/ultimo`, { method: "DELETE" }),

  eliminarGasto: (id: number) =>
    request<{ mensaje: string }>(`/gastos/${id}`, { method: "DELETE" }),

  // Categorias: el pack base (24) vive en el backend y NO se siembra por
  // negocio; esta lista mezcla el pack con lo que el negocio cambio o invento.
  getCategoriasGasto: () => request<CategoriaGasto[]>("/gastos/categorias"),
  crearCategoriaGasto: (input: {
    nombre: string;
    tipoCosto?: TipoCostoGasto;
  }) =>
    request<CategoriaGasto>("/gastos/categorias", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  /** Renombrar una, o corregirle el fijo/variable. Vale tambien para las del
   *  pack: casi todo lo que carga un negocio nuevo es del pack, y el punto de
   *  equilibrio divide justo por esa linea. */
  actualizarCategoriaGasto: (
    codigo: string,
    input: { nombre?: string; tipoCosto?: TipoCostoGasto; activa?: boolean },
  ) =>
    request<CategoriaGasto>(`/gastos/categorias/${encodeURIComponent(codigo)}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  eliminarCategoriaGasto: (codigo: string) =>
    request<{ mensaje: string }>(
      `/gastos/categorias/${encodeURIComponent(codigo)}`,
      { method: "DELETE" },
    ),

  // Gastos automaticos (las plantillas): la regla que crea el gasto sola.
  getPlantillasGasto: (sucursalId?: number | null) =>
    request<PlantillaGasto[]>(
      `/gastos/plantillas${qs({ sucursalId: sucursalId ?? undefined })}`,
    ),
  crearPlantillaGasto: (input: PlantillaGastoInput) =>
    request<PlantillaGasto>("/gastos/plantillas", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  actualizarPlantillaGasto: (id: number, input: PlantillaGastoInput) =>
    request<PlantillaGasto>(`/gastos/plantillas/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  /** Pausar no borra: la regla se conserva con su historial. `motivoPausa`
   *  es lo que despues explica por que esa regla esta apagada. */
  cambiarEstadoPlantillaGasto: (
    id: number,
    input: { activa: boolean; motivoPausa?: string | null },
  ) =>
    request<PlantillaGasto>(`/gastos/plantillas/${id}/estado`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  eliminarPlantillaGasto: (id: number) =>
    request<{ mensaje: string }>(`/gastos/plantillas/${id}`, {
      method: "DELETE",
    }),

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
    request<T>(`/reportes/${nombre}${qs({ ...rangoParaApi(rango), ...extra })}`),

  // ── Salón ─────────────────────────────────────────────────────────────────
  // El panel del mesero. `clienteRequestId` viaja en abrir y en comanda porque
  // el backend las dedupe: si el POST llegó pero la respuesta se perdió, el
  // reintento devuelve lo que ya existe en vez de duplicarlo — una comanda
  // repetida es un pedido que la cocina hace dos veces.
  salon: () => request<Salon>("/salon"),
  mesa: (id: number) => request<Mesa>(`/salon/mesas/${id}`),
  /** La carta del mesero: el catálogo con el stock ya comprometido por las mesas. */
  cartaSalon: () => request<Producto[]>("/salon/carta"),
  turnoMesero: () => request<TurnoMesero>("/salon/turno"),
  /**
   * Una mesa ya cobrada del turno, para volver a darle el recibo al cliente.
   * `mesa(id)` no sirve: la mesa ya se levantó y devuelve la gente de AHORA.
   */
  mesaCerrada: (sesionId: number) => request<Mesa>(`/salon/turno/mesas/${sesionId}`),
  cerrarTurnoMesero: () =>
    request<TurnoMesero>("/salon/turno/cerrar", { method: "POST" }),

  abrirMesa: (
    id: number,
    input: {
      comensales: number;
      referencia?: string;
      clienteRequestId?: string;
    },
  ) =>
    request<Mesa>(`/salon/mesas/${id}/abrir`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  /** Manda la mesa a caja. No cobra: el mesero no cobra. */
  pedirCuentaMesa: (id: number) =>
    request<Mesa>(`/salon/mesas/${id}/cuenta`, { method: "POST" }),
  liberarMesa: (id: number) =>
    request<Mesa>(`/salon/mesas/${id}/liberar`, { method: "POST" }),

  crearComanda: (
    id: number,
    input: {
      items: { productoId: number; cantidad: number; nota?: string }[];
      clienteRequestId?: string;
    },
  ) =>
    request<Mesa>(`/salon/mesas/${id}/comandas`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  marcarComandaServida: (mesaId: number, comandaId: number) =>
    request<Mesa>(`/salon/mesas/${mesaId}/comandas/${comandaId}/servida`, {
      method: "POST",
    }),
  anularItemComanda: (
    mesaId: number,
    comandaId: number,
    itemId: number,
    input: { motivo?: string; autorizadorUsername?: string; autorizadorPin?: string },
  ) =>
    request<Mesa>(
      `/salon/mesas/${mesaId}/comandas/${comandaId}/items/${itemId}/anular`,
      { method: "POST", body: JSON.stringify(input) },
    ),

  /** Mueve el grupo entero a otra mesa. */
  transferirMesa: (id: number, destinoId: number) =>
    request<Mesa>(`/salon/mesas/${id}/transferir`, {
      method: "POST",
      body: JSON.stringify({ destinoId }),
    }),
  /** Junta el consumo de dos cuentas que YA comieron. */
  juntarMesa: (id: number, otraId: number) =>
    request<Mesa>(`/salon/mesas/${id}/juntar`, {
      method: "POST",
      body: JSON.stringify({ otraId }),
    }),
  /** Arrima mesas libres ANTES de sentar a nadie, para un grupo grande. */
  unirMesa: (id: number, mesaIds: number[]) =>
    request<Mesa>(`/salon/mesas/${id}/unir`, {
      method: "POST",
      body: JSON.stringify({ mesaIds }),
    }),
  separarMesa: (id: number) =>
    request<Mesa>(`/salon/mesas/${id}/separar`, { method: "POST" }),

  reservarMesa: (
    id: number,
    input: { hora: string; nombre: string; telefono?: string; personas?: number; nota?: string },
  ) =>
    request<Mesa>(`/salon/mesas/${id}/reserva`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  quitarReservaMesa: (id: number) =>
    request<Mesa>(`/salon/mesas/${id}/reserva`, { method: "DELETE" }),

  /** Las cuentas que esperan en caja. Sólo la ven los que cobran. */
  mesasPorCobrar: () => request<Mesa[]>("/salon/por-cobrar"),
  /**
   * Convierte la cuenta de la mesa en venta.
   *
   * Normalmente lo hace la caja. El MESERO entra acá sólo si el negocio tiene
   * la capacidad `mesero_cobra` prendida y sólo sobre SUS mesas: las dos cosas
   * las revisa el backend, porque el rol por sí solo no alcanza para decidirlo.
   *
   * La propina va al turno del mesero y NO entra al total de la venta ni a la
   * matemática de la caja.
   */
  cobrarMesa: (
    id: number,
    input: {
      pagos: { formaPagoId: number; monto: number; recibido?: number }[];
      propina?: number;
      clienteRequestId?: string;
    },
  ) => request<Venta>(`/salon/mesas/${id}/cobrar`, {
    method: "POST",
    body: JSON.stringify(input),
  }),

  // ── Entregas de efectivo del mesero ───────────────────────────────────────

  /**
   * El efectivo que los meseros cobraron en el turno.
   *
   * La misma lista sirve para los dos lados: el cajero ve lo que le tienen que
   * entregar y el mesero lo que le falta entregar. El backend filtra según
   * quién pregunta, así que acá no hay dos métodos.
   */
  entregasMesero: () => request<EntregasMesero>("/salon/entregas"),

  // ── QR de cobro del negocio ───────────────────────────────────────────────
  // Compartido por todos los equipos: lo sube quien abre la caja y lo bajan
  // la caja, los meseros y el reparto. Ver lib/qrPago.ts.

  /** El QR vigente; `imagen` null si todavía nadie lo subió. */
  qrCobro: () =>
    request<{ imagen: string | null; actualizadoEn: string | null }>("/qr-cobro"),
  /** Lo sube quien abre la caja. El backend rechaza al mesero y al repartidor. */
  subirQrCobro: (imagen: string) =>
    request<{ imagen: string | null }>("/qr-cobro", {
      method: "PUT",
      body: JSON.stringify({ imagen }),
    }),
  borrarQrCobro: () =>
    request<{ imagen: null }>("/qr-cobro", { method: "DELETE" }),

  /**
   * El cajero confirma que recibió la plata.
   *
   * Es el acto que mueve ese efectivo del delantal del mesero al cajón: hasta
   * acá el arqueo lo restaba del esperado. Devuelve la lista al día.
   */
  aprobarEntregas: (ids: number[]) =>
    request<EntregasMesero>("/salon/entregas/aprobar", {
      method: "POST",
      body: JSON.stringify({ ids }),
    }),

  // ── Mesas (administración) ────────────────────────────────────────────────
  // El mesero no crea mesas: sólo abre las que el dueño registre. El backend
  // lo exige con RolesGuard (ADMIN, SUPERVISOR).
  /** Con `sucursalId`, sólo las mesas de ese local (por la zona donde están). */
  getMesas: (sucursalId?: number | null) =>
    request<Mesa[]>(`/mesas${qs({ sucursalId: sucursalId ?? undefined })}`),
  getZonas: (sucursalId?: number | null) =>
    request<ZonaSalon[]>(`/mesas/zonas${qs({ sucursalId: sucursalId ?? undefined })}`),
  crearMesa: (input: {
    codigo: string;
    nombre?: string;
    zonaId: number;
    capacidad: number;
    notaMesa?: string;
    activa?: boolean;
  }) => request<Mesa>("/mesas", { method: "POST", body: JSON.stringify(input) }),
  actualizarMesa: (
    id: number,
    input: Partial<{
      codigo: string;
      nombre: string;
      zonaId: number;
      capacidad: number;
      notaMesa: string;
      activa: boolean;
    }>,
  ) => request<Mesa>(`/mesas/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  eliminarMesa: (id: number) => request<void>(`/mesas/${id}`, { method: "DELETE" }),
};

/** Pago con el que el repartidor cobra un pedido contra entrega. */
export interface PagoEntrega {
  formaPagoId: number;
  monto: number;
  recibido?: number;
}

export { limpiarSesion };
