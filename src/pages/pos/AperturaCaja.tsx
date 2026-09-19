import { useState } from "react";
import { parsearMontoO } from "../../lib/dinero";
import CorteDeCaja from "../../components/CorteDeCaja";
import { CargarQrCobro } from "../../components/QrCobro";
import { Icon } from "../../components/Icon";
import { Boton, Campo, ErrorMsg, Input, Select } from "../../components/ui";
import { api } from "../../lib/api";
import { fmtMoney } from "../../lib/format";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import { useSucursales } from "../../lib/useSucursales";

/** Montos típicos de fondo de caja: ahorran teclear lo de siempre. */
const SUGERENCIAS = [50, 100, 200, 500];

export default function AperturaCaja({ onAbierta }: { onAbierta: () => void }) {
  const { usuario } = useAuth();
  const [monto, setMonto] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [almacenId, setAlmacenId] = useState<number | null>(null);

  /**
   * En qué sucursal se abre la caja.
   *
   * La caja fija el local de TODO el turno: de ahí sale el stock que se
   * descuenta y los precios que se cobran. Por eso se elige acá y no por venta
   * — una caja con ventas de dos locales no cierra contra ninguno.
   *
   * Sólo lo elige un usuario de organización (el dueño, que atiende en
   * cualquier local). El cajero trabaja donde le asignaron: el backend le
   * rechaza el campo, así que ni se le muestra.
   */
  // Las tres reglas (2+ sucursales, solo usuario de organización, sin
  // depósitos) viven en `useSucursales`; acá estaban copiadas a mano.
  //
  // El `almacenId` propio NO se reemplaza por el `sucursalId` del hook: son
  // cosas distintas. El del hook arranca en null = "todas" y sirve para
  // FILTRAR; acá hay que ELEGIR una sí o sí, porque la caja abre en un local
  // concreto. Por eso se usa `sugerida` como valor inicial.
  const suc = useSucursales();
  const { sucursales, elegir: elegirSucursal } = suc;
  const elegida = almacenId ?? suc.sugerida?.id ?? null;

  const montoNum = parsearMontoO(monto, NaN);
  const valido = monto !== "" && Number.isFinite(montoNum) && montoNum >= 0;

  async function abrir() {
    if (!valido) return setError("Poné el monto con el que arranca la caja.");
    setError("");
    setEnviando(true);
    try {
      await api.abrirCaja({
        montoApertura: montoNum,
        ...(descripcion.trim() ? { descripcion: descripcion.trim() } : {}),
        ...(elegirSucursal && elegida != null ? { almacenId: elegida } : {}),
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
          {/* Primero la sucursal y después el monto: decide de qué stock se vende
              todo el turno, así que se elige antes de contar la plata. */}
          {elegirSucursal && (
            <Campo
              label="Sucursal"
              hint="Acá vendés este turno: se descuenta de su stock y se cobran sus precios"
            >
              <Select
                value={elegida ?? ""}
                onChange={(e) => setAlmacenId(Number(e.target.value))}
              >
                {sucursales.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nombre}
                    {a.esPrincipal ? " (principal)" : ""}
                  </option>
                ))}
              </Select>
            </Campo>
          )}

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

          {/* Contar por denominación y que el total se copie al monto: es lo
              que hace el cajero al abrir, y tecleando el total de cabeza es
              donde se cuelan los errores. */}
          <CorteDeCaja onTotal={(t) => setMonto(t > 0 ? String(t) : "")} />

          <CargarQrCobro />

          <ErrorMsg>{error}</ErrorMsg>

          <Boton onClick={abrir} disabled={enviando || !valido} className="w-full">
            {enviando ? "Abriendo…" : "Abrir caja y empezar a vender"}
          </Boton>

          <p className="text-center text-xs text-texto-4">
            Abrís como {usuario?.nombre ?? usuario?.username}
            {/* Al cajero no se le pregunta, pero SÍ se le dice: es cómo nota que
                le asignaron el local equivocado. Si nunca lo ve, el error se
                descubre en el inventario físico, semanas después. */}
            {!elegirSucursal && usuario?.sucursal ? ` en ${usuario.sucursal}` : ""}
          </p>
        </div>
      </div>
    </div>
  );
}
