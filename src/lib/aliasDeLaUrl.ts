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
