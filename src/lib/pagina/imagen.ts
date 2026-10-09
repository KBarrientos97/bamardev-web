/**
 * Achica el logo, la portada y las fotos del catálogo en el navegador antes
 * de subirlos (PLAN-PAGINA-NEGOCIO §1.5): logo cuadrado de 512 px, portada de
 * 1600 px de ancho y foto del catálogo de 1200 px de lado mayor, en WebP.
 * Redibujar en un canvas además deja atrás los metadatos (la ubicación de la
 * foto). El backend igual valida tipo, tamaño y los quita.
 */

export const TOPE_ORIGINAL = 10 * 1024 * 1024;

export type TipoImagen = "logo" | "portada" | "catalogo";

/** El backend rechaza una foto del catálogo con un lado fuera de 200–2048 px. */
export const LADO_MINIMO_CATALOGO = 200;
const LADO_MAXIMO_CATALOGO = 2048;

export interface MedidasDestino {
  ancho: number;
  alto: number;
  /** Recorte desde la imagen original. */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/**
 * Cuánto recortar y a qué medida. El logo se recorta al cuadrado del centro
 * (se muestra redondo); la portada y la foto del catálogo conservan su
 * proporción y sólo se achican. Nunca se agranda una imagen chica.
 */
export function medidas(tipo: TipoImagen, ancho: number, alto: number): MedidasDestino {
  if (tipo === "logo") {
    const lado = Math.min(ancho, alto);
    const final = Math.min(512, lado);
    return {
      ancho: final,
      alto: final,
      sx: Math.round((ancho - lado) / 2),
      sy: Math.round((alto - lado) / 2),
      sw: lado,
      sh: lado,
    };
  }
  let escala = Math.min(1, 1600 / ancho);
  if (tipo === "catalogo") {
    // La tarjeta la recorta al cuadrado y el visor la muestra entera: se
    // achica por el lado mayor. Una panorámica no puede quedar con el lado
    // corto bajo el mínimo del backend (el de 4000×500 quedaría de 150 px).
    const mayor = Math.max(ancho, alto);
    const menor = Math.min(ancho, alto);
    escala = Math.min(1, 1200 / mayor);
    if (menor * escala < LADO_MINIMO_CATALOGO) {
      escala = Math.min(1, LADO_MINIMO_CATALOGO / menor, LADO_MAXIMO_CATALOGO / mayor);
    }
  }
  return {
    ancho: Math.round(ancho * escala),
    alto: Math.round(alto * escala),
    sx: 0,
    sy: 0,
    sw: ancho,
    sh: alto,
  };
}

function cargar(archivo: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la imagen. Probá con un PNG o un JPG."));
    };
    img.src = url;
  });
}

/** Devuelve la imagen lista para subir (WebP; JPG si el navegador no sabe). */
export async function prepararImagen(archivo: File, tipo: TipoImagen): Promise<Blob> {
  if (!archivo.type.startsWith("image/")) throw new Error("Elegí una imagen (PNG, JPG o WebP).");
  if (archivo.size > TOPE_ORIGINAL) throw new Error("La imagen pesa más de 10 MB.");
  const img = await cargar(archivo);
  if (tipo === "catalogo" && Math.min(img.naturalWidth, img.naturalHeight) < LADO_MINIMO_CATALOGO) {
    throw new Error(`La foto es muy chica: tiene que medir al menos ${LADO_MINIMO_CATALOGO} px de cada lado.`);
  }
  const m = medidas(tipo, img.naturalWidth, img.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = m.ancho;
  canvas.height = m.alto;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Tu navegador no pudo procesar la imagen.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, m.sx, m.sy, m.sw, m.sh, 0, 0, m.ancho, m.alto);
  const aBlob = (tipoMime: string, calidad: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, tipoMime, calidad));
  let blob = await aBlob("image/webp", tipo === "logo" ? 0.9 : 0.82);
  // Safari viejo devuelve PNG cuando no sabe WebP: el PNG de una foto pesa mucho.
  if (!blob || blob.type !== "image/webp") blob = await aBlob("image/jpeg", 0.85);
  if (!blob) throw new Error("Tu navegador no pudo procesar la imagen.");
  return blob;
}
