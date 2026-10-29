import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { EVENTO_NAVEGAR_PUSH, rutaDePush } from "./destino";

/**
 * Tocar una notificación con la app ya abierta: el service worker la trae al
 * frente y manda la ruta por mensaje (ver `public/push-sw.js`); acá se navega
 * con el router, sin recargar. Va en las rutas de la app, antes de mirar si
 * hay sesión: sin sesión la dirección cambia igual y, al entrar, se sigue a
 * donde apuntaba (como cualquier link abierto sin sesión).
 *
 * La ruta se vuelve a validar: el mensaje viene del SW propio, pero es la
 * misma regla en las dos puntas y no cuesta nada.
 */
export function useNavegarDesdePush(): void {
  const navigate = useNavigate();
  useEffect(() => {
    const sw = typeof navigator !== "undefined" ? navigator.serviceWorker : undefined;
    if (!sw) return;
    const alRecibir = (e: MessageEvent) => {
      const datos = e.data as { tipo?: unknown; url?: unknown } | null;
      if (!datos || datos.tipo !== EVENTO_NAVEGAR_PUSH) return;
      navigate(rutaDePush(datos.url));
    };
    sw.addEventListener("message", alRecibir);
    return () => sw.removeEventListener("message", alRecibir);
  }, [navigate]);
}
