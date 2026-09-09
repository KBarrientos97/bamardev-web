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
 * Si el equipo no puede compartir archivos, baja la imagen: en un escritorio es
 * lo más parecido que hay, y deja al cajero adjuntarla a mano.
 */
export async function compartirComoImagen(
  nodo: HTMLElement,
  nombre: string,
): Promise<ResultadoCompartir> {
  let blob: Blob | null;
  try {
    // Import dinámico: la librería son ~45 KB que sólo hacen falta al tocar
    // "Compartir". Cargarla en el bundle principal se la haría bajar a todos
    // los cajeros en cada visita, incluidos los que nunca comparten un ticket.
    const { toBlob } = await import("html-to-image");
    blob = await toBlob(nodo, {
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
    return { ok: false, motivo: "error" };
  }
  if (!blob) return { ok: false, motivo: "error" };

  const archivo = new File([blob], `${nombre}.png`, { type: "image/png" });

  if (puedeCompartirImagen() && navigator.canShare({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo], title: nombre });
      return { ok: true };
    } catch (e) {
      // Cancelar el diálogo del sistema no es un error que mostrar.
      const cancelado = e instanceof DOMException && e.name === "AbortError";
      return { ok: false, motivo: cancelado ? "cancelado" : "error" };
    }
  }

  // Sin soporte para compartir archivos: se descarga.
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nombre}.png`;
  a.click();
  URL.revokeObjectURL(url);
  return { ok: false, motivo: "no_soportado" };
}
