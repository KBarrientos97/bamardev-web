/**
 * La entrada del soporte de BamarDev desde el panel, y "Te la armamos"
 * (PLAN-PAGINA-PRO M5): el operador abre la web del cliente con un token de
 * soporte (`POST /negocios/:id/soporte` o `/sitio/armar`). Con `armado`, el
 * backend le deja escribir en el borrador de la página y en nada más; sin él,
 * todo es sólo lectura. El dueño después lo revisa y publica.
 *
 * El panel abre `app…/#soporte=<jwt>&armado=1`. El token va en el `#` a
 * propósito: el fragmento no viaja al servidor, ni a los logs de Cloudflare,
 * ni en el `Referer`. Al arrancar, la web lo pasa a `sessionStorage` (esa
 * pestaña y nada más, se va al cerrarla), limpia la barra y sigue en
 * `/soporte`. Nunca toca el `localStorage` de la sesión normal: el navegador
 * puede tener abierta la sesión del dueño (o del operador en otro negocio), y
 * un 401 o un vencimiento de acá no tiene que cerrarla. El token sólo vale
 * bajo `/soporte`: si en esa pestaña se escribe otra dirección, la app sigue
 * con su sesión de siempre.
 *
 * La seguridad la pone el backend (`SoloLecturaGuard`). Esto decodifica el
 * JWT sólo para la pantalla.
 */

export const RUTA_SOPORTE = "/soporte";
const CLAVE = "bamardev_web_token_soporte";

export interface SesionSoporte {
  token: string;
  /** El claim `armado` del JWT: puede escribir el borrador de la página. */
  armado: boolean;
  /** Cuándo vence, en ms (el `exp` del JWT). */
  vence: number | null;
  negocioId: number | null;
}

/** El payload de un JWT, sin verificar la firma (eso lo hace el backend). */
export function payloadJwt(token: string): Record<string, unknown> | null {
  const partes = token.split(".");
  if (partes.length !== 3) return null;
  try {
    const b64 = partes[1].replace(/-/g, "+").replace(/_/g, "/");
    const relleno = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const json = decodeURIComponent(
      Array.from(atob(relleno), (c) => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`).join(""),
    );
    const p = JSON.parse(json) as unknown;
    return p && typeof p === "object" && !Array.isArray(p) ? (p as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function sesionDeToken(token: string): SesionSoporte | null {
  const p = payloadJwt(token);
  if (!p || p.soporte !== true) return null;
  return {
    token,
    armado: p.armado === true,
    vence: typeof p.exp === "number" ? p.exp * 1000 : null,
    negocioId: typeof p.negocioId === "number" ? p.negocioId : null,
  };
}

const enSoporte = () => typeof window !== "undefined" && window.location.pathname.startsWith(RUTA_SOPORTE);

function guardado(): string | null {
  try {
    return sessionStorage.getItem(CLAVE);
  } catch {
    return null;
  }
}

/** El token de esta pestaña, si se está en `/soporte` y hay uno. Lo usa `tokenStore`. */
export function tokenDeSoporte(): string | null {
  return enSoporte() ? guardado() : null;
}

export function olvidarTokenDeSoporte(): void {
  try {
    sessionStorage.removeItem(CLAVE);
  } catch {
    /* nada que olvidar */
  }
}

/**
 * Al arrancar: si la dirección trae `#soporte=<token>`, lo guarda en la
 * pestaña, limpia el fragmento (que el token no quede a la vista ni en el
 * historial) y deja la pestaña en `/soporte`. Devuelve si había entrada.
 */
export function capturarEntradaDeSoporte(): boolean {
  if (typeof window === "undefined") return false;
  const p = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const token = p.get("soporte");
  if (!token) return false;
  try {
    sessionStorage.setItem(CLAVE, token);
  } catch {
    /* sin almacenamiento no hay cómo seguir: /soporte dirá que no hay acceso */
  }
  window.history.replaceState(null, "", RUTA_SOPORTE);
  return true;
}

/**
 * La sesión de soporte de esta pestaña. El `armado=1` de la dirección es sólo
 * el pedido del panel: lo que vale es el claim del token.
 */
export function sesionDeSoporte(): SesionSoporte | null {
  const token = guardado();
  return token ? sesionDeToken(token) : null;
}

export function vencida(s: SesionSoporte | null, ahora = Date.now()): boolean {
  return !s || (s.vence !== null && s.vence <= ahora);
}

/** "se vence en 12 min" (o "en menos de un minuto"). */
export function textoVence(vence: number | null, ahora = Date.now()): string {
  if (vence === null) return "";
  const min = Math.floor((vence - ahora) / 60_000);
  if (min <= 0) return "se vence en menos de un minuto";
  return `se vence en ${min} min`;
}
