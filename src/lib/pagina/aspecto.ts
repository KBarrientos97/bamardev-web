import type { FormaBotones, TipoEnlace, Tipografia } from "./tipos";

/**
 * La apariencia de la página del negocio (PLAN-PAGINA-NEGOCIO §1.5): cómo se
 * pinta el color de la muestra, la forma de los botones y la tipografía.
 *
 * Mismas cuentas que el lienzo aprobado (BioPublica / MiPagina): el tinte es
 * la muestra mezclada con 88 % de blanco (fondo de los íconos) y el oscuro, con
 * 35 % de negro (trazo de los íconos y textos de acento).
 */

/** Mezcla dos colores hex: `t` = cuánto del segundo. */
export function mezcla(hex: string, otro: string, t: number): string {
  const a = hex.replace("#", "");
  const b = otro.replace("#", "");
  const c = [0, 2, 4].map((i) =>
    Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t),
  );
  return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
}

export interface Paleta {
  acento: string;
  tinte: string;
  oscuro: string;
  /** La barra del cartel QR. */
  barra: string;
}

export function paleta(hex: string): Paleta {
  return {
    acento: hex,
    tinte: mezcla(hex, "#ffffff", 0.88),
    oscuro: mezcla(hex, "#000000", 0.35),
    barra: mezcla(hex, "#000000", 0.3),
  };
}

export const RADIO_BOTON: Record<FormaBotones, string> = {
  REDONDEADO: "14px",
  PILDORA: "999px",
  RECTO: "4px",
};

export function radioBoton(forma: string): string {
  return RADIO_BOTON[forma as FormaBotones] ?? RADIO_BOTON.REDONDEADO;
}

export const FUENTE_TITULO: Record<Tipografia, string> = {
  MODERNA: "Roboto, system-ui, sans-serif",
  ELEGANTE: '"Playfair Display", Georgia, serif',
  FUERTE: "Oswald, Impact, sans-serif",
};

export function fuenteTitulo(tipografia: string): string {
  return FUENTE_TITULO[tipografia as Tipografia] ?? FUENTE_TITULO.MODERNA;
}

export const NOMBRE_FORMA: Record<FormaBotones, string> = {
  REDONDEADO: "Redondeados",
  PILDORA: "Píldora",
  RECTO: "Rectos",
};

export const NOMBRE_TIPOGRAFIA: Record<Tipografia, string> = {
  MODERNA: "Moderna",
  ELEGANTE: "Elegante",
  FUERTE: "Fuerte",
};

const FUENTES_GOOGLE =
  "https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Playfair+Display:wght@600;700&family=Oswald:wght@500;600&display=swap";

/**
 * Carga las tres tipografías de la página una sola vez. La app no las usa, así
 * que no van en `index.html`: sólo las baja quien abre una página o el editor.
 */
export function cargarFuentesPagina(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById("fuentes-pagina")) return;
  const link = document.createElement("link");
  link.id = "fuentes-pagina";
  link.rel = "stylesheet";
  link.href = FUENTES_GOOGLE;
  document.head.appendChild(link);
}

// ── Íconos ─────────────────────────────────────────────────────────────────
// Set propio de trazos (§1.5: no se cargan scripts de las redes). viewBox 24.

export const ICONO_RED: Record<TipoEnlace, string> = {
  WHATSAPP:
    "M4 20l1.5-4A8 8 0 1 1 9 19.5L4 20Zm5-11c0 3 3 6 6 6l1-1.5-2-1-1 1c-1 0-2.5-1.5-2.5-2.5l1-1-1-2L9 9Z",
  FACEBOOK: "M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8Z",
  INSTAGRAM:
    "M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4Zm5 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm5.5-1.5h.01",
  TIKTOK: "M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5M14 3c.5 2.5 2.5 4.5 5 5",
  MAPS: "M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12Zm0-9.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  YOUTUBE:
    "M3 8.5C3 6.6 4.4 5.1 6.3 5 8 4.9 10 4.8 12 4.8s4 .1 5.7.2c1.9.1 3.3 1.6 3.3 3.5v7c0 1.9-1.4 3.4-3.3 3.5-1.7.1-3.7.2-5.7.2s-4-.1-5.7-.2C4.4 18.9 3 17.4 3 15.5v-7ZM10 9l5 3-5 3V9Z",
  WEB: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9S14.5 18.5 12 21c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3Z",
  TELEFONO:
    "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z",
  CORREO: "M4 6h16v12H4zM4 7l8 6 8-6",
  DELIVERY:
    "M5 17a2 2 0 1 0 4 0 2 2 0 0 0-4 0Zm10 0a2 2 0 1 0 4 0 2 2 0 0 0-4 0ZM9 17h6M3 9h8l2 4h4l2 4M13 9V6h3",
  TELEGRAM: "M21 4 3 11l6 2 2 6 3-4 5 4 2-15ZM9 13l9-7",
  X: "M5 4l14 16M19 4 5 20",
  THREADS: "M16 12a4 4 0 1 1-1.2-2.8M16 9v4.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3.5 7.1",
  LINKEDIN: "M4 9h4v11H4zM6 5h.01M10 20V9h4v2c.8-1.3 2-2 3.5-2 2.2 0 3.5 1.5 3.5 4.3V20h-4v-6c0-1.2-.6-2-1.6-2-1.2 0-1.9.8-1.9 2.2V20",
  BOTON:
    "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
};

