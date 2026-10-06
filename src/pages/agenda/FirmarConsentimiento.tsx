import { useState } from "react";
import { Boton, Campo, ErrorMsg, Input, Modal } from "../../components/ui";
import { apiSpa } from "../../lib/agenda/apiSpa";
import { mensajeDe } from "../../lib/agenda/apiAgenda";
import type { ConsentimientoFaltante } from "../../lib/agenda/tiposSpa";
import FirmaEnPantalla from "./FirmaEnPantalla";

/**
 * El cliente lee el consentimiento del servicio y firma en la pantalla
 * (tablet o celular de recepción). Se guarda el texto tal como lo leyó, la
 * versión y la firma (§17.3).
 */
export default function FirmarConsentimiento({
  clienteId,
  citaId,
  faltante,
  nombreCliente,
  onClose,
  onFirmado,
}: {
  clienteId: number;
  citaId?: number;
  faltante: ConsentimientoFaltante;
  nombreCliente: string;
  onClose: () => void;
  onFirmado: () => void;
}) {
  const [firmante, setFirmante] = useState(nombreCliente);
  const [firma, setFirma] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    if (!firmante.trim()) return setError("Escribí el nombre de quien firma.");
    if (!firma) return setError("Falta la firma.");
    setGuardando(true);
    setError("");
    try {
      await apiSpa.firmar({
        clienteId,
        servicioId: faltante.servicioId,
        ...(citaId ? { citaId } : {}),
        firmante: firmante.trim(),
        firma,
        version: faltante.version,
      });
      onFirmado();
    } catch (e) {
      setError(mensajeDe(e, "No se pudo guardar la firma"));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      abierto
      titulo={`Consentimiento · ${faltante.servicio}`}
      subtitulo={`Versión ${faltante.version}`}
      onClose={onClose}
      cerrarAlClicAfuera={false}
      ancho="max-w-2xl"
      acciones={
        <>
          <Boton variante="ghost" onClick={onClose} disabled={guardando}>
            Cancelar
          </Boton>
          <Boton onClick={guardar} disabled={guardando || !firma}>
            {guardando ? "Guardando…" : "Firmar"}
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <div className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-xl bg-muted p-3.5 text-sm text-texto-2">
          {faltante.texto}
        </div>
        <Campo label="Quién firma" hint="El cliente, o su tutor si es menor de edad.">
          <Input value={firmante} onChange={(e) => setFirmante(e.target.value)} aria-label="Nombre de quien firma" />
        </Campo>
        <FirmaEnPantalla onCambio={setFirma} />
        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </Modal>
  );
}
