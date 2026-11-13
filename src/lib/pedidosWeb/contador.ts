import { useEffect, useRef, useSyncExternalStore } from "react";
import { apiPedidosWeb } from "./apiPrivada";
import type { ContadorPedidos } from "./tipos";

/**
 * El contador de pedidos nuevos (pedidos web, 13-nov): lo consultan el menú,
 * el POS y el aviso de cualquier pantalla, así que hay UN solo reloj por
 * pestaña, cada 10 s (la web) y sólo con la pestaña visible. Liviano a
 * propósito: `GET /pedidos-web/contador`.
 */

export const CADA_MS = 10_000;
/** La bandeja avisa con este evento al aceptar o rechazar, así el número baja en el acto. */
export const EVENTO_PEDIDOS_WEB = "pedidos-web-cambiaron";

const VACIO: ContadorPedidos = { nuevos: 0, masViejoEn: null };

let valor: ContadorPedidos = VACIO;
let reloj: ReturnType<typeof setInterval> | null = null;
const oyentes = new Set<() => void>();

/** Pide el contador y avisa sólo si cambió (el snapshot tiene que ser estable). */
export async function consultarContador(): Promise<void> {
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
  try {
    const c = await apiPedidosWeb.contador();
    if (c.nuevos === valor.nuevos && c.masViejoEn === valor.masViejoEn) return;
    valor = { nuevos: c.nuevos, masViejoEn: c.masViejoEn ?? null };
    for (const f of oyentes) f();
  } catch {
    // Sin red o sin permiso: el menú sigue con lo último que supo, nunca con un 0 inventado.
  }
}

function suscribir(avisar: () => void) {
  oyentes.add(avisar);
  if (oyentes.size === 1) {
    void consultarContador();
    reloj = setInterval(() => void consultarContador(), CADA_MS);
    window.addEventListener(EVENTO_PEDIDOS_WEB, alEvento);
    document.addEventListener("visibilitychange", alEvento);
  }
  return () => {
    oyentes.delete(avisar);
    if (oyentes.size === 0) {
      if (reloj) clearInterval(reloj);
      reloj = null;
      window.removeEventListener(EVENTO_PEDIDOS_WEB, alEvento);
      document.removeEventListener("visibilitychange", alEvento);
    }
  };
}

function alEvento() {
  void consultarContador();
}

const sinSuscripcion = () => () => {};

/** Vuelve al estado de recién abierto: al cerrar sesión y en los tests. */
export function reiniciarContador() {
  if (valor === VACIO) return;
  valor = VACIO;
  for (const f of oyentes) f();
}

/** Cuántos pedidos esperan respuesta. 0 (y sin consultar nada) si la sección no se ve. */
export function usePedidosNuevos(activo: boolean): ContadorPedidos {
  return useSyncExternalStore(activo ? suscribir : sinSuscripcion, () => (activo ? valor : VACIO));
}

// ── El sonido ───────────────────────────────────────────────────────────

let contexto: AudioContext | null = null;
let desbloqueado = false;
const oyentesSonido = new Set<() => void>();

/** Prende o apaga el «ya puede sonar» y avisa sólo si cambió. */
function marcar(ok: boolean) {
  if (desbloqueado === ok) return;
  desbloqueado = ok;
  for (const f of oyentesSonido) f();
}

/**
 * Safari (iPad, iPhone) y las tablets que se bloquean dejan el contexto en
 * `suspended` o `interrupted` al ocultar la página: sólo un toque lo vuelve a
 * levantar. Un contexto sin `state` (los navegadores viejos, los tests) cuenta
 * como andando.
 */
function parado(ctx: AudioContext): boolean {
  const estado = ctx.state as string | undefined;
  return estado === "suspended" || estado === "interrupted";
}

function alCambiarEstado() {
  if (contexto) marcar(!parado(contexto));
}

/** Crea el contexto la primera vez y, si quedó dormido, lo despierta. Sólo con un toque. */
function desbloquear() {
  try {
    if (!contexto) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      contexto = new Ctx();
      contexto.onstatechange = alCambiarEstado;
    }
    const ctx = contexto;
    if (!parado(ctx)) {
      marcar(true);
      return;
    }
    // Despierta con el gesto; cuando el navegador lo confirma (`statechange`)
    // vuelve a marcarse como listo.
    void ctx.resume?.().then(
      () => marcar(!parado(ctx)),
      () => {},
    );
  } catch {
    // Sin Web Audio: el aviso queda visual.
  }
}

