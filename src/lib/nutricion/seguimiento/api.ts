import { ApiError, qs, request } from "../../api";
import type {
  AjustesSeguimiento,
  CambiosProducto,
  CambiosTratamiento,
  CatalogoSeguimiento,
  HojaPaciente,
  IniciarTratamientoInput,
  ListaProductos,
  ListaSeguimiento,
  PagosPendientes,
  RegistroInput,
  Tratamiento,
  Vial,
} from "./tipos";

/**
 * Todas las llamadas del seguimiento del tratamiento
 * (CONTRATO-nutricion-seguimiento-23nov §3.3). Pasan por el mismo `request` que
 * la evaluación, que no manda a la telemetría ni el cuerpo ni el texto buscado:
 * sólo la ruta sin ids y sólo los 5xx (dato sensible de salud).
 */

/**
 * Los códigos de error del backend (§3.3). Todos traen su mensaje en castellano
 * y la hoja lo muestra tal cual; además, el tratamiento que ya existe se puede
 * abrir y los «no encontrado» dicen que ya no existe.
 */
export const CODIGOS_SEGUIMIENTO = {
  YA_TIENE_TRATAMIENTO: "YA_TIENE_TRATAMIENTO",
  PACIENTE_ARCHIVADO: "PACIENTE_ARCHIVADO",
  SEMANA_REPETIDA: "SEMANA_REPETIDA",
  REGISTRO_VACIO: "REGISTRO_VACIO",
  FECHA_FUTURA: "FECHA_FUTURA",
  TRATAMIENTO_TERMINADO: "TRATAMIENTO_TERMINADO",
  INICIAL_NO_SE_BORRA: "INICIAL_NO_SE_BORRA",
  // Los que sumó el backend al construirse (23-nov): el inicial no cambia de
  // número (y ninguna semana pasa a ser la 0), y la semana fuera de 0–520.
  SEMANA_INICIAL: "SEMANA_INICIAL",
  SEMANA_FUERA_DE_RANGO: "SEMANA_FUERA_DE_RANGO",
  // §7.1: la marca del cambio de producto no va en el inicial.
  PRODUCTO_EN_INICIAL: "PRODUCTO_EN_INICIAL",
  PACIENTE_NO_ENCONTRADO: "PACIENTE_NO_ENCONTRADO",
  TRATAMIENTO_NO_ENCONTRADO: "TRATAMIENTO_NO_ENCONTRADO",
  REGISTRO_NO_ENCONTRADO: "REGISTRO_NO_ENCONTRADO",
  // §9.1: un tratamiento que ya está en la lista del negocio (visible u oculto).
  PRODUCTO_REPETIDO: "PRODUCTO_REPETIDO",
} as const;

const NO_ENCONTRADOS: string[] = [
  CODIGOS_SEGUIMIENTO.PACIENTE_NO_ENCONTRADO,
  CODIGOS_SEGUIMIENTO.TRATAMIENTO_NO_ENCONTRADO,
  CODIGOS_SEGUIMIENTO.REGISTRO_NO_ENCONTRADO,
];

/** ¿No existe (o es de otro negocio)? */
export function esNoEncontrado(e: unknown): boolean {
  return e instanceof ApiError && (e.status === 404 || (!!e.codigo && NO_ENCONTRADOS.includes(e.codigo)));
}

