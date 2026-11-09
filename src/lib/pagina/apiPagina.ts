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
  FichaSucursal,
  ItemCatalogoEditor,
  ItemCatalogoInput,
  PaginaPublica,
  PlantillaSitio,
  ProductoFijado,
  ProductoParaPagina,
  Sitio,
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

/** La extensión según lo que dio el canvas (WebP, o JPG en un Safari viejo). */
function nombreDeFoto(archivo: Blob): string {
  return archivo.type === "image/jpeg" ? "foto.jpg" : "foto.webp";
}

/**
 * Sube una imagen por multipart (campo `archivo`). Va por fuera de `request`
 * porque éste fija `Content-Type: application/json`, y un multipart necesita
 * que el navegador ponga el suyo (con el separador).
 */
async function subirArchivo<T>(ruta: string, archivo: Blob, nombre: string): Promise<T> {
  const datos = new FormData();
  datos.append("archivo", archivo, nombre);
  const token = tokenStore.get();
  let res: Response;
  try {
    res = await fetch(`${BASE_API}${ruta}`, {
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
  return cuerpo as T;
}

/**
 * Editor "Mi página" y enlaces cortos: pasan por el `request` de siempre
 * (token, sesión vencida, licencia y PostHog).
 *
 * Desde el 02-nov (PLAN-PAGINA-WEB §4.2) lo que el editor cambia va al
 * BORRADOR (`/pagina/borrador/...`): mismos nombres y mismas respuestas que
 * antes, pero la página pública no cambia hasta `publicarCambios`. Sólo
 * `publicacion` (Publicar/Despublicar la página entera) va directo.
 */
export const apiPagina = {
  estado: () => request<EstadoEditor>("/pagina"),
  guardar: (cambios: CambiosPagina) =>
    request<EstadoEditor>("/pagina/borrador", { method: "PATCH", body: json(cambios) }),
  /** Despublicar (o volver a publicar sin cambios): directo, no pasa por el borrador. */
  publicacion: (publicada: boolean) =>
    request<EstadoEditor>("/pagina", { method: "PATCH", body: json({ publicada }) }),
  /** Pasa el borrador a la página; con `publicarPagina`, además la deja publicada. */
  publicarCambios: (publicarPagina = false) =>
    request<EstadoEditor>("/pagina/borrador/publicar", { method: "POST", body: json({ publicarPagina }) }),
  descartarBorrador: () => request<EstadoEditor>("/pagina/borrador", { method: "DELETE" }),
  crearEnlace: (input: EnlaceInput) =>
    request<EnlaceEditor>("/pagina/borrador/enlaces", { method: "POST", body: json(input) }),
  editarEnlace: (id: number, cambios: Partial<EnlaceInput>) =>
    request<EnlaceEditor>(`/pagina/borrador/enlaces/${id}`, { method: "PATCH", body: json(cambios) }),
  borrarEnlace: (id: number) => request<void>(`/pagina/borrador/enlaces/${id}`, { method: "DELETE" }),
  ordenar: (ids: number[]) =>
    request<EstadoEditor>("/pagina/borrador/enlaces/orden", { method: "PUT", body: json({ ids }) }),
  sucursal: (
    id: number,
    cambios: Partial<Pick<SucursalEditor, "publicarEnPagina" | "whatsapp">>,
  ) => request<SucursalEditor>(`/pagina/borrador/sucursales/${id}`, { method: "PATCH", body: json(cambios) }),
  /** Configuración › Sucursales: la ficha única (se guarda al toque, no es de la página). */
  fichasSucursal: () => request<FichaSucursal[]>("/sucursales/fichas"),
  guardarFichaSucursal: (id: number, cambios: Partial<Omit<FichaSucursal, "id" | "nombre" | "esPrincipal">>) =>
    request<FichaSucursal>(`/sucursales/${id}/ficha`, { method: "PATCH", body: json(cambios) }),
  borrarImagen: (tipo: "logo" | "portada") =>
    request<void>(`/pagina/borrador/imagen/${tipo}`, { method: "DELETE" }),
  enlaceCorto: (canal: "CARTEL" | "COMPARTIR" | "RESERVA" = "CARTEL") =>
    request<EnlaceCortoSistema>("/pagina/enlace-corto", { method: "POST", body: json({ canal }) }),

  /** Sube el logo o la portada (ver `subirArchivo`). */
  subirImagen: (tipo: "logo" | "portada", archivo: Blob) =>
    subirArchivo<{ url: string | null }>(
      `/pagina/borrador/imagen/${tipo}`,
      archivo,
      tipo === "logo" ? "logo.webp" : "portada.webp",
    ),

  // ── El sitio del Profesional (PLAN-PAGINA-PRO M1): todo al borrador ──
  /** La primera vez arma el sitio del rubro; después cambia de plantilla sin perder lo cargado. */
  elegirPlantillaSitio: (plantilla: PlantillaSitio) =>
    request<EstadoEditor>("/pagina/borrador/sitio/plantilla", { method: "POST", body: json({ plantilla }) }),
  /** El sitio entero (400 con el motivo si algo no vale). */
  guardarSitio: (sitio: Sitio) => request<EstadoEditor>("/pagina/borrador/sitio", { method: "PUT", body: json(sitio) }),
  /** Volver a la página de siempre: se aplica al publicar. */
  quitarSitio: () => request<EstadoEditor>("/pagina/borrador/sitio", { method: "DELETE" }),
  subirFotoSitio: (archivo: Blob) =>
    subirArchivo<{ foto: string; estado: EstadoEditor }>("/pagina/borrador/sitio/fotos", archivo, nombreDeFoto(archivo)),
  /** 400 si la usa el sitio publicado. */
  borrarFotoSitio: (foto: string) =>
    request<EstadoEditor>(`/pagina/borrador/sitio/fotos/${encodeURIComponent(foto)}`, { method: "DELETE" }),

  // ── Catálogo: cada acción se guarda al toque, como los enlaces ──
  crearItemCatalogo: (input: ItemCatalogoInput) =>
    request<ItemCatalogoEditor>("/pagina/catalogo", { method: "POST", body: json(input) }),
  editarItemCatalogo: (id: number, cambios: Partial<ItemCatalogoInput>) =>
    request<ItemCatalogoEditor>(`/pagina/catalogo/${id}`, { method: "PATCH", body: json(cambios) }),
  /** Todos los ids, en el orden nuevo. */
  ordenarCatalogo: (ids: number[]) =>
    request<ItemCatalogoEditor[]>("/pagina/catalogo/orden", { method: "PUT", body: json({ ids }) }),
  borrarItemCatalogo: (id: number) => request<void>(`/pagina/catalogo/${id}`, { method: "DELETE" }),
  subirFotoCatalogo: (id: number, archivo: Blob) =>
    subirArchivo<ItemCatalogoEditor>(`/pagina/catalogo/${id}/foto`, archivo, nombreDeFoto(archivo)),
  borrarFotoCatalogo: (id: number) =>
    request<ItemCatalogoEditor>(`/pagina/catalogo/${id}/foto`, { method: "DELETE" }),

  // ── Catálogo "Mis productos" ──
  /** El selector: productos a la venta, por nombre (paginado en el backend). */
  buscarProductosCatalogo: (q: string, offset = 0) => {
    const params = new URLSearchParams({ offset: String(offset) });
    if (q.trim()) params.set("q", q.trim());
    return request<{ items: ProductoParaPagina[]; total: number; limite: number; offset: number }>(
      `/pagina/catalogo/productos?${params.toString()}`,
    );
  },
  /** La lista entera de productos fijados, en el orden nuevo (fijar, quitar y ordenar). */
  fijarProductosCatalogo: (productoIds: number[]) =>
    request<ProductoFijado[]>("/pagina/catalogo/productos", { method: "PUT", body: json({ productoIds }) }),

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
