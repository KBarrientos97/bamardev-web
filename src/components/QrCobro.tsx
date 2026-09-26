import { useEffect, useRef, useState } from "react";
import {
  borrarQr,
  guardarQr,
  leerQr,
  quitarQrDelNegocio,
  sincronizarQr,
  subirQr,
} from "../lib/qrPago";
import { useAuth } from "../store/AuthContext";
import type { Rol } from "../types";
import { Icon } from "./Icon";
import { ErrorMsg, Modal } from "./ui";

/** Quién maneja la caja y puede cambiar el QR. Tiene que coincidir con el backend. */
function puedeCambiarQr(rol: Rol | undefined): boolean {
  return rol === "ADMIN" || rol === "SUPERVISOR" || rol === "CAJERO";
}

/**
 * Carga del QR de cobro del negocio. Va en la apertura de caja, igual que en la
 * app: es el momento en que alguien está configurando el turno.
 *
 * Se sube al backend y lo reciben todos los equipos del negocio (ver
 * `qrPago.ts`). Antes quedaba sólo en este equipo y el mesero nunca lo tenía.
 */
export function CargarQrCobro() {
  const { negocio, usuario } = useAuth();
  const alias = negocio?.alias;
  const [qr, setQr] = useState<string | null>(() => leerQr(alias));
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);

  // Si otro equipo ya lo subió, se muestra ése: no hay que volver a elegirlo.
  useEffect(() => {
    let vivo = true;
    void sincronizarQr(alias, puedeCambiarQr(usuario?.rol)).then((q) => {
      if (vivo) setQr(q);
    });
    return () => {
      vivo = false;
    };
  }, [alias, usuario?.rol]);

  async function elegir(archivo: File | undefined) {
    if (!archivo) return;
    setError("");
    const res = await guardarQr(alias, archivo);
    if (res.ok) {
      setQr(leerQr(alias));
      // Si no sube (sin señal), en este equipo igual queda y se cobra; se
      // avisa para que se sepa que los meseros todavía no lo tienen.
      const subida = await subirQr(alias);
      if (!subida.ok) {
        setError(
          `El QR quedó en este equipo, pero no se pudo compartir con los meseros: ${subida.error}`,
        );
      }
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
          <p className="mt-1 text-xs text-texto-4">
            Lo reciben también los meseros y el reparto.
          </p>

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
                onClick={async () => {
                  borrarQr(alias);
                  setQr(null);
                  // Quitarlo acá y dejarlo en los celulares de los meseros
                  // sería seguir cobrando a una cuenta dada de baja.
                  const res = await quitarQrDelNegocio();
                  if (!res.ok) setError(res.error);
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
  const { negocio, usuario } = useAuth();
  const alias = negocio?.alias;
  const [qr, setQr] = useState<string | null>(() => leerQr(alias));
  const [ampliado, setAmpliado] = useState(false);
  const puedeCargar = puedeCambiarQr(usuario?.rol);
  const input = useRef<HTMLInputElement>(null);
  const [cargando, setCargando] = useState(false);
  const [errorCarga, setErrorCarga] = useState("");

  async function cargar(archivo: File | undefined) {
    if (!archivo) return;
    setErrorCarga("");
    setCargando(true);
    const res = await guardarQr(alias, archivo);
    if (res.ok) {
      setQr(leerQr(alias));
      const subida = await subirQr(alias);
      if (!subida.ok) {
        setErrorCarga(
          `El QR quedó en este equipo, pero no se pudo compartir con los meseros: ${subida.error}`,
        );
      }
    } else {
      setErrorCarga(res.error);
    }
    setCargando(false);
    if (input.current) input.current.value = "";
  }

  // Se muestra la copia del equipo al instante y se trae la del backend por
  // si la caja la cambió (o, en el equipo del mesero, porque nunca la tuvo).
  useEffect(() => {
    let vivo = true;
    void sincronizarQr(alias, puedeCambiarQr(usuario?.rol)).then((q) => {
      if (vivo) setQr(q);
    });
    return () => {
      vivo = false;
    };
  }, [alias, usuario?.rol]);

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
            {puedeCargar
              ? "Todavía no hay QR del negocio."
              : "Todavía no hay QR del negocio. Lo carga el encargado desde la caja."}
          </span>
          {/* Cargarlo acá mismo. Antes el único lugar era la apertura de caja,
              y con la caja ya abierta no había dónde: en QA llevaba una semana
              abierta y el QR no se podía subir. El mesero no lo ve (no puede
              cambiarlo: ver el modelo QrCobro en el backend). */}
          {puedeCargar && (
            <>
              <button
                type="button"
                onClick={() => input.current?.click()}
                disabled={cargando}
                className="rounded-lg border border-borde bg-white px-3 py-1.5 text-xs font-semibold text-texto-2 hover:bg-white/70"
              >
                {cargando ? "Cargando…" : "Cargar el QR"}
              </button>
              <input
                ref={input}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => cargar(e.target.files?.[0])}
              />
            </>
          )}
        </div>
      )}
      {errorCarga && <ErrorMsg>{errorCarga}</ErrorMsg>}

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