/** El tratamiento ACTIVO que ya tiene el paciente (409 YA_TIENE_TRATAMIENTO), o null si el error es otro. */
export function tratamientoQueYaTiene(e: unknown): number | null {
  if (!(e instanceof ApiError) || e.codigo !== CODIGOS_SEGUIMIENTO.YA_TIENE_TRATAMIENTO) return null;
  const id = Number(e.detalle.tratamientoId);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/**
 * ¿El servidor dijo que lo que se ve ya no es lo que hay? (404: otra persona
 * lo borró; 409: cargó esa semana, terminó el tratamiento, inició uno…). La
 * hoja del paciente se vuelve a leer al cerrar la que dio el error.
 */
export const hojaDesactualizada = (e: unknown) => e instanceof ApiError && (e.status === 404 || e.status === 409);

/** ¿El error es de este código? */
export const esCodigo = (e: unknown, codigo: keyof typeof CODIGOS_SEGUIMIENTO) => e instanceof ApiError && e.codigo === codigo;

/**
 * ¿Ya está en la lista? (§9.1: `409 PRODUCTO_REPETIDO`). Las escrituras de la
 * lista no dan otro 409, y el contrato lo escribe como `code`: se mira el
 * estado, no sólo el nombre del código.
 */
export const esProductoRepetido = (e: unknown) =>
  e instanceof ApiError && (e.status === 409 || e.codigo === CODIGOS_SEGUIMIENTO.PRODUCTO_REPETIDO || e.detalle.code === CODIGOS_SEGUIMIENTO.PRODUCTO_REPETIDO);

const json = (cuerpo: unknown) => JSON.stringify(cuerpo);

export const apiSeguimiento = {
  catalogo: () => request<CatalogoSeguimiento>("/nutricion/seguimiento/catalogo"),

  /**
   * La lista. Recibe `page`/`pageSize` para andar con `usePaginado` y los manda
   * como los pide el backend (`pagina`/`porPagina`). `soloEnTratamiento`: sólo
   * los que tienen uno ACTIVO, el de actividad más reciente arriba.
   */
  pacientes: (f: { q?: string; soloEnTratamiento?: boolean; page: number; pageSize: number }) =>
    request<ListaSeguimiento>(
      `/nutricion/seguimiento/pacientes${qs({
        q: f.q?.trim() || undefined,
        soloEnTratamiento: f.soloEnTratamiento ? 1 : undefined,
        pagina: f.page,
        porPagina: f.pageSize,
      })}`,
    ),

  /** La hoja del paciente: sus datos, su último control de la evaluación, el tratamiento activo y los anteriores. */
  hoja: (pacienteId: number) => request<HojaPaciente>(`/nutricion/seguimiento/pacientes/${pacienteId}`),

  pagosPendientes: () => request<PagosPendientes>("/nutricion/seguimiento/pagos-pendientes"),

  cambiarAjustes: (cambios: Partial<AjustesSeguimiento>) =>
    request<AjustesSeguimiento>("/nutricion/seguimiento/ajustes", { method: "PATCH", body: json(cambios) }),

  /** Inicia un tratamiento con su registro inicial. */
  iniciar: (pacienteId: number, cuerpo: IniciarTratamientoInput) =>
    request<Tratamiento>(`/nutricion/seguimiento/pacientes/${pacienteId}/tratamientos`, { method: "POST", body: json(cuerpo) }),

  /** Uno anterior (o cualquiera), por su id. */
  tratamiento: (id: number) => request<Tratamiento>(`/nutricion/tratamientos/${id}`),

  /** Nombre, unidad, vial, nota; terminar (`estado: "TERMINADO"`) o reabrir (`"ACTIVO"`). */
  cambiarTratamiento: (id: number, cambios: CambiosTratamiento) =>
    request<Tratamiento>(`/nutricion/tratamientos/${id}`, { method: "PATCH", body: json(cambios) }),

  /** Borra el tratamiento con todas sus semanas. */
  borrarTratamiento: (id: number) => request<{ ok: true }>(`/nutricion/tratamientos/${id}`, { method: "DELETE" }),

  cargarSemana: (tratamientoId: number, cuerpo: RegistroInput) =>
    request<Tratamiento>(`/nutricion/tratamientos/${tratamientoId}/registros`, { method: "POST", body: json(cuerpo) }),

  /** Cambia sólo lo que viene; `null` borra el dato. */
  corregirRegistro: (id: number, cambios: RegistroInput) =>
    request<Tratamiento>(`/nutricion/registros/${id}`, { method: "PATCH", body: json(cambios) }),

  /** Borra una semana (el inicial no: 409 INICIAL_NO_SE_BORRA). */
  borrarRegistro: (id: number) => request<Tratamiento>(`/nutricion/registros/${id}`, { method: "DELETE" }),

  // ── La lista de tratamientos del negocio (§9.1, `negocio.configurar`) ─────
  // Todas devuelven la lista entera ya cambiada. Quien escribe olvida el
  // catálogo guardado (`olvidarCatalogoSeguimiento`): sus botones cambiaron.
  // Un backend anterior no tiene estas rutas (404).

  /** La lista entera, con los ocultos. */
  productos: () => request<ListaProductos>("/nutricion/seguimiento/productos"),

  /** Agrega uno propio (409 PRODUCTO_REPETIDO si ya está, aunque esté oculto). */
  agregarProducto: (cuerpo: { nombre: string; presentaciones?: Vial[] }) =>
    request<ListaProductos>("/nutricion/seguimiento/productos", { method: "POST", body: json(cuerpo) }),

  /** Cambia una fila: uno propio, o uno de fábrica que ya se tocó (a ése no se le cambia el nombre). */
  cambiarProducto: (id: number, cambios: CambiosProducto) =>
    request<ListaProductos>(`/nutricion/seguimiento/productos/${id}`, { method: "PATCH", body: json(cambios) }),

  /** Redefine u oculta uno de fábrica que todavía no tiene fila (se busca por el nombre). */
  cambiarDeFabrica: (nombre: string, cambios: Omit<CambiosProducto, "nombre">) =>
    request<ListaProductos>("/nutricion/seguimiento/productos/de-fabrica", { method: "PATCH", body: json({ nombre, ...cambios }) }),

  /** Borra la fila: uno propio desaparece; uno de fábrica vuelve a como venía. */
  quitarProducto: (id: number) => request<ListaProductos>(`/nutricion/seguimiento/productos/${id}`, { method: "DELETE" }),
};
