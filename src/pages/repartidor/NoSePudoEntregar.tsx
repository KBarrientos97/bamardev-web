import { useState } from "react";
import { Icon } from "../../components/Icon";
import { Boton, ErrorMsg, Modal } from "../../components/ui";
import { api } from "../../lib/api";
import {
  cuerpoNoEntregado,
  MAX_NOTA_ENTREGA_FALLIDA,
  MOTIVOS_ENTREGA_FALLIDA,
  TEXTO_MOTIVO,
  type MotivoEntregaFallida,
} from "../../lib/entregaFallida";

/**
 * «No se pudo entregar» (20-nov, regla del dueño): el repartidor ya no cancela
 * un pedido —cancelar anula la venta y devuelve el stock, y eso lo decide la
 * caja—. Avisa por qué no pudo y el pedido queda en espera.
 *
 * Es la hoja de siempre (`Modal`: desde abajo en el celular, se baja con el
 * dedo). Los motivos van como opciones grandes y no como un desplegable: se
 * elige con el pulgar, parado en la vereda. No se cierra con un toque afuera:
 * con la nota a medio escribir, un roce la borraba.
 */
export default function NoSePudoEntregar({
  ventaId,
  cliente,
  onClose,
  onAvisado,
}: {
  ventaId: number;
  cliente: string;
  onClose: () => void;
  /** Ya quedó en espera: la lista se refresca. */
  onAvisado: () => void;
}) {
  const [motivo, setMotivo] = useState<MotivoEntregaFallida | null>(null);
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  async function avisar() {
    if (enviando) return;
    setError("");
    if (!motivo) return setError("Elegí por qué no se pudo entregar.");
    const armado = cuerpoNoEntregado(motivo, nota);
    if ("error" in armado) return setError(armado.error);
    setEnviando(true);
    try {
      await api.noEntregado(ventaId, armado.body);
      onAvisado();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo avisar a la caja");
      setEnviando(false);
    }
  }

  return (
    <Modal
      abierto
      titulo="No se pudo entregar"
      subtitulo={cliente}
      onClose={onClose}
      ancho="max-w-sm"
      cerrarAlClicAfuera={false}
      acciones={
        <>
          <Boton variante="ghost" className="min-h-11 flex-1 sm:flex-none" onClick={onClose} disabled={enviando}>
            Volver
          </Boton>
          <Boton className="min-h-11 flex-1 sm:flex-none" onClick={avisar} disabled={enviando || !motivo}>
            {enviando ? "Avisando…" : "Avisar a la caja"}
          </Boton>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-[13px] text-texto-2">La caja decide si lo volvés a intentar, lo lleva otro o se cancela.</p>
        <div role="radiogroup" aria-label="Por qué no se pudo entregar" className="space-y-2">
          {MOTIVOS_ENTREGA_FALLIDA.map((m) => {
            const elegido = motivo === m;
            return (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={elegido}
                onClick={() => {
                  setMotivo(m);
                  setError("");
                }}
                className={`flex min-h-12 w-full items-center gap-3 rounded-xl border-[1.5px] px-3.5 py-3 text-left text-sm font-semibold transition-[transform,background-color,border-color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] motion-reduce:active:scale-100 ${
                  elegido ? "border-primary bg-primary-50 text-primary-700" : "border-borde bg-white text-texto-2 hover:bg-muted"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                    elegido ? "border-primary-boton bg-primary-boton text-white" : "border-borde"
                  }`}
                >
                  {elegido && <Icon name="check" size={12} />}
                </span>
                {TEXTO_MOTIVO[m]}
              </button>
            );
          })}
        </div>
        {motivo && (
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-semibold text-texto-2">
              {motivo === "OTRO" ? "¿Qué pasó?" : "Nota para la caja (opcional)"}
            </span>
            <textarea
              rows={2}
              value={nota}
              maxLength={MAX_NOTA_ENTREGA_FALLIDA}
              onChange={(e) => setNota(e.target.value)}
              placeholder={motivo === "OTRO" ? "Contalo en pocas palabras" : "Por ejemplo: toqué el timbre dos veces"}
              className="w-full rounded-xl border border-borde bg-white px-3.5 py-2.5 text-base text-texto outline-none focus:border-primary focus:ring-2 focus:ring-primary-100 sm:text-sm"
            />
          </label>
        )}
        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </Modal>
  );
}
