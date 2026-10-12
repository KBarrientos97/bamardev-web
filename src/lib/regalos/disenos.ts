/**
 * Diseños de gift card (IDEAS/6 #6). Son 10 estilos que se pintan con el
 * COLOR de la página del negocio y los MOTIVOS de su rubro (bigote en la
 * barbería, hoja en el spa, cubiertos en el restaurante…): cada rubro ve 10
 * diseños propios sin que nadie los dibuje a mano. Las claves son las mismas
 * que valida el backend (`src/pagina/regalos.ts`).
 *
 * Referencias (oct-2026): el monto grande y la tipografía como protagonista,
 * motivos ilustrados o botánicos para bienestar, la foto del negocio como
 * protagonista para experiencias, y siempre nombre, monto, código y vigencia.
 */

export const DISENOS_REGALO = [
  "MINIMAL",
  "CLASICA",
  "ELEGANTE",
  "GRADIENTE",
  "VALE",
  "BOTANICA",
  "POSTAL",
  "NEON",
  "GEOMETRICA",
  "FOTO",
] as const;
export type DisenoRegalo = (typeof DISENOS_REGALO)[number];

export const NOMBRE_DISENO: Record<DisenoRegalo, { nombre: string; descripcion: string }> = {
  MINIMAL: { nombre: "Minimal", descripcion: "Blanca, con el monto grande en tu color" },
  CLASICA: { nombre: "Clásica", descripcion: "Marco doble, como un certificado" },
  ELEGANTE: { nombre: "Elegante", descripcion: "Fondo oscuro con detalles dorados" },
  GRADIENTE: { nombre: "Degradé", descripcion: "Tu color en degradé, moderna" },
  VALE: { nombre: "Vale", descripcion: "Ticket troquelado, con su talón" },
  BOTANICA: { nombre: "Orgánica", descripcion: "Formas suaves y tranquilas" },
  POSTAL: { nombre: "Postal", descripcion: "Con estampilla y matasellos" },
  NEON: { nombre: "Neón", descripcion: "Oscura, con brillo de cartel" },
  GEOMETRICA: { nombre: "Geométrica", descripcion: "Figuras en los tonos de tu color" },
  FOTO: { nombre: "Con tu foto", descripcion: "La portada o el logo de tu página de fondo" },
};

export function esDiseno(x: string | null | undefined): x is DisenoRegalo {
  return !!x && (DISENOS_REGALO as readonly string[]).includes(x);
}

// ── Motivos por rubro ─────────────────────────────────────────────────────

/** Un ícono de trazo en una caja de 24×24 (uno o varios `d`). */
export type Icono = string[];

const ICONO = {
  regalo: [
    "M20 12v10H4V12",
    "M2 7h20v5H2z",
    "M12 22V7",
    "M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z",
    "M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z",
  ],
  tijeras: [
    "M3 6a3 3 0 1 0 6 0a3 3 0 1 0-6 0",
    "M3 18a3 3 0 1 0 6 0a3 3 0 1 0-6 0",
    "M20 4 8.12 15.88",
    "M14.47 14.48 20 20",
    "M8.12 8.12 12 12",
  ],
  bigote: ["M2 13c2 1 4 0 5.5-1.5S10 10 12 12c2-2 3-1.5 4.5-.5S20 14 22 13c-1 3-4 4-6 3-1.5-.7-2.5-1.5-4-1.5s-2.5.8-4 1.5c-2 1-5 0-6-3z"],
  navaja: ["M4 20l9-9", "M13 11l2-2 5-5c1 3 0 5-2 7l-3 2", "M4 20h3l6-6"],
  secador: ["M14 9a5 5 0 1 1-10 0a5 5 0 1 1 10 0", "M14 7h6v4h-6", "M8 14l1 7h3l-1-7"],
  hoja: [
    "M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z",
    "M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12",
  ],
  piedras: ["M5 18h14a3 3 0 0 0 0-6H5a3 3 0 0 0 0 6z", "M8 12a4 3 0 0 1 8 0", "M10 8a2 2 0 0 1 4 0"],
  esmalte: ["M9 2h6v5H9z", "M7 7h10l1 3v9a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3v-9z", "M7 13h10"],
  corazon: ["M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"],
  cubiertos: [
    "M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2",
    "M7 2v20",
    "M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7",
  ],
  taza: ["M17 8h1a4 4 0 1 1 0 8h-1", "M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z", "M6 2v2", "M10 2v2", "M14 2v2"],
  bolsa: ["M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z", "M3 6h18", "M16 10a4 4 0 0 1-8 0"],
  cruz: ["M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"],
  capsula: ["m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z", "m8.5 8.5 7 7"],
  llave: [
    "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z",
  ],
  engranaje: [
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
    "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
  ],
  estrella: ["M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"],
} satisfies Record<string, Icono>;

