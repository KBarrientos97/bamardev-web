import type { AjustesTicketsTv, TemaTv, TonoTv } from "../../types/tickets";

/**
 * Cómo suena y cómo se ve el llamado de un número: lo comparten la TV de
 * tickets, la vista previa de Tickets y pedidos y el botón "Probar llamado",
 * para que lo que el encargado prueba sea exactamente lo que oye el local.
 *
 * Los tonos se arman con Web Audio (sin archivos que bajar) y la voz es la
 * del navegador (speechSynthesis): en un televisor sin voces en español el
 * tono suena igual.
 */

/** "0072": el número como se canta y se imprime. Pasado 9999 sigue creciendo. */
export function numeroTicket(n: number): string {
  return String(n).padStart(4, "0");
}

const DIGITOS = ["cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve"];

/**
 * Lo que dice la voz: "Ticket, cero, cero, siete, dos. Su pedido está listo".
 * Dígito por dígito y con los ceros, como se lee en la pantalla: "setenta y
 * dos" no se parece a lo que el cliente tiene impreso en la mano.
 */
export function textoVoz(numero: number, etiqueta: string, frase: string): string {
  const cifras = numeroTicket(numero)
    .split("")
    .map((d) => DIGITOS[Number(d)])
    .join(", ");
  const quien = etiqueta.trim() ? `${conMayuscula(etiqueta.trim().toLowerCase())}, ` : "";
  const cola = frase.trim() ? ` ${frase.trim().replace(/[.!?¡¿]+$/u, "")}.` : "";
  return `${quien}${cifras}.${cola}`;
}

function conMayuscula(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Tonos ───────────────────────────────────────────────────────────────────

let contexto: AudioContext | null = null;

function audio(): AudioContext | null {
  if (contexto) return contexto;
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    contexto = new Ctor();
  } catch {
    return null;
  }
  return contexto;
}

/**
 * El navegador no deja sonar nada hasta el primer toque en la página: se
 * desbloquea ahí. Devuelve false si sigue bloqueado.
 */
export async function desbloquearAudio(): Promise<boolean> {
  const ctx = audio();
  if (!ctx) return false;
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      return false;
    }
  }
  // speechSynthesis también pide un gesto en algunos navegadores: un
  // enunciado vacío dentro del toque lo deja habilitado para después.
  try {
    window.speechSynthesis?.speak(new SpeechSynthesisUtterance(""));
  } catch {
    // Sin voz: el tono sigue andando.
  }
  return ctx.state === "running";
}

/**
 * Si el navegador ya deja sonar sin que nadie toque —la app instalada, o
 * Chrome abierto con `--autoplay-policy=no-user-gesture-required` en la PC de
 * la TV—, la TV no pide el toque. Sin permiso, `resume()` queda esperando un
 * gesto para siempre: se mira el estado al rato, sin esperar la promesa.
 */
export async function audioYaPermitido(): Promise<boolean> {
  const ctx = audio();
  if (!ctx) return false;
  if (ctx.state === "running") return true;
  ctx.resume().catch(() => {});
  await new Promise((listo) => setTimeout(listo, 400));
  return (ctx.state as string) === "running";
}

export function audioBloqueado(): boolean {
  return !contexto || contexto.state !== "running";
}

interface Nota {
  hz: number;
  /** Cuándo empieza, en segundos desde el inicio del tono. */
  en: number;
  dura: number;
  forma?: OscillatorType;
}

/** Las notas de cada tono. Cortas y claras: tienen que oírse sobre la freidora. */
const NOTAS: Record<TonoTv, Nota[]> = {
  // El "ding-dong" del banco: dos notas que bajan.
  banco: [
    { hz: 659.25, en: 0, dura: 0.9 },
    { hz: 523.25, en: 0.45, dura: 1.2 },
  ],
  campanilla: [
    { hz: 1046.5, en: 0, dura: 0.5 },
    { hz: 1318.5, en: 0.16, dura: 0.5 },
    { hz: 1568, en: 0.32, dura: 0.8 },
  ],
  ascensor: [
    { hz: 880, en: 0, dura: 1.4, forma: "triangle" },
    { hz: 1320, en: 0, dura: 1.0 },
  ],
  bip: [
    { hz: 1000, en: 0, dura: 0.14, forma: "square" },
    { hz: 1000, en: 0.24, dura: 0.14, forma: "square" },
  ],
};

/** Suena el tono. Devuelve cuántos segundos dura (0 si el audio está bloqueado). */
export function sonarTono(tono: TonoTv, volumen: number): number {
  const ctx = audio();
  if (!ctx || ctx.state !== "running") return 0;
  const notas = NOTAS[tono] ?? NOTAS.banco;
  // El cuadrado suena mucho más fuerte que el seno a la misma ganancia.
  const tope = Math.max(0, Math.min(1, volumen / 100)) * 0.6;
  const inicio = ctx.currentTime + 0.03;
  let fin = 0;
  for (const n of notas) {
    const osc = ctx.createOscillator();
    const vol = ctx.createGain();
    const pico = n.forma === "square" ? tope * 0.35 : tope;
    osc.type = n.forma ?? "sine";
    osc.frequency.value = n.hz;
    const t = inicio + n.en;
    vol.gain.setValueAtTime(0.0001, t);
    vol.gain.exponentialRampToValueAtTime(Math.max(pico, 0.0002), t + 0.02);
    vol.gain.exponentialRampToValueAtTime(0.0001, t + n.dura);
    osc.connect(vol).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + n.dura + 0.05);
    fin = Math.max(fin, n.en + n.dura);
  }
  return fin;
}

