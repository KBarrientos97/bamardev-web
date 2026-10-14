import { fmtMinSeg, segundosJugados } from "./calculo";
import type { Mesa } from "./tipos";

/**
 * Los avisos del tiempo fijo (BILLAR_MODULO_SPEC §6): zumbido con Web Audio y
 * voz con speechSynthesis, una sola vez por umbral y sesión. Se disparan en el
 * navegador del cajero, no en el servidor.
 */

/** 0 = tiempo cumplido. */
export type Nivel = number;

/**
 * El umbral más bajo que ya se cruzó, o null si todavía no se cruzó ninguno.
 * Si se saltaron varios (al recargar, al extender) se avisa sólo el más bajo.
 */
export function nivelAlcanzado(restante: number, avisos: number[]): Nivel | null {
  let nivel: Nivel | null = null;
  for (const n of [...avisos, 0]) {
    if (restante <= n * 60 && (nivel === null || n < nivel)) nivel = n;
  }
  return nivel;
}

// ── Una vez por umbral y sesión ─────────────────────────────────────────────

/**
 * Lo ya avisado, guardado en el equipo (§9) por sesión y no por mesa: al
 * recargar no se repite, y al pasar la cuenta a otra mesa tampoco (con la
 * mesa en la clave, el cambio de mesa volvía a avisar lo mismo).
 *
 * También va el tramo contratado (los minutos de tiempo fijo): `olvidarAvisos`
 * sólo corre en el equipo que extiende, y la PC de la barra, que ya había
 * avisado 10 y 5 min, se quedaba callada en la hora nueva que se extendió
 * desde el celular (QA del 12-oct).
 */
const AVISADOS_KEY = "bamardev.billar.avisados";
const clave = (sesionId: string, nivel: Nivel, tramo: number) => `${sesionId}:${nivel}:${tramo}`;

function leer(): Set<string> | null {
  try {
    const crudo = localStorage.getItem(AVISADOS_KEY);
    return crudo === null ? null : new Set(JSON.parse(crudo) as string[]);
  } catch {
    return null;
  }
}

const disparados = leer() ?? new Set<string>();
/** Primera vez en este navegador: lo que ya pasó no se avisa de golpe (ver `prepararAvisos`). */
let estrenando = leer() === null;

function guardar() {
  try {
    localStorage.setItem(AVISADOS_KEY, JSON.stringify([...disparados]));
  } catch {
    // Sin almacenamiento vale lo de memoria hasta recargar.
  }
}

export function yaAvisado(sesionId: string, nivel: Nivel, tramo: number): boolean {
  return disparados.has(clave(sesionId, nivel, tramo));
}

/** Marca el nivel y los de arriba: después de avisar 5 min no se avisa 10. */
export function marcarAvisado(sesionId: string, nivel: Nivel, avisos: number[], tramo: number) {
  for (const n of [...avisos, 0]) if (n >= nivel) disparados.add(clave(sesionId, n, tramo));
  guardar();
}

/**
 * Al cambiar de sucursal (el dueño, en el tablero): el próximo tablero se toma
 * como el de un equipo nuevo. El otro local puede tener cinco mesas vencidas
 * que este equipo nunca avisó, y sonaban todas juntas al elegirlo; y al volver
 * al primero, lo suyo ya se había olvidado (`prepararAvisos` borra lo que no
 * está en el tablero) y sonaba de nuevo.
 */
export function reestrenarAvisos() {
  estrenando = true;
}

/** Al extender, la sesión vuelve a avisar desde cero. */
export function olvidarAvisos(sesionId: string) {
  for (const k of [...disparados]) if (k.split(":")[0] === sesionId) disparados.delete(k);
  guardar();
}

/**
 * Con el primer tablero: se olvidan las sesiones que ya no están en juego (si
 * no, la lista crece para siempre) y, si este navegador nunca avisó nada, lo
 * que ya pasó se da por avisado. Un equipo nuevo que entra al turno con cinco
 * mesas vencidas no tiene que sonar cinco veces seguidas; uno que ya venía
 * avisando sí avisa lo que se cruzó mientras estuvo cerrado.
 */
