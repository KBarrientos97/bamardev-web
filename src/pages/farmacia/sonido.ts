/**
 * Los sonidos del mostrador de la farmacia. Por ahora uno solo.
 *
 * Existe por el lector de código de barras (B9, testing 11-nov): quien
 * escanea mira el producto y no la pantalla, y un Enter que no agregó nada
 * —agotado, sólo cajas vencidas, dos coincidencias— pasaba en silencio. El
 * aviso de abajo dice qué pasó; el pitido es lo que hace levantar la vista.
 *
 * Todo adentro de try/catch y sin `AudioContext` (jsdom, un navegador viejo)
 * no hace nada: el sonido es una ayuda y no puede frenar una venta.
 */

/** Un solo contexto para toda la sesión: el navegador los limita. */
let contexto: AudioContext | null = null;

function audio(): AudioContext | null {
  if (contexto) return contexto;
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  contexto = new Ctor();
  return contexto;
}

/** Un pitido corto y agudo: "esto NO se cargó". */
export function pitidoDeError(): void {
  try {
    const ctx = audio();
    if (!ctx) return;
    // El navegador lo deja suspendido hasta el primer gesto en la página; el
    // Enter del lector (una tecla) cuenta como gesto, así que acá ya se puede.
    if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
    const oscilador = ctx.createOscillator();
    const volumen = ctx.createGain();
    oscilador.type = "square";
    oscilador.frequency.value = 880;
    // Bajo: es un aviso al lado del mostrador, no una alarma.
    volumen.gain.value = 0.06;
    oscilador.connect(volumen).connect(ctx.destination);
    const ahora = ctx.currentTime;
    oscilador.start(ahora);
    oscilador.stop(ahora + 0.12);
  } catch {
    /* sin sonido se sigue igual */
  }
}
