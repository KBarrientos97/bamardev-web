import { useMemo, useState } from "react";
import { Icon } from "../../components/Icon";
import { Boton, Campo, ErrorMsg, Input, Select } from "../../components/ui";
import { api } from "../../lib/api";
import { fmtMoney, isoDia } from "../../lib/format";
import { useApi } from "../../lib/useApi";
import type { ClienteCredito, CreditoInput, FormaPago, PagoInput } from "../../types";

/** Plazos habituales del fiado de barrio. */
const PLAZOS = [7, 15, 30];

/**
 * Venta a crédito: se registra la venta y queda un saldo a cobrar. El
 * adelanto es opcional y entra a la caja como cualquier pago; el resto pasa
 * a Cuentas por cobrar.
 */
export default function PantallaCredito({
  total,
  formasPago,
  onAtras,
  onConfirmar,
  enviando,
  error,
}: {
  total: number;
  formasPago: FormaPago[];
  onAtras: () => void;
  onConfirmar: (credito: CreditoInput, pagos: PagoInput[]) => void;
  enviando: boolean;
  error: string;
}) {
  // Los clientes que ya fiaron antes: reusarlos evita duplicar la ficha y
  // deja ver de una si el cliente ya arrastra deuda.
  const clientes = useApi(() => api.getClientesCredito(), []);

  const [clienteId, setClienteId] = useState("");
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [plazo, setPlazo] = useState(7);
  const [adelanto, setAdelanto] = useState("");
  const [nota, setNota] = useState("");
  const [errorLocal, setErrorLocal] = useState("");

  const formaEfectivo = formasPago.find((f) => f.nombre.toLowerCase() === "efectivo");
  const lista = clientes.datos ?? [];
  const elegido = lista.find((c) => String(c.id) === clienteId) ?? null;

  const adelantoNum = Number(adelanto) || 0;
  const saldo = Math.round((total - adelantoNum) * 100) / 100;

  const compromiso = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + plazo);
    return d;
  }, [plazo]);

  function confirmar() {
    setErrorLocal("");

    if (!elegido && nombre.trim().length < 2)
      return setErrorLocal("Poné el nombre del cliente.");
    if (adelantoNum < 0) return setErrorLocal("El adelanto no puede ser negativo.");
    // Contra el saldo redondeado, que es el que se muestra y el que queda en
    // la cuenta: con un adelanto de 99.999 sobre 100 esta guarda pasaba y se
    // creaba un crédito de Bs 0,001 imposible de saldar.
    if (saldo <= 0)
      return setErrorLocal("Si paga todo no es un fiado: cobralo como venta normal.");
    if (adelantoNum > 0 && !formaEfectivo)
      return setErrorLocal("El negocio no tiene cargada la forma de pago Efectivo.");

    const credito: CreditoInput = {
      // El backend exige ISO 8601 CON offset: una fecha suelta se
      // interpretaría en UTC y el compromiso caería un día antes.
      fechaCompromiso: conOffset(compromiso),
      ...(elegido
        ? { clienteId: elegido.id }
        : {
            clienteNombre: nombre.trim(),
            ...(telefono.trim() ? { clienteTelefono: telefono.trim() } : {}),
          }),
      ...(nota.trim() ? { nota: nota.trim() } : {}),
    };

    // El adelanto viaja como pago normal: es plata que sí entró a la caja.
    const pagos: PagoInput[] =
      adelantoNum > 0 && formaEfectivo
        ? [{ formaPagoId: formaEfectivo.id, monto: adelantoNum, recibido: adelantoNum }]
        : [];

    onConfirmar(credito, pagos);
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
        <h1 className="text-[15px] font-bold text-texto">Venta a crédito</h1>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <div className="rounded-2xl bg-marca p-5 text-center text-white">
          <p className="text-xs font-semibold uppercase tracking-wide opacity-90">
            Queda debiendo
          </p>
          <p className="mt-1 text-4xl font-extrabold tracking-tight">{fmtMoney(saldo)}</p>
          {adelantoNum > 0 && (
            <p className="mt-1.5 text-[13px] opacity-90">
              De {fmtMoney(total)}, adelanta {fmtMoney(adelantoNum)}
            </p>
          )}
        </div>

        {lista.length > 0 && (
          <Campo label="Cliente" hint="Elegí uno que ya fió antes o cargá uno nuevo">
            <Select value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
              <option value="">Cliente nuevo</option>
              {lista.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                  {c.saldoTotal > 0 ? ` — debe ${fmtMoney(c.saldoTotal)}` : ""}
                </option>
              ))}
            </Select>
          </Campo>
        )}

        {elegido ? (
          <AvisoCliente cliente={elegido} />
        ) : (
          <>
            <Campo label="Nombre del cliente">
              <Input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej. Kevin Barrientos"
                autoFocus
              />
            </Campo>
            <Campo label="Teléfono">
              <Input
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="7…"
                inputMode="tel"
              />
            </Campo>
          </>
        )}

        <Campo label="Plazo para pagar">
          <div className="flex flex-wrap gap-2">
            {PLAZOS.map((d) => (
              <button
                key={d}
                onClick={() => setPlazo(d)}
                className={`rounded-xl px-3.5 py-2 text-[13px] font-semibold transition-colors ${
                  plazo === d
                    ? "bg-primary text-white"
                    : "border border-borde bg-white text-texto-2 hover:bg-muted"
                }`}
              >
                {d} días
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-texto-4">
            Se compromete a pagar el {isoDia(compromiso).split("-").reverse().join("/")}
          </p>
        </Campo>

        <Campo label="Adelanto (opcional)" hint="Lo que paga ahora en efectivo">
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={adelanto}
            onChange={(e) => setAdelanto(e.target.value)}
            placeholder="0,00"
            className="font-bold"
          />
        </Campo>

        <Campo label="Nota (opcional)">
          <Input
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Ej. paga cuando cobre el sueldo"
          />
        </Campo>

        <ErrorMsg>{errorLocal || error}</ErrorMsg>
      </div>

      <div className="border-t border-borde bg-white p-4">
        <Boton onClick={confirmar} disabled={enviando} className="w-full py-3 text-base">
          {enviando ? "Registrando…" : `Registrar fiado · ${fmtMoney(saldo)}`}
        </Boton>
      </div>
    </div>
  );
}

function AvisoCliente({ cliente }: { cliente: ClienteCredito }) {
  const debe = cliente.saldoTotal > 0;
  return (
    <div
      className={`rounded-xl px-3.5 py-3 text-[13px] ${
        cliente.montoVencido > 0
          ? "bg-danger-bg text-danger-text"
          : debe
            ? "bg-warning-bg text-warning-text"
            : "bg-primary-50 text-primary-700"
      }`}
    >
      <p className="font-bold">{cliente.nombre}</p>
      <p className="mt-0.5">
        {cliente.montoVencido > 0
          ? `Tiene ${fmtMoney(cliente.montoVencido)} vencidos sin pagar.`
          : debe
            ? `Ya debe ${fmtMoney(cliente.saldoTotal)} en ${cliente.creditosAbiertos} ${
                cliente.creditosAbiertos === 1 ? "cuenta" : "cuentas"
              }.`
            : "Está al día."}
      </p>
    </div>
  );
}

/**
 * ISO 8601 con el offset local (ej. "2026-09-09T23:59:59-04:00"). El backend
 * lo exige así: una fecha sin zona la tomaría como UTC y en Bolivia el
 * compromiso vencería un día antes de lo pactado.
 */
function conOffset(d: Date): string {
  const fin = new Date(d);
  // Se compromete al final del día: si no, un pago a la tarde ya llegaría
  // tarde a su propia fecha de compromiso.
  fin.setHours(23, 59, 59, 0);

  const min = -fin.getTimezoneOffset();
  const signo = min >= 0 ? "+" : "-";
  const hh = String(Math.floor(Math.abs(min) / 60)).padStart(2, "0");
  const mm = String(Math.abs(min) % 60).padStart(2, "0");
  const p = (n: number) => String(n).padStart(2, "0");

  return (
    `${fin.getFullYear()}-${p(fin.getMonth() + 1)}-${p(fin.getDate())}` +
    `T${p(fin.getHours())}:${p(fin.getMinutes())}:${p(fin.getSeconds())}` +
    `${signo}${hh}:${mm}`
  );
}
