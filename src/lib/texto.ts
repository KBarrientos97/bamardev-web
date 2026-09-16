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

/**
 * Dónde cae la coincidencia **en el texto original**, para poder resaltarla.
 *
 * No alcanza con buscar sobre el texto normalizado: al sacarle las tildes, los
 * índices dejan de corresponder con los del original y el resaltado se corre
 * (en "Ibuprofeno jarabe" no se nota, en "Solución" sí). Por eso se normaliza
 * carácter por carácter y se guarda de dónde vino cada uno.
 *
 * Devuelve `[inicio, fin)` del original, o `null` si no hay coincidencia.
 */
export function posicionDe(
  texto: string | null | undefined,
  busqueda: string,
): [number, number] | null {
  const aguja = normalizar(busqueda.trim());
  if (!texto || !aguja) return null;

  let pajar = "";
  // Por cada carácter del texto normalizado, de qué carácter del original vino.
  const origen: number[] = [];
  for (let i = 0; i < texto.length; i++) {
    const norm = normalizar(texto[i]);
    for (const c of norm) {
      pajar += c;
      origen.push(i);
    }
  }

  const desde = pajar.indexOf(aguja);
  if (desde === -1) return null;
  const hasta = desde + aguja.length - 1;
  // `+1` porque el fin es exclusivo y `origen[hasta]` es el índice del último
  // carácter que entra en la coincidencia.
  return [origen[desde], origen[hasta] + 1];
}
