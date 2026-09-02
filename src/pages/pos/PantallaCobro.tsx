import { useMemo, useState } from "react";
import { Icon } from "../../components/Icon";
import { Boton, Campo, ErrorMsg, Input } from "../../components/ui";
import { fmtMoney } from "../../lib/format";
import { tieneFeature } from "../../lib/permisos";
import { useAuth } from "../../store/AuthContext";
import type { FormaPago, PagoInput } from "../../types";

type Metodo = "EFECTIVO" | "QR" | "MIXTO";

/**
 * Las formas de pago se resuelven por NOMBRE: los ids son autoincrementales
 * por negocio, así que el "Efectivo" de un negocio no tiene el mismo id que
 * el de otro.
 */
function buscarForma(formas: FormaPago[], nombre: string): FormaPago | undefined {
  return formas.find((f) => f.nombre.toLowerCase() === nombre.toLowerCase());
}

/** Montos redondos que el cliente suele entregar, por encima del total. */
function sugerenciasEfectivo(total: number): number[] {
  const base = [10, 20, 50, 100, 200];
  const out = new Set<number>();
  // El total exacto siempre sirve: es el caso de "justo".
  out.add(Math.ceil(total * 100) / 100);
  for (const b of base) {
    const redondeado = Math.ceil(total / b) * b;
    if (redondeado > total) out.add(redondeado);
  }
  return [...out].sort((a, b) => a - b).slice(0, 4);
}

