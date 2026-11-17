/**
 * Achica el logo, la portada y las fotos del catálogo en el navegador antes
 * de subirlos (PLAN-PAGINA-NEGOCIO §1.5): logo cuadrado de 512 px, portada de
 * 1600 px de ancho y foto del catálogo de 1200 px de lado mayor, en WebP.
 * Redibujar en un canvas además deja atrás los metadatos (la ubicación de la
 * foto). El backend igual valida tipo, tamaño y los quita.
 */

import { LADO_MINIMO_LOGO, quitarFondo, type OpcionesFondo, type Pixeles, type Recorte } from "./quitarFondo";

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
  marca: { tope: 300 * 1024, ladoMinimo: LADO_MINIMO_LOGO, calidad: 0.9, tolerancia: "fija", platos: false },
  // Según el ruido: el plato blanco sobre blanco perdía el canto a mordiscos.
  // Y el borde de cada plato por su forma (platos.ts): por color no se sabe
  // dónde termina un plato blanco sobre blanco.
  plato: { tope: 400 * 1024, ladoMinimo: 96, calidad: 0.82, tolerancia: "segun-ruido", platos: true },
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
    const r = quitarFondo(pixeles, { ladoMinimo: lim.ladoMinimo, tolerancia: lim.tolerancia, platos: lim.platos });
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

// ── Íconos propios del negocio («Mis íconos», 16-nov) ─────────────────────
//
// La foto de un producto que el negocio sube para usarla de ícono. Sale
// SIEMPRE como un cuadrado de 512 px, igual en la web y en la app (contrato
// §1.5), para que se vea parejo al lado de los del catálogo:
// - Sin fondo (se pudo sacar, o el PNG ya venía recortado): el producto
//   recortado y centrado con 32 px de aire por lado, sobre transparente. Es el
//   formato de las fotos del catálogo (las bebidas de marca, los vasos).
// - Con fondo (no se pudo sacar o el dueño eligió dejarlo): el cuadrado del
//   centro de la foto, con las esquinas redondeadas horneadas. Así se ve como
//   un ícono en el POS, la TV y la página sin tocar ningún lugar que lo dibuja.

/** El lienzo del ícono propio. */
export const LADO_ICONO = 512;
/** El aire alrededor del producto sin fondo (el de las fotos del catálogo). */
export const MARGEN_ICONO = 32;
/** El redondeo de las esquinas de la foto con fondo. */
export const RADIO_ICONO = 92;
/** Lo que acepta el backend por ícono. */
export const TOPE_ICONO = 300 * 1024;
/** El backend rechaza un ícono con un lado de menos de 96 px; tampoco se acepta un original así. */
export const LADO_MINIMO_ICONO = 96;
/**
 * A cuánto se achica la foto antes de buscarle el fondo. El producto termina
 * en 448 px: con 1024 de trabajo sobra detalle aunque ocupe media foto, y la
 * varita no se arrastra con los 12 megapíxeles de un celular.
 */
const LADO_TRABAJO_ICONO = 1024;
/** Menos opaco que esto cuenta como vacío (lo mismo que mira `quitarFondo`). */
const ALFA_VACIO_ICONO = 32;

/**
 * Cómo se le busca el fondo a la foto de un producto (probado con fotos de
 * botellas, latas y vasos, 16-nov):
 * - La tolerancia fina (`segun-ruido`): con la del logo se iban el cuello de
 *   vidrio de una botella y el canto de una lata blanca sobre blanco.
 * - `soloFondoLiso`: un vaso sobre una mesa de madera salía con la madera
 *   borrada a parches. Así queda como foto (con fondo), que se ve bien.
 * - Sin `platos`: un vaso o una botella no es un plato, y buscarle el canto
 *   redondo no aporta nada (y tarda el doble).
 * Una botella de agua transparente sale agujereada, como en el catálogo: para
 * eso está el «Sacarle el fondo» apagado.
 */
const FONDO_ICONO: OpcionesFondo = { tolerancia: "segun-ruido", soloFondoLiso: true };

