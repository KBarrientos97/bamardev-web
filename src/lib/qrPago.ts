/**
 * QR de cobro del negocio: la imagen que el dueño sube y que se le muestra al
 * cliente cuando paga por QR o transferencia.
 *
 * Port de `QrPago.kt` (Android). Igual que allá, vive en el DISPOSITIVO y no en
 * el backend: no depende de que el turno esté abierto ni de qué cajero entró, y
 * se sube una vez por equipo. Por eso tampoco se borra al cerrar sesión — es
 * configuración de la máquina, como la impresora.
 *
 * La contrapartida de guardarlo local: cada navegador lo carga por separado. Es
 * el mismo comportamiento que la app, donde cada tablet sube el suyo.
 *
 * La clave lleva el alias del negocio para que un equipo que cambia de cliente
 * no le muestre a uno el QR del otro (lo que `CambioDeNegocio` resuelve en la
 * app borrando los datos del negocio anterior).
 */

const PREFIJO = "bamardev.qr.cobro";

/**
 * Lado máximo al guardar. Una foto de 12 MP no hace al QR más escaneable y sí
 * llena la cuota de localStorage, que ronda los 5 MB por origen.
 */
const LADO_MAX = 900;

/** Calidad del JPEG/WebP resultante: suficiente para que el QR escanee bien. */
const CALIDAD = 0.85;

function clave(alias: string | null | undefined): string {
  return `${PREFIJO}_${alias || "sin_negocio"}`;
}

/** El QR guardado en este equipo como data URL, o null si no hay ninguno. */
export function leerQr(alias: string | null | undefined): string | null {
  try {
    return localStorage.getItem(clave(alias));
  } catch {
    return null;
  }
}

/** `true` si el negocio ya cargó su QR en este dispositivo. */
export function hayQr(alias: string | null | undefined): boolean {
  return leerQr(alias) !== null;
}

/** Borra el QR guardado: el cobro vuelve a mostrar el marcador de ejemplo. */
export function borrarQr(alias: string | null | undefined): void {
  try {
    localStorage.removeItem(clave(alias));
  } catch {
    /* sin storage no hay nada que borrar */
  }
}

export type ResultadoQr = { ok: true; error?: undefined } | { ok: false; error: string };

/**
 * Guarda la imagen elegida, reescalada.
 *
 * Se reescala antes de guardar porque una foto de celular son varios MB en
 * base64 y localStorage se llena: al día siguiente el cobro se quedaría sin QR
 * y sin aviso. Devuelve el motivo cuando falla para poder mostrarlo.
 */
export async function guardarQr(
  alias: string | null | undefined,
  archivo: File,
): Promise<ResultadoQr> {
  if (!archivo.type.startsWith("image/")) {
    return { ok: false, error: "Elegí una imagen (PNG o JPG)." };
  }
  try {
    const dataUrl = await reescalar(archivo);
    localStorage.setItem(clave(alias), dataUrl);
    return { ok: true };
  } catch (e) {
    // La cuota llena es el fallo esperable, y decir "no se pudo" a secas deja
    // al dueño sin saber que el problema es el tamaño.
    const lleno = e instanceof DOMException && e.name.includes("Quota");
    return {
      ok: false,
      error: lleno
        ? "La imagen es muy pesada para guardarla en este equipo. Probá con una más chica."
        : "No se pudo leer la imagen. Probá con otro archivo.",
    };
  }
}

/** Dibuja la imagen en un canvas del tamaño tope y la devuelve como data URL. */
function reescalar(archivo: File): Promise<string> {
  return new Promise((resolver, rechazar) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const escala = Math.min(1, LADO_MAX / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * escala);
      canvas.height = Math.round(img.height * escala);
      const ctx = canvas.getContext("2d");
      if (!ctx) return rechazar(new Error("sin canvas"));
      // Fondo blanco: un QR con transparencia sobre fondo oscuro no escanea.
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolver(canvas.toDataURL("image/jpeg", CALIDAD));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      rechazar(new Error("imagen ilegible"));
    };
    img.src = url;
  });
}
