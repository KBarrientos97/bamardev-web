import { qs, request } from "../api";
import type {
  GuardarRecetaInput,
  HistorialCostoPlato,
  InsumoReceta,
  RecetaPlato,
  TableroCostos,
} from "./tipos";

/**
 * Cliente de las recetas del plato (CONTRATO-recetas-plato §2.3 y §2.5). Pasa
 * por el mismo `request` que el resto de la app (401, licencia, reporte de
 * 5xx); acá sólo se arman las rutas, como en `lib/belleza/apiExtras.ts`. Toda
 * la regla (el costo que se escribe en la ficha, el historial, el aviso) vive
 * en el backend. El ajuste de Configuración está en `api.configRecetas`.
 */

const json = (body: unknown) => ({ body: JSON.stringify(body) });

/** `sucursalId` sólo si hay uno: sin él, el backend usa el criterio de `GET /insumos`. */
const deSucursal = (sucursalId?: number | null) => qs({ sucursalId: sucursalId ?? undefined });

export const apiRecetas = {
  /** Los insumos para armar recetas (`catalogo.editar` o `insumos.gestionar`). */
  insumos: () => request<InsumoReceta[]>("/recetas-plato/insumos"),

  /** La receta de un plato (`catalogo.editar` o `costos.ver`). `alcanza` sale del stock de esa sucursal. */
  receta: (platoId: number, sucursalId?: number | null) =>
    request<RecetaPlato>(`/recetas-plato/${platoId}${deSucursal(sucursalId)}`),

  /**
   * Reemplaza la receta entera (`catalogo.editar`). Con `conReceta: true` el
   * backend recalcula y escribe el costo del plato; con `false` lo deja de
   * sincronizar. Devuelve lo mismo que `receta`.
   */
  guardar: (platoId: number, input: GuardarRecetaInput) =>
    request<RecetaPlato>(`/recetas-plato/${platoId}`, { method: "PUT", ...json(input) }),

  /** El tablero «Costos de platos» (`costos.ver`). */
  costos: (sucursalId?: number | null) => request<TableroCostos>(`/recetas-plato/costos${deSucursal(sucursalId)}`),

  /** «Ya lo vi»: el aviso vuelve a contar desde ahora. */
  marcarVisto: () => request<{ vistoEn: string }>("/recetas-plato/costos/visto", { method: "POST", ...json({}) }),

  /** Cómo se movió el costo de un plato (`costos.ver`). */
  historial: (platoId: number) => request<HistorialCostoPlato>(`/recetas-plato/${platoId}/historial`),
};
