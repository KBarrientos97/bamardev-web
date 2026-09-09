import { useRef, useState } from "react";
import { borrarQr, guardarQr, leerQr } from "../lib/qrPago";
import { useAuth } from "../store/AuthContext";
import { Icon } from "./Icon";
import { ErrorMsg, Modal } from "./ui";

/**
 * Carga del QR de cobro del negocio. Va en la apertura de caja, igual que en la
 * app: es el momento en que alguien está configurando el turno.
 *
 * El QR se guarda en ESTE equipo (ver `qrPago.ts`), así que el texto lo dice —
 * si no, el dueño lo sube en su laptop y no entiende por qué la tablet del
 * mostrador sigue sin mostrarlo.
 */
export function CargarQrCobro() {
  const { negocio } = useAuth();
  const alias = negocio?.alias;
  const [qr, setQr] = useState<string | null>(() => leerQr(alias));
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);

  async function elegir(archivo: File | undefined) {
    if (!archivo) return;
    setError("");
    const res = await guardarQr(alias, archivo);
    if (res.ok) {
      setQr(leerQr(alias));
    } else {
      setError(res.error);
    }
    // Permite volver a elegir el MISMO archivo si el primer intento falló.
    if (input.current) input.current.value = "";
  }

  return (
    <div className="rounded-xl border border-borde p-3.5">
      <div className="flex items-start gap-3">
        {qr ? (
          <img
            src={qr}
            alt="QR de cobro del negocio"
            className="h-16 w-16 shrink-0 rounded-lg border border-borde object-contain"
          />
        ) : (
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-muted text-texto-4">
            <Icon name="qr" size={26} />
          </span>
        )}

        <div className="min-w-0 flex-1">
          <h4 className="text-[13px] font-bold text-texto">QR de cobro</h4>
          <p className="mt-0.5 text-xs text-texto-3">
            {qr
              ? "Se le muestra al cliente cuando paga por QR."
              : "Subí la imagen de tu QR para mostrársela al cliente al cobrar."}
          </p>
          <p className="mt-1 text-xs text-texto-4">Se guarda solo en este equipo.</p>

          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => input.current?.click()}
              className="rounded-lg border border-borde bg-white px-3 py-1.5 text-xs font-semibold text-texto-2 hover:bg-muted"
            >
              {qr ? "Cambiar" : "Subir QR"}
            </button>
            {qr && (
              <button
                type="button"
                onClick={() => {
                  borrarQr(alias);
                  setQr(null);
                }}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-danger-text hover:bg-danger-bg"
              >
                Quitar
              </button>
            )}
          </div>
        </div>
      </div>

      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => elegir(e.target.files?.[0])}
      />

      <ErrorMsg>{error}</ErrorMsg>
    </div>
  );
}

/**
 * El QR que ve el cliente al pagar, con su confirmación manual.
 *
 * La confirmación es el punto: nadie verifica la transferencia por nosotros, y
 * sin este paso la venta se registraba como cobrada por el solo hecho de haber
 * elegido "QR". El cajero mira su banco y recién ahí confirma; hasta entonces
 * el botón de cobrar queda bloqueado, igual que en la app.
 */
export function QrParaCobrar({
  confirmado,
  onConfirmar,
  /** Monto a cobrar, para que el cajero contraste contra lo que le entró. */
  monto,
}: {
  confirmado: boolean;
  onConfirmar: () => void;
  monto?: string;
}) {
  const { negocio } = useAuth();
  const qr = leerQr(negocio?.alias);
  const [ampliado, setAmpliado] = useState(false);

  return (
    <div className="space-y-3">
      {qr ? (
        <button
          type="button"
          onClick={() => setAmpliado(true)}
          className="mx-auto block rounded-xl border border-borde bg-white p-2"
          title="Ampliar"
        >
          <img src={qr} alt="QR de cobro" className="h-44 w-44 object-contain" />
        </button>
      ) : (
        <div className="mx-auto flex h-44 w-44 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-borde bg-muted px-3 text-center">
          <Icon name="qr" size={30} />
          <span className="text-xs text-texto-3">
            Todavía no subiste tu QR. Se carga al abrir la caja.
          </span>
        </div>
      )}

      <button
        type="button"
        onClick={onConfirmar}
        disabled={confirmado}
        className={[
          "flex w-full items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-bold transition-colors",
          confirmado
            ? "border-primary bg-primary-50 text-primary-700"
            : "border-borde bg-white text-texto hover:bg-muted",
        ].join(" ")}
      >
        {confirmado && <Icon name="check" size={17} />}
        {confirmado ? "Pago confirmado" : "Confirmar pago recibido"}
      </button>

      {!confirmado && (
        <p className="text-center text-xs text-texto-3">
          Revisá que el pago{monto ? ` de ${monto}` : ""} haya llegado antes de confirmar.
        </p>
      )}

      {ampliado && qr && (
        <Modal abierto titulo="QR de cobro" onClose={() => setAmpliado(false)} ancho="max-w-sm">
          <div className="p-4">
            <img src={qr} alt="QR de cobro" className="mx-auto w-full max-w-xs object-contain" />
          </div>
        </Modal>
      )}
    </div>
  );
}
