import { enlaceWhatsapp, urlWhatsappConTexto } from "./catalogo";
import type { PaginaPublica } from "./tipos";

/**
 * Los WhatsApp de la página (13-oct): el general (el enlace de WhatsApp que
 * cargó el dueño) y, opcional, uno por sucursal. Pedido del dueño: "puede que
 * tenga sólo un WhatsApp; si tiene dos, le ponemos los dos números con el
 * nombre de la sucursal cada uno".
 */

export interface ContactoWhatsapp {
  /** El nombre de la sucursal, o "General" para el de la página. */
  etiqueta: string;
  /** `https://wa.me/<número>` (el general puede traer su `?text=`). */
  url: string;
}

/** El número de un enlace de WhatsApp (`wa.me/<n>` o `?phone=<n>`), o null. */
export function numeroWhatsapp(url: string): string | null {
  const directo = /wa\.me\/(\d+)/i.exec(url);
  if (directo) return directo[1];
  try {
    const telefono = new URL(url).searchParams.get("phone");
    return telefono ? telefono.replace(/\D/g, "") || null : null;
  } catch {
    return null;
  }
}

/**
 * Los números distintos a los que se puede escribir, cada uno con su
 * etiqueta. Primero las sucursales con número propio (en el orden de la
 * página) y al final el general, si es otro número. Un mismo número no se
 * repite: si el general es el de una sucursal, queda con el nombre de ella.
 * Con uno solo, los botones de WhatsApp funcionan como siempre (directo).
 */
export function contactosWhatsapp(p: PaginaPublica): ContactoWhatsapp[] {
  const vistos = new Set<string>();
  const lista: ContactoWhatsapp[] = [];
  const sumar = (etiqueta: string, url: string | null | undefined) => {
    if (!url) return;
    const n = numeroWhatsapp(url) ?? url;
    if (vistos.has(n)) return;
    vistos.add(n);
    lista.push({ etiqueta, url });
  };
  for (const s of p.sucursales) sumar(s.nombre, s.whatsappUrl);
  sumar("General", enlaceWhatsapp(p)?.url);
  return lista;
}

/**
 * La URL de un contacto con el mensaje que traía el botón tocado (su
 * `?text=`), si traía uno: "Hola, quiero hacer un pedido" llega igual a la
 * sucursal que se elija.
 */
export function conMensajeDe(urlTocada: string, contacto: string): string {
  try {
    const texto = new URL(urlTocada).searchParams.get("text");
    return texto ? urlWhatsappConTexto(contacto, texto) : contacto;
  } catch {
    return contacto;
  }
}

/**
 * El número como lo guarda el backend (`telefonoInternacional`): 8 dígitos
 * de Bolivia → 591…; con código de país, tal cual (10 a 15 dígitos). null si
 * no es un número válido (la vista previa no lo muestra hasta que lo sea).
 */
export function numeroInternacional(valor: string | null | undefined): string | null {
  const d = (valor ?? "").replace(/\D/g, "");
  if (d.length === 8 && /^[2-7]/.test(d)) return `591${d}`;
  if (d.length >= 10 && d.length <= 15) return d;
  return null;
}

/** Cómo se le muestra al dueño un número guardado: sin el 591 de Bolivia. */
export function numeroParaEditar(guardado: string | null | undefined): string {
  if (!guardado) return "";
  return /^591\d{8}$/.test(guardado) ? guardado.slice(3) : guardado;
}
