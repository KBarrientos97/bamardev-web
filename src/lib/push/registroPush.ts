import { tokenStore, USER_KEY, NEGOCIO_KEY } from "../api";

/**
 * Registro del token de push (FCM) de este navegador en el backend
 * (`POST /auth/dispositivos-push`), sin basura: UNA fila por dispositivo.
 *
 * - `dispositivoId`: un UUID por navegador, generado una vez y guardado. El
 *   backend lo usa de clave: si el token cambia, pisa la misma fila; si otro
 *   usuario entra en este navegador, la fila pasa a ser suya.
 * - Sólo se llama al API si algo cambió (token, usuario o negocio): se guarda
 *   la huella de lo último que se envió bien. Abrir la app cien veces con lo
 *   mismo no hace ni una llamada.
 * - Si falla (sin red, 5xx), no se guarda la huella y se reintenta en el
 *   próximo arranque o login. Un 401 acá no cierra la sesión: no pasa por
 *   `request` a propósito, esto es accesorio y no puede echar a nadie.
 */
const BASE = import.meta.env.VITE_API_URL || "/api";
const DISPOSITIVO_KEY = "bamardev.push.dispositivo";
const HUELLA_KEY = "bamardev.push.enviado";

function leer(clave: string): string | null {
  try {
    return localStorage.getItem(clave);
  } catch {
    return null;
  }
}

function guardar(clave: string, valor: string | null) {
  try {
    if (valor == null) localStorage.removeItem(clave);
    else localStorage.setItem(clave, valor);
  } catch {
    // Sin almacenamiento (modo privado): se reintenta la próxima vez.
  }
}

export function dispositivoId(): string {
  let id = leer(DISPOSITIVO_KEY);
  if (!id) {
    id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    guardar(DISPOSITIVO_KEY, id);
  }
  return id;
}

/** Quién está sentado ahora: usuario y negocio de la sesión guardada. */
function sesionActual(): { usuarioId: number; negocioId: number | null } | null {
  try {
    const u = JSON.parse(leer(USER_KEY) ?? "null") as { id?: number } | null;
    const n = JSON.parse(leer(NEGOCIO_KEY) ?? "null") as { id?: number } | null;
    if (!u?.id) return null;
    return { usuarioId: u.id, negocioId: n?.id ?? null };
  } catch {
    return null;
  }
}

/** Manda el token al backend si cambió algo desde el último envío exitoso. */
export async function registrarTokenSiCambio(fcm: string): Promise<boolean> {
  const sesion = sesionActual();
  const jwt = tokenStore.get();
  if (!sesion || !jwt || !fcm) return false;
  const huella = `${fcm}|${sesion.usuarioId}|${sesion.negocioId ?? ""}`;
  if (leer(HUELLA_KEY) === huella) return true;
  try {
    const res = await fetch(`${BASE}/auth/dispositivos-push`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ dispositivoId: dispositivoId(), token: fcm, plataforma: "WEB" }),
    });
    if (!res.ok) return false;
    guardar(HUELLA_KEY, huella);
    return true;
  } catch {
    return false;
  }
}

/**
 * Al cerrar sesión: el backend borra este dispositivo (mejor esfuerzo, no
 * frena el logout) y se olvida la huella, para que el próximo login vuelva a
 * registrar. Recibe el JWT porque se llama ANTES de limpiar la sesión.
 */
export function olvidarDispositivoPush(jwt: string | null) {
  guardar(HUELLA_KEY, null);
  const id = leer(DISPOSITIVO_KEY);
  if (!jwt || !id) return;
  void fetch(`${BASE}/auth/dispositivos-push/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${jwt}` },
    keepalive: true,
  }).catch(() => undefined);
}

/**
 * Al iniciar sesión o abrir la app con sesión: si el permiso YA está dado,
 * trae el token sin preguntar nada y lo registra si cambió. Sin permiso no
 * baja Firebase ni hace ninguna llamada: hoy casi nadie lo dio.
 */
export async function sincronizarPushSilencioso(): Promise<void> {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted" || !("serviceWorker" in navigator)) return;
  try {
    const { tokenFcm } = await import("./firebasePush");
    const fcm = await tokenFcm();
    if (fcm) await registrarTokenSiCambio(fcm);
  } catch {
    // Push es accesorio: si falla, se reintenta en el próximo arranque.
  }
}
