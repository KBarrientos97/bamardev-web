import type { EstadoLicencia, SesionNegocio } from "../types";

/**
 * Lo que trae el estado de la licencia del perfil del negocio, aplicado a la
 * sesión. Devuelve la MISMA sesión si no hay nada que cambiar, para que el
 * poller no recalcule permisos cada 15 min.
 *
 * Se compara sólo `perfilVersion`: el backend la sube cuando cambia la paleta
 * o el perfil, y comparar los JSON enteros sería frágil (el orden de las
 * claves no está garantizado). Un backend que no la manda no cambia nada.
 */
export function conPerfilDelEstado(
  previo: SesionNegocio,
  estado: Pick<EstadoLicencia, "tema" | "perfil" | "perfilVersion">,
): SesionNegocio {
  const version = estado.perfilVersion;
  if (version == null || version === previo.perfilVersion) return previo;
  return {
    ...previo,
    perfilVersion: version,
    // Si la versión cambió pero uno de los dos no vino, se queda el que había:
    // un campo ausente no es "borralo".
    tema: estado.tema !== undefined ? estado.tema : previo.tema,
    perfil: estado.perfil !== undefined ? estado.perfil : previo.perfil,
  };
}
