import { useState } from "react";
import { Boton } from "../../components/ui";
import type { EntregaPdf } from "../../lib/pdf/tablaPdf";
import DialogoWhatsapp, { type EnvioPorWhatsapp } from "./DialogoWhatsapp";

/**
 * «Descargar PDF» y «Enviar por WhatsApp» de nutrición: la tarjeta «Semanas»
 * del seguimiento (CONTRATO-nutricion-seguimiento-23nov §7.2) y la tarjeta
 * «Controles» de la evaluación (CONTRATO-nutricion-evaluacion-22nov §6.1).
 * Con poder ver alcanza. «Descargar PDF»: en el teléfono y la tablet, el
 * diálogo de compartir del equipo; en la PC, «Guardar como» o la descarga.
 *
 * «Enviar por WhatsApp» abre `DialogoWhatsapp` (26-nov-2026): el número de la
 * ficha y el botón de enviar, que abre el chat de ese número; `whatsapp` trae
 * lo que el diálogo necesita (el teléfono, el paciente, el mensaje, el nombre
 * del archivo y cómo armarlo).
 */
export default function BotonesPdf({
  listo,
  descargar,
  whatsapp,
  onAviso,
  onError,
}: {
  /** El aviso al terminar la descarga: «PDF del seguimiento listo.» */
  listo: string;
  descargar: () => Promise<EntregaPdf>;
  whatsapp: EnvioPorWhatsapp;
  onAviso: (texto: string) => void;
  onError: (texto: string) => void;
}) {
  const [armando, setArmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  async function bajar() {
    if (armando) return;
    setArmando(true);
    onError("");
    try {
      const r = await descargar();
      if (r === "guardado" || r === "descargado") onAviso(listo);
    } catch {
      onError("No se pudo armar el PDF. Probá de nuevo.");
    } finally {
      setArmando(false);
    }
  }
  // En el teléfono, cortos: los dos entran en un renglón.
  return (
    <>
      <Boton variante="ghost" icono="download" aria-label="Descargar PDF" className="min-h-11 lg:min-h-10" disabled={armando} onClick={() => void bajar()}>
        {armando ? (
          "Armando…"
        ) : (
          <>
            <span className="sm:hidden">PDF</span>
            <span className="max-sm:hidden">Descargar PDF</span>
          </>
        )}
      </Boton>
      <Boton
        variante="ghost"
        icono="whatsapp"
        aria-label="Enviar por WhatsApp"
        aria-haspopup="dialog"
        className="min-h-11 lg:min-h-10"
        disabled={armando}
        onClick={() => {
          onError("");
          setEnviando(true);
        }}
      >
        <span className="sm:hidden">WhatsApp</span>
        <span className="max-sm:hidden">Enviar por WhatsApp</span>
      </Boton>
      {/* Montado sólo mientras está abierto: cada vez arranca con el número de la ficha, sin recordar otro. */}
      {enviando && <DialogoWhatsapp envio={whatsapp} onCerrar={() => setEnviando(false)} onAviso={onAviso} onError={onError} />}
    </>
  );
}
