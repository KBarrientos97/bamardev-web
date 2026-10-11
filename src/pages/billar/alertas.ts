import { fmtMinSeg } from "./calculo";
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
 * MAQUETA: en memoria, porque la demo arranca de cero en cada recarga. Con el
 * backend va a `localStorage` por sesión (§9) para no repetir al recargar.
 */
const disparados = new Set<string>();
const clave = (mesaId: number, sesionId: string, nivel: Nivel) => `${mesaId}:${sesionId}:${nivel}`;

export function yaAvisado(mesaId: number, sesionId: string, nivel: Nivel): boolean {
  return disparados.has(clave(mesaId, sesionId, nivel));
}

/** Marca el nivel y los de arriba: después de avisar 5 min no se avisa 10. */
export function marcarAvisado(mesaId: number, sesionId: string, nivel: Nivel, avisos: number[]) {
  for (const n of [...avisos, 0]) if (n >= nivel) disparados.add(clave(mesaId, sesionId, n));
}

/** Al extender, la sesión vuelve a avisar desde cero. */
export function olvidarAvisos(sesionId: string) {
  for (const k of [...disparados]) if (k.split(":")[1] === sesionId) disparados.delete(k);
}

/** Lo que ya pasó cuando la pantalla arranca no se avisa de golpe. */
export function marcarLoYaPasado(mesas: Mesa[], avisos: number[], segundos: (m: Mesa) => number) {
  for (const m of mesas) {
    const s = m.sesion;
    if (m.estado !== "abierta" || !s?.prepago) continue;
    const nivel = nivelAlcanzado(s.prepago.min * 60 - segundos(m), avisos);
    if (nivel !== null) marcarAvisado(m.id, s.id, nivel, avisos);
  }
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