export default function PantallaCobro({
  total,
  formasPago,
  onAtras,
  onConfirmar,
  onCredito,
  enviando,
  error,
}: {
  total: number;
  formasPago: FormaPago[];
  onAtras: () => void;
  onConfirmar: (pagos: PagoInput[]) => void;
  /** Sólo se ofrece si el plan incluye fiado. */
  onCredito?: () => void;
  enviando: boolean;
  error: string;
}) {
  const { negocio } = useAuth();
  // El plan puede no incluir QR ni pago mixto: en ese caso sólo hay efectivo.
  const permiteQr = tieneFeature(negocio?.features, "pago_qr_mixto");

  const formaEfectivo = buscarForma(formasPago, "Efectivo");
  const formaQr = buscarForma(formasPago, "QR");

  const [metodo, setMetodo] = useState<Metodo>("EFECTIVO");
  const [recibido, setRecibido] = useState("");
  const [montoQr, setMontoQr] = useState("");
  const [errorLocal, setErrorLocal] = useState("");

  const recibidoNum = Number(recibido) || 0;
  const qrNum = Number(montoQr) || 0;

  // En mixto, el QR cubre una parte y el efectivo el resto.
  const aCubrirEnEfectivo = metodo === "MIXTO" ? Math.max(0, total - qrNum) : total;
  const cambio =
    metodo === "QR" ? 0 : Math.max(0, Math.round((recibidoNum - aCubrirEnEfectivo) * 100) / 100);
  const falta =
    metodo === "QR" ? 0 : Math.max(0, Math.round((aCubrirEnEfectivo - recibidoNum) * 100) / 100);

  const sugerencias = useMemo(() => sugerenciasEfectivo(aCubrirEnEfectivo), [aCubrirEnEfectivo]);

  function confirmar() {
    setErrorLocal("");

    if (metodo === "EFECTIVO") {
      if (!formaEfectivo) return setErrorLocal("El negocio no tiene cargada la forma de pago Efectivo.");
      if (recibidoNum < total)
        return setErrorLocal("Lo recibido no alcanza para cubrir el total.");
      return onConfirmar([
        { formaPagoId: formaEfectivo.id, monto: total, recibido: recibidoNum },
      ]);
    }

    if (metodo === "QR") {
      if (!formaQr) return setErrorLocal("El negocio no tiene cargada la forma de pago QR.");
      return onConfirmar([{ formaPagoId: formaQr.id, monto: total }]);
    }

    // Mixto: se reparte entre QR y efectivo, y la suma tiene que dar el total.
    if (!formaEfectivo || !formaQr)
      return setErrorLocal("Faltan formas de pago cargadas para cobrar mixto.");
    if (qrNum <= 0) return setErrorLocal("Poné cuánto se paga por QR.");
    if (qrNum >= total) return setErrorLocal("Si el QR cubre todo, cobrá con el método QR.");
    if (recibidoNum < aCubrirEnEfectivo)
      return setErrorLocal("El efectivo recibido no cubre lo que falta.");

    onConfirmar([
      { formaPagoId: formaQr.id, monto: qrNum },
      { formaPagoId: formaEfectivo.id, monto: aCubrirEnEfectivo, recibido: recibidoNum },
    ]);
  }

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-lg flex-col">
      <div className="flex items-center gap-2 border-b border-borde bg-white px-4 py-3">
        <button
          onClick={onAtras}
          aria-label="Volver"
          className="rounded-lg p-1.5 text-texto-2 hover:bg-muted"
        >
          <Icon name="arrowLeft" size={20} />
        </button>
        <h1 className="text-[15px] font-bold text-texto">Cobrar</h1>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <div className="rounded-2xl bg-marca p-5 text-center text-white">
          <p className="text-xs font-semibold uppercase tracking-wide opacity-90">
            Total a cobrar
          </p>
          <p className="mt-1 text-4xl font-extrabold tracking-tight">{fmtMoney(total)}</p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <BotonMetodo
            activo={metodo === "EFECTIVO"}
            icono="dollar"
            label="Efectivo"
            onClick={() => setMetodo("EFECTIVO")}
          />
          <BotonMetodo
            activo={metodo === "QR"}
            icono="qr"
            label="QR"
            deshabilitado={!permiteQr}
            onClick={() => setMetodo("QR")}
          />
          <BotonMetodo
            activo={metodo === "MIXTO"}
            icono="swap"
            label="Mixto"
            deshabilitado={!permiteQr}
            onClick={() => setMetodo("MIXTO")}
          />
        </div>

        {!permiteQr && (
          <p className="rounded-xl bg-info-bg px-3.5 py-2.5 text-[13px] text-info-text">
            Tu plan sólo incluye cobro en efectivo.
          </p>
        )}

        {metodo === "MIXTO" && (
          <Campo label="Monto pagado por QR" hint="El resto se cobra en efectivo">
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={montoQr}
              onChange={(e) => setMontoQr(e.target.value)}
              placeholder="0,00"
              className="text-lg font-bold"
            />
          </Campo>
        )}

        {metodo !== "QR" && (
          <>
            <Campo
              label="Efectivo recibido"
              hint={metodo === "MIXTO" ? `Falta cubrir ${fmtMoney(aCubrirEnEfectivo)}` : undefined}
            >
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={recibido}
                onChange={(e) => setRecibido(e.target.value)}
                placeholder="0,00"
                autoFocus
                className="text-lg font-bold"
              />
            </Campo>

            <div className="flex flex-wrap gap-2">
              {sugerencias.map((s) => (
                <button
                  key={s}
                  onClick={() => setRecibido(String(s))}
                  className="rounded-xl border border-borde bg-white px-3.5 py-2 text-[13px] font-semibold text-texto-2 transition-colors hover:border-primary hover:bg-primary-50 hover:text-primary-700"
                >
                  {fmtMoney(s)}
                </button>
              ))}
            </div>

            <div
              className={`rounded-xl px-4 py-3 text-center ${
                falta > 0 ? "bg-warning-bg text-warning-text" : "bg-primary-50 text-primary-700"
              }`}
            >
              {falta > 0 ? (
                <>
                  <p className="text-xs font-semibold uppercase tracking-wide">Falta</p>
                  <p className="text-2xl font-extrabold">{fmtMoney(falta)}</p>
                </>
              ) : (
                <>
                  <p className="text-xs font-semibold uppercase tracking-wide">Cambio</p>
                  <p className="text-2xl font-extrabold">{fmtMoney(cambio)}</p>
                </>
              )}
            </div>
          </>
        )}

        {metodo === "QR" && (
          <div className="flex flex-col items-center rounded-2xl border border-borde bg-white p-6 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-50 text-primary-700">
              <Icon name="qr" size={32} />
            </span>
            <p className="mt-3 text-sm font-semibold text-texto">
              Cobrá {fmtMoney(total)} por QR
            </p>
            <p className="mt-1 text-[13px] text-texto-3">
              Confirmá cuando veas el pago acreditado.
            </p>
          </div>
        )}

        <ErrorMsg>{errorLocal || error}</ErrorMsg>
      </div>

      <div className="space-y-2 border-t border-borde bg-white p-4">
        <Boton onClick={confirmar} disabled={enviando} className="w-full py-3 text-base">
          {enviando ? "Registrando…" : `Confirmar cobro · ${fmtMoney(total)}`}
        </Boton>
        {onCredito && (
          <Boton variante="ghost" onClick={onCredito} disabled={enviando} className="w-full">
            Vender a crédito (fiado)
          </Boton>
        )}
      </div>
    </div>
  );
}

function BotonMetodo({
  activo,
  icono,
  label,
  onClick,
  deshabilitado,
}: {
  activo: boolean;
  icono: "dollar" | "qr" | "swap";
  label: string;
  onClick: () => void;
  deshabilitado?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={deshabilitado}
      className={`flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-[13px] font-semibold transition-colors disabled:opacity-40 ${
        activo
          ? "border-primary bg-primary-50 text-primary-700"
          : "border-borde bg-white text-texto-2 enabled:hover:bg-muted"
      }`}
    >
      <Icon name={icono} size={20} />
      {label}
    </button>
  );
}
