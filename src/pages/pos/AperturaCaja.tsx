import { useState } from "react";
import { Icon } from "../../components/Icon";
import { Boton, Campo, ErrorMsg, Input } from "../../components/ui";
import { api } from "../../lib/api";
import { fmtMoney } from "../../lib/format";
import { useAuth } from "../../store/AuthContext";

/** Montos típicos de fondo de caja: ahorran teclear lo de siempre. */
const SUGERENCIAS = [50, 100, 200, 500];

export default function AperturaCaja({ onAbierta }: { onAbierta: () => void }) {
  const { usuario } = useAuth();
  const [monto, setMonto] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  const montoNum = Number(monto);
  const valido = monto !== "" && Number.isFinite(montoNum) && montoNum >= 0;

  async function abrir() {
    if (!valido) return setError("Poné el monto con el que arranca la caja.");
    setError("");
    setEnviando(true);
    try {
      await api.abrirCaja({
        montoApertura: montoNum,
        ...(descripcion.trim() ? { descripcion: descripcion.trim() } : {}),
      });
      onAbierta();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo abrir la caja");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center p-5">
      <div className="w-full max-w-md">
        <div className="mb-5 flex flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-marca text-white shadow-lg shadow-primary/25">
            <Icon name="lock" size={30} />
          </div>
          <h1 className="mt-4 text-xl font-bold text-texto">Abrir caja</h1>
          <p className="mt-1 text-[13px] text-texto-3">
            Contá el efectivo con el que arrancás el turno
          </p>
        </div>

        <div className="card space-y-4 p-5">
          <Campo
            label="Monto de apertura"
            hint="Es el fondo con el que empezás: se descuenta del arqueo al cerrar"
          >
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder="0,00"
              autoFocus
              className="text-lg font-bold"
            />
          </Campo>

          <div className="flex flex-wrap gap-2">
            {SUGERENCIAS.map((s) => (
              <button
                key={s}
                onClick={() => setMonto(String(s))}
                className="rounded-xl border border-borde bg-white px-3.5 py-2 text-[13px] font-semibold text-texto-2 transition-colors hover:border-primary hover:bg-primary-50 hover:text-primary-700"
              >
                {fmtMoney(s)}
              </button>
            ))}
          </div>

          <Campo label="Nota (opcional)">
            <Input
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Ej. turno mañana"
            />
          </Campo>

          <ErrorMsg>{error}</ErrorMsg>

          <Boton onClick={abrir} disabled={enviando || !valido} className="w-full">
            {enviando ? "Abriendo…" : "Abrir caja y empezar a vender"}
          </Boton>

          <p className="text-center text-xs text-texto-4">
            Abrís como {usuario?.nombre ?? usuario?.username}
          </p>
        </div>
      </div>
    </div>
  );
}
