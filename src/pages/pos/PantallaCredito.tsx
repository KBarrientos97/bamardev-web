import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "../../components/Icon";
import InputMonto from "../../components/InputMonto";
import { QrParaCobrar } from "../../components/QrCobro";
import { Boton, Campo, ErrorMsg, Input, Modal, Select } from "../../components/ui";
import { api } from "../../lib/api";
import { aCentavos, esCero, esPositivo, excede, restoEnEfectivo } from "../../lib/dinero";
import { fmtMoney, isoDia } from "../../lib/format";
import { leerMonto, montoParaEditar } from "../../lib/montoTecleado";
import { tienePermiso } from "../../lib/permisos";
import { useApi } from "../../lib/useApi";
import { conCopia } from "../../lib/offline/copias";
import { formaPagoFaltante } from "../../lib/formaPagoFaltante";
import { useAuth } from "../../store/AuthContext";
import type { ClienteCredito, CreditoInput, FormaPago, PagoInput } from "../../types";
import {
  clientePorNombre,
  fechaDelPlazo,
  leerPorcentaje,
  PLAZO_MAXIMO_DIAS,
  problemaDeLaFecha,
  sumarDias,
  textoPorcentaje,
  type Plazo,
} from "./fiado";

/**
 * Los plazos del fiado de barrio, "Fin de mes" (el que más se usa) y una fecha
 * cualquiera del calendario: si el cliente pacta "el 5", aproximarlo a 7 o 15
 * días deja en el papel que firma y en el vencimiento una fecha que nadie
 * pactó (CRE-1). El backend no deja corregirla después.
 */
const PLAZOS: { plazo: Plazo; etiqueta: string }[] = [
  { plazo: 7, etiqueta: "7 días" },
  { plazo: 15, etiqueta: "15 días" },
  { plazo: 30, etiqueta: "30 días" },
  { plazo: "FIN_DE_MES", etiqueta: "Fin de mes" },
  { plazo: "OTRA", etiqueta: "Otra fecha" },
];

/**
 * Venta a crédito: se registra la venta y queda un saldo a cobrar. El
 * adelanto es opcional y entra a la caja como cualquier pago; el resto pasa
 * a Cuentas por cobrar.
 *
 * El adelanto se teclea en Bs o en % y los dos campos se siguen (CRE-2, como
 * Android): en el mostrador se negocia de las dos formas ("dejame la mitad",
 * "te dejo veinte") y obligar a traducir de cabeza es donde se cuelan los
 * errores. Por eso el campo es el adelanto ENTERO, también en mixto: ahí se
 * dice cuánto va por QR y el resto es efectivo.
 */
