import { useMemo, useState } from "react";
import { Icon } from "../../components/Icon";
import { QrParaCobrar } from "../../components/QrCobro";
import { Boton, Campo, ErrorMsg, Input, Modal, Select } from "../../components/ui";
import { api } from "../../lib/api";
import { aCentavos, esPositivo, excede, parsearMontoO } from "../../lib/dinero";
import { fmtMoney, isoDia } from "../../lib/format";
import { puedeSupervisar } from "../../lib/permisos";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import type { ClienteCredito, CreditoInput, FormaPago, PagoInput } from "../../types";

/** Plazos habituales del fiado de barrio. */
const PLAZOS = [7, 15, 30];

/** Días hasta el último día del mes en curso: el plazo que más se usa. */
function diasAFinDeMes(): number {
  const hoy = new Date();
  const fin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
  const dias = Math.round((fin.getTime() - hoy.getTime()) / 86_400_000);
  // Si hoy ES el último día, "fin de mes" sería hoy y no habría plazo: se pasa
  // al cierre del mes siguiente.
  return dias > 0 ? dias : Math.round(
    (new Date(hoy.getFullYear(), hoy.getMonth() + 2, 0).getTime() - hoy.getTime()) / 86_400_000,
  );
}

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
  /** Con qué se paga el adelanto. En el mostrador se negocia de las tres formas. */
  const [metodo, setMetodo] = useState<"EFECTIVO" | "QR" | "MIXTO">("EFECTIVO");
  const [adelantoQr, setAdelantoQr] = useState("");
  const [qrConfirmado, setQrConfirmado] = useState(false);
  /** Techo con el que nace la ficha de un cliente nuevo. Vacío = sin límite. */
  const [limiteNuevo, setLimiteNuevo] = useState("");
  /** Firma del encargado cuando la venta pasa el techo del cliente. */
  const [autorizacion, setAutorizacion] = useState<{ usuario: string; pin: string } | null>(
    null,
  );
  const [pidiendoPin, setPidiendoPin] = useState(false);

  const { incluye } = useAuth();
  const formaEfectivo = formasPago.find((f) => f.nombre.toLowerCase() === "efectivo");
  const formaQr = formasPago.find((f) => f.nombre.toLowerCase() === "qr");
  const permiteQr = incluye("pago_qr_mixto") && !!formaQr;
  const lista = clientes.datos ?? [];
  const elegido = lista.find((c) => String(c.id) === clienteId) ?? null;

  const adelantoNum = parsearMontoO(adelanto);
  const adelantoQrNum = parsearMontoO(adelantoQr);
  /** En mixto, el QR cubre una parte del adelanto y el efectivo el resto. */
  const adelantoTotal =
    metodo === "QR" ? adelantoNum : metodo === "MIXTO" ? aCentavos(adelantoNum + adelantoQrNum) : adelantoNum;
  const saldo = Math.round((total - adelantoTotal) * 100) / 100;

  /**
   * Si fiarle este saldo lo pasa de su techo. Se avisa ARRIBA y no al
   * confirmar: es lo que decide si la venta se puede hacer, y enterarse en el
   * resumen final es enterarse tarde.
   */
  const superaLimite =
    !!elegido && elegido.limiteCredito !== null && excede(elegido.saldoTotal + saldo, elegido.limiteCredito);

  const compromiso = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + plazo);
    return d;
  }, [plazo]);

  /**
   * Arma y manda la venta. `firma` llega cuando el encargado ya puso su PIN
   * para pasar el techo del cliente.
   */
  function confirmar(firma?: { usuario: string; pin: string }) {
    setErrorLocal("");

    if (!elegido && nombre.trim().length < 2)
      return setErrorLocal("Poné el nombre del cliente.");
    if (adelantoNum < 0 || adelantoQrNum < 0)
      return setErrorLocal("El adelanto no puede ser negativo.");
    // Contra el saldo redondeado, que es el que se muestra y el que queda en
    // la cuenta: con un adelanto de 99.999 sobre 100 esta guarda pasaba y se
    // creaba un crédito de Bs 0,001 imposible de saldar.
    if (saldo <= 0)
      return setErrorLocal("Si paga todo no es un fiado: cobralo como venta normal.");

    const pagos: PagoInput[] = [];
    if (metodo === "EFECTIVO" || metodo === "MIXTO") {
      if (esPositivo(adelantoNum)) {
        if (!formaEfectivo)
          return setErrorLocal("El negocio no tiene cargada la forma de pago Efectivo.");
        pagos.push({ formaPagoId: formaEfectivo.id, monto: adelantoNum, recibido: adelantoNum });
      }
    }
    if (metodo === "QR" || metodo === "MIXTO") {
      const montoQr = metodo === "QR" ? adelantoNum : adelantoQrNum;
      if (esPositivo(montoQr)) {
        if (!formaQr) return setErrorLocal("El negocio no tiene cargada la forma de pago QR.");
        if (!qrConfirmado)
          return setErrorLocal("Confirmá que el pago por QR llegó antes de registrar el fiado.");
        // En QR puro el adelanto entero es el QR; en mixto sólo su parte.
        pagos.length = metodo === "QR" ? 0 : pagos.length;
        pagos.push({ formaPagoId: formaQr.id, monto: montoQr });
      }
    }

    // Pasa el techo y todavía no hay firma: se pide acá, con el carrito
    // intacto, en vez de mandar la venta para que el backend la rechace con el
    // cliente enfrente.
    const conFirma = firma ?? autorizacion;
    if (superaLimite && !conFirma) {
      setPidiendoPin(true);
      return;
    }

    const credito: CreditoInput = {
      // El backend exige ISO 8601 CON offset: una fecha suelta se
      // interpretaría en UTC y el compromiso caería un día antes.
      fechaCompromiso: conOffset(compromiso),
      ...(elegido
        ? { clienteId: elegido.id }
        : {
            clienteNombre: nombre.trim(),
            ...(telefono.trim() ? { clienteTelefono: telefono.trim() } : {}),
            // El techo con el que nace su ficha. Vacío = sin límite, que no es
            // un estado aparte sino la ausencia del dato.
            ...(limiteNuevo.trim() !== ""
              ? { limiteCredito: parsearMontoO(limiteNuevo) }
              : {}),
          }),
      ...(nota.trim() ? { nota: nota.trim() } : {}),
      ...(conFirma
        ? { autorizadorUsername: conFirma.usuario, autorizadorPin: conFirma.pin }
        : {}),
    };

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
          <>
            <AvisoCliente cliente={elegido} />
            {/* Arriba y no en el resumen final: es lo que decide si la venta se
                puede hacer, y enterarse al confirmar es enterarse tarde. */}
            {elegido.limiteCredito !== null && (
              <div
                className={`rounded-xl px-3.5 py-2.5 text-[13px] ${
                  superaLimite
                    ? "bg-danger-bg text-danger-text"
                    : "bg-muted text-texto-2"
                }`}
              >
                <p className="font-bold">
                  Límite {fmtMoney(elegido.limiteCredito)} · le quedan{" "}
                  {fmtMoney(elegido.disponible ?? 0)}
                </p>
                {superaLimite && (
                  <p className="mt-0.5">
                    Este fiado lo pasa de su techo: hace falta la firma de un encargado.
                  </p>
                )}
              </div>
            )}
          </>
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
            <Campo
              label="Límite de crédito"
              hint="Cuánto se le puede fiar en total. Vacío = sin límite"
            >
              <div className="flex flex-wrap gap-2">
                {[100, 200, 500].map((v) => (
                  <button
                    key={v}
                    onClick={() => setLimiteNuevo(String(v))}
                    className={`rounded-xl px-3.5 py-2 text-[13px] font-semibold transition-colors ${
                      limiteNuevo === String(v)
                        ? "bg-primary-boton text-white"
                        : "border border-borde bg-white text-texto-2 hover:bg-muted"
                    }`}
                  >
                    {fmtMoney(v)}
                  </button>
                ))}
                <button
                  onClick={() => setLimiteNuevo("")}
                  className={`rounded-xl px-3.5 py-2 text-[13px] font-semibold transition-colors ${
                    limiteNuevo === ""
                      ? "bg-primary-boton text-white"
                      : "border border-borde bg-white text-texto-2 hover:bg-muted"
                  }`}
                >
                  Sin límite
                </button>
              </div>
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                value={limiteNuevo}
                onChange={(e) => setLimiteNuevo(e.target.value)}
                placeholder="Otro monto"
                className="mt-2"
              />
            </Campo>
          </>
        )}

        <Campo label="Plazo para pagar">
          <div className="flex flex-wrap gap-2">
            {[...PLAZOS, diasAFinDeMes()].map((d, i) => (
              <button
                key={`${d}-${i}`}
                onClick={() => setPlazo(d)}
                className={`rounded-xl px-3.5 py-2 text-[13px] font-semibold transition-colors ${
                  plazo === d
                    ? "bg-primary-boton text-white"
                    : "border border-borde bg-white text-texto-2 hover:bg-muted"
                }`}
              >
                {i === PLAZOS.length ? "Fin de mes" : `${d} días`}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-texto-4">
            Se compromete a pagar el {isoDia(compromiso).split("-").reverse().join("/")}
          </p>
        </Campo>

        {permiteQr && (
          <div className="grid grid-cols-3 gap-2">
            {(["EFECTIVO", "QR", "MIXTO"] as const).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMetodo(m);
                  setQrConfirmado(false);
                  setErrorLocal("");
                }}
                className={`rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition-colors ${
                  metodo === m
                    ? "border-primary bg-primary-50 text-primary-700"
                    : "border-borde bg-white text-texto-2"
                }`}
              >
                {m === "EFECTIVO" ? "Efectivo" : m === "QR" ? "QR" : "Mixto"}
              </button>
            ))}
          </div>
        )}

        <Campo
          label="Adelanto (opcional)"
          hint={
            metodo === "QR"
              ? "Lo que paga ahora por QR"
              : metodo === "MIXTO"
                ? "La parte en efectivo"
                : "Lo que paga ahora en efectivo"
          }
        >
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={adelanto}
            onChange={(e) => {
              setAdelanto(e.target.value);
              if (metodo === "QR") setQrConfirmado(false);
            }}
            placeholder="0,00"
            className="font-bold"
          />
        </Campo>

        {metodo === "MIXTO" && (
          <Campo label="Parte pagada por QR">
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={adelantoQr}
              onChange={(e) => {
                setAdelantoQr(e.target.value);
                setQrConfirmado(false);
              }}
              placeholder="0,00"
              className="font-bold"
            />
          </Campo>
        )}

        {/* El QR real del negocio y su confirmación manual: el adelanto es
            plata que entra, y nadie verifica la transferencia por nosotros. */}
        {((metodo === "QR" && esPositivo(adelantoNum)) ||
          (metodo === "MIXTO" && esPositivo(adelantoQrNum))) && (
          <div className="rounded-2xl border border-borde bg-white p-5">
            <QrParaCobrar
              confirmado={qrConfirmado}
              onConfirmar={() => setQrConfirmado(true)}
              monto={fmtMoney(metodo === "QR" ? adelantoNum : adelantoQrNum)}
            />
          </div>
        )}

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
        {pidiendoPin && (
          <PedirPinCredito
            onCancelar={() => setPidiendoPin(false)}
            onFirmar={(usuario, pin) => {
              setPidiendoPin(false);
              setAutorizacion({ usuario, pin });
              // Se reintenta sola con la firma: perder el carrito porque el
              // encargado tardó en llegar sería el peor final posible.
              confirmar({ usuario, pin });
            }}
          />
        )}

        <Boton onClick={() => confirmar()} disabled={enviando} className="w-full py-3 text-base">
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


