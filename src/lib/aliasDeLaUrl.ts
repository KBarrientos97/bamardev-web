/*
 * El código del negocio que trae la dirección (PLAN-ALTA-LANDING B5).
 *
 * La landing manda siempre al login con `?negocio=<alias>` (B6): el login lo
 * usa para rellenar el campo y después lo saca de la URL. También vale
 * `?alias=`, por si el enlace lo arma otro.
 */

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
 * el login. Se normaliza como lo escribiría a mano (minúsculas, sin espacios)
 * y lo que no tiene forma de alias se descarta: es un enlace que cualquiera
 * puede armar, y un campo prellenado con basura es peor que uno vacío.
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
 * El usuario que trae la dirección (`?usuario=…`): el QR del acceso de
 * despacho abre el login con el negocio y el usuario puestos, y en la tablet
 * sólo se escribe la contraseña (Kevin, 29-oct). Con la forma de un usuario
 * del alta; si no la tiene, vacío.
 */
export function usuarioDeLaDireccion(search: string): string {
  const usuario = (new URLSearchParams(search).get("usuario") ?? "").trim().toLowerCase();
  return /^[a-z0-9._-]{3,30}$/.test(usuario) ? usuario : "";
}

/** Lo que el login toma de la dirección y después saca de ella. */
const PARAMS_LOGIN = [...PARAMS_ALIAS, "usuario"] as const;

/**
 * La misma búsqueda sin los parámetros del login —el alias y el usuario—
 * (con su `?` si queda algo), o null si no traía ninguno y no hay nada que
 * limpiar.
 */
export function direccionSinAlias(search: string): string | null {
  const params = new URLSearchParams(search);
  if (!PARAMS_LOGIN.some((nombre) => params.has(nombre))) return null;
  for (const nombre of PARAMS_LOGIN) params.delete(nombre);
  const resto = params.toString();
  return resto ? `?${resto}` : "";
}
