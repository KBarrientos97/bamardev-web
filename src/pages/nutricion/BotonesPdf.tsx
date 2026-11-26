import { useState } from "react";
import { Boton } from "../../components/ui";
import type { EnvioWhatsapp } from "../../lib/nutricion/pdfComun";
import type { EntregaPdf } from "../../lib/pdf/tablaPdf";

/**
 * «Descargar PDF» y «Enviar por WhatsApp» de nutrición: la tarjeta «Semanas»
 * del seguimiento (CONTRATO-nutricion-seguimiento-23nov §7.2) y la tarjeta
 * «Controles» de la evaluación (CONTRATO-nutricion-evaluacion-22nov §6.1).
 * Con poder ver alcanza. En el teléfono y la tablet, el diálogo de compartir
 * del equipo; en la PC, «Guardar como» o la descarga, y para WhatsApp el chat
 * del paciente (sin mensaje) y el PDF descargado para adjuntar.
 *
 * WhatsApp va directo, sin diálogo propio: el 26-nov-2026 se probó uno con el
 * número de la ficha y, visto en el teléfono, se volvió a esto («directo desde
 * aquí, tanto pc, teléfono o tablets»). Lo que tiene que llegar es el PDF, sin
 * mensaje (por el chat se mandaba el texto solo).
 *
 * `descargar` y `enviar` arman el documento y lo entregan; se llaman en el
 * mismo clic, sin esperas antes (WhatsApp abre el chat antes de armar el PDF:
 * si no, lo frena el bloqueador de ventanas).
 */
export default function BotonesPdf({
  listo,
  descargar,
  enviar,
  onAviso,
  onError,
}: {
  /** El aviso al terminar la descarga: «PDF del seguimiento listo.» */
  listo: string;
  descargar: () => Promise<EntregaPdf>;
  enviar: () => Promise<EnvioWhatsapp>;
  onAviso: (texto: string) => void;
  onError: (texto: string) => void;
}) {
  const [armando, setArmando] = useState<"pdf" | "whatsapp" | null>(null);
  async function hacer(que: "pdf" | "whatsapp") {
    if (armando) return;
    setArmando(que);
    onError("");
    try {
      if (que === "pdf") {
        const r = await descargar();
        if (r === "guardado" || r === "descargado") onAviso(listo);
      } else {
        const r = await enviar();
        if (r === "descargado") onAviso("Se descargó el PDF: adjuntalo en el chat de WhatsApp.");
      }
    } catch {
      onError("No se pudo armar el PDF. Probá de nuevo.");
    } finally {
      setArmando(null);
    }
  }
  // En el teléfono, cortos: los dos entran en un renglón.
  return (
    <>
      <Boton variante="ghost" icono="download" aria-label="Descargar PDF" className="min-h-11 lg:min-h-10" disabled={!!armando} onClick={() => void hacer("pdf")}>
        {armando === "pdf" ? (
          "Armando…"
        ) : (
          <>
            <span className="sm:hidden">PDF</span>
            <span className="max-sm:hidden">Descargar PDF</span>
          </>
        )}
      </Boton>
      <Boton variante="ghost" icono="whatsapp" aria-label="Enviar por WhatsApp" className="min-h-11 lg:min-h-10" disabled={!!armando} onClick={() => void hacer("whatsapp")}>
        {armando === "whatsapp" ? (
          "Armando…"
        ) : (
          <>
            <span className="sm:hidden">WhatsApp</span>
            <span className="max-sm:hidden">Enviar por WhatsApp</span>
          </>
        )}
      </Boton>
    </>
  );
}
