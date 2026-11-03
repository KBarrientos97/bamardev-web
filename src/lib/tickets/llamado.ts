import type { AjustesTicketsTv, TemaTv, TipoVoz, TonoTv } from "../../types/tickets";

/**
 * Cómo suena y cómo se ve el llamado de un número: lo comparten la TV de
 * tickets, la vista previa de Tickets y pedidos y el botón "Probar llamado",
 * para que lo que el encargado prueba sea exactamente lo que oye el local.
 *
 * Los tonos se arman con Web Audio (sin archivos que bajar) y la voz es la
 * del navegador (speechSynthesis): en un televisor sin voces en español el
 * tono suena igual.
 */

/**
 * "072": el número como se ve y se imprime. Con tres cifras (Kevin, 1-nov: con
 * cuatro sobraba un cero); pasado 999 sigue creciendo.
 */
export function numeroTicket(n: number): string {
  return String(n).padStart(3, "0");
}

/**
 * Lo que dice la voz: "Ticket 72. Su pedido está listo." El número va en
 * cifras y la voz lo dice entero ("setenta y dos"), sin los ceros de adelante.
 *
 * Hasta el 1-nov se decía dígito por dígito con los ceros ("cero, cero, siete,
 * dos") para que sonara como lo impreso; a Kevin le sonaba robótico, y el
 * número entero se entiende igual.
 */
export function textoVoz(numero: number, etiqueta: string, frase: string): string {
  const quien = etiqueta.trim() ? `${conMayuscula(etiqueta.trim().toLowerCase())} ` : "";
  const cola = frase.trim() ? ` ${frase.trim().replace(/[.!?¡¿]+$/u, "")}.` : "";
  return `${quien}${numero}.${cola}`;
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
  /** Cuánto suena al lado de la principal (los armónicos de una campana). 1 si falta. */
  vol?: number;
}

/**
 * Las notas de cada tono. Cortas y claras: tienen que oírse sobre la freidora.
 * La app de Android las arma igual (`SonidoTv.notasDe`).
 *
 * El "timbre" y el "turnero" son campanas: cada golpe es una nota con sus
 * armónicos, que se apagan antes que ella. Sin los armónicos, un seno solo
 * suena a pitido de electrodoméstico.
 */
const NOTAS: Record<TonoTv, Nota[]> = {
  // El "ding-dong" del banco: dos notas que bajan.
  banco: [
    { hz: 659.25, en: 0, dura: 0.9 },
    { hz: 523.25, en: 0.45, dura: 1.2 },
  ],
  // Un ding-dong de timbre, más grave y más largo que el del banco.
  timbre: [
    { hz: 783.99, en: 0, dura: 1.4 },
    { hz: 1567.98, en: 0, dura: 0.6, vol: 0.3 },
    { hz: 2351.97, en: 0, dura: 0.35, vol: 0.12 },
    { hz: 622.25, en: 0.6, dura: 1.9 },
    { hz: 1244.51, en: 0.6, dura: 0.8, vol: 0.3 },
    { hz: 1866.76, en: 0.6, dura: 0.45, vol: 0.12 },
  ],
  // El aviso de turno de un banco: un dong-ding que sube (el del banco baja),
  // con timbre de vibráfono: sus armónicos suenan a 4 y a 10 veces la nota y se
  // apagan enseguida. Reemplazó el 1-nov al "mostrador" (una campanita tocada
  // dos veces): a Kevin ese "ding ding" no le gustó.
  turnero: [
    { hz: 523.25, en: 0, dura: 1.3 },
    { hz: 2093, en: 0, dura: 0.35, vol: 0.18 },
    { hz: 5232.5, en: 0, dura: 0.12, vol: 0.05 },
    { hz: 880, en: 0.4, dura: 1.9 },
    { hz: 3520, en: 0.4, dura: 0.45, vol: 0.18 },
    { hz: 8800, en: 0.4, dura: 0.15, vol: 0.05 },
  ],
  ascensor: [
    { hz: 880, en: 0, dura: 1.4, forma: "triangle" },
    { hz: 1320, en: 0, dura: 1.0 },
  ],
};

