import type { Muestra } from "./tipos";

/**
 * "Colores de tu logo" (IDEAS/5 §4.5 b, aprobado el 09-oct): los 2 o 3 colores
 * que más se ven en el logo, llevados a la muestra más parecida de las 32. No
 * se abre el color libre (decisión del 06-oct): así se conserva la garantía de
 * contraste. Todo en el navegador, sin backend.
 */

type Rgb = [number, number, number];

function aRgb(hex: string): Rgb {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
}

function aHex([r, g, b]: Rgb): string {
  return "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase();
}

/** Saturación y luminosidad (HSL), de 0 a 1. */
function satLuz([r, g, b]: Rgb): { s: number; l: number } {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { s, l };
}

/**
 * Los colores que más se ven, de más a menos. Se ignoran los transparentes,
 * los blancos, los negros y los grises: el fondo del logo y el texto negro no
 * son "el color de la marca". Cuantiza a 4 bits por canal y promedia cada
 * grupo; dos grupos casi iguales se juntan.
 */
export function coloresDominantes(datos: ArrayLike<number>, maximo = 3): string[] {
  const grupos = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i + 3 < datos.length; i += 4) {
    const r = datos[i];
    const g = datos[i + 1];
    const b = datos[i + 2];
    const a = datos[i + 3];
    if (a < 128) continue;
    const { s, l } = satLuz([r, g, b]);
    if (l > 0.94 || l < 0.08 || s < 0.22) continue;
    const clave = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const x = grupos.get(clave) ?? { n: 0, r: 0, g: 0, b: 0 };
    x.n += 1;
    x.r += r;
    x.g += g;
    x.b += b;
    grupos.set(clave, x);
  }
  const ordenados = [...grupos.values()]
    .sort((p, q) => q.n - p.n)
    .map((x) => ({ n: x.n, rgb: [x.r / x.n, x.g / x.n, x.b / x.n] as Rgb }));
  const total = ordenados.reduce((s, x) => s + x.n, 0);
  const elegidos: Rgb[] = [];
  for (const x of ordenados) {
    // Un color que ocupa menos del 3 % del logo es un detalle, no la marca.
    if (x.n < total * 0.03) break;
    if (elegidos.some((e) => distanciaLab(e, x.rgb) < 18)) continue;
    elegidos.push(x.rgb);
    if (elegidos.length >= maximo) break;
  }
  return elegidos.map(aHex);
}

// ── Distancia en Lab (CIE 1976, D65) ───────────────────────────────────────

function lineal(v: number): number {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function aLab([r, g, b]: Rgb): Rgb {
  const [R, G, B] = [lineal(r), lineal(g), lineal(b)];
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const x = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047);
  const y = f(0.2126 * R + 0.7152 * G + 0.0722 * B);
  const z = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/**
 * Distancia entre dos colores en Lab, con la luminosidad a mitad de peso: las
 * 32 muestras son todas oscuras (para que el blanco se lea encima) y los
 * logos suelen ser claros y vivos; lo que importa es el tono, no cuán claro es.
 */
function distanciaLab(a: Rgb, b: Rgb): number {
  const [l1, a1, b1] = aLab(a);
  const [l2, a2, b2] = aLab(b);
  return Math.hypot((l1 - l2) * 0.5, a1 - a2, b1 - b2);
}

/** La muestra más parecida a un color. */
export function muestraMasParecida(hex: string, muestras: Muestra[]): Muestra | null {
  const rgb = aRgb(hex);
  let mejor: Muestra | null = null;
  let menor = Infinity;
  for (const m of muestras) {
    const d = distanciaLab(rgb, aRgb(m.hex));
    if (d < menor) {
      menor = d;
      mejor = m;
    }
  }
  return mejor;
}

/** Las claves de las muestras de esos colores, sin repetir y en el mismo orden. */
export function muestrasDeColores(colores: string[], muestras: Muestra[]): string[] {
  const claves: string[] = [];
  for (const c of colores) {
    const m = muestraMasParecida(c, muestras);
    if (m && !claves.includes(m.clave)) claves.push(m.clave);
  }
  return claves;
}

/** Lado del canvas: con 48×48 sobra para contar colores y no cuesta nada. */
const LADO = 48;

/**
 * Lee los colores de una imagen: un archivo recién elegido (Blob) o la URL
 * del logo ya subido. La URL va con `crossOrigin="anonymous"`: el canvas sólo
 * deja leer píxeles de otro origen si el servidor manda
 * `Access-Control-Allow-Origin` (el API lo hace para los orígenes de la web en
 * CORS_ORIGINS). Si no se puede leer, devuelve [] sin romper nada.
 */
export async function leerColoresDeImagen(fuente: Blob | string, maximo = 3): Promise<string[]> {
  if (typeof document === "undefined") return [];
  const url = typeof fuente === "string" ? fuente : URL.createObjectURL(fuente);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      if (typeof fuente === "string") i.crossOrigin = "anonymous";
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("imagen"));
      i.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = LADO;
    canvas.height = LADO;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return [];
    ctx.drawImage(img, 0, 0, LADO, LADO);
    return coloresDominantes(ctx.getImageData(0, 0, LADO, LADO).data, maximo);
  } catch {
    // Sin CORS el canvas queda "manchado" y getImageData tira SecurityError.
    return [];
  } finally {
    if (typeof fuente !== "string") URL.revokeObjectURL(url);
  }
}
