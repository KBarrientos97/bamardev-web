import type { NombreIcono } from "../../components/Icon";
import type { Feature } from "../../types";
import type { Seccion } from "../permisos";
import { normalizar } from "../texto";

/**
 * La Ayuda del sistema (IDEAS/11-CHATBOT-SOPORTE-GUIAS §0): el botón de la web
 * con respuestas de soporte para el dueño y su equipo. Un menú de botones con
 * un buscador arriba, sin servidor: el contenido viaja con la app, así que
 * anda aunque el VPS esté caído o no haya internet.
 *
 * No es el asistente de la página (`asistente_pagina`, bamardev-chat): aquél
 * contesta a los clientes del negocio sobre su ficha; éste, sobre cómo se usa
 * BamarDev. No comparten nada (el dueño, 02-nov).
 */

export type Rama = "vender" | "caja" | "reportes" | "productos" | "equipo" | "pagina-qr" | "licencia";

export type Bloque =
  | { tipo: "pasos"; items: string[] }
  | { tipo: "lista"; items: string[] }
  | { tipo: "texto"; texto: string };

export interface Respuesta {
  /** Estable: lo citan `relacionados` y, más adelante, el video del mismo flujo. */
  id: string;
  titulo: string;
  rama: Rama;
  /** Posición del botón dentro de su rama. */
  orden: number;
  /** Cómo lo escribe la gente: alimenta el buscador. */
  frases: string[];
  /** Vacío = todos los rubros. */
  rubros: string[];
  /** Sin la sección (el mismo filtro del menú) la respuesta no se ofrece. */
  seccion?: Seccion;
  /** "Llevame ahí": una ruta de AppNegocio. */
  destino?: string;
  cuerpo: Bloque[];
  /** Los pasos en la app Android, si cambian: el dueño le enseña a su cajera. */
  celular?: string[];
  importante?: string;
  siNoAparece?: string;
  relacionados: string[];
}

export interface InfoRama {
  id: Rama;
  titulo: string;
  icono: NombreIcono;
}

/** El orden de los botones del inicio: primero lo de todos los días. */
export const RAMAS: InfoRama[] = [
  { id: "vender", titulo: "Vender", icono: "cart" },
  { id: "caja", titulo: "Caja", icono: "dollar" },
  { id: "reportes", titulo: "Reportes", icono: "chart" },
  { id: "productos", titulo: "Productos y precios", icono: "package" },
  { id: "equipo", titulo: "Mi equipo", icono: "users" },
  { id: "pagina-qr", titulo: "Mi página y QR", icono: "qr" },
  { id: "licencia", titulo: "Mi licencia", icono: "key" },
];

/**
 * La Ayuda sólo con la feature prendida desde el panel, y sin el fail-open de
 * `tieneFeature`: una sesión sin la lista de features (vieja, o el backend que
 * no la mandó) no la muestra. Mientras el contenido sea de restaurante se
 * prende negocio por negocio (el dueño, 02-nov).
 */
export function tieneAyuda(features: Feature[] | undefined): boolean {
  return !!features?.includes("ayuda");
}

export interface ContextoAyuda {
  rubro: string | undefined;
  puede: (seccion: Seccion) => boolean;
  /** Los reportes que el usuario ve (`gruposVisibles` de Reportes). */
  reportesVisibles: ReadonlySet<string>;
}

