/**
 * Utilidades de texto para las búsquedas.
 *
 * Existe porque los catálogos están llenos de tildes ("Café", "Limón", "Piña")
 * y el cajero teclea sin ellas: filtrar con `includes` a secas hacía que "cafe"
 * no encontrara "Café". Port de `Texto.kt` (Android).
 */

/** Marcador temporal para la ñ, fuera del rango que alguien vaya a teclear. */
const MARCA_ENIE = "";

/**
 * Deja el texto comparable: minúsculas y sin tildes ni diéresis. La "ñ" se
 * conserva — es una letra distinta en español, no una "n" acentuada, y quien
 * busca "niño" no quiere que le aparezca "nino".
 */
export function normalizar(texto: string): string {
  const protegido = texto.replace(/ñ/g, MARCA_ENIE).replace(/Ñ/g, MARCA_ENIE);
  return protegido
    .normalize("NFD")
    .replace(/\p{Mn}+/gu, "")
    .replace(new RegExp(MARCA_ENIE, "g"), "ñ")
    .toLowerCase();
}

/** `true` si `texto` contiene `busqueda` ignorando mayúsculas y tildes. */
export function contiene(texto: string | null | undefined, busqueda: string): boolean {
  if (!texto) return false;
  return normalizar(texto).includes(normalizar(busqueda));
}
