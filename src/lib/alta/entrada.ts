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
 * "Reintentar", la recarga ya no tiene el fragmento. Va con su vencimiento:
 * desde B4 el código vale 10 minutos (antes 60 s, cuando daba igual guardarlo
 * sin fecha), y una pestaña que queda abierta no tiene por qué seguir
 * mandando uno que el backend ya no acepta.
 */
const CODIGO_KEY = "bamardev_web_codigo_entrada";

/** Lo que dura el código en el backend (PLAN-ALTA-LANDING B4). */
export const VIGENCIA_CODIGO_MS = 10 * 60_000;

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
      const guardado: CodigoGuardado = { codigo: delFragmento, hasta: Date.now() + VIGENCIA_CODIGO_MS };
      win.sessionStorage.setItem(CODIGO_KEY, JSON.stringify(guardado));
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
  return codigoGuardado(win);
}

interface CodigoGuardado {
  codigo: string;
  /** Epoch en ms: pasado esto el backend ya no lo acepta. */
  hasta: number;
}

/** La copia de la pestaña, si sigue vigente. La vencida se borra. */
function codigoGuardado(win: Window): string | null {
  try {
    const raw = win.sessionStorage.getItem(CODIGO_KEY);
    if (!raw) return null;
    const guardado = JSON.parse(raw) as Partial<CodigoGuardado>;
    if (typeof guardado.codigo === "string" && typeof guardado.hasta === "number" && Date.now() < guardado.hasta) {
      return guardado.codigo;
    }
    // Vencida, o con otra forma (la de antes de B4 era el código pelado).
    win.sessionStorage.removeItem(CODIGO_KEY);
    return null;
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

// ── El alias en la dirección ───────────────────────────────────────────────

/** Los parámetros que traen el código del negocio: `negocio` el de la landing. */
const PARAMS_ALIAS = ["negocio", "alias"] as const;

/**
 * Forma de un alias: lo que deja el `slug` del backend (minúsculas, dígitos y
 * guiones, sin guion en las puntas). El tope es más holgado que sus 30
 * caracteres porque al alias tomado se le suma un número.
 */
const ALIAS_VALIDO = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

/**
 * El alias que trae la dirección (`?negocio=…` o `?alias=…`), para prellenar
 * el login (B5) y el de respaldo de `/entrar`. Se normaliza como lo escribiría
 * a mano (minúsculas, sin espacios) y lo que no tiene forma de alias se
 * descarta: es un enlace que cualquiera puede armar, y un campo prellenado
 * con basura es peor que uno vacío.
 */
export function aliasDeLaDireccion(search: string): string {
  const params = new URLSearchParams(search);
  for (const nombre of PARAMS_ALIAS) {
    const alias = (params.get(nombre) ?? "").toLowerCase().replace(/\s+/g, "");
    if (alias) return ALIAS_VALIDO.test(alias) ? alias : "";
  }
  return "";
}

/**
 * La misma búsqueda sin los parámetros del alias (con su `?` si queda algo),
 * o null si no traía ninguno y no hay nada que limpiar.
 */
export function direccionSinAlias(search: string): string | null {
  const params = new URLSearchParams(search);
  if (!PARAMS_ALIAS.some((nombre) => params.has(nombre))) return null;
  for (const nombre of PARAMS_ALIAS) params.delete(nombre);
  const resto = params.toString();
  return resto ? `?${resto}` : "";
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