export default function PantallaCredito({
  total,
  formasPago,
  avisoPropinas,
  onAtras,
  onConfirmar,
  enviando,
  error,
  rechazosPorLimite = 0,
}: {
  total: number;
  formasPago: FormaPago[];
  /** Belleza: las propinas anotadas en el cobro, que viajan con el fiado. */
  avisoPropinas?: string;
  onAtras: () => void;
  onConfirmar: (credito: CreditoInput, pagos: PagoInput[]) => void;
  enviando: boolean;
  error: string;
  /**
   * Cuántas veces el backend frenó este fiado por el límite del cliente (403
   * `LIMITE_CREDITO`). Cada vez que sube se abre la firma del encargado. Sin
   * él (el cierre de mesa del billar) el rechazo queda como un error más.
   */
  rechazosPorLimite?: number;
}) {
  // Los clientes del negocio (no sólo los que ya fiaron: también los de la
  // agenda o la academia): reusarlos evita duplicar la ficha y deja ver de
  // una si el cliente ya arrastra deuda.
  // En la app del iPhone guarda copia: sin señal se puede fiar igual a un
  // cliente que ya estaba (Android: `clientes_credito`).
  const clientes = useApi(() => conCopia("clientes_credito", () => api.getClientesCredito()), []);

  const [clienteId, setClienteId] = useState("");
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [plazo, setPlazo] = useState<Plazo>(7);
  /** El día elegido en el calendario ("aaaa-mm-dd"), con el plazo "Otra fecha". */
  const [otraFecha, setOtraFecha] = useState("");
  /** El adelanto ENTERO, en Bs. */
  const [adelanto, setAdelanto] = useState("");
  /** El mismo adelanto como % del total; se escriben uno al otro. */
  const [porcentaje, setPorcentaje] = useState("");
  const [nota, setNota] = useState("");
  const [errorLocal, setErrorLocal] = useState("");
  /** Con qué se paga el adelanto. En el mostrador se negocia de las tres formas. */
  const [metodo, setMetodo] = useState<"EFECTIVO" | "QR" | "MIXTO">("EFECTIVO");
  /** En mixto, cuánto del adelanto va por QR. */
  const [adelantoQr, setAdelantoQr] = useState("");
  /**
   * El monto por QR que se dio por recibido, o null. Se guarda el MONTO y no
   * un sí/no: así la confirmación caduca sola cuando cambia lo que entra por
   * QR, venga el cambio del campo en Bs, del % o de "Mitad".
   */
  const [qrConfirmadoPor, setQrConfirmadoPor] = useState<number | null>(null);
  /** Techo con el que nace la ficha de un cliente nuevo. Vacío = sin límite. */
  const [limiteNuevo, setLimiteNuevo] = useState("");
  // La firma del encargado NO se guarda para reusarla: si el backend la
  // rechazaba (PIN mal tipeado), cada "Registrar fiado" volvía a mandar el
  // mismo PIN malo sin mostrar el diálogo, hasta que el backend bloqueaba los
  // PIN de ese cajero por 15 minutos (429), anular incluido. Cada intento que
  // pasa el techo la pide de nuevo.
  const [pidiendoPin, setPidiendoPin] = useState(false);
  /** El porqué de la firma cuando la pidió el backend: trae sus números, que son los de ahora. */
  const [motivoFirma, setMotivoFirma] = useState<string | null>(null);
  const campoFecha = useRef<HTMLInputElement>(null);

  const { incluye } = useAuth();
  const formaEfectivo = formasPago.find((f) => f.nombre.toLowerCase() === "efectivo");
  const formaQr = formasPago.find((f) => f.nombre.toLowerCase() === "qr");
  const permiteQr = incluye("pago_qr_mixto") && !!formaQr;
  const lista = clientes.datos ?? [];
  const delDesplegable = lista.find((c) => String(c.id) === clienteId) ?? null;
  /**
   * CRE-4 / BUG-cobro-2: el cliente se reconoce también por el nombre
   * tecleado, comparado como lo compara el backend. Antes el aviso de deuda,
   * el límite y la firma salían sólo eligiéndolo del desplegable: con "Cliente
   * nuevo" y "rosa" escrito a mano, el fiado salía sin firma, el backend la
   * encontraba por el nombre y lo frenaba (403), y volver a tocar "Registrar
   * fiado" rebotaba igual. Además se le ofrecía ponerle un límite que el
   * backend descarta (sólo lo aplica al crear la ficha).
   */
  const reconocido = delDesplegable ? null : clientePorNombre(lista, nombre);
  const elegido = delDesplegable ?? reconocido;

  // "1.500" son mil quinientos, como en el cierre (26-oct).
  const adelantoNum = leerMonto(adelanto) ?? 0;
  const qrMixtoNum = leerMonto(adelantoQr) ?? 0;
  // Sin adelanto no entra nada, aunque quede tecleada la parte por QR de un
  // mixto de antes de tocar "Sin adelanto": si no, el QR seguía en pantalla
  // sin los controles que lo explican.
  const hayAdelanto = esPositivo(adelantoNum);
  /** Lo que entra por QR: el adelanto entero, la parte del mixto, o nada. */
  const montoQr = !hayAdelanto
    ? 0
    : metodo === "QR"
      ? adelantoNum
      : metodo === "MIXTO"
        ? aCentavos(qrMixtoNum)
        : 0;
  /** Y en efectivo, el resto. */
  const montoEfectivo = !hayAdelanto
    ? 0
    : metodo === "QR"
      ? 0
      : metodo === "MIXTO"
        ? restoEnEfectivo(adelantoNum, qrMixtoNum)
        : adelantoNum;
  const saldo = aCentavos(total - adelantoNum);
  const qrConfirmado =
    qrConfirmadoPor !== null && esPositivo(montoQr) && esCero(qrConfirmadoPor - montoQr);

  /**
   * Si fiarle este saldo lo pasa de su techo. Se avisa ARRIBA y no al
   * confirmar: es lo que decide si la venta se puede hacer, y enterarse en el
   * resumen final es enterarse tarde.
   */
  const superaLimite =
    !!elegido && elegido.limiteCredito !== null && excede(elegido.saldoTotal + saldo, elegido.limiteCredito);

  const hoy = new Date();
  const compromiso = fechaDelPlazo(plazo, hoy, otraFecha);

  /**
   * CRE-4: el backend frenó el fiado por el límite. Pasa cuando la deuda
   * cambió desde que se cargó la lista (otro cajero le fió en el medio) o
   * cuando el backend lo reconoce y la lista no lo trae. Antes se pintaba el
   * texto y nada más; ahora se abre la firma ahí mismo y el fiado se reintenta
   * con ella, con el carrito intacto (como `VentaCreditoFragment`).
   */
  const rechazosAtendidos = useRef(rechazosPorLimite);
  /** Si el último envío ya llevaba firma: ahí el rechazo no reabre el diálogo solo. */
  const ultimoConFirma = useRef(false);
  const fijarClientes = clientes.setDatos;
  useEffect(() => {
    // Al montar no se pide nada: un rechazo de una visita anterior a esta
    // pantalla ya se atendió (o se abandonó) en esa visita.
    if (rechazosPorLimite === rechazosAtendidos.current) return;
    rechazosAtendidos.current = rechazosPorLimite;
    // La deuda de ahora, para que el aviso y el límite de arriba digan lo
    // mismo que el backend. Sin `recargar()`: si esa lectura fallara, la
    // lista quedaría vacía y se perdería el cliente elegido con la firma ya
    // abierta. Si falla, queda la de antes.
    conCopia("clientes_credito", () => api.getClientesCredito())
      .then(fijarClientes)
      .catch(() => {});
    // Con una firma que el backend igual no aceptó, pedirla sola de nuevo
    // sería un bucle: queda el error y "Registrar fiado" la vuelve a pedir.
    if (ultimoConFirma.current) return;
    setMotivoFirma(error || null);
    setPidiendoPin(true);
  }, [rechazosPorLimite, fijarClientes, error]);

  function alCambiarAdelanto(texto: string) {
    setAdelanto(texto);
    setPorcentaje(textoPorcentaje(leerMonto(texto) ?? 0, total));
  }

  function alCambiarPorcentaje(texto: string) {
    const limpio = texto.replace(/[^\d.,]/g, "").slice(0, 5);
    setPorcentaje(limpio);
    const pct = leerPorcentaje(limpio);
    const monto = aCentavos((total * pct) / 100);
    setAdelanto(esPositivo(monto) ? montoParaEditar(monto) : "");
  }

  /** "Sin adelanto" y "Mitad": los dos campos de una. */
  function fijarAdelanto(monto: number) {
    const m = aCentavos(Math.min(Math.max(0, monto), total));
    setAdelanto(esPositivo(m) ? montoParaEditar(m) : "");
    setPorcentaje(textoPorcentaje(m, total));
  }

  function elegirPlazo(p: Plazo) {
    setErrorLocal("");
    if (p === "OTRA") {
      // El calendario arranca en la fecha que ya estaba elegida, no en blanco.
      if (compromiso) setOtraFecha(isoDia(compromiso));
      setPlazo("OTRA");
      const campo = campoFecha.current;
      campo?.focus();
      try {
        // Abre el calendario de una, como el DatePicker de la app. No todos
        // los navegadores lo tienen; sin él, el campo queda enfocado.
        campo?.showPicker?.();
      } catch {
        // Sin el gesto del usuario o sin soporte: alcanza con el foco.
      }
      return;
    }
    setPlazo(p);
  }

  /**
   * Arma y manda la venta. `firma` llega cuando el encargado ya puso su PIN
   * para pasar el techo del cliente.
   */
  function confirmar(firma?: { usuario: string; pin: string }) {
    setErrorLocal("");

    if (!elegido && nombre.trim().length < 2)
      return setErrorLocal("Poné el nombre del cliente.");
    const problemaFecha = problemaDeLaFecha(compromiso, new Date());
    if (problemaFecha || !compromiso) return setErrorLocal(problemaFecha ?? "");
    if (adelantoNum < 0 || qrMixtoNum < 0)
      return setErrorLocal("El adelanto no puede ser negativo.");
    // Contra el saldo redondeado, que es el que se muestra y el que queda en
    // la cuenta: con un adelanto de 99.999 sobre 100 esta guarda pasaba y se
    // creaba un crédito de Bs 0,001 imposible de saldar.
    if (!esPositivo(saldo))
      return setErrorLocal("Si paga todo no es un fiado: cobralo como venta normal.");
    // El QR es exacto (no da vuelto): no puede pasar el adelanto.
    if (hayAdelanto && metodo === "MIXTO" && excede(qrMixtoNum, adelantoNum))
      return setErrorLocal(`Por QR no puede ir más que el adelanto (${fmtMoney(adelantoNum)}).`);

    // Cada parte por separado: si fuera una sola línea de efectivo, el arqueo
    // esperaría plata que se fue por transferencia.
    const pagos: PagoInput[] = [];
    if (esPositivo(montoEfectivo)) {
      if (!formaEfectivo) return setErrorLocal(formaPagoFaltante(formasPago, "Efectivo"));
      pagos.push({ formaPagoId: formaEfectivo.id, monto: montoEfectivo, recibido: montoEfectivo });
    }
    if (esPositivo(montoQr)) {
      if (!formaQr) return setErrorLocal(formaPagoFaltante(formasPago, "QR"));
      if (!qrConfirmado)
        return setErrorLocal("Confirmá que el pago por QR llegó antes de registrar el fiado.");
      pagos.push({ formaPagoId: formaQr.id, monto: montoQr });
    }

    // Pasa el techo y todavía no hay firma: se pide acá, con el carrito
    // intacto, en vez de mandar la venta para que el backend la rechace con el
    // cliente enfrente.
    if (superaLimite && !firma) {
      setMotivoFirma(null);
      setPidiendoPin(true);
      return;
    }

    const credito: CreditoInput = {
      // El backend exige ISO 8601 CON offset: una fecha suelta se
      // interpretaría en UTC y el compromiso caería un día antes.
      fechaCompromiso: conOffset(compromiso),
      ...(elegido
        ? {
            // Por id también el reconocido por el nombre: la deuda va a la
            // ficha que la pantalla mostró, no a la que el backend adivine.
            clienteId: elegido.id,
            ...(delDesplegable
              ? {}
              : {
                  // Y lo tecleado, como Android: el backend resuelve por el
                  // id, pero el cierre de mesa del billar nombra al cliente en
                  // su aviso con `clienteNombre`. Con el id solo, "Bs 15,00 a
                  // cuentas por cobrar (Juan Pérez)" pasó a no nombrar a nadie.
                  clienteNombre: nombre.trim(),
                  // El backend completa el teléfono de una ficha que no lo tenía.
                  ...(telefono.trim() ? { clienteTelefono: telefono.trim() } : {}),
                }),
          }
        : {
            clienteNombre: nombre.trim(),
            ...(telefono.trim() ? { clienteTelefono: telefono.trim() } : {}),
            // El techo con el que nace su ficha. Vacío = sin límite, que no es
            // un estado aparte sino la ausencia del dato.
            ...(limiteNuevo.trim() !== ""
              ? { limiteCredito: leerMonto(limiteNuevo) ?? 0 }
              : {}),
          }),
      ...(nota.trim() ? { nota: nota.trim() } : {}),
      ...(firma ? { autorizadorUsername: firma.usuario, autorizadorPin: firma.pin } : {}),
    };

    ultimoConFirma.current = !!firma;
    onConfirmar(credito, pagos);
  }

  // Lo que queda debiendo, en pantalla: un adelanto de más no se muestra como
  // una deuda negativa (al confirmar se avisa que eso no es un fiado).
  const saldoVisible = Math.max(0, saldo);
  // Lo que el encargado tiene que ver para firmar: de cuánto se pasa.
  const avisoLimite =
    elegido && elegido.limiteCredito !== null
      ? `Debe ${fmtMoney(elegido.saldoTotal)} y quedaría en ${fmtMoney(elegido.saldoTotal + saldoVisible)}, con un límite de ${fmtMoney(elegido.limiteCredito)}.`
      : undefined;

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
          <p className="mt-1 text-4xl font-extrabold tracking-tight">{fmtMoney(saldoVisible)}</p>
          {/* El adelanto entero: en mixto, efectivo + QR (con sólo el efectivo
              no cerraba con el saldo de arriba). */}
          {hayAdelanto && (
            <p className="mt-1.5 text-[13px] opacity-90">
              De {fmtMoney(total)}, adelanta {fmtMoney(adelantoNum)}
            </p>
          )}
          {avisoPropinas && <p className="mt-1.5 text-[13px] opacity-90">{avisoPropinas}</p>}
        </div>

        {lista.length > 0 && (
          <Campo label="Cliente" hint="Elegí uno que ya fió antes o cargá uno nuevo">
            <Select value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
              <option value="">Cliente nuevo</option>
              {lista.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                  {esPositivo(c.saldoTotal) ? ` — debe ${fmtMoney(c.saldoTotal)}` : ""}
                </option>
              ))}
            </Select>
          </Campo>
        )}

        {delDesplegable ? (
          <BloqueCliente cliente={delDesplegable} superaLimite={superaLimite} />
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
            {reconocido && <BloqueCliente cliente={reconocido} superaLimite={superaLimite} reconocido />}
            <Campo label="Teléfono">
              <Input
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="7…"
                inputMode="tel"
              />
            </Campo>
            {/* Sólo para una ficha nueva: a un cliente que ya existe el backend
                no le cambia el límite desde acá, y un campo que no hace nada
                es peor que no tenerlo. */}
            {!reconocido && (
              <Grupo
                titulo="Límite de crédito"
                pie="Cuánto se le puede fiar en total. Vacío = sin límite"
              >
                <div className="flex flex-wrap gap-2">
                  {[100, 200, 500].map((v) => (
                    <Opcion
                      key={v}
                      activa={leerMonto(limiteNuevo) === v}
                      onClick={() => setLimiteNuevo(montoParaEditar(v))}
                    >
                      {fmtMoney(v)}
                    </Opcion>
                  ))}
                  <Opcion activa={limiteNuevo === ""} onClick={() => setLimiteNuevo("")}>
                    Sin límite
                  </Opcion>
                </div>
                <InputMonto
                  value={limiteNuevo}
                  onChange={setLimiteNuevo}
                  placeholder="Otro monto"
                  aria-label="Límite de crédito"
                  className="mt-2"
                />
              </Grupo>
            )}
          </>
        )}

        {/* Un grupo y no un <label>: con los botones adentro, tocar el texto
            de abajo "clickeaba" el primero y el plazo volvía a 7 días. */}
        <Grupo titulo="Plazo para pagar">
          <div className="flex flex-wrap gap-2">
            {PLAZOS.map(({ plazo: p, etiqueta }) => (
              <Opcion key={String(p)} activa={plazo === p} onClick={() => elegirPlazo(p)}>
                {etiqueta}
              </Opcion>
            ))}
          </div>
          {/* La fecha misma se puede tocar, como en la app: elegir un día en el
              calendario pasa el plazo a "Otra fecha". Desde mañana: una cuenta
              que vence hoy sale en rojo el mismo día que se fió. */}
          <label className="mt-2 flex flex-wrap items-center gap-2 text-xs text-texto-4">
            <span>Se compromete a pagar el</span>
            <input
              ref={campoFecha}
              type="date"
              value={plazo === "OTRA" ? otraFecha : compromiso ? isoDia(compromiso) : ""}
              min={isoDia(sumarDias(hoy, 1))}
              max={isoDia(sumarDias(hoy, PLAZO_MAXIMO_DIAS))}
              onChange={(e) => {
                setErrorLocal("");
                setOtraFecha(e.target.value);
                setPlazo("OTRA");
              }}
              className="rounded-lg border border-borde bg-white px-2.5 py-1.5 text-[13px] font-semibold text-texto outline-none focus:border-primary focus:ring-2 focus:ring-primary-100"
            />
          </label>
        </Grupo>

        <Grupo
          titulo="Adelanto (opcional)"
          pie="Lo que deja hoy: en Bs o en % del total."
        >
          <div className="grid grid-cols-[1fr_6.5rem] gap-2">
            <InputMonto
              value={adelanto}
              onChange={alCambiarAdelanto}
              placeholder="0,00"
              aria-label="Adelanto en Bs"
              className="font-bold"
            />
            <div className="relative">
              <Input
                value={porcentaje}
                onChange={(e) => alCambiarPorcentaje(e.target.value)}
                placeholder="0"
                inputMode="decimal"
                autoComplete="off"
                aria-label="Adelanto en %"
                className="pr-8 font-bold"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-texto-4">
                %
              </span>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Opcion activa={!hayAdelanto} onClick={() => fijarAdelanto(0)}>
              Sin adelanto
            </Opcion>
            <Opcion
              activa={hayAdelanto && esCero(adelantoNum - aCentavos(total / 2))}
              onClick={() => fijarAdelanto(total / 2)}
            >
              Mitad
            </Opcion>
          </div>
        </Grupo>

        {/* Cómo paga, sólo cuando hay algo que pagar (como en la app). */}
        {permiteQr && hayAdelanto && (
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="Cómo paga el adelanto">
            {(["EFECTIVO", "QR", "MIXTO"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMetodo(m);
                  setQrConfirmadoPor(null);
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

        {metodo === "MIXTO" && hayAdelanto && (
          <div className="space-y-1.5">
            <Campo label="Parte pagada por QR">
              <InputMonto
                value={adelantoQr}
                onChange={setAdelantoQr}
                placeholder="0,00"
                className="font-bold"
              />
            </Campo>
            {/* El reparto siempre a la vista: sin él, un monto mal tecleado
                no se distingue de uno bien cobrado. */}
            <p className="text-[13px] text-texto-2">
              En efectivo: <strong>{fmtMoney(montoEfectivo)}</strong>
            </p>
          </div>
        )}

        {/* El QR real del negocio y su confirmación manual: el adelanto es
            plata que entra, y nadie verifica la transferencia por nosotros. */}
        {esPositivo(montoQr) && (
          <div className="rounded-2xl border border-borde bg-white p-5">
            <QrParaCobrar
              confirmado={qrConfirmado}
              onConfirmar={() => setQrConfirmadoPor(montoQr)}
              monto={fmtMoney(montoQr)}
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
            subtitulo={motivoFirma ?? avisoLimite}
            onCancelar={() => setPidiendoPin(false)}
            onFirmar={(usuario, pin) => {
              setPidiendoPin(false);
              // Se reintenta sola con la firma: perder el carrito porque el
              // encargado tardó en llegar sería el peor final posible.
              confirmar({ usuario, pin });
            }}
          />
        )}

        <Boton onClick={() => confirmar()} disabled={enviando} className="w-full py-3 text-base">
          {enviando ? "Registrando…" : `Registrar fiado · ${fmtMoney(saldoVisible)}`}
        </Boton>
      </div>
    </div>
  );
}

/** Lo que se sabe del cliente: su deuda y su techo. */
function BloqueCliente({
  cliente,
  superaLimite,
  reconocido,
}: {
  cliente: ClienteCredito;
  superaLimite: boolean;
  /** Se lo reconoció por el nombre tecleado, sin elegirlo de la lista. */
  reconocido?: boolean;
}) {
  return (
    <>
      <AvisoCliente cliente={cliente} reconocido={reconocido} />
      {/* Arriba y no en el resumen final: es lo que decide si la venta se
          puede hacer, y enterarse al confirmar es enterarse tarde. */}
      {cliente.limiteCredito !== null && (
        <div
          className={`rounded-xl px-3.5 py-2.5 text-[13px] ${
            superaLimite ? "bg-danger-bg text-danger-text" : "bg-muted text-texto-2"
          }`}
        >
          <p className="font-bold">
            Límite {fmtMoney(cliente.limiteCredito)} · le quedan {fmtMoney(cliente.disponible ?? 0)}
          </p>
          {superaLimite && (
            <p className="mt-0.5">
              Este fiado lo pasa de su techo: hace falta la firma de un encargado.
            </p>
          )}
        </div>
      )}
    </>
  );
}

function AvisoCliente({ cliente, reconocido }: { cliente: ClienteCredito; reconocido?: boolean }) {
  const debe = esPositivo(cliente.saldoTotal);
  const vencido = esPositivo(cliente.montoVencido);
  return (
    <div
      className={`rounded-xl px-3.5 py-3 text-[13px] ${
        vencido
          ? "bg-danger-bg text-danger-text"
          : debe
            ? "bg-warning-bg text-warning-text"
            : "bg-primary-50 text-primary-700"
      }`}
    >
      <p className="font-bold">{cliente.nombre}</p>
      {/* Si se lo reconoció por lo tecleado, se dice: es la razón de que
          aparezcan su deuda y su límite sin haberlo elegido. "Ya fió" sólo si
          fió: la lista trae a todos los clientes activos, también a los de la
          agenda de belleza o de la academia que nunca fiaron, y a esos les
          decía "Ya fió antes" sin un solo fiado. */}
      {reconocido && (
        <p className="mt-0.5 text-xs">
          {cliente.vecesFiado > 0
            ? "Ya fió antes con este nombre."
            : "Ya figura como cliente con este nombre."}
        </p>
      )}
      <p className="mt-0.5">
        {vencido
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

/** Un título con sus controles, sin ser un <label> (ver el plazo). */
function Grupo({ titulo, pie, children }: { titulo: string; pie?: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={titulo}>
      <p className="mb-1.5 text-[13px] font-semibold text-texto-2">{titulo}</p>
      {children}
      {pie && <p className="mt-1 text-xs text-texto-4">{pie}</p>}
    </div>
  );
}

function Opcion({
  activa,
  onClick,
  children,
}: {
  activa: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={activa}
      onClick={onClick}
      className={`rounded-xl px-3.5 py-2 text-[13px] font-semibold transition-colors ${
        activa
          ? "bg-primary-boton text-white"
          : "border border-borde bg-white text-texto-2 hover:bg-muted"
      }`}
    >
      {children}
    </button>
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
 *
 * Exportado para el sobre-turno de la agenda, que pide la misma firma
 * (PLAN-AGENDA-BELLEZA §4): cambia sólo el subtítulo.
 */
export function PedirPinCredito({
  onCancelar,
  onFirmar,
  subtitulo = "Este fiado pasa el límite del cliente",
}: {
  onCancelar: () => void;
  onFirmar: (usuario: string, pin: string) => void;
  subtitulo?: string;
}) {
  const { usuario: actual } = useAuth();
  // Quien autoriza con PIN firma con el suyo; el resto necesita además el
  // usuario de quien autoriza.
  const pideUsuario = !tienePermiso(actual, "autorizar.pin");
  const [autorizador, setAutorizador] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  function firmar() {
    // El PIN es de 4 (18-oct); uno viejo de 5 o 6 sigue entrando.
    if (!/^\d{4,6}$/.test(pin)) return setError("El PIN son 4 dígitos.");
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
      subtitulo={subtitulo}
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
            placeholder="4 dígitos"
            className="text-lg font-bold tracking-widest"
          />
        </Campo>
        {/* Fuera del label: los tests buscan el campo por su etiqueta exacta. */}
        <p className="-mt-2 text-xs text-texto-4">
          Cada intento queda registrado con tu usuario y lo ve el administrador.
        </p>
        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </Modal>
  );
}
