import { esHostLink } from "./link";

/**
 * ¿El enlace saca al visitante de la página? Las redes, WhatsApp y las webs
 * de afuera se abren en otra pestaña, así el cliente vuelve a la carta sin
 * perder el pedido que estaba armando. Lo que sigue dentro de BamarDev (la
 * reserva, el modo pedir, la privacidad, otra página `link…` o `app…`) y
 * los esquemas que abre el sistema (`tel:`, `mailto:`) siguen en la misma.
 *
 * Pura: recibe el origen actual para poder probarla sin navegador.
 */
export function abreEnOtraPestana(href: string, origenActual: string): boolean {
  let url: URL;
  try {
    url = new URL(href, origenActual);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (url.origin === origenActual) return false;
  const host = url.hostname.toLowerCase();
  return !esHostLink(host) && !/^app(-[a-z0-9]+)?\.bamardev\.com$/.test(host);
}

/** Los atributos del `<a>`: `target` sólo cuando sale de la página. */
export function atributosEnlace(href: string): { target?: "_blank"; rel: string } {
  const origen = typeof window === "undefined" ? "" : window.location.origin;
  return abreEnOtraPestana(href, origen) ? { target: "_blank", rel: "noopener noreferrer" } : { rel: "noopener noreferrer" };
}
