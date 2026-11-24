import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

/** El número de entrada que react-router guarda en cada paso del historial (`history.state.idx`). */
function indiceDe(estado: unknown): number | null {
  const idx = (estado as { idx?: unknown } | null)?.idx;
  return typeof idx === "number" ? idx : null;
}

type Atento = (e: PopStateEvent) => void;
/** Las pantallas que atienden el atrás ahora; manda la última que se prendió. */
const atentos: Atento[] = [];
let instalada = false;

/**
 * El único oyente de `popstate` que pone este módulo en `window`; no hace nada
 * si ninguna pantalla con cambios lo prendió. Tiene que quedar registrado ANTES
 * que el del router, por eso va en main.tsx, antes de montar la app (probado
 * en Chrome 157, 23-nov):
 *
 *  · en `window`, que es el destino del evento, los oyentes corren en el orden
 *    en que se registraron: la fase de captura no adelanta a nadie;
 *  · y React 19 dibuja en el mismo evento la navegación que pide el router en
 *    su `popstate`: la pantalla se desmonta, su oyente se saca y, si estaba
 *    después del router, ya no llega a correr.
 *
 * El del router se registra al montar `BrowserRouter`; éste, antes del render.
 * Si no se instaló al arrancar (las pruebas), se instala al prenderse el primero.
 */
export function instalarGuardiaDelAtras() {
  if (instalada || typeof window === "undefined") return;
  instalada = true;
  window.addEventListener("popstate", (e) => atentos[atentos.length - 1]?.(e), true);
}

/**
 * El botón atrás (o adelante) del navegador con cambios sin guardar: en vez de
 * irse y perder lo escrito, se queda y pregunta. Con `BrowserRouter` no hay
 * `useBlocker`, así que se hace a mano y sin desmontar la pantalla:
 *
 *  · la guardia de `instalarGuardiaDelAtras` corre antes que el router y, con
 *    esta pantalla prendida, le corta el evento (`stopImmediatePropagation`);
 *  · hacia dónde iba sale del `idx` que el router guarda en `history.state`
 *    (el de ahora menos el de la entrada del formulario; sin `idx`, −1);
 *  · se deshace con `history.go(-delta)` y ese segundo `popstate` también se
 *    traga: la dirección vuelve a la del formulario y el router sigue en
 *    sintonía con el navegador, porque no vio ninguno de los dos;
 *  · recién entonces `alIntentar(irIgual)`: `irIgual()` deja pasar el próximo
 *    `popstate` y repite el viaje con `history.go(delta)`.
 *
 * No agrega entradas al historial. Con `activo` en false no atiende nada.
 */
export function useAtrasConCambios(activo: boolean, alIntentar: (irIgual: () => void) => void) {
  const { key } = useLocation();
  const aviso = useRef(alIntentar);
  aviso.current = alIntentar;
  /** El `idx` de la entrada del historial donde está el formulario. */
  const entrada = useRef<number | null>(null);
  /**
   * En un ref y no en el efecto: un `irIgual` que llega cuando el efecto ya se
   * rearmó (o se apagó) igual tiene que dejar pasar su viaje.
   */
  const banderas = useRef({ deshaciendo: false, dejarPasar: false, delta: -1 });

  // Un `replace` (la etapa en la dirección) cambia la ubicación sin cambiar de entrada; un `push`, de entrada.
  useEffect(() => {
    entrada.current = indiceDe(window.history.state);
  }, [key]);

  useEffect(() => {
    if (!activo) return;
    instalarGuardiaDelAtras();
    const b = banderas.current;
    b.deshaciendo = false;
    b.dejarPasar = false;
    entrada.current = indiceDe(window.history.state);

    const alViajar: Atento = (e) => {
      if (b.deshaciendo) {
        // La vuelta a la entrada del formulario que pedimos: no es de la persona.
        e.stopImmediatePropagation();
        b.deshaciendo = false;
        // Si mientras volvía ya eligió «salir», su viaje viene atrás: no se pregunta de nuevo.
        if (b.dejarPasar) return;
        const delta = b.delta;
        let usado = false;
        aviso.current(() => {
          if (usado) return;
          usado = true;
          b.dejarPasar = true;
          window.history.go(delta);
        });
        return;
      }
      if (b.dejarPasar) {
        // El viaje de `irIgual`: ahora sí lo ve el router.
        b.dejarPasar = false;
        return;
      }
      const nuevo = indiceDe(e.state);
      const delta = nuevo != null && entrada.current != null ? nuevo - entrada.current : -1;
      // La misma entrada: no se fue a ningún lado, no hay nada que deshacer.
      if (delta === 0) return;
      e.stopImmediatePropagation();
      b.deshaciendo = true;
      b.delta = delta;
      window.history.go(-delta);
    };

    atentos.push(alViajar);
    return () => {
      const i = atentos.lastIndexOf(alViajar);
      if (i >= 0) atentos.splice(i, 1);
    };
  }, [activo]);
}
