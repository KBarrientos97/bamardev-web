/**
 * Achica el logo, la portada y las fotos del catálogo en el navegador antes
 * de subirlos (PLAN-PAGINA-NEGOCIO §1.5): logo cuadrado de 512 px, portada de
 * 1600 px de ancho y foto del catálogo de 1200 px de lado mayor, en WebP.
 * Redibujar en un canvas además deja atrás los metadatos (la ubicación de la
 * foto). El backend igual valida tipo, tamaño y los quita.
 */

import { LADO_MINIMO_LOGO, quitarFondo } from "./quitarFondo";

export const TOPE_ORIGINAL = 10 * 1024 * 1024;

/**
 * `plato` es la foto de un plato del menú digital (640 px de lado mayor: en
 * una TV de 4 columnas la tarjeta mide ~350 px, y una TV con 25 platos baja
 * todas las fotos de una). `marca` es el logo del negocio para el recibo y
 * las TVs, que no se recorta: un logo ancho (el dibujo con el nombre al lado) cortado al
 * cuadrado perdía las letras de los costados.
 */
export type TipoImagen = "logo" | "portada" | "catalogo" | "plato" | "marca";

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
  if (tipo === "plato") escala = Math.min(1, 640 / Math.max(ancho, alto));
  if (tipo === "marca") escala = Math.min(1, 720 / Math.max(ancho, alto));
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

/**
 * Lo que el backend acepta de cada imagen que puede ir sin fondo: el logo
 * (300 KB, 64 px de lado) y la foto de un plato (400 KB, 96 px).
 */
const SIN_FONDO = {
  marca: { tope: 300 * 1024, ladoMinimo: LADO_MINIMO_LOGO, calidad: 0.9 },
  plato: { tope: 400 * 1024, ladoMinimo: 96, calidad: 0.82 },
} as const;

function blobDe(canvas: HTMLCanvasElement, tipoMime: string, calidad?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, tipoMime, calidad));
}

export interface ImagenSinFondo {
  blob: Blob;
  /** Se le borró el fondo (blanco, negro, un color parejo o los cuadritos dibujados). */
  fondoQuitado: boolean;
}

/**
 * El logo del negocio para las TVs y el recibo (`marca`), sin el fondo si se
 * pide y el borde es parejo (`quitarFondo`). Después se recorta lo vacío de
 * alrededor: en la TV el dibujo sale más grande en el mismo lugar.
 */
export function prepararLogo(archivo: File, sacarFondo: boolean): Promise<ImagenSinFondo> {
  return prepararSinFondo(archivo, sacarFondo, "marca");
}

/**
 * La foto de un plato del menú digital, sin el fondo si es parejo (una foto
 * de internet sobre blanco, el plato sobre una cartulina o un mantel liso).
 * Kevin (9-nov) quería el plato suelto en la TV, como el dibujo del ícono, y
 * no la foto enmarcada con la mesa adentro. Una foto con la mesa, el mantel
 * estampado o las sombras no tiene un borde parejo: sube como vino y la TV la
 * sigue mostrando enmarcada. El backend se da cuenta solo de que quedó
 * transparente (`fotoSinFondo`).
 */
export function prepararFotoPlato(archivo: File, sacarFondo: boolean): Promise<ImagenSinFondo> {
  return prepararSinFondo(archivo, sacarFondo, "plato");
}

async function prepararSinFondo(
  archivo: File,
  sacarFondo: boolean,
  tipo: keyof typeof SIN_FONDO,
): Promise<ImagenSinFondo> {
  const lim = SIN_FONDO[tipo];
  if (!archivo.type.startsWith("image/")) throw new Error("Elegí una imagen (PNG, JPG o WebP).");
  if (archivo.size > TOPE_ORIGINAL) throw new Error("La imagen pesa más de 10 MB.");
  const img = await cargar(archivo);
  const m = medidas(tipo, img.naturalWidth, img.naturalHeight);
  let canvas = document.createElement("canvas");
  canvas.width = m.ancho;
  canvas.height = m.alto;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Tu navegador no pudo procesar la imagen.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, m.sx, m.sy, m.sw, m.sh, 0, 0, m.ancho, m.alto);

  let fondoQuitado = false;
  let conTransparencia = false;
  if (sacarFondo) {
    const pixeles = ctx.getImageData(0, 0, m.ancho, m.alto);
    const r = quitarFondo(pixeles, lim.ladoMinimo);
    if (r.tipo !== "sin-cambios") {
      fondoQuitado = r.tipo === "quitado";
      conTransparencia = true;
      ctx.putImageData(pixeles, 0, 0);
      const c = r.recorte;
      if (c.ancho !== m.ancho || c.alto !== m.alto) {
        const recortado = document.createElement("canvas");
        recortado.width = c.ancho;
        recortado.height = c.alto;
        recortado.getContext("2d")?.drawImage(canvas, c.x, c.y, c.ancho, c.alto, 0, 0, c.ancho, c.alto);
        canvas = recortado;
      }
    }
  }

  let blob = await blobDe(canvas, "image/webp", lim.calidad);
  if (!blob || blob.type !== "image/webp") {
    // Safari no sabe hacer WebP. El JPG de siempre pinta de NEGRO lo
    // transparente, que es justo lo que se acaba de borrar: va en PNG, que
    // pesa más y se achica hasta entrar en el tope del backend.
    blob = conTransparencia
      ? await pngQueEntre(canvas, lim.tope, lim.ladoMinimo)
      : await blobDe(canvas, "image/jpeg", 0.85);
  }
  if (!blob) throw new Error("Tu navegador no pudo procesar la imagen.");
  return { blob, fondoQuitado };
}

async function pngQueEntre(original: HTMLCanvasElement, tope: number, ladoMinimo: number): Promise<Blob | null> {
  let canvas = original;
  for (let vuelta = 0; vuelta < 5; vuelta++) {
    const blob = await blobDe(canvas, "image/png");
    const ancho = Math.round(canvas.width * 0.8);
    const alto = Math.round(canvas.height * 0.8);
    if (!blob || blob.size <= tope || Math.min(ancho, alto) < ladoMinimo) return blob;
    const chico = document.createElement("canvas");
    chico.width = ancho;
    chico.height = alto;
    const ctx = chico.getContext("2d");
    if (!ctx) return blob;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(canvas, 0, 0, ancho, alto);
    canvas = chico;
  }
  return blobDe(canvas, "image/png");
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
  let blob = await aBlob("image/webp", tipo === "logo" || tipo === "marca" ? 0.9 : 0.82);
  // Safari viejo devuelve PNG cuando no sabe WebP: el PNG de una foto pesa mucho.
  if (!blob || blob.type !== "image/webp") blob = await aBlob("image/jpeg", 0.85);
  if (!blob) throw new Error("Tu navegador no pudo procesar la imagen.");
  return blob;
}
