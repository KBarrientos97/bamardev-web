import { useState } from "react";
import { Icon } from "../../components/Icon";
import { Boton, Campo, ErrorMsg, Input, Select } from "../../components/ui";
import { fmtMoney } from "../../lib/format";
import type { Repartidor, TipoPedido } from "../../types";

/** Tiempos típicos de preparación para un pedido que pasan a recoger. */
const MINUTOS = [15, 20, 30, 45];

export interface DatosEntrega {
  clienteNombre: string;
  clienteDireccion?: string;
  clienteTelefono?: string;
  repartidorId?: number;
  tarifaEnvio: number;
  minutosEstimados?: number;
  notaPedido?: string;
  /**
   * Prepagado = lo cobra la cajera ahora y entra a SU caja. Si no, lo cobra
   * el repartidor al entregar y entra a su rendición. La diferencia importa
   * para que los arqueos cuadren, por eso se decide acá y no después.
   */
  prepagado: boolean;
}

export default function PantallaEntrega({
  tipo,
  total,
  unidades,
  repartidores,
  enviando,
  onAtras,
  onContinuar,
}: {
  tipo: Extract<TipoPedido, "DELIVERY" | "RECOGER">;
  total: number;
  unidades: number;
  repartidores: Repartidor[];
  /**
   * El pedido pendiente se crea con un POST que tarda: sin bloquear los
   * botones, un segundo toque creaba una venta duplicada con el stock
   * descontado dos veces (no hay clienteRequestId que lo ataje).
   */
  enviando: boolean;
  onAtras: () => void;
  /** `prepagado` decide si sigue al cobro o si el pedido queda pendiente. */
  onContinuar: (datos: DatosEntrega) => void;
}) {
  const esDelivery = tipo === "DELIVERY";

  const [nombre, setNombre] = useState("");
  const [direccion, setDireccion] = useState("");
  const [telefono, setTelefono] = useState("");
  const [repartidorId, setRepartidorId] = useState(
    repartidores.length === 1 ? String(repartidores[0].id) : "",
  );
  const [tarifa, setTarifa] = useState(esDelivery ? "8" : "0");
  const [minutos, setMinutos] = useState(20);
  const [nota, setNota] = useState("");
  const [error, setError] = useState("");

  const tarifaNum = Number(tarifa) || 0;
  const totalConEnvio = total + (esDelivery ? tarifaNum : 0);

  function validar(): DatosEntrega | null {
    setError("");
    if (nombre.trim().length < 2) {
      setError("Poné el nombre del cliente.");
      return null;
    }
    if (esDelivery && direccion.trim().length < 4) {
      setError("Poné la dirección de entrega.");
      return null;
    }
    if (esDelivery && !repartidorId) {
      setError("Asigná un repartidor.");
      return null;
    }
    return {
      clienteNombre: nombre.trim(),
      ...(esDelivery ? { clienteDireccion: direccion.trim() } : {}),
      ...(telefono.trim() ? { clienteTelefono: telefono.trim() } : {}),
      ...(esDelivery && repartidorId ? { repartidorId: Number(repartidorId) } : {}),
      tarifaEnvio: esDelivery ? tarifaNum : 0,
      ...(esDelivery ? {} : { minutosEstimados: minutos }),
      ...(nota.trim() ? { notaPedido: nota.trim() } : {}),
      prepagado: false,
    };
  }

  function continuar(prepagado: boolean) {
    const datos = validar();
    if (datos) onContinuar({ ...datos, prepagado });
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
        <div>
          <h1 className="text-[15px] font-bold text-texto">
            {esDelivery ? "Datos de entrega" : "Datos del pedido"}
          </h1>
          <p className="text-xs text-texto-3">
            {fmtMoney(total)} · {unidades} {unidades === 1 ? "artículo" : "artículos"}
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <div className="flex items-center gap-3 rounded-xl bg-primary-50 p-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-primary-700">
            <Icon name={esDelivery ? "truck" : "clock"} size={21} />
          </span>
          <div>
            <p className="text-[13px] font-semibold text-primary-700">
              {esDelivery ? "Pedido para delivery" : "Pedido para recoger"}
            </p>
            <p className="text-lg font-extrabold text-texto">{fmtMoney(totalConEnvio)}</p>
          </div>
        </div>

        <Campo label="Nombre del cliente">
          <Input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej. Lucía Fernández"
            autoFocus
          />
        </Campo>

        {esDelivery && (
          <Campo label="Dirección de entrega">
            <Input
              value={direccion}
              onChange={(e) => setDireccion(e.target.value)}
              placeholder="Calle, número, referencia…"
            />
          </Campo>
        )}

        <Campo label="Teléfono">
          <Input
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            placeholder="7…"
            inputMode="tel"
          />
        </Campo>

        {esDelivery ? (
          <>
            <Campo label="Repartidor">
              <Select
                value={repartidorId}
                onChange={(e) => setRepartidorId(e.target.value)}
              >
                <option value="">Elegí un repartidor</option>
                {repartidores.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nombre}
                    {r.zona ? ` — ${r.zona}` : ""}
                  </option>
                ))}
              </Select>
            </Campo>

            <Campo
              label="Tarifa de envío"
              hint="Se la cobra y se la queda el repartidor: no entra a la caja ni a su rendición"
            >
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={tarifa}
                onChange={(e) => setTarifa(e.target.value)}
              />
            </Campo>
          </>
        ) : (
          <Campo label="Listo en">
            <div className="flex flex-wrap gap-2">
              {MINUTOS.map((m) => (
                <button
                  key={m}
                  onClick={() => setMinutos(m)}
                  className={`rounded-xl px-3.5 py-2 text-[13px] font-semibold transition-colors ${
                    minutos === m
                      ? "bg-primary text-white"
                      : "border border-borde bg-white text-texto-2 hover:bg-muted"
                  }`}
                >
                  {m} min
                </button>
              ))}
            </div>
          </Campo>
        )}

        <Campo label="Nota del pedido">
          <Input
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Ej. tocar timbre, portón verde"
          />
        </Campo>

        <ErrorMsg>{error}</ErrorMsg>
      </div>

      <div className="space-y-2 border-t border-borde bg-white p-4">
        <p className="text-center text-xs font-semibold uppercase tracking-wide text-texto-4">
          ¿Cómo se cobra?
        </p>
        {/* El envío NO va en este monto: el backend lo guarda aparte y la
            pantalla de cobro pide sólo los productos. Prometer acá el total
            con envío hacía que el cajero le pidiera de más al cliente. */}
        <Boton
          onClick={() => continuar(true)}
          disabled={enviando}
          className="w-full py-3"
        >
          {enviando ? "Un momento…" : `Cobrar ahora en caja · ${fmtMoney(total)}`}
        </Boton>
        <Boton
          variante="ghost"
          onClick={() => continuar(false)}
          disabled={enviando}
          className="w-full"
        >
          {enviando
            ? "Creando el pedido…"
            : esDelivery
              ? "Cobra el repartidor al entregar"
              : "Paga al retirar"}
        </Boton>
      </div>
    </div>
  );
}
