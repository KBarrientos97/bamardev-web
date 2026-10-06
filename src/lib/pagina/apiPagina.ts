import { ApiError, request, tokenStore } from "../api";
import type {
  CambiosPagina,
  EnlaceCorto,
  EnlaceCortoInput,
  EnlaceCortoSistema,
  EnlaceEditor,
  EnlaceInput,
  EstadisticasEnlace,
  EstadoEditor,
  PaginaPublica,
  SucursalEditor,
} from "./tipos";

/** El mismo origen del API que usa `lib/api.ts`. */
export const BASE_API = import.meta.env.VITE_API_URL || "/api";

/** Una ruta de imagen del backend (relativa al API) o una URL absoluta. */
export function urlDeImagen(ruta: string | null): string | null {
  if (!ruta) return null;
  return /^https?:\/\//.test(ruta) ? ruta : `${BASE_API}${ruta}`;
}

const json = (cuerpo: unknown) => JSON.stringify(cuerpo);

/**
 * Editor "Mi página" y enlaces cortos: pasan por el `request` de siempre
 * (token, sesión vencida, licencia y PostHog).
 */
export const apiPagina = {
  estado: () => request<EstadoEditor>("/pagina"),
  guardar: (cambios: CambiosPagina) =>
    request<EstadoEditor>("/pagina", { method: "PATCH", body: json(cambios) }),
  crearEnlace: (input: EnlaceInput) =>
    request<EnlaceEditor>("/pagina/enlaces", { method: "POST", body: json(input) }),
  editarEnlace: (id: number, cambios: Partial<EnlaceInput>) =>
    request<EnlaceEditor>(`/pagina/enlaces/${id}`, { method: "PATCH", body: json(cambios) }),
  borrarEnlace: (id: number) => request<void>(`/pagina/enlaces/${id}`, { method: "DELETE" }),
  ordenar: (ids: number[]) =>
    request<EstadoEditor>("/pagina/enlaces/orden", { method: "PUT", body: json({ ids }) }),
  sucursal: (
    id: number,
    cambios: Partial<Pick<SucursalEditor, "publicarEnPagina" | "horarioTexto" | "mapsUrl">>,
  ) => request<SucursalEditor>(`/pagina/sucursales/${id}`, { method: "PATCH", body: json(cambios) }),
  borrarImagen: (tipo: "logo" | "portada") =>
    request<void>(`/pagina/imagen/${tipo}`, { method: "DELETE" }),
  enlaceCorto: (canal: "CARTEL" | "COMPARTIR" | "RESERVA" = "CARTEL") =>
    request<EnlaceCortoSistema>("/pagina/enlace-corto", { method: "POST", body: json({ canal }) }),

  /**
   * Sube el logo o la portada. Va por fuera de `request` porque éste fija
   * `Content-Type: application/json`, y un multipart necesita que el
   * navegador ponga el suyo (con el separador).
   */
  async subirImagen(tipo: "logo" | "portada", archivo: Blob): Promise<{ url: string | null }> {
    const datos = new FormData();
    datos.append("archivo", archivo, tipo === "logo" ? "logo.webp" : "portada.webp");
    const token = tokenStore.get();
    let res: Response;
    try {
      res = await fetch(`${BASE_API}/pagina/imagen/${tipo}`, {
        method: "POST",
        body: datos,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch {
      throw new ApiError("No se pudo conectar con el servidor. Probá en un momento.", 0);
    }
    const cuerpo = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const m = cuerpo.message;
      const mensaje =
        res.status === 413
          ? "La imagen pesa más de 2 MB."
          : Array.isArray(m)
            ? m.join(", ")
            : String(m ?? "No se pudo subir la imagen");
      throw new ApiError(mensaje, res.status, cuerpo);
    }
    return cuerpo as { url: string | null };
  },

  // ── Mis enlaces ──
  enlaces: () => request<EnlaceCorto[]>("/enlaces"),
  crearCorto: (input: EnlaceCortoInput) =>
    request<EnlaceCorto>("/enlaces", { method: "POST", body: json(input) }),
  editarCorto: (
    id: number,
    cambios: Partial<EnlaceCortoInput> & { activo?: boolean; expiraEn?: string | null },
  ) => request<EnlaceCorto>(`/enlaces/${id}`, { method: "PATCH", body: json(cambios) }),
  borrarCorto: (id: number) => request<void>(`/enlaces/${id}`, { method: "DELETE" }),
  estadisticas: (id: number) => request<EstadisticasEnlace>(`/enlaces/${id}/estadisticas`),
};

/** Página no disponible (404) o sin conexión: la pública no distingue más. */
export class PaginaNoDisponible extends Error {}

/**
 * La página pública: sin token y sin las reglas de sesión. La ve cualquiera,
 * con o sin sesión abierta; un 404 no tiene que mandar a nadie al login.
 */
export async function pedirPaginaPublica(subdominio: string): Promise<PaginaPublica> {
  let res: Response;
  try {
    res = await fetch(`${BASE_API}/publico/pagina/${encodeURIComponent(subdominio)}`);
  } catch {
    throw new Error("No se pudo cargar la página. Revisá tu conexión.");
  }
  if (res.status === 404) throw new PaginaNoDisponible("Esta página no está disponible");
  if (!res.ok) throw new Error("No se pudo cargar la página. Probá en un momento.");
  return (await res.json()) as PaginaPublica;
}

/**
 * Cuenta un clic sin demorar la navegación: `sendBeacon` sigue aunque la
 * página se cierre. Si no está, un fetch `keepalive`. Nunca falla.
 */
export function avisarClic(subdominio: string, enlaceId: number): void {
  const url = `${BASE_API}/publico/pagina/${encodeURIComponent(subdominio)}/clic/${enlaceId}`;
  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      if (navigator.sendBeacon(url)) return;
    }
    void fetch(url, { method: "POST", keepalive: true }).catch(() => undefined);
  } catch {
    /* el enlace abre igual */
  }
}