/** La foto achicada para trabajarla: hasta 1024 de lado mayor, nunca agrandada. */
export function medidasDeTrabajo(ancho: number, alto: number, maximo = LADO_TRABAJO_ICONO): { ancho: number; alto: number } {
  const escala = Math.min(1, maximo / Math.max(ancho, alto));
  return { ancho: Math.max(1, Math.round(ancho * escala)), alto: Math.max(1, Math.round(alto * escala)) };
}

/**
 * Si el borde de la imagen está casi todo vacío: un PNG que ya viene sin fondo.
 * El mismo criterio que `quitarFondo` usa para el "ya-transparente".
 */
export function bordeVacio(p: Pixeles): boolean {
  const { data: d, width: ancho, height: alto } = p;
  if (ancho === 0 || alto === 0) return false;
  let total = 0;
  let vacios = 0;
  const mirar = (x: number, y: number) => {
    total++;
    if (d[(y * ancho + x) * 4 + 3] <= ALFA_VACIO_ICONO) vacios++;
  };
  for (let x = 0; x < ancho; x++) {
    mirar(x, 0);
    if (alto > 1) mirar(x, alto - 1);
  }
  for (let y = 1; y < alto - 1; y++) {
    mirar(0, y);
    if (ancho > 1) mirar(ancho - 1, y);
  }
  return vacios >= total / 2;
}

/**
 * La caja justa de lo que tiene dibujo (sin margen: el aire lo pone
 * `encajarEnIcono`). Null si no hay nada.
 */
export function cajaDelDibujo(p: Pixeles): Recorte | null {
  const { data: d, width: ancho, height: alto } = p;
  let x0 = ancho;
  let y0 = alto;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      if (d[(y * ancho + x) * 4 + 3] > ALFA_VACIO_ICONO) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, ancho: x1 - x0 + 1, alto: y1 - y0 + 1 };
}

/**
 * Dónde va el producto recortado dentro del lienzo: lo más grande que entre
 * dejando el margen, centrado, sin deformarlo. Uno chico se agranda: todos los
 * íconos tienen que verse del mismo tamaño en la grilla del POS.
 */
export function encajarEnIcono(ancho: number, alto: number): Recorte {
  const util = LADO_ICONO - 2 * MARGEN_ICONO;
  const escala = util / Math.max(ancho, alto, 1);
  const w = Math.max(1, Math.round(ancho * escala));
  const h = Math.max(1, Math.round(alto * escala));
  return { x: Math.round((LADO_ICONO - w) / 2), y: Math.round((LADO_ICONO - h) / 2), ancho: w, alto: h };
}

/** El cuadrado del centro de la foto ("cover"): lo que se ve de una foto con fondo. */
export function cuadradoDelCentro(ancho: number, alto: number): Recorte {
  const lado = Math.min(ancho, alto);
  return { x: Math.round((ancho - lado) / 2), y: Math.round((alto - lado) / 2), ancho: lado, alto: lado };
}

/** Un cuadrado de esquinas redondeadas (con `arcTo`: `roundRect` no está en todos los navegadores). */
function trazarRedondeado(ctx: CanvasRenderingContext2D, lado: number, radio: number) {
  ctx.beginPath();
  ctx.moveTo(radio, 0);
  ctx.arcTo(lado, 0, lado, lado, radio);
  ctx.arcTo(lado, lado, 0, lado, radio);
  ctx.arcTo(0, lado, 0, 0, radio);
  ctx.arcTo(0, 0, lado, 0, radio);
  ctx.closePath();
}

export interface ImagenIcono extends ImagenSinFondo {
  /**
   * Ya venía sin fondo (un PNG recortado): sale sin fondo aunque se pida
   * dejarlo, porque no hay fondo que dejar, y el cuadrado del centro le
   * cortaría los costados a una botella.
   */
  yaSinFondo: boolean;
}