/**
 * El navegador sólo deja sonar después de un toque, y en iOS el contexto se
 * vuelve a dormir al bloquear la pantalla (PW-05): se escucha CUALQUIER toque
 * de la sesión para despertarlo, no sólo el primero.
 */
function esperarToques() {
  if (typeof window === "undefined") return;
  for (const ev of ["pointerdown", "keydown", "touchstart"] as const) {
    window.addEventListener(ev, desbloquear, { passive: true });
  }
}

/** ¿Ya puede sonar? Si no, el aviso muestra «Activar sonido». */
export function sonidoListo(): boolean {
  return desbloqueado;
}

/** El botón «Activar sonido»: un toque de verdad lo habilita. */
export function activarSonido() {
  desbloquear();
}

/** Dos tonos marcados, fuertes pero cortos (no es una alarma). */
export function sonarPedido(): boolean {
  if (!desbloqueado || !contexto) return false;
  try {
    const ctx = contexto;
    // El contexto se durmió desde el último toque: no suena, y se vuelve a
    // ofrecer «Activar sonido» en vez de decir que sonó (PW-05). Se intenta
    // despertarlo igual: si el navegador lo permite, vuelve solo.
    if (parado(ctx)) {
      marcar(false);
      void ctx.resume?.().catch?.(() => {});
      return false;
    }
    const t0 = ctx.currentTime;
    [880, 1175, 880, 1175].forEach((hz, i) => {
      const osc = ctx.createOscillator();
      const gan = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = hz;
      const ini = t0 + i * 0.22;
      gan.gain.setValueAtTime(0.0001, ini);
      gan.gain.exponentialRampToValueAtTime(0.25, ini + 0.02);
      gan.gain.exponentialRampToValueAtTime(0.0001, ini + 0.2);
      osc.connect(gan).connect(ctx.destination);
      osc.start(ini);
      osc.stop(ini + 0.21);
    });
    return true;
  } catch {
    return false;
  }
}

/** Para los tests. */
export function reiniciarSonido() {
  if (contexto) contexto.onstatechange = null;
  contexto = null;
  desbloqueado = false;
  oyentesSonido.clear();
}

/** Re-render cuando el sonido se habilita (para ocultar «Activar sonido»). */
export function useSonidoListo(): boolean {
  return useSyncExternalStore(
    (f) => {
      oyentesSonido.add(f);
      return () => oyentesSonido.delete(f);
    },
    () => desbloqueado,
  );
}

if (typeof window !== "undefined") esperarToques();

// ── El aviso global ─────────────────────────────────────────────────────

/** Cada cuánto vuelve a sonar mientras haya pedidos sin atender. */
export const REPETIR_SONIDO_MS = 30_000;

/**
 * El aviso de pedidos nuevos, para el Layout: suena cuando llega uno (y cada
 * 30 s mientras sigan sin atender) y pone «(2) Pedidos nuevos» en el título de
 * la pestaña. El sonido sólo después del primer toque del navegador; antes, el
 * aviso muestra «Activar sonido».
 */
export function useAvisoPedidosWeb(activo: boolean): ContadorPedidos {
  const c = usePedidosNuevos(activo);
  const previo = useRef(0);

  useEffect(() => {
    if (c.nuevos > previo.current) sonarPedido();
    previo.current = c.nuevos;
  }, [c.nuevos]);

  useEffect(() => {
    if (!activo || c.nuevos === 0) return;
    const id = setInterval(() => sonarPedido(), REPETIR_SONIDO_MS);
    return () => clearInterval(id);
  }, [activo, c.nuevos]);

  useEffect(() => {
    if (!activo || c.nuevos === 0) return;
    const base = document.title;
    document.title = `(${c.nuevos}) Pedidos nuevos`;
    return () => {
      document.title = base;
    };
  }, [activo, c.nuevos]);

  return c;
}
