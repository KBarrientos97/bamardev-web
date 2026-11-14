import type { EntregaPublica, InfoPedidos, SucursalPedido } from "./tipos";

/**
 * Lo común a las pantallas del delivery EXTERNO de los pedidos de la página
 * (PLAN-DELIVERY-EXTERNO §2): quién entrega, cómo se llama el servicio y cuáles
 * sucursales ofrecen delivery. Un solo lugar, para que la hoja del pedido, el
 * seguimiento y la bandeja digan lo mismo.
 */

/** Cómo se llama el servicio cuando el negocio no escribió otro. */
export const SERVICIO_POR_DEFECTO = "Yango";

/** El nombre que ve la gente: el que escribió el negocio o «Yango». */
export function nombreServicio(servicio: string | null | undefined): string {
  return servicio?.trim() || SERVICIO_POR_DEFECTO;
}

/** ¿Entrega por un servicio externo? Recibe el `modo` / `modoEntrega`; ausente = repartidores propios. */
export const esExterno = (modo: string | null | undefined): boolean => modo === "EXTERNO";

/** La operativa del negocio en la página, con «propia» si un backend viejo no la manda. */
export function entregaDe(info: Pick<InfoPedidos, "entrega"> | null | undefined): EntregaPublica {
  return info?.entrega ?? { modo: "PROPIO", servicio: null };
}

/**
 * ¿Esta sucursal ofrece delivery? Lo dice el backend (`delivery`); un backend
 * viejo no lo manda y vale lo de siempre: tener un punto en el mapa.
 */
export function ofreceDelivery(s: SucursalPedido): boolean {
  return s.delivery ?? (s.latitud != null && s.longitud != null);
}

/**
 * La URL de la imagen del QR de pago. El backend la manda como ruta de la API
 * (`/publico/pedidos/<sub>/<token>/qr`) o ya completa: se acepta de las dos
 * formas, con la base de la API de esta web.
 */
export function urlDeQr(qrUrl: string, base: string = import.meta.env.VITE_API_URL || "/api"): string {
  if (/^https?:\/\//i.test(qrUrl)) return qrUrl;
  if (qrUrl.startsWith("/publico/")) return `${base.replace(/\/$/, "")}${qrUrl}`;
  if (/^https?:\/\//i.test(base)) {
    try {
      return new URL(qrUrl, base).href;
    } catch {
      return qrUrl;
    }
  }
  return qrUrl;
}

/** El enlace de seguimiento que acepta el backend: sólo `https://`, hasta 500 caracteres (§2.1). */
export const MAX_ENLACE = 500;

/** `null` si el enlace sirve (o está vacío: es opcional); si no, qué decirle a la caja. */
export function errorDeEnlace(enlace: string): string | null {
  const t = enlace.trim();
  if (!t) return null;
  if (!/^https:\/\/\S+$/i.test(t)) return "El enlace tiene que empezar con https:// y no llevar espacios.";
  if (t.length > MAX_ENLACE) return `El enlace es muy largo (hasta ${MAX_ENLACE} caracteres).`;
  return null;
}
