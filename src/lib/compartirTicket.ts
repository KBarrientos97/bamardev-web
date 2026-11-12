/**
 * Comparte un ticket como IMAGEN, igual que la app.
 *
 * Por qué imagen y no PDF ni texto: es la decisión que ya tomó Android
 * (`Comprobante.compartir`). Un PDF, con un lector tipo WPS por defecto, se
 * subía a *su* nube y mandaba un link en vez del comprobante; el texto plano
 * pierde el formato del ticket. Una imagen se abre en cualquier teléfono y se
 * ve igual que el papel.
 *
 * El navegador sólo deja compartir archivos desde un gesto del usuario y en
 * contexto seguro (https), así que hay que llamarlo desde el onClick del botón.
 */

/** Escala del render: 2x para que el ticket no se vea borroso en el celular. */
const ESCALA = 2;

export type ResultadoCompartir =
  | { ok: true; motivo?: undefined }
  | { ok: false; motivo: "cancelado" | "no_soportado" | "error" };

/** `true` si este equipo puede compartir archivos (móviles, casi ningún escritorio). */
export function puedeCompartirImagen(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function"
  );
}

/**
 * Rasteriza `nodo` y abre el diálogo de compartir del sistema.
 *
 * Con `texto` (el mensaje del recibo, con el enlace al estado de cuenta) va la
 * imagen Y el texto en el mismo envío (Drick, 08-nov: "la imagen y el link, no
 * sólo uno"): WhatsApp en Android lo manda como foto con el texto de pie. Si
 * el equipo no acepta las dos cosas juntas, va sólo la imagen.
 *
 * Si el equipo no puede compartir archivos, baja la imagen: en un escritorio es
 * lo más parecido que hay, y deja al cajero adjuntarla a mano. Con `texto`,
 * además lo copia, para pegarlo junto a la imagen.
 */
export async function compartirComoImagen(
  nodo: HTMLElement,
  nombre: string,
  texto?: string,
): Promise<ResultadoCompartir> {
  const blob = await rasterizar(nodo);
  if (!blob) return { ok: false, motivo: "error" };

  const archivo = new File([blob], `${nombre}.png`, { type: "image/png" });

  if (puedeCompartirImagen() && navigator.canShare({ files: [archivo] })) {
    const conTexto = !!texto && navigator.canShare({ files: [archivo], text: texto });
    try {
      await navigator.share(conTexto ? { files: [archivo], text: texto, title: nombre } : { files: [archivo], title: nombre });
      return { ok: true };
    } catch (e) {
      // Cancelar el diálogo del sistema no es un error que mostrar.
      const cancelado = e instanceof DOMException && e.name === "AbortError";
      return { ok: false, motivo: cancelado ? "cancelado" : "error" };
    }
  }

  // Sin soporte para compartir archivos: se descarga (y el texto, al portapapeles).
  descargar(blob, nombre);
  if (texto) await copiar(texto);
  return { ok: false, motivo: "no_soportado" };
}

/**
 * "Enviar por WhatsApp" con la imagen del recibo y el mensaje (Drick, 08-nov).
 *
 * En el celular, el diálogo de compartir con las dos cosas juntas (ahí se
 * elige WhatsApp y el chat). En la compu `wa.me` no puede adjuntar archivos:
 * se abre el chat de quien pagó con el mensaje ya escrito y se baja la imagen
 * para arrastrarla. El chat se abre ANTES de rasterizar, mientras dura el
 * clic: si no, el bloqueador de ventanas lo frena.
 *
 * Se decide por el celular y no por `puedeCompartirImagen`: Chrome en Windows
 * también comparte archivos, y en la PC de la recepción abría el diálogo de
 * Windows en vez del chat del estudiante (visto en QA el 08-nov).
 */
export async function enviarPorWhatsapp(
  nodo: HTMLElement,
  nombre: string,
  texto: string,
  urlWhatsapp: string,
): Promise<ResultadoCompartir> {
  if (esCelular() && puedeCompartirImagen()) return compartirComoImagen(nodo, nombre, texto);
  window.open(urlWhatsapp, "_blank", "noopener,noreferrer");
  const blob = await rasterizar(nodo);
  if (!blob) return { ok: false, motivo: "error" };
  descargar(blob, nombre);
  return { ok: false, motivo: "no_soportado" };
}

/** Un teléfono (o tablet Android). El iPad se presenta como Mac: va por el camino de la compu. */
export function esCelular(): boolean {
  if (typeof navigator === "undefined") return false;
  const datos = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData;
  if (typeof datos?.mobile === "boolean") return datos.mobile;
  return /Android|iPhone|iPod|Mobile/i.test(navigator.userAgent);
}

async function rasterizar(nodo: HTMLElement): Promise<Blob | null> {
  try {
    // Import dinámico: la librería son ~45 KB que sólo hacen falta al tocar
    // "Compartir". Cargarla en el bundle principal se la haría bajar a todos
    // los cajeros en cada visita, incluidos los que nunca comparten un ticket.
    const { toBlob } = await import("html-to-image");
    return await toBlob(nodo, {
      pixelRatio: ESCALA,
      // Fondo blanco explícito: el ticket es transparente y sin esto sale
      // negro en los visores que ponen fondo oscuro.
      backgroundColor: "#ffffff",
      // El botonera y todo lo marcado como print:hidden no va en el papel
      // tampoco acá: es el mismo comprobante.
      filter: (el) =>
        !(el instanceof HTMLElement && el.classList.contains("print:hidden")),
    });
  } catch {
    return null;
  }
}

function descargar(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nombre}.png`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Al portapapeles; si el navegador no deja, no pasa nada: la imagen ya bajó. */
async function copiar(texto: string) {
  try {
    await navigator.clipboard?.writeText(texto);
  } catch {
    // Sin permiso o sin https: se sigue.
  }
}