// ── Voz ─────────────────────────────────────────────────────────────────────

const IDIOMAS = ["es-BO", "es-419", "es-MX", "es-US", "es-AR", "es"];

/** Dice el texto y avisa cuando termina (o a los 8 s, si el navegador nunca avisa). */
function hablar(texto: string, volumen: number): Promise<void> {
  return new Promise((listo) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return listo();
    const voces = window.speechSynthesis.getVoices();
    const voz =
      IDIOMAS.map((l) => voces.find((v) => v.lang === l || v.lang.replace("_", "-") === l)).find(Boolean) ??
      voces.find((v) => v.lang.startsWith("es"));
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = voz?.lang ?? "es-BO";
    if (voz) u.voice = voz;
    u.rate = 0.92;
    u.volume = Math.max(0, Math.min(1, volumen / 100));
    const corte = setTimeout(listo, 8000);
    u.onend = u.onerror = () => {
      clearTimeout(corte);
      listo();
    };
    window.speechSynthesis.speak(u);
  });
}

const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

let cola: Promise<void> = Promise.resolve();
/** Los números que esperan su turno en la cola (todavía no empezaron a sonar). */
const enEspera = new Set<number>();
/** Pasado este rato esperando, se dice una sola vez: la cola se pone al día. */
const ATRASO_MS = 15_000;

/**
 * Anuncia un número: tono, voz, y otra vez si se pidió repetir. Dos llamados
 * seguidos no se pisan: el segundo espera a que termine el primero (una TV
 * que dice dos números a la vez no se entiende).
 *
 * En hora pico la cola se atrasaba (cada llamado con repetir dura unos 12 s):
 * un número que ya espera en la cola no se encola otra vez, y el que esperó
 * de más se dice sin repetir. Y un llamado que falla no deja muda a la TV:
 * sin el `catch`, la cola quedaba rechazada y no volvía a sonar hasta recargar.
 */
export function anunciar(numero: number, a: AjustesTicketsTv): Promise<void> {
  if (enEspera.has(numero)) return cola;
  enEspera.add(numero);
  const encolado = Date.now();
  cola = cola.then(async () => {
    enEspera.delete(numero);
    const veces = Date.now() - encolado > ATRASO_MS ? 1 : Math.max(1, a.repetir);
    try {
      for (let i = 0; i < veces; i++) {
        const dura = sonarTono(a.tono, a.volumen);
        await esperar(dura * 1000 + 120);
        if (a.voz) await hablar(textoVoz(numero, a.textos.etiqueta, a.textos.frase), a.volumen);
        if (i < veces - 1) await esperar(500);
      }
    } catch {
      // El que sigue suena igual.
    }
  });
  return cola;
}

// ── Colores ─────────────────────────────────────────────────────────────────

export interface PaletaTv {
  fondo: string;
  /** El panel grande de los listos, sobre el fondo. */
  panel: string;
  /** La columna de los que se preparan, un poco más oscura. */
  panelPreparacion: string;
  /** Cada número de esa columna, y el hueco vacío de los listos. */
  fila: string;
  acento: string;
  texto: string;
  /** El texto que va encima del acento (el número llamado). */
  sobreAcento: string;
}

const TEMAS: Record<Exclude<TemaTv, "personalizado">, { fondo: string; acento: string; texto: string }> = {
  rojo: { fondo: "#A30000", acento: "#FFC800", texto: "#FFFFFF" },
  verde: { fondo: "#0B4D2C", acento: "#FFC800", texto: "#FFFFFF" },
  brasa: { fondo: "#1A1210", acento: "#FF8A00", texto: "#FFF4E6" },
  crema: { fondo: "#FFF4E0", acento: "#C62828", texto: "#2B1B0E" },
};

/** Los tres colores de cada tema, para las muestras del selector. */
export function coloresDeTema(tema: TemaTv, propios: AjustesTicketsTv["colores"]) {
  return tema === "personalizado" ? propios : TEMAS[tema];
}

/** ¿Es un color claro? Decide si encima va texto negro o blanco. */
export function esClaro(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45;
}

export function paletaTv(a: Pick<AjustesTicketsTv, "tema" | "colores">): PaletaTv {
  const c = coloresDeTema(a.tema, a.colores);
  const claro = esClaro(c.fondo);
  return {
    fondo: c.fondo,
    // Sobre un fondo oscuro los paneles aclaran; sobre uno claro, oscurecen.
    panel: claro ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.09)",
    panelPreparacion: claro ? "rgba(0,0,0,0.10)" : "rgba(0,0,0,0.22)",
    fila: claro ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.09)",
    acento: c.acento,
    texto: c.texto,
    sobreAcento: esClaro(c.acento) ? "#141414" : "#FFFFFF",
  };
}

/** Minutos enteros que lleva esperando, contados con la hora del servidor. */
export function minutosDesde(desde: number, ahora: number): number {
  return Math.max(0, Math.floor((ahora - desde) / 60_000));
}