export const ICONO_BOTON: Record<string, string> = {
  enlace: ICONO_RED.BOTON,
  menu: "M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2V3ZM9 8h6M9 12h6",
  catalogo: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  promo: "M3 12V4h8l10 10-8 8L3 12Zm5-4h.01",
  calendario: "M3 5h18v16H3zM3 10h18M8 3v4M16 3v4",
  foto: "M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M15 9h.01",
  delivery: ICONO_RED.DELIVERY,
  ubicacion: ICONO_RED.MAPS,
  telefono: ICONO_RED.TELEFONO,
  estrella: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z",
  regalo: "M3 9h18v4H3zM5 13h14v8H5zM12 9v12M12 9c-2-4-6-4-6-1s6 1 6 1Zm0 0c2-4 6-4 6-1s-6 1-6 1Z",
  formulario: "M6 3h12v18H6zM9 8h6M9 12h6M9 16h4",
};

export const NOMBRE_ICONO_BOTON: Record<string, string> = {
  enlace: "Enlace",
  menu: "Menú",
  catalogo: "Catálogo",
  promo: "Promoción",
  calendario: "Calendario",
  foto: "Fotos",
  delivery: "Delivery",
  ubicacion: "Ubicación",
  telefono: "Teléfono",
  estrella: "Destacado",
  regalo: "Regalo",
  formulario: "Formulario",
};

export const ICONO_ANUNCIO =
  "M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1ZM15 9a3 3 0 0 1 0 6M18 6a7 7 0 0 1 0 12";
export const ICONO_RESERVAR = "M3 5h18v16H3zM3 10h18M8 3v4M16 3v4";

/** El trazo de un enlace: el de su red, o el ícono elegido si es un botón. */
export function iconoDe(tipo: string, icono: string | null): string {
  if (tipo === "BOTON" || icono) return ICONO_BOTON[icono ?? "enlace"] ?? ICONO_BOTON.enlace;
  return ICONO_RED[tipo as TipoEnlace] ?? ICONO_RED.BOTON;
}

// ── Tipos de enlace para el editor ─────────────────────────────────────────

export interface TipoEnlaceEditor {
  tipo: TipoEnlace;
  nombre: string;
  /** Qué se le pide al dueño (§1.5: el usuario o el número, no la URL). */
  pide: string;
  ejemplo: string;
}

/** En el orden de §1.5: lo que más se usa en Bolivia primero. */
export const TIPOS_EDITOR: TipoEnlaceEditor[] = [
  { tipo: "WHATSAPP", nombre: "WhatsApp", pide: "Número", ejemplo: "70123456" },
  { tipo: "FACEBOOK", nombre: "Facebook", pide: "Usuario o enlace de la página", ejemplo: "minegocio" },
  { tipo: "INSTAGRAM", nombre: "Instagram", pide: "@usuario", ejemplo: "@minegocio" },
  { tipo: "TIKTOK", nombre: "TikTok", pide: "@usuario", ejemplo: "@minegocio" },
  { tipo: "MAPS", nombre: "Google Maps", pide: "Enlace de tu ficha", ejemplo: "https://maps.app.goo.gl/…" },
  { tipo: "YOUTUBE", nombre: "YouTube", pide: "@canal", ejemplo: "@minegocio" },
  { tipo: "WEB", nombre: "Sitio web", pide: "Dirección", ejemplo: "https://minegocio.bo" },
  { tipo: "TELEFONO", nombre: "Teléfono", pide: "Número", ejemplo: "33445566" },
  { tipo: "CORREO", nombre: "Correo", pide: "Correo", ejemplo: "hola@minegocio.bo" },
  { tipo: "DELIVERY", nombre: "App de delivery", pide: "Enlace a tu tienda", ejemplo: "https://www.pedidosya.com.bo/…" },
  { tipo: "TELEGRAM", nombre: "Telegram", pide: "@usuario", ejemplo: "@minegocio" },
  { tipo: "X", nombre: "X", pide: "@usuario", ejemplo: "@minegocio" },
  { tipo: "THREADS", nombre: "Threads", pide: "@usuario", ejemplo: "@minegocio" },
  { tipo: "LINKEDIN", nombre: "LinkedIn", pide: "Usuario o enlace", ejemplo: "minegocio" },
  { tipo: "BOTON", nombre: "Botón libre", pide: "Enlace", ejemplo: "https://… (menú en PDF, catálogo, formulario)" },
];

export function nombreTipo(tipo: string): string {
  return TIPOS_EDITOR.find((t) => t.tipo === tipo)?.nombre ?? tipo;
}