export function prepararAvisos(mesas: Mesa[], avisos: number[], ahora: number) {
  const vivas = new Set(mesas.flatMap((m) => (m.estado === "abierta" && m.sesion ? [m.sesion.id] : [])));
  for (const k of [...disparados]) if (!vivas.has(k.split(":")[0])) disparados.delete(k);
  if (estrenando) {
    for (const m of mesas) {
      const s = m.sesion;
      if (m.estado !== "abierta" || !s?.prepago) continue;
      const nivel = nivelAlcanzado(s.prepago.min * 60 - segundosJugados(s, ahora), avisos);
      if (nivel !== null) for (const n of [...avisos, 0]) if (n >= nivel) disparados.add(clave(s.id, n, s.prepago.min));
    }
    estrenando = false;
  }
  guardar();
}

// ── Los textos ──────────────────────────────────────────────────────────────

export function textosAviso(mesaId: number, restante: number, horasFijo: number, tarifa: string) {
  if (restante <= 0) {
    return {
      titulo: `Mesa ${mesaId} · tiempo cumplido`,
      texto: `Sigue abierta; el excedente se cobra a ${tarifa}`,
      voz: `Mesa ${mesaId}. Tiempo cumplido.`,
    };
  }
  const fijo = `Tiempo fijo ${horasFijo} h · quedan ${fmtMinSeg(restante)}`;
  if (restante <= 60) {
    return {
      titulo: `Mesa ${mesaId} · le queda menos de 1 min`,
      texto: fijo,
      voz: `Mesa ${mesaId}. Le queda menos de un minuto.`,
    };
  }
  const min = Math.ceil(restante / 60);
  return {
    titulo: `Mesa ${mesaId} · le quedan ${min} min`,
    texto: fijo,
    voz: `Mesa ${mesaId}. Le quedan ${min} minutos.`,
  };
}

// ── Zumbido (Web Audio) ─────────────────────────────────────────────────────

interface Patron {
  pulsos: number;
  on: number;
  off: number;
  hz: number;
}

/** Más pulsos y más rápido a medida que se acerca el fin (§6). */
function patronDe(nivel: Nivel): Patron {
  if (nivel <= 0) return { pulsos: 3, on: 0.55, off: 0.2, hz: 160 };
  if (nivel <= 1) return { pulsos: 6, on: 0.14, off: 0.08, hz: 320 };
  if (nivel <= 5) return { pulsos: 3, on: 0.24, off: 0.14, hz: 260 };
  return { pulsos: 2, on: 0.28, off: 0.18, hz: 220 };
}

let contexto: AudioContext | null = null;

function audio(): AudioContext | null {
  if (contexto) return contexto;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
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
  return ctx.state === "running";
}

export function audioBloqueado(): boolean {
  return !contexto || contexto.state !== "running";
}

/** Suena el zumbido del nivel. Devuelve cuántos segundos dura (0 si no sonó). */
export function zumbido(nivel: Nivel): number {
  const ctx = audio();
  if (!ctx || ctx.state !== "running") return 0;
  const p = patronDe(nivel);
  const filtro = ctx.createBiquadFilter();
  filtro.type = "lowpass";
  filtro.frequency.value = 900;
  filtro.connect(ctx.destination);
  let t = ctx.currentTime + 0.02;
  for (let i = 0; i < p.pulsos; i++) {
    const osc = ctx.createOscillator();
    const vol = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = p.hz;
    vol.gain.setValueAtTime(0.0001, t);
    vol.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
    vol.gain.setValueAtTime(0.35, t + p.on - 0.03);
    vol.gain.exponentialRampToValueAtTime(0.0001, t + p.on);
    osc.connect(vol).connect(filtro);
    osc.start(t);
    osc.stop(t + p.on + 0.01);
    t += p.on + p.off;
  }
  return p.pulsos * (p.on + p.off);
}

// ── Voz (speechSynthesis) ───────────────────────────────────────────────────

const IDIOMAS = ["es-BO", "es-419", "es-MX", "es-US", "es-AR", "es"];

export function hablar(texto: string, demoraSeg = 0) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const decir = () => {
    const voces = window.speechSynthesis.getVoices();
    const voz =
      IDIOMAS.map((l) => voces.find((v) => v.lang === l || v.lang.replace("_", "-") === l)).find(Boolean) ??
      voces.find((v) => v.lang.startsWith("es"));
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = voz?.lang ?? "es-BO";
    if (voz) u.voice = voz;
    u.rate = 0.95;
    window.speechSynthesis.speak(u);
  };
  if (demoraSeg > 0) setTimeout(decir, demoraSeg * 1000);
  else decir();
}