export interface MotivoRubro {
  /** El motivo principal (el grande) y el secundario (patrones, esquinas). */
  principal: Icono;
  secundario: Icono;
  /** La frase de la tarjeta, en el tono del rubro. */
  frase: string;
}

const MOTIVOS: Record<string, MotivoRubro> = {
  BARBERIA: { principal: ICONO.bigote, secundario: ICONO.navaja, frase: "Un regalo para lucir impecable" },
  PELUQUERIA: { principal: ICONO.tijeras, secundario: ICONO.secador, frase: "Un regalo para consentirte" },
  SPA: { principal: ICONO.hoja, secundario: ICONO.piedras, frase: "Un momento solo para vos" },
  UNAS: { principal: ICONO.esmalte, secundario: ICONO.corazon, frase: "Uñas perfectas de regalo" },
  RESTAURANTE: { principal: ICONO.cubiertos, secundario: ICONO.taza, frase: "Una comida rica, de regalo" },
  MINIMARKET: { principal: ICONO.bolsa, secundario: ICONO.estrella, frase: "Para lo que necesites" },
  FARMACIA: { principal: ICONO.cruz, secundario: ICONO.capsula, frase: "Para cuidarte" },
  FERRETERIA: { principal: ICONO.llave, secundario: ICONO.engranaje, frase: "Para tu próximo proyecto" },
  REPUESTOS: { principal: ICONO.engranaje, secundario: ICONO.llave, frase: "Para tu vehículo" },
};

const MOTIVO_GENERAL: MotivoRubro = { principal: ICONO.regalo, secundario: ICONO.estrella, frase: "Un regalo especial" };

/** Los motivos del rubro (clave del backend o nombre visible), o los generales. */
export function motivoDe(rubro: string | null | undefined): MotivoRubro {
  const clave = (rubro ?? "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^A-Z]/g, "");
  return MOTIVOS[clave] ?? MOTIVO_GENERAL;
}

// ── Color ─────────────────────────────────────────────────────────────────

function rgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function aHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`;
}

/** Mezcla `a` con `b` (t = 0 → a, 1 → b). */
export function mezclar(a: string, b: string, t: number): string {
  const x = rgb(a);
  const y = rgb(b);
  return aHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

function luminancia(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Texto legible sobre ese fondo. */
export function textoSobre(fondo: string): string {
  return luminancia(fondo) > 0.42 ? "#1F2937" : "#FFFFFF";
}

export interface Tonos {
  base: string;
  oscuro: string;
  profundo: string;
  claro: string;
  tinte: string;
  sobreBase: string;
}

export function tonos(hex: string): Tonos {
  const base = /^#?[0-9a-f]{6}$/i.test(hex) ? (hex.startsWith("#") ? hex : `#${hex}`) : "#4A4744";
  return {
    base,
    oscuro: mezclar(base, "#000000", 0.35),
    profundo: mezclar(base, "#0B0B0F", 0.78),
    claro: mezclar(base, "#FFFFFF", 0.55),
    tinte: mezclar(base, "#FFFFFF", 0.9),
    sobreBase: textoSobre(base),
  };
}

// ── Texto de la tarjeta ───────────────────────────────────────────────────

export function montoTexto(monto: number | null | undefined): string {
  if (monto == null || !Number.isFinite(monto)) return "Bs —";
  const entero = Number.isInteger(monto);
  return `Bs ${monto.toLocaleString("es-BO", { minimumFractionDigits: entero ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/** Corta con "…" para que entre en la tarjeta. */
export function corto(texto: string | null | undefined, max: number): string {
  const t = (texto ?? "").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** "2026-12-31" → "31/12/2026". */
export function fechaCorta(fecha: string | null | undefined): string | null {
  if (!fecha) return null;
  const [y, m, d] = fecha.split("-");
  return y && m && d ? `${d}/${m}/${y}` : null;
}