/** Suena el tono. Devuelve cuántos segundos dura (0 si el audio está bloqueado). */
export function sonarTono(tono: TonoTv, volumen: number): number {
  const ctx = audio();
  if (!ctx || ctx.state !== "running") return 0;
  const notas = NOTAS[tono] ?? NOTAS.banco;
  // 0,6 y no 1: las campanas suman sus armónicos y la cola del golpe anterior.
  const tope = Math.max(0, Math.min(1, volumen / 100)) * 0.6;
  const inicio = ctx.currentTime + 0.03;
  let fin = 0;
  for (const n of notas) {
    const osc = ctx.createOscillator();
    const vol = ctx.createGain();
    const pico = tope * (n.vol ?? 1);
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

/** Lo que importa de una voz del navegador (así se prueba sin `speechSynthesis`). */
export interface VozDisponible {
  name: string;
  lang: string;
  /** false = la arma un servidor: las de Edge y Chrome en línea, mucho menos robóticas. */
  localService?: boolean;
}

// El navegador no dice si una voz es de mujer o de hombre: se sabe por el
// nombre, en este orden.
//
// 1) Lo que el nombre dice de sí mismo: "Female Spanish", o el "#female_1" /
//    "#male_3" que el motor viejo de Google ponía detrás del código. Sin letra
//    pegada a los lados: "Malena" no es "male".
const MARCA = /(?:^|[^a-záéíóúñ])(female|male|mujer|hombre|femenin[ao]|masculin[ao])(?:[^a-záéíóúñ]|$)/i;
// 2) Los códigos del motor de Google en Android, según la lista de sus voces
//    (no por intuición: hasta el 1-nov "es-us-x-esf" figuraba como de mujer, es
//    de hombre, y con "Mujer" el teléfono de Kevin hablaba con voz de hombre).
const CODIGOS_MUJER = /es-us-x-(esc|sfb)|es-es-x-ee[ace]|es-(us|es)-language/i;
const CODIGOS_HOMBRE = /es-us-x-es[df]|es-es-x-ee[df]/i;
// 3) Los nombres de persona: Microsoft (Sabina, Raúl, las "Natural" de Edge
//    como Sofía y Marcelo de Bolivia), Apple (Paulina, Mónica, Jorge, Diego) y
//    la "Google español" (mujer).
const NOMBRES_MUJER =
  /\b(sabina|helena|laura|paulina|m[oó]nica|marisol|ang[eé]lica|soledad|esperanza|paloma|elvira|dalia|elena|salom[eé]|camila|valentina|ximena|sof[ií]a|lupe|pilar|conchita|pen[eé]lope|luc[ií]a|isabela|abril|irene|estrella|triana|vera|karla|catalina|lorena|yolanda|beatriz|marta|carmen|renata|francisca|andrea|tatiana|teresa|mar[ií]a|ana|carla|candela|carlota|larissa|nuria|marina)\b|google espa[nñ]ol/i;
const NOMBRES_HOMBRE =
  /\b(ra[uú]l|pablo|jorge|diego|juan|carlos|enrique|marcelo|[aá]lvaro|gonzalo|tom[aá]s|andr[eé]s|gerardo|alonso|emilio|lorenzo|mateo|luciano|ricardo|manuel|rodrigo|sergio|miguel|arnau|dar[ií]o|el[ií]as|sa[uú]l|alejandro|federico|mario|roberto|v[ií]ctor|luis|rafael|sebasti[aá]n|javier|fernando|antonio|jos[eé]|alex|cecilio|liberto|pelayo|yago)\b/i;
/** Las voces de servidor o mejoradas: suenan como una persona y no como un contestador. */
const NATURAL = /natural|neural|online|enhanced|premium|mejorad|google/i;

/** De quién es la voz, por su nombre; null si el nombre no lo dice. */
export function tipoDeVoz(nombre: string): TipoVoz | null {
  const marca = MARCA.exec(nombre)?.[1].toLowerCase();
  if (marca) return /^(female|mujer|femenin)/.test(marca) ? "mujer" : "hombre";
  if (CODIGOS_MUJER.test(nombre)) return "mujer";
  if (CODIGOS_HOMBRE.test(nombre)) return "hombre";
  if (NOMBRES_MUJER.test(nombre)) return "mujer";
  if (NOMBRES_HOMBRE.test(nombre)) return "hombre";
  return null;
}

/** Español de este lado del mar: el acento que el cliente entiende sin esfuerzo. */
function latina(lang: string): boolean {
  const l = lang.replace("_", "-").toLowerCase();
  return /^es-[a-z0-9]+$/.test(l) && l !== "es-es";
}

/** Cuanto más cerca de Bolivia, mejor se le entiende al cliente. */
function cercania(lang: string): number {
  const l = lang.replace("_", "-").toLowerCase();
  if (l === "es-bo") return 6;
  if (["es-419", "es-mx", "es-us"].includes(l)) return 5;
  if (["es-ar", "es-co", "es-pe", "es-cl", "es-ec", "es-py", "es-uy", "es-ve"].includes(l)) return 4;
  if (l === "es-es") return 3;
  return 2;
}

/**
 * La voz para el llamado, entre las del navegador: en español, del tipo que
 * eligió el dueño, latina, la más natural y la más cercana a Bolivia, en ese
 * orden.
 *
 * Latina antes que natural (Kevin, 1-nov: "una voz neutral latina"): la
 * "Google español" de Chrome, de España, le ganaba a la Sabina de México por
 * ser de servidor. En Edge están las dos cosas juntas (Sofía y Marcelo de
 * Bolivia, Dalia y Jorge de México): son las que suenan como un anuncio.
 *
 * `tono` acerca la voz al tipo pedido cuando el navegador no tiene ninguna de
 * ese tipo (un televisor suele traer una sola voz, casi siempre de mujer): se
 * baja para un hombre y se sube para una mujer. Con la voz justa queda en 1,
 * porque correrla la vuelve robótica.
 */
export function elegirVoz<V extends VozDisponible>(voces: V[], tipo: TipoVoz): { voz: V | null; tono: number } {
  const enEspanol = voces.filter((v) => v.lang.replace("_", "-").toLowerCase().startsWith("es"));
  const puntaje = (v: V) => {
    const deQuien = tipoDeVoz(v.name);
    const parecido = deQuien === tipo ? 2 : deQuien === null ? 1 : 0;
    const natural = NATURAL.test(v.name) || v.localService === false ? 1 : 0;
    return parecido * 1000 + (latina(v.lang) ? 100 : 0) + natural * 10 + cercania(v.lang);
  };
  const voz = [...enEspanol].sort((a, b) => puntaje(b) - puntaje(a))[0] ?? null;
  return { voz, tono: tonoPara(tipo, voz ? tipoDeVoz(voz.name) : null) };
}

function tonoPara(tipo: TipoVoz, deLaVoz: TipoVoz | null): number {
  if (deLaVoz === tipo) return 1;
  // Sin saber de quién es, se supone de mujer, que es la que traen casi todos.
  if (tipo === "mujer") return deLaVoz === "hombre" ? 1.3 : 1;
  return deLaVoz === "mujer" ? 0.75 : 0.8;
}

/**
 * La voz de este equipo para el tipo elegido: la que quedó guardada si sigue
 * estando, y si no la mejor de `elegirVoz` (que pasa a ser la guardada).
 *
 * Kevin (3-nov): con "Mujer" elegida, la TV hablaba a veces con una voz y a
 * veces con otra, y en otra compu la primera vez fue de hombre. Se elegía de
 * nuevo en cada llamado sobre una lista que el navegador va llenando de a poco
 * (vacía al principio, con las voces de servidor después). Fija, suena siempre
 * la misma, también después de que la TV se recarga sola con una versión nueva.
 *
 * Sólo se cambia la guardada si era de un recurso: del otro tipo (la única que
 * había, con el tono corrido) y ahora hay una del tipo pedido.
 */
export function vozFija<V extends VozDisponible>(
  voces: V[],
  tipo: TipoVoz,
  guardada: string | null,
): { voz: V | null; tono: number } {
  const mejor = elegirVoz(voces, tipo);
  const fija = guardada ? voces.find((v) => v.name === guardada) : undefined;
  if (!fija) return mejor;
  const deLaFija = tipoDeVoz(fija.name);
  const hayDelTipo = mejor.voz != null && tipoDeVoz(mejor.voz.name) === tipo;
  if (deLaFija !== tipo && deLaFija !== null && hayDelTipo) return mejor;
  return { voz: fija, tono: tonoPara(tipo, deLaFija) };
}

const CLAVE_VOZ = "bamardev.tv.voz.";

function vozGuardada(tipo: TipoVoz): string | null {
  try {
    return window.localStorage.getItem(CLAVE_VOZ + tipo);
  } catch {
    return null;
  }
}

function guardarVoz(tipo: TipoVoz, nombre: string) {
  try {
    window.localStorage.setItem(CLAVE_VOZ + tipo, nombre);
  } catch {
    // Sin almacenamiento (ventana privada): se elige igual, sólo que no se recuerda.
  }
}

/** Medio segundo sin voces nuevas: el navegador terminó de cargarlas. */
const VOCES_QUIETAS_MS = 500;
/** Una TV sin voces no avisa nunca: pasado esto, se habla con lo que haya. */
const VOCES_TOPE_MS = 3000;
let vocesListas: Promise<void> | null = null;

/**
 * Espera a que el navegador termine de cargar sus voces. Chrome y Edge las
 * entregan de a poco: al abrir, `getVoices()` viene vacío, y llegan en una o
 * dos tandas (Edge suma las "Natural" en la segunda). Hablar antes elegía de
 * una lista a medias: o ninguna voz (y el navegador ponía la suya, a veces de
 * hombre) o una que cambiaba en cuanto llegaba el resto.
 *
 * La TV la llama al abrir, para que el primer llamado ya las tenga.
 */
export function prepararVoces(): Promise<void> {
  if (vocesListas) return vocesListas;
  vocesListas = new Promise<void>((listo) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return listo();
    const s = window.speechSynthesis;
    let quietas: ReturnType<typeof setTimeout> | undefined;
    let tope: ReturnType<typeof setTimeout> | undefined;
    const terminar = () => {
      s.removeEventListener?.("voiceschanged", alCambiar);
      clearTimeout(quietas);
      clearTimeout(tope);
      listo();
    };
    function alCambiar() {
      clearTimeout(quietas);
      quietas = setTimeout(terminar, VOCES_QUIETAS_MS);
    }
    s.addEventListener?.("voiceschanged", alCambiar);
    tope = setTimeout(terminar, VOCES_TOPE_MS);
    // Ya hay algunas: igual se espera un poco, por si falta una tanda.
    if (s.getVoices().length) alCambiar();
  });
  return vocesListas;
}

/** Para los tests: volver a esperar las voces. */
export function olvidarVocesCargadas() {
  vocesListas = null;
}

/** Dice el texto y avisa cuando termina (o a los 8 s, si el navegador nunca avisa). */
async function hablar(texto: string, volumen: number, tipo: TipoVoz): Promise<void> {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  await prepararVoces();
  const { voz, tono } = vozFija(window.speechSynthesis.getVoices(), tipo, vozGuardada(tipo));
  if (voz) guardarVoz(tipo, voz.name);
  return new Promise((listo) => {
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = voz?.lang ?? "es-BO";
    if (voz) u.voice = voz;
    u.pitch = tono;
    // A velocidad normal: más lento, con el número entero, sonaba arrastrado.
    u.rate = 1;
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
        if (a.voz) await hablar(textoVoz(numero, a.textos.etiqueta, a.textos.frase), a.volumen, a.tipoVoz ?? "mujer");
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