/**
 * Firma del encargado para fiar por encima del techo del cliente.
 *
 * Se pide ANTES de mandar la venta, no después del rechazo: el carrito sigue
 * armado y el cliente no ve un error. Mismo patrón que la anulación —el PIN se
 * teclea en el mismo dispositivo sin cerrar la sesión del cajero.
 */
function PedirPinCredito({
  onCancelar,
  onFirmar,
}: {
  onCancelar: () => void;
  onFirmar: (usuario: string, pin: string) => void;
}) {
  const { usuario: actual } = useAuth();
  // Un encargado firma con su propio PIN; un cajero necesita además el usuario
  // de quien autoriza.
  const pideUsuario = !puedeSupervisar(actual?.rol);
  const [autorizador, setAutorizador] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  function firmar() {
    if (!/^\d{4,6}$/.test(pin)) return setError("El PIN son 4 a 6 dígitos.");
    if (pideUsuario && autorizador.trim().length < 3)
      return setError("Poné el usuario del encargado que autoriza.");
    // Cuando el que está en la caja YA puede supervisar, el campo de usuario ni
    // se muestra: firma con el suyo. Sin esto viajaba vacío y el backend
    // respondía con su mensaje de validación crudo ("autorizadorUsername must
    // be longer than..."), así que un admin no podía autorizar su propio fiado.
    const usuario = pideUsuario ? autorizador.trim() : (actual?.username ?? "");
    onFirmar(usuario, pin);
  }

  return (
    <Modal
      abierto
      titulo="Autorización del encargado"
      subtitulo="Este fiado pasa el límite del cliente"
      onClose={onCancelar}
      ancho="max-w-sm"
      acciones={
        <>
          <Boton variante="ghost" onClick={onCancelar}>
            Cancelar
          </Boton>
          <Boton onClick={firmar}>Autorizar</Boton>
        </>
      }
    >
      <div className="space-y-3">
        {pideUsuario && (
          <Campo label="Usuario del encargado">
            <Input
              value={autorizador}
              onChange={(e) => setAutorizador(e.target.value)}
              autoFocus
            />
          </Campo>
        )}
        <Campo label="PIN">
          <Input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            autoFocus={!pideUsuario}
            className="text-lg font-bold tracking-widest"
          />
        </Campo>
        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </Modal>
  );
}
