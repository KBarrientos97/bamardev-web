import type { FotosInscripcion, TipoFoto } from "./tipos";

/**
 * Las 3 fotos de la inscripción (D7): foto del estudiante y carnet por los
 * dos lados. Va aparte del cliente de la API porque la página pública
 * (inscribirme) también las manda, y no tiene que arrastrar la app.
 *
 * Se achican en el navegador con la misma utilidad de la ficha técnica de
 * belleza (`lib/belleza/fotos.ts`): WebP, el lado mayor a 1280 px y sin los
 * metadatos de la cámara.
 */
export { prepararFoto } from "../belleza/fotos";

/** El nombre de cada archivo en el multipart (contrato ronda 2). */
export const CAMPO_FOTO: Record<TipoFoto, string> = {
  FOTO: "foto",
  CI_ANVERSO: "ciAnverso",
  CI_REVERSO: "ciReverso",
};

/** Cómo se nombra cada foto en pantalla. */
export const NOMBRE_FOTO: Record<TipoFoto, string> = {
  FOTO: "Foto del estudiante",
  CI_ANVERSO: "Carnet, adelante",
  CI_REVERSO: "Carnet, atrás",
};

/** La extensión según lo que dio el canvas (WebP, o JPG en un Safari viejo). */
export function nombreArchivo(base: string, archivo: Blob): string {
  return `${base}.${archivo.type === "image/jpeg" ? "jpg" : "webp"}`;
}

/**
 * El cuerpo multipart: el JSON de siempre en `datos` y las fotos que haya.
 */
export function formularioConFotos(datos: unknown, fotos: FotosInscripcion): FormData {
  const f = new FormData();
  f.append("datos", JSON.stringify(datos));
  for (const [tipo, archivo] of Object.entries(fotos) as [TipoFoto, Blob | undefined][]) {
    if (archivo) f.append(CAMPO_FOTO[tipo], archivo, nombreArchivo(CAMPO_FOTO[tipo], archivo));
  }
  return f;
}

export const hayFotos = (fotos?: FotosInscripcion): fotos is FotosInscripcion =>
  !!fotos && Object.values(fotos).some(Boolean);

/** "Faltan 2 fotos": el texto del botón principal hasta tener las 3. */
export function textoFaltanFotos(faltan: number): string {
  return faltan === 1 ? "Falta 1 foto" : `Faltan ${faltan} fotos`;
}
