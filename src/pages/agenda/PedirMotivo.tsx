import { useState, type ReactNode } from "react";
import { Chips } from "../../components/filtros";
import { Boton, ErrorMsg, Input, Modal } from "../../components/ui";

/**
 * Motivo de una cancelación o de un "sin cargo". Queda en la bitácora de la
 * cita: el quién y el cuándo los pone el backend, el porqué sólo lo sabe quien
 * está en el mostrador. Empieza sin nada marcado a propósito, como al anular
 * una venta: un motivo elegido de antemano se confirmaría sin leerlo.
 */
export default function PedirMotivo({
  titulo,
  texto,
  motivos,
  etiquetaOk,
  peligroso,
  faltaMotivo = "Elegí el motivo: queda guardado en la cita.",
  validar,
  children,
  onCancelar,
  onConfirmar,
}: {
  titulo: string;
  texto: string;
  motivos: readonly string[];
  etiquetaOk: string;
  peligroso?: boolean;
  /** El aviso si no se eligió motivo: dice dónde queda (la cita, la ficha…). */
  faltaMotivo?: string;
  /** Lo que pida quien lo usa además del motivo; devuelve el error o null. */
  validar?: () => string | null;
  /** Algo más para elegir arriba de los motivos (por ejemplo, cuáles fotos). */
  children?: ReactNode;
  onCancelar: () => void;
  onConfirmar: (motivo: string) => Promise<void> | void;
}) {
  const [motivo, setMotivo] = useState("");
  const [detalle, setDetalle] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function ok() {
    const otroError = validar?.();
    if (otroError) return setError(otroError);
    if (!motivo) return setError(faltaMotivo);
    if (motivo === "Otro" && detalle.trim().length < 3) return setError("Contá en pocas palabras qué pasó.");
    const texto = motivo === "Otro" ? detalle.trim() : [motivo, detalle.trim()].filter(Boolean).join(" · ");
    setEnviando(true);
    try {
      await onConfirmar(texto);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      abierto
      titulo={titulo}
      onClose={onCancelar}
      ancho="max-w-sm"
      cerrarAlClicAfuera={false}
      acciones={
        <>
          <Boton variante="ghost" onClick={onCancelar} disabled={enviando}>
            Volver
          </Boton>
          <Boton variante={peligroso ? "danger" : "primary"} onClick={ok} disabled={enviando}>
            {enviando ? "Un momento…" : etiquetaOk}
          </Boton>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-[13px] text-texto-2">{texto}</p>
        {children}
        <Chips valor={motivo} opciones={motivos.map((m) => [m, m] as const)} onChange={setMotivo} />
        <Input
          value={detalle}
          onChange={(e) => setDetalle(e.target.value)}
          placeholder={motivo === "Otro" ? "¿Qué pasó?" : "Detalle (opcional)"}
          aria-label="Detalle del motivo"
        />
        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </Modal>
  );
}
