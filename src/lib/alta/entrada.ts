/*
 * La entrada de una cuenta recién creada desde la landing (PLAN-ALTA-LANDING).
 *
 * La landing salta a `/entrar#c=<código>`: el código va en el fragmento, que
 * el navegador no manda a ningún servidor ni queda en un log. Igual dura poco
 * en la barra de direcciones: se lee y se borra al arrancar, antes de que la
 * telemetría o cualquier otra cosa mire la URL, y de ahí en más vive acá.
 *
 * Este archivo lo importa main.tsx: tiene que seguir siendo liviano (nada de
 * React, ni del API, ni de la sesión).
 */

export const RUTA_ENTRAR = "/entrar";

/**
 * Copia en la pestaña: si la carga de la app falla y el usuario toca
 * "Reintentar", la recarga ya no tiene el fragmento. El código vence a los
 * 60 segundos, así que guardarlo un rato más no abre nada nuevo.
 */
const CODIGO_KEY = "bamardev_web_codigo_entrada";

let codigoEnMemoria: string | null = null;

/** El código de `#c=…`, o null si la dirección no lo trae. */
function codigoDelFragmento(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const codigo = params.get("c")?.trim();
  return codigo ? codigo : null;
}

/**
 * Si la dirección es `/entrar#c=…`, se queda con el código y lo saca de la
 * barra. Se llama al arrancar (main.tsx) y otra vez desde la pantalla, por si
 * llegó por otro camino: la segunda vez el fragmento ya no está y devuelve lo
 * guardado. Sin efecto en cualquier otra ruta.
 */
export function tomarCodigoDeEntrada(win: Window = window): string | null {
  if (win.location.pathname !== RUTA_ENTRAR) return codigoEnMemoria;
  const delFragmento = codigoDelFragmento(win.location.hash);
  if (delFragmento) {
    codigoEnMemoria = delFragmento;
    try {
      win.sessionStorage.setItem(CODIGO_KEY, delFragmento);
    } catch {
      /* sin almacenamiento: alcanza con la memoria */
    }
  }
  if (win.location.hash) {
    // replaceState y no `location.hash = ""`: no deja una entrada en el
    // historial con el código ni dispara una navegación. El `?` se conserva
    // (puede traer el alias para el login de respaldo).
    win.history.replaceState(win.history.state, "", win.location.pathname + win.location.search);
  }
  if (codigoEnMemoria) return codigoEnMemoria;
  try {
    return win.sessionStorage.getItem(CODIGO_KEY);
  } catch {
    return null;
  }
}

/** Ya se canjeó (o falló): es de un solo uso y no tiene que quedar guardado. */
export function olvidarCodigoDeEntrada(win: Window = window) {
  codigoEnMemoria = null;
  try {
    win.sessionStorage.removeItem(CODIGO_KEY);
  } catch {
    /* nada que borrar */
  }
}

/**
 * El alias para el login de respaldo, si la dirección lo trae
 * (`/entrar?negocio=…` o `?alias=…`). La landing de hoy no lo manda: sin él el
 * login queda como siempre.
 */
export function aliasDeLaDireccion(search: string): string {
  const params = new URLSearchParams(search);
  return (params.get("negocio") ?? params.get("alias") ?? "").trim().toLowerCase();
}

// ── La bienvenida ──────────────────────────────────────────────────────────

/** Lo que muestra la bienvenida, tomado de la respuesta del canje. */
export interface DatosBienvenida {
  negocioId: number;
  usuarioId: number;
  /** El código del negocio con el que se entra la próxima vez. */
  alias: string;
  usuario: string;
  nombreNegocio: string;
  /** Fin de la prueba, si el canje trajo la licencia. */
  vence: string | null;
}

const PENDIENTE_KEY = "bamardev_web_bienvenida_pendiente";
const vistaKey = (negocioId: number, usuarioId: number) =>
  `bamardev_web_bienvenida_vista:${negocioId}:${usuarioId}`;

// Sin almacenamiento (ventana privada estricta) la bienvenida igual sale una
// vez en esta pestaña; lo que no se puede es recordarla para la próxima.
let pendienteEnMemoria: DatosBienvenida | null = null;
const vistasEnMemoria = new Set<string>();

export function bienvenidaVista(negocioId: number, usuarioId: number): boolean {
  const clave = vistaKey(negocioId, usuarioId);
  if (vistasEnMemoria.has(clave)) return true;
  try {
    return localStorage.getItem(clave) !== null;
  } catch {
    return false;
  }
}

/** La deja lista para que la muestre la app al llegar a su inicio. */
export function dejarBienvenidaPendiente(datos: DatosBienvenida) {
  pendienteEnMemoria = datos;
  try {
    localStorage.setItem(PENDIENTE_KEY, JSON.stringify(datos));
  } catch {
    /* queda la de memoria */
  }
}

/** La bienvenida de ESTE usuario en ESTE negocio, si falta mostrarla. */
export function bienvenidaPendiente(negocioId: number, usuarioId: number): DatosBienvenida | null {
  let datos = pendienteEnMemoria;
  try {
    const raw = localStorage.getItem(PENDIENTE_KEY);
    if (raw) datos = JSON.parse(raw) as DatosBienvenida;
  } catch {
    /* la de memoria */
  }
  if (!datos || datos.negocioId !== negocioId || datos.usuarioId !== usuarioId) return null;
  return bienvenidaVista(negocioId, usuarioId) ? null : datos;
}

/** Cerrada una vez, no vuelve a salir para ese usuario de ese negocio. */
export function marcarBienvenidaVista(negocioId: number, usuarioId: number) {
  const clave = vistaKey(negocioId, usuarioId);
  vistasEnMemoria.add(clave);
  pendienteEnMemoria = null;
  try {
    localStorage.setItem(clave, "1");
    localStorage.removeItem(PENDIENTE_KEY);
  } catch {
    /* recordada sólo en esta pestaña */
  }
}

/** Para los tests: arranca sin nada en memoria. */
export function reiniciarEntradaParaTests() {
  codigoEnMemoria = null;
  pendienteEnMemoria = null;
  vistasEnMemoria.clear();
}
