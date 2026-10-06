/**
 * Las fotos de la ficha técnica se achican en el navegador antes de subirlas:
 * el lado mayor a 1280 px, en WebP. Redibujarlas en un canvas además deja
 * atrás los metadatos (la ubicación de quien la sacó). El backend igual valida
 * el tipo por contenido, el tamaño y quita lo que quede.
 */

export const LADO_MAXIMO = 1280;
export const TOPE_ORIGINAL = 15 * 1024 * 1024;

/** A qué medida se redibuja: nunca se agranda una foto chica. */
export function medidasFoto(ancho: number, alto: number): { ancho: number; alto: number } {
  const escala = Math.min(1, LADO_MAXIMO / Math.max(ancho, alto));
  return { ancho: Math.round(ancho * escala), alto: Math.round(alto * escala) };
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
      reject(new Error("No se pudo leer la foto. Probá con un JPG o un PNG."));
    };
    img.src = url;
  });
}

export async function prepararFoto(archivo: File): Promise<Blob> {
  if (!archivo.type.startsWith("image/")) throw new Error("Elegí una foto (JPG, PNG o WebP).");
  if (archivo.size > TOPE_ORIGINAL) throw new Error("La foto pesa más de 15 MB.");
  const img = await cargar(archivo);
  const m = medidasFoto(img.naturalWidth, img.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = m.ancho;
  canvas.height = m.alto;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Tu navegador no pudo procesar la foto.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, m.ancho, m.alto);
  const aBlob = (tipo: string, calidad: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, tipo, calidad));
  const blob = (await aBlob("image/webp", 0.8)) ?? (await aBlob("image/jpeg", 0.8));
  if (!blob) throw new Error("Tu navegador no pudo procesar la foto.");
  return blob;
}
