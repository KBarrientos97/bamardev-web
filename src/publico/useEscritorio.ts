import { useCoincideMedia } from "../lib/useCoincideMedia";

/**
 * La misma frontera que el `lg:` de Tailwind (64rem): lo que cambia de
 * estructura lo decide este hook y lo que sólo cambia de tamaño, las clases
 * `lg:`. Si no coincidieran, entre los dos anchos se vería medio armado.
 */
const CONSULTA_ESCRITORIO = "(min-width: 64rem)";

/** ¿Computadora? Sin `matchMedia` (los tests) es celular. */
export function useEscritorio(): boolean {
  return useCoincideMedia(CONSULTA_ESCRITORIO);
}
