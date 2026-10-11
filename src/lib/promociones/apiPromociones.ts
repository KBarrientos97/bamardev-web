import { request, tokenStore } from "../api";
import type {
  Cotizacion,
  CotizarInput,
  Cupon,
  CuponesInput,
  DisponibilidadCupon,
  EnlaceCampana,
  EstadoPromocion,
  Promocion,
  PromocionInput,
  PromoPublica,
  ReportePromocion,
} from "./tipos";

const BASE = import.meta.env.VITE_API_URL || "/api";
const json = (body: unknown) => ({ body: JSON.stringify(body) });

/** Promociones, cupones y la cotización del POS (PLAN-CRM-Y-PROMOCIONES). */
export const apiPromociones = {
  listar: () => request<Promocion[]>("/promociones"),
  ver: (id: number) => request<Promocion>(`/promociones/${id}`),
  crear: (input: PromocionInput) =>
    request<Promocion>("/promociones", { method: "POST", ...json(input) }),
  editar: (id: number, input: PromocionInput) =>
    request<Promocion>(`/promociones/${id}`, { method: "PATCH", ...json(input) }),
  estado: (id: number, estado: EstadoPromocion) =>
    request<Promocion>(`/promociones/${id}/estado`, { method: "POST", ...json({ estado }) }),
  borrar: (id: number) => request<{ ok: true }>(`/promociones/${id}`, { method: "DELETE" }),
  reporte: (id: number) => request<ReportePromocion>(`/promociones/${id}/reporte`),
  enlace: (id: number, canal = "WHATSAPP") =>
    request<EnlaceCampana>(`/promociones/${id}/enlace`, { method: "POST", ...json({ canal }) }),
  anunciar: (id: number) =>
    request<{ ok: true; url: string }>(`/promociones/${id}/anunciar`, { method: "POST" }),

  cupones: (id: number) => request<Cupon[]>(`/promociones/${id}/cupones`),
  /** ¿El código está libre en el negocio? Sólo lee. */
  disponibilidadCupon: (codigo: string) =>
    request<DisponibilidadCupon>(`/promociones/cupones/disponible?codigo=${encodeURIComponent(codigo)}`),
  crearCupones: (id: number, input: CuponesInput) =>
    request<Cupon[]>(`/promociones/${id}/cupones`, { method: "POST", ...json(input) }),
  anularCupon: (cuponId: number) =>
    request<Cupon>(`/promociones/cupones/${cuponId}/anular`, { method: "POST" }),
  bajarCuponesCsv: (id: number) => descargar(`/promociones/${id}/cupones.csv`, `cupones-${id}.csv`),

  /** Sin efectos: el carrito con sus descuentos y el total. */
  cotizar: (input: CotizarInput) =>
    request<Cotizacion>("/ventas/cotizar", { method: "POST", ...json(input) }),
};

/**
 * Baja un archivo de un endpoint con sesión. `fetch` + blob y no un `<a href>`:
 * el enlace no lleva el token.
 */
export async function descargar(path: string, nombrePorDefecto: string) {
  const token = tokenStore.get();
  const res = await fetch(`${BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    let mensaje = "No se pudo descargar";
    try {
      const cuerpo = (await res.json()) as { message?: string };
      if (cuerpo.message) mensaje = cuerpo.message;
    } catch {
      /* sin cuerpo */
    }
    throw new Error(mensaje);
  }
  const disposicion = res.headers.get("content-disposition") ?? "";
  const nombre = /filename="([^"]+)"/.exec(disposicion)?.[1] ?? nombrePorDefecto;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export class PromoNoDisponible extends Error {}

/** La página pública de una promo: sin token, como la del negocio. */
export async function pedirPromoPublica(subdominio: string, slug: string): Promise<PromoPublica> {
  let res: Response;
  try {
    res = await fetch(
      `${BASE}/publico/promo/${encodeURIComponent(subdominio)}/${encodeURIComponent(slug)}`,
    );
  } catch {
    throw new Error("No se pudo cargar la promoción. Revisá tu conexión.");
  }
  if (res.status === 404) throw new PromoNoDisponible("Esta promoción no está disponible");
  if (!res.ok) throw new Error("No se pudo cargar la promoción. Probá en un momento.");
  return (await res.json()) as PromoPublica;
}
