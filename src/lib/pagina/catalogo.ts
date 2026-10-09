import type { EnlacePublico, PaginaPublica } from "./tipos";

/**
 * El catálogo de la página (08-oct): una galería general de fotos con título
 * y precio opcional, para cualquier rubro (uñas, cortes, platos, productos).
 * Las reglas de los campos son las del backend (`pagina/dto`): si se toca una
 * acá hay que tocarla allá.
 */

export const MAX_TITULO_ITEM = 60;
export const MAX_DESCRIPCION_ITEM = 140;
export const MAX_TITULO_CATALOGO = 40;
export const PRECIO_MAXIMO = 999_999.99;
/** Lo que manda el backend en `topeCatalogo`; por si un backend anterior no lo manda. */
export const TOPE_CATALOGO = 60;
/** Sin título propio, la sección se llama así (como la llama el backend). */
export const TITULO_CATALOGO = "Catálogo";

/**
 * "Bs 80", "Bs 80,50", "Desde Bs 1200". Sin decimales cuando el precio es
 * redondo: en una vidriera "Bs 80,00" se lee como un ticket. El símbolo va
 * fijo: la página pública no conoce la moneda del negocio (`fmtMoney` la toma
 * del login de la app) y el catálogo es en Bs.
 */
export function formatoPrecio(precio: number | null | undefined, desde = false): string | null {
  if (precio == null || !Number.isFinite(precio)) return null;
  const entero = Number.isInteger(precio);
  const numero = precio.toLocaleString("es-BO", {
    minimumFractionDigits: entero ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${desde ? "Desde " : ""}Bs ${numero}`;
}

export interface CamposItem {
  titulo: string;
  precio: string;
  descripcion: string;
}

export interface ErroresItem {
  titulo?: string;
  precio?: string;
  descripcion?: string;
}

/**
 * Valida lo tecleado en el popup con las reglas del backend y devuelve el
 * precio ya como número (o null si quedó vacío). Acepta coma o punto.
 */
export function validarItem(c: CamposItem): { errores: ErroresItem; precio: number | null } {
  const errores: ErroresItem = {};
  const titulo = c.titulo.trim();
  if (!titulo) errores.titulo = "Escribí un título.";
  else if (titulo.length > MAX_TITULO_ITEM) errores.titulo = `Hasta ${MAX_TITULO_ITEM} caracteres.`;

  let precio: number | null = null;
  const texto = c.precio.trim().replace(",", ".");
  if (texto) {
    if (!/^\d+(\.\d+)?$/.test(texto)) errores.precio = "Escribí sólo el número, por ejemplo 80 o 80,50.";
    else if (!/^\d+(\.\d{1,2})?$/.test(texto)) errores.precio = "El precio puede tener hasta 2 decimales.";
    else {
      precio = Number(texto);
      if (precio <= 0) errores.precio = "El precio tiene que ser mayor a 0. Si no querés mostrarlo, dejalo vacío.";
      else if (precio > PRECIO_MAXIMO) errores.precio = "El precio máximo es Bs 999.999,99.";
    }
  }
  if (c.descripcion.trim().length > MAX_DESCRIPCION_ITEM) {
    errores.descripcion = `Hasta ${MAX_DESCRIPCION_ITEM} caracteres.`;
  }
  return { errores, precio: errores.precio ? null : precio };
}

/** Mueve `id` a la posición `destino` (las demás corren un lugar). */
export function moverA(ids: number[], id: number, destino: number): number[] {
  const resto = ids.filter((x) => x !== id);
  const i = Math.max(0, Math.min(destino, resto.length));
  return [...resto.slice(0, i), id, ...resto.slice(i)];
}

/**
 * El WhatsApp del negocio para "Consultar por WhatsApp": el botón principal
 * si es un WhatsApp; si no, el primero que haya entre los botones y las redes.
 */
export function enlaceWhatsapp(p: PaginaPublica): EnlacePublico | null {
  if (p.destacado?.tipo === "WHATSAPP") return p.destacado;
  return [...p.botones, ...p.redes].find((x) => x.tipo === "WHATSAPP") ?? null;
}

/**
 * La URL de WhatsApp con el mensaje "Hola, me interesa: <título>". Respeta
 * los demás parámetros (el `phone` de api.whatsapp.com) y reemplaza el
 * `text` que traiga: el saludo genérico no dice qué le interesó. Va con %20 y
 * no con "+": así lo arma WhatsApp y así lo leen todas sus versiones.
 */
export function urlConsultaWhatsapp(url: string, titulo: string): string {
  const texto = `text=${encodeURIComponent(`Hola, me interesa: ${titulo}`)}`;
  try {
    const u = new URL(url);
    u.searchParams.delete("text");
    const resto = u.searchParams.toString();
    u.search = resto ? `${resto}&${texto}` : texto;
    return u.toString();
  } catch {
    return url;
  }
}
