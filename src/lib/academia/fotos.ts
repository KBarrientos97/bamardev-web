import { TIPOS_FOTO, type FotosInscripcion, type TipoFoto } from "./tipos";

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

/**
 * El texto del candado para quien no ve las fotos (L9, 28-oct): decía
 * «Sólo el administrador ve las fotos», pero ahora el administrador le puede
 * dar el permiso a otro rol (la recepción). Va sólo a quien no las ve.
 */
export const TEXTO_CANDADO_FOTOS = "Las fotos las ve el administrador o quien tenga su permiso";

/** Cómo se nombra cada foto dentro de una frase ("observadas: foto y carnet de atrás"). */
export const NOMBRE_FOTO_CORTO: Record<TipoFoto, string> = {
  FOTO: "foto",
  CI_ANVERSO: "carnet de adelante",
  CI_REVERSO: "carnet de atrás",
};

/** "foto", "foto y carnet de atrás", "foto, carnet de adelante y carnet de atrás". */
export function listaDeFotos(tipos: TipoFoto[]): string {
  const ordenadas = TIPOS_FOTO.filter((t) => tipos.includes(t)).map((t) => NOMBRE_FOTO_CORTO[t]);
  if (ordenadas.length <= 1) return ordenadas.join("");
  return `${ordenadas.slice(0, -1).join(", ")} y ${ordenadas[ordenadas.length - 1]}`;
}

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

/**
 * El aviso de éxito cuando se inscribió sin las fotos (D3): `null` si no
 * quedó nada pendiente. Lo usan todas las pantallas desde donde se inscribe.
 */
export function avisoFotosPendientes(i: { fotosPendientes?: boolean; fotosFaltan?: TipoFoto[] } | null | undefined): string | null {
  if (!i?.fotosPendientes) return null;
  const cuales = i.fotosFaltan?.length ? ` (${listaDeFotos(i.fotosFaltan)})` : "";
  return `Quedó con las fotos pendientes${cuales}: queda marcado «Faltan fotos» en su ficha.`;
}

/**
 * El aviso de una inscripción hecha SIN cobrar en el momento (ronda 2, R8): el
 * panel se cierra y, sin esto, no quedaba ninguna señal de que se hizo (y se
 * reintentaba, con YA_INSCRIPTO). Lleva el aviso de las fotos si quedaron pendientes.
 */
export function avisoInscripcionHecha(nombre: string | undefined, sinFotos: string | null): string {
  return [nombre ? `${nombre} quedó inscrito.` : "La inscripción quedó registrada.", sinFotos].filter(Boolean).join(" ");
}

/** Cuántas de las 3 faltan, contando las nuevas y las ya guardadas. */
export function fotosQueFaltan(fotos: FotosInscripcion, yaTiene: TipoFoto[] = []): TipoFoto[] {
  return TIPOS_FOTO.filter((t) => !fotos[t] && !yaTiene.includes(t));
}
