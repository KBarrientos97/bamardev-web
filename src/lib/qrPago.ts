import { api } from "./api";

/**
 * QR de cobro del negocio: la imagen que el dueño sube y que se le muestra al
 * cliente cuando paga por QR o transferencia.
 *
 * Port de `QrPago.kt` (Android). El original vive en el backend (`/qr-cobro`):
 * lo sube quien abre la caja y lo bajan todos los equipos del negocio. Lo que
 * guarda este archivo en localStorage es la copia del equipo, que es la que se
 * muestra: así el cobro no depende de que el backend conteste en ese momento.
 *
 * Antes vivía SÓLO en el equipo y cada navegador lo cargaba por separado: el
 * mesero, que nunca abre la caja, nunca lo tenía.
 *
 * La clave lleva el alias del negocio para que un equipo que cambia de cliente
 * no le muestre a uno el QR del otro.
 */

const PREFIJO = "bamardev.qr.cobro";
/** El equipo recibió el QR del backend al menos una vez (ver sincronizarQr). */
const PREFIJO_SINCRONIZADO = "bamardev.qr.cobro.sincronizado";

/**
 * Lado máximo. Una foto de 12 MP no hace al QR más escaneable, y la imagen
 * viaja al backend, que acepta hasta 90 000 caracteres: 600 px alcanzan de
 * sobra para que escanee.
 */
const LADO_MAX = 600;

/** Largo máximo del data URL, con margen bajo el tope del backend. */
const LARGO_MAX = 85_000;

/** Calidades a probar, de mejor a peor, hasta que la imagen entre en el tope. */
const CALIDADES = [0.85, 0.75, 0.65, 0.55, 0.45];

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

/** Borra la copia del equipo: el cobro vuelve a decir que no hay QR. */
export function borrarQr(alias: string | null | undefined): void {
  try {
    localStorage.removeItem(clave(alias));
  } catch {
    /* sin storage no hay nada que borrar */
  }
}

function marcarSincronizado(alias: string | null | undefined): void {
  try {
    localStorage.setItem(`${PREFIJO_SINCRONIZADO}_${alias || "sin_negocio"}`, "1");
  } catch {
    /* sin storage se vuelve a sincronizar la próxima vez, no pasa nada */
  }
}

function yaSincronizado(alias: string | null | undefined): boolean {
  try {
    return localStorage.getItem(`${PREFIJO_SINCRONIZADO}_${alias || "sin_negocio"}`) === "1";
  } catch {
    return false;
  }
}

/**
 * Trae el QR del backend y lo deja como copia del equipo. Devuelve el QR con
 * que quedó el equipo. Sin internet sigue con la copia que tenía.
 *
 * `puedeSubir`: si quien mira maneja la caja (no el mesero ni el repartidor).
 */
export async function sincronizarQr(
  alias: string | null | undefined,
  puedeSubir: boolean,
): Promise<string | null> {
  let remoto: string | null;
  try {
    remoto = (await api.qrCobro()).imagen;
  } catch {
    return leerQr(alias);
  }
  if (remoto) {
    try {
      localStorage.setItem(clave(alias), remoto);
      marcarSincronizado(alias);
    } catch {
      /* sin storage se muestra igual lo que vino, abajo */
      return remoto;
    }
  } else if (yaSincronizado(alias)) {
    // Este equipo ya lo había recibido: alguien lo quitó a propósito, y
    // seguir mostrando la copia sería cobrar a una cuenta dada de baja.
    borrarQr(alias);
  } else if (puedeSubir && leerQr(alias)) {
    // La caja de antes de que el QR viviera en el backend: ya lo tenía
    // cargado. Se sube para que lo reciban los meseros sin volver a elegirlo.
    if ((await subirQr(alias)).ok) marcarSincronizado(alias);
  }
  return leerQr(alias);
}

/** Sube la copia del equipo al backend, para el resto de los equipos. */
export async function subirQr(alias: string | null | undefined): Promise<ResultadoQr> {
  const qr = leerQr(alias);
  if (!qr) return { ok: false, error: "No hay QR para compartir." };
  try {
    await api.subirQrCobro(qr);
    marcarSincronizado(alias);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo compartir el QR.",
    };
  }
}

/** Lo quita para todos los equipos del negocio, no sólo de éste. */
export async function quitarQrDelNegocio(): Promise<ResultadoQr> {
  try {
    await api.borrarQrCobro();
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo quitar el QR de los otros equipos.",
    };
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
        ? "La imagen es muy pesada. Probá con una captura del QR solo, sin el resto de la pantalla."
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
      for (const calidad of CALIDADES) {
        const dataUrl = canvas.toDataURL("image/jpeg", calidad);
        if (dataUrl.length <= LARGO_MAX) return resolver(dataUrl);
      }
      rechazar(new DOMException("imagen muy pesada", "QuotaExceededError"));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      rechazar(new Error("imagen ilegible"));
    };
    img.src = url;
  });
}