/**
 * El ícono propio listo para subir (contrato §1.5): 512 × 512, en WebP con
 * transparencia y, donde el navegador no sabe hacer WebP (Safari), en PNG
 * achicado hasta entrar en los 300 KB del backend. `fondoQuitado` dice si
 * salió sin fondo: si se pidió sacarlo y es false, no se pudo (una foto sobre
 * la mesa) y quedó como foto.
 */
export async function prepararIcono(archivo: File, sacarFondo: boolean): Promise<ImagenIcono> {
  if (!archivo.type.startsWith("image/")) throw new Error("Elegí una imagen (PNG, JPG o WebP).");
  if (archivo.size > TOPE_ORIGINAL) throw new Error("La imagen pesa más de 10 MB.");
  const img = await cargar(archivo);
  const ancho = img.naturalWidth;
  const alto = img.naturalHeight;
  if (Math.min(ancho, alto) < LADO_MINIMO_ICONO) {
    throw new Error(`La imagen es muy chica: tiene que medir al menos ${LADO_MINIMO_ICONO} px de cada lado.`);
  }

  const t = medidasDeTrabajo(ancho, alto);
  const trabajo = document.createElement("canvas");
  trabajo.width = t.ancho;
  trabajo.height = t.alto;
  const ctxTrabajo = trabajo.getContext("2d", { willReadFrequently: true });
  if (!ctxTrabajo) throw new Error("Tu navegador no pudo procesar la imagen.");
  ctxTrabajo.imageSmoothingQuality = "high";
  ctxTrabajo.drawImage(img, 0, 0, t.ancho, t.alto);
  const pixeles = ctxTrabajo.getImageData(0, 0, t.ancho, t.alto);

  const yaSinFondo = bordeVacio(pixeles);
  let sinFondo = yaSinFondo;
  if (!yaSinFondo && sacarFondo && quitarFondo(pixeles, FONDO_ICONO).tipo !== "sin-cambios") {
    ctxTrabajo.putImageData(pixeles, 0, 0);
    sinFondo = true;
  }

  const icono = document.createElement("canvas");
  icono.width = LADO_ICONO;
  icono.height = LADO_ICONO;
  const ctx = icono.getContext("2d");
  if (!ctx) throw new Error("Tu navegador no pudo procesar la imagen.");
  ctx.imageSmoothingQuality = "high";
  if (sinFondo) {
    const caja = cajaDelDibujo(pixeles) ?? { x: 0, y: 0, ancho: t.ancho, alto: t.alto };
    const destino = encajarEnIcono(caja.ancho, caja.alto);
    ctx.drawImage(trabajo, caja.x, caja.y, caja.ancho, caja.alto, destino.x, destino.y, destino.ancho, destino.alto);
  } else {
    // Del original y no de la copia achicada: la foto con fondo llena el lienzo entero.
    const q = cuadradoDelCentro(ancho, alto);
    ctx.drawImage(img, q.x, q.y, q.ancho, q.alto, 0, 0, LADO_ICONO, LADO_ICONO);
    // Las esquinas: se borra lo de afuera con un relleno (suavizado en todos
    // los navegadores; un `clip` queda serruchado en algunos).
    ctx.globalCompositeOperation = "destination-in";
    trazarRedondeado(ctx, LADO_ICONO, RADIO_ICONO);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  }

  return { blob: await blobDeIcono(icono), fondoQuitado: sinFondo, yaSinFondo };
}

/**
 * WebP (con transparencia: las esquinas y el fondo quitado); si se pasa del
 * tope, con menos calidad. Donde el navegador no exporta WebP, PNG: el JPG
 * pintaría de negro lo transparente.
 */
async function blobDeIcono(canvas: HTMLCanvasElement): Promise<Blob> {
  for (const calidad of [0.9, 0.8, 0.7]) {
    const blob = await blobDe(canvas, "image/webp", calidad);
    if (!blob || blob.type !== "image/webp") break;
    if (blob.size <= TOPE_ICONO) return blob;
  }
  const png = await pngQueEntre(canvas, TOPE_ICONO, LADO_MINIMO_ICONO);
  if (!png) throw new Error("Tu navegador no pudo procesar la imagen.");
  return png;
}