/** `/reportes/cierres` → "cierres". `/reportes` a secas es el Resumen. */
export function reporteDeDestino(destino: string | undefined): string | null {
  const m = destino?.match(/^\/reportes\/([^/?#]+)/);
  return m ? m[1] : null;
}

/**
 * Se ofrece lo que esa persona puede hacer en su negocio: el rubro, la sección
 * del menú y, en los atajos de Reportes, que vea ese reporte (cada uno pide su
 * permiso y su parte del plan). A la cajera no le sale "Crear un usuario".
 */
export function respuestaVisible(r: Respuesta, ctx: ContextoAyuda): boolean {
  if (r.rubros.length > 0 && !(ctx.rubro && r.rubros.includes(ctx.rubro))) return false;
  if (r.seccion && !ctx.puede(r.seccion)) return false;
  const reporte = reporteDeDestino(r.destino);
  if (reporte && !ctx.reportesVisibles.has(reporte)) return false;
  return true;
}

export function respuestasVisibles(todas: Respuesta[], ctx: ContextoAyuda): Respuesta[] {
  return todas.filter((r) => respuestaVisible(r, ctx));
}

export function deRama(visibles: Respuesta[], rama: Rama): Respuesta[] {
  return visibles.filter((r) => r.rama === rama).sort((a, b) => a.orden - b.orden);
}

/** Lo que no aporta para elegir una respuesta: "cómo hago para…". */
const VACIAS = new Set(
  "a al como cual cuando de del donde el en es esta este hago hacer la las le lo los me mi mis no o para por puedo que quiero se si su sus te tengo tu un una y ya".split(" "),
);

function palabras(texto: string): string[] {
  return normalizar(texto)
    .replace(/[^a-z0-9ñ]+/g, " ")
    .split(" ")
    .filter((p) => p.length > 1 && !VACIAS.has(p));
}

/**
 * Dos palabras valen lo mismo si son iguales o comparten la raíz: "anulo" y
 * "anular", "sobro" y "sobrante". Con 4 letras de raíz mínima, para que
 * "caja" no encuentre "cajero".
 */
function mismaRaiz(a: string, b: string): boolean {
  if (a === b) return true;
  const corta = Math.min(a.length, b.length);
  if (corta < 4) return false;
  const raiz = Math.max(4, corta - 1);
  return a.slice(0, raiz) === b.slice(0, raiz);
}

/**
 * El buscador de arriba: compara lo escrito con el título y las frases de cada
 * respuesta y se queda con las que cubren la mayor parte de lo escrito. No
 * necesita sinónimos ni corpus como el chat de la página: para lo que no
 * encuentra está el menú y WhatsApp.
 */
export function buscar(texto: string, visibles: Respuesta[], tope = 5): Respuesta[] {
  const pedidas = palabras(texto);
  if (pedidas.length === 0) return [];
  const puntaje = (r: Respuesta) => {
    let mejor = 0;
    for (const frase of [r.titulo, ...r.frases]) {
      const deFrase = palabras(frase);
      if (deFrase.length === 0) continue;
      const cubiertas = pedidas.filter((p) => deFrase.some((f) => mismaRaiz(p, f))).length;
      // Lo que se cubrió de la pregunta pesa más; lo que se usó de la frase
      // desempata ("cerrar caja" gana a "no me deja cerrar caja" si se
      // escribió sólo "cerrar caja").
      const valor = cubiertas / pedidas.length + (cubiertas / deFrase.length) * 0.1;
      if (valor > mejor) mejor = valor;
    }
    return mejor;
  };
  return visibles
    .map((r) => ({ r, p: puntaje(r) }))
    .filter((x) => x.p >= 0.6)
    .sort((a, b) => b.p - a.p)
    .slice(0, tope)
    .map((x) => x.r);
}

/**
 * Soporte por WhatsApp: el número de la landing (`bamardev-landing`
 * `WHATSAPP_NUMERO`). Si el soporte pasa a otro número, se cambia acá.
 */
export const WHATSAPP_SOPORTE = "59167865462";

/**
 * El mensaje sale armado para que soporte no tenga que preguntar de dónde
 * escriben: negocio, rol, en qué parte de la Ayuda estaba y qué buscó. No lleva
 * datos del negocio (ventas, clientes): sólo lo que la persona ve.
 */
export function enlaceWhatsapp(datos: {
  negocio?: string;
  alias?: string;
  rol?: string;
  donde?: string;
  busco?: string;
}): string {
  const quien = [datos.rol, datos.negocio && `de ${datos.negocio}${datos.alias ? ` (${datos.alias})` : ""}`]
    .filter(Boolean)
    .join(" ");
  const partes = [
    `Hola, vengo de la Ayuda.${quien ? ` Soy ${quien}.` : ""}`,
    datos.donde ? `Estaba en: ${datos.donde}.` : "",
    datos.busco ? `Busqué: "${datos.busco.slice(0, 120)}".` : "",
    "Necesito ayuda con:",
  ].filter(Boolean);
  return `https://wa.me/${WHATSAPP_SOPORTE}?text=${encodeURIComponent(partes.join(" "))}`;
}

/**
 * Pantallas donde el botón flotante taparía algo (el carrito y Cobrar, el
 * salón del mesero, la cola de despacho): ahí la Ayuda queda en el menú.
 */
const SIN_FLOTANTE = ["/pos", "/salon", "/despacho", "/billar", "/reparto", "/buscar", "/academia/cobrar"];

export function conBotonFlotante(pathname: string): boolean {
  return !SIN_FLOTANTE.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}

/** `**Cobrar**` → partes para dibujar en negrita los rótulos de la pantalla. */
export function partesConNegrita(texto: string): { texto: string; negrita: boolean }[] {
  return texto
    .split(/(\*\*[^*]+\*\*)/)
    .filter((p) => p !== "")
    .map((p) => (p.startsWith("**") && p.endsWith("**") ? { texto: p.slice(2, -2), negrita: true } : { texto: p, negrita: false }));
}
