import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../components/Icon";
import InputMonto from "../../components/InputMonto";
import { QrParaCobrar } from "../../components/QrCobro";
import { Chips } from "../../components/filtros";
import {
  Badge,
  Boton,
  Campo,
  Cargando,
  Confirmar,
  ErrorMsg,
  Kpi,
  Modal,
  Vacio,
} from "../../components/ui";
import { api, type PagoEntrega } from "../../lib/api";
import { aCentavos, cubre, esPositivo, excede, restoEnEfectivo, vuelto } from "../../lib/dinero";
import { fmtHora, fmtMoney, fmtNum } from "../../lib/format";
import { atajosDeEfectivo } from "../../lib/billetes";
import { leerMonto, montoParaEditar } from "../../lib/montoTecleado";
import { tieneFeature } from "../../lib/permisos";
import { Telefono } from "../../lib/telefono";
import { useApi } from "../../lib/useApi";
import { enlaceWhatsApp, mensajePedido, pedidoDeVenta } from "../../lib/mensajePedido";
import { useAuth } from "../../store/AuthContext";
import type { FormaPago, Venta } from "../../types";
import { cobradoPorQr, rendicionDelTurno } from "./rendicion";

type Vista = "pendientes" | "entregadas";

const VISTAS = [
  ["pendientes", "Por entregar"],
  ["entregadas", "Entregadas"],
] as const satisfies readonly (readonly [Vista, string])[];

/**
 * App del repartidor: ve los pedidos que le asignaron, los entrega, cobra
 * (efectivo / QR / mixto) y rinde cuentas al final del turno.
 *
 * El modelo de dinero, que es lo que hace cuadrar los arqueos:
 *   • Pedido contra entrega → lo cobra el repartidor → entra a su RENDICIÓN.
 *   • Pedido prepagado en caja → ya lo cobró la cajera → NO entra a la
 *     rendición (el repartidor sólo confirma la entrega).
 *   • La tarifa de envío SIEMPRE se la queda el repartidor: no entra ni a la
 *     caja ni a la rendición. Por eso `montoRendicion` la excluye.
 */
export default function Repartidor() {
  const { usuario } = useAuth();
  const entregas = useApi(() => api.getMisEntregas(), []);

  /**
   * Refresco cada minuto: un pedido recién asignado no aparecía hasta salir y
   * volver a entrar, y el repartidor se quedaba esperando sin saber que ya
   * tenía trabajo. Sólo con la pestaña visible — refrescar en segundo plano
   * gasta datos del celular sin que nadie lo esté mirando.
   */
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") entregas.recargar();
    }, 60_000);
    const alVolver = () => {
      if (document.visibilityState === "visible") entregas.recargar();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", alVolver);
    };
    // Sólo al montar: `recargar` es estable y volver a suscribirse en cada
    // render dejaría timers colgados.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const formasPago = useApi(() => api.getFormasPago(), []);

  const [vista, setVista] = useState<Vista>("pendientes");
  const [detalle, setDetalle] = useState<Venta | null>(null);
  const [rendicionAbierta, setRendicionAbierta] = useState(false);

  // Lo que se le entrega al negocio es SÓLO el efectivo (`enEfectivo`): lo
  // cobrado por QR ya está en su cuenta. La cuenta vive en `rendicion.ts`.
  const { pendientes, entregadas, tarifas, enEfectivo, porQr } = useMemo(
    () => rendicionDelTurno(entregas.datos ?? []),
    [entregas.datos],
  );

  const mostradas = vista === "pendientes" ? pendientes : entregadas;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-texto">Mis entregas</h1>
          <p className="mt-0.5 text-[13px] text-texto-3">
            {usuario?.nombre ?? usuario?.username}
          </p>
        </div>
        <Boton variante="ghost" icono="dollar" onClick={() => setRendicionAbierta(true)}>
          Rendición
        </Boton>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Kpi etiqueta="Por entregar" valor={String(pendientes.length)} icono="truck" tono="amarillo" />
        <Kpi etiqueta="Entregadas" valor={String(entregadas.length)} icono="check" />
        {/* El efectivo, como "A entregar al negocio" de la rendición: con el QR
            adentro le pedía plata que ya estaba en el banco (BUG-pedidos-3). */}
        <Kpi
          etiqueta="A rendir"
          valor={fmtMoney(enEfectivo)}
          pie="en efectivo"
          icono="dollar"
          tono="marca"
        />
      </div>

      <Chips valor={vista} opciones={VISTAS} onChange={setVista} />

      <ErrorMsg>{entregas.error}</ErrorMsg>

      {entregas.cargando ? (
        <Cargando />
      ) : mostradas.length === 0 ? (
        <div className="card">
          <Vacio
            icono="truck"
            titulo={vista === "pendientes" ? "Sin pedidos pendientes" : "Sin entregas todavía"}
            texto={
              vista === "pendientes"
                ? "Cuando te asignen un pedido lo vas a ver acá."
                : "Las entregas del turno aparecerán acá."
            }
          />
        </div>
      ) : (
        <ul className="space-y-2.5">
          {mostradas.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => setDetalle(p)}
                className="card flex w-full items-center gap-3 p-4 text-left transition-shadow hover:shadow-md"
              >
                <span
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                    p.estadoEntrega === "ENTREGADO"
                      ? "bg-primary-50 text-primary-700"
                      : "bg-warning-bg text-warning-text"
                  }`}
                >
                  <Icon name={p.estadoEntrega === "ENTREGADO" ? "check" : "truck"} size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-texto">
                    {p.clienteNombre ?? "Sin nombre"}
                  </p>
                  <p className="truncate text-xs text-texto-3">{p.clienteDireccion}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {/* Entregado ya no debe nada: seguía en ámbar "Cobra al
                        entregar" al lado de "Cobrado Bs 35,00" (QA 29-oct). */}
                    <Badge tono={p.prepagado || p.estadoEntrega === "ENTREGADO" ? "verde" : "amarillo"}>
                      {p.estadoEntrega === "ENTREGADO" ? "Entregado" : p.prepagado ? "Ya pagado" : "Cobra al entregar"}
                    </Badge>
                    <span className="text-xs text-texto-4">{fmtHora(p.fecha)}</span>
                  </div>
                </div>
                {/* `totalACobrar` YA trae el envío (y en un prepagado es sólo
                    el envío): debajo decía "+Bs 8,00 envío" y un pedido de Bs 58
                    se leía como 58 + 8, y uno pagado en caja como 8 + 8
                    (BUG-pedidos-10). Ahora dice qué es el número. */}
                <div className="shrink-0 text-right">
                  <p className="text-xs text-texto-3">
                    {p.estadoEntrega === "ENTREGADO" ? "Cobrado" : "A cobrar"}
                  </p>
                  <p className="text-sm font-bold text-texto">
                    {fmtMoney(p.totalACobrar ?? 0)}
                  </p>
                  {esPositivo(p.tarifaEnvio ?? 0) && (
                    <p className="text-xs text-texto-3">
                      {p.prepagado ? "es tu envío" : `incluye ${fmtMoney(p.tarifaEnvio)} de envío`}
                    </p>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {detalle && (
        <DetalleEntrega
          pedido={detalle}
          formasPago={formasPago.datos ?? []}
          onClose={() => setDetalle(null)}
          onCambio={() => {
            setDetalle(null);
            entregas.recargar();
          }}
        />
      )}

      {rendicionAbierta && (
        <Modal
          abierto
          titulo="Rendición del turno"
          subtitulo={`${entregadas.length} ${entregadas.length === 1 ? "entrega" : "entregas"}`}
          onClose={() => setRendicionAbierta(false)}
          acciones={
            <Boton onClick={() => setRendicionAbierta(false)}>Entendido</Boton>
          }
        >
          <div className="space-y-4">
            {/* Sólo el efectivo: lo cobrado por QR ya entró a la cuenta del
                negocio y el repartidor no lo tiene en la mano. El número
                grande sumaba el QR (BUG-pedidos-3), aunque el comentario de
                abajo ya decía que se entrega sólo el efectivo. */}
            <div className="rounded-2xl bg-marca p-5 text-center text-white">
              <p className="text-xs font-semibold uppercase tracking-wide opacity-90">
                A entregar al negocio
              </p>
              <p className="mt-1 text-3xl font-extrabold">{fmtMoney(enEfectivo)}</p>
              <p className="mt-0.5 text-xs opacity-90">en efectivo</p>
            </div>

            {/* Con QR, a dónde fue cada parte: sin esto lo cobrado no cierra
                con lo que se entrega y parece que falta plata. */}
            {esPositivo(porQr) && (
              <>
                <dl className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-muted px-3 py-2.5">
                    <dt className="text-xs text-texto-3">Efectivo en mano</dt>
                    <dd className="text-[13px] font-bold text-texto">{fmtMoney(enEfectivo)}</dd>
                  </div>
                  <div className="rounded-xl bg-muted px-3 py-2.5">
                    <dt className="text-xs text-texto-3">Ya cobrado por QR</dt>
                    <dd className="text-[13px] font-bold text-texto">{fmtMoney(porQr)}</dd>
                  </div>
                </dl>
                <p className="text-[13px] text-texto-3">
                  Lo cobrado por QR ({fmtMoney(porQr)}) ya está en la cuenta del negocio: no lo
                  entregás.
                </p>
              </>
            )}

            <p className="rounded-xl bg-primary-50 px-3.5 py-2.5 text-[13px] text-primary-700">
              Las tarifas de envío ({fmtMoney(tarifas)}) son tuyas: no entran en la
              rendición. Los pedidos que ya venían pagados tampoco.
            </p>

            {entregadas.length === 0 ? (
              <p className="text-[13px] text-texto-3">Todavía no entregaste ningún pedido.</p>
            ) : (
              <ul className="divide-y divide-borde-soft">
                {entregadas.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-texto">
                        {p.clienteNombre}
                      </p>
                      <p className="text-xs text-texto-3">
                        {fmtHora(p.entregadoEn ?? p.fecha)}
                        {p.prepagado ? " · ya estaba pagado" : comoSeCobro(p)}
                      </p>
                    </div>
                    <span className="shrink-0 text-[13px] font-bold text-texto">
                      {fmtMoney(p.montoRendicion ?? 0)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

/**
 * Con qué se cobró lo que rinde un pedido, para el renglón de la rendición:
 * " · Efectivo", " · QR" o, en un mixto, con los montos reales de cada forma
 * (DEL-2). Así el repartidor ve qué pedido explica cada parte del desglose.
 */
function comoSeCobro(p: Venta): string {
  const rinde = p.montoRendicion ?? 0;
  if (!esPositivo(rinde)) return "";
  // Sin los montos (un backend anterior) quedan los nombres, que no mienten.
  if (!p.pagos) return p.formasPago?.length ? ` · ${p.formasPago.join(" + ")}` : "";
  const qr = cobradoPorQr(p);
  if (!esPositivo(qr)) return " · Efectivo";
  const efectivo = aCentavos(rinde - qr);
  if (!esPositivo(efectivo)) return " · QR";
  return ` · QR ${fmtMoney(qr)} + efectivo ${fmtMoney(efectivo)}`;
}

function DetalleEntrega({
  pedido,
  formasPago,
  onClose,
  onCambio,
}: {
  pedido: Venta;
  formasPago: FormaPago[];
  onClose: () => void;
  onCambio: () => void;
}) {
  const completo = useApi(() => api.getVenta(pedido.id), [pedido.id]);
  const { negocio } = useAuth();
  const [cobrando, setCobrando] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  const p = completo.datos ?? pedido;
  const pendiente = p.estadoEntrega === "PENDIENTE";
  // Dos montos distintos y no da igual cuál se usa dónde: `totalACobrar` es
  // lo que el repartidor pide en mano (productos + envío) y `total` es lo
  // único que el backend acepta como suma de los pagos, porque la tarifa la
  // guarda aparte. Mandarle totalACobrar rechazaba la entrega con un 400 y
  // el pedido quedaba pendiente para siempre.
  const aCobrar = p.totalACobrar ?? 0;
  const aRegistrar = p.total ?? 0;
  // Un pedido prepagado sólo se confirma: la plata ya entró a la caja.
  const soloConfirmar = pendiente && (p.prepagado || aCobrar <= 0);

  // Con el helper de toda la web (`lib/telefono`, calcado de `Telefono.kt`),
  // como la caja. Armado a mano, "Llamar" marcaba los dígitos tal cual: un
  // número guardado como "+591 7…" quedaba `tel:5917…`, sin el "+"
  // (BUG-pedidos-12). Los dos son null juntos, con el teléfono vacío.
  const paraLlamar = Telefono.paraLlamada(p.clienteTelefono);
  const numeroWhatsApp = Telefono.paraWhatsApp(p.clienteTelefono);
  // Pendiente: el chat abre con el aviso de llegada ya escrito, el mismo de la
  // app (Kevin, 15-oct). Antes abría vacío y había que tipear todo en la puerta.
  const hrefWhatsApp = !numeroWhatsApp
    ? null
    : pendiente
      ? enlaceWhatsApp(numeroWhatsApp, mensajePedido(pedidoDeVenta(p), negocio?.nombre))
      : `https://wa.me/${numeroWhatsApp}`;

  async function confirmarEntrega(pagos?: PagoEntrega[]) {
    setError("");
    setEnviando(true);
    try {
      await api.entregarPedido(p.id, pagos);
      onCambio();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo confirmar la entrega");
    } finally {
      setEnviando(false);
    }
  }

  async function cancelar() {
    if (enviando) return;
    setError("");
    setEnviando(true);
    try {
      await api.cancelarPedido(p.id);
      onCambio();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cancelar");
      setCancelando(false);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <Modal
        abierto
        titulo={p.clienteNombre ?? "Pedido"}
        subtitulo={p.comprobante ?? `#${p.id}`}
        onClose={onClose}
        acciones={
          pendiente && (
            <>
              <Boton variante="ghost" onClick={() => setCancelando(true)}>
                Cancelar pedido
              </Boton>
              {soloConfirmar ? (
                <Boton icono="check" onClick={() => confirmarEntrega()} disabled={enviando}>
                  {enviando ? "Confirmando…" : "Marcar entregado"}
                </Boton>
              ) : (
                <Boton icono="dollar" onClick={() => setCobrando(true)}>
                  Cobrar {fmtMoney(aCobrar)}
                </Boton>
              )}
            </>
          )
        }
      >
        {completo.cargando ? (
          <Cargando />
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl bg-muted p-3.5">
              <p className="text-[13px] text-texto">{p.clienteDireccion}</p>
              {p.notaPedido && (
                <p className="mt-1 text-[13px] italic text-texto-3">{p.notaPedido}</p>
              )}
              {paraLlamar && hrefWhatsApp && (
                <div className="mt-2.5 flex gap-2">
                  <a
                    href={`tel:${paraLlamar}`}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-borde bg-white px-3 py-3 text-[13px] font-semibold text-texto-2 hover:bg-muted"
                  >
                    <Icon name="phone" size={15} /> Llamar
                  </a>
                  <a
                    href={hrefWhatsApp}
                    target="_blank"
                    rel="noreferrer"
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-borde bg-white px-3 py-3 text-[13px] font-semibold text-texto-2 hover:bg-muted"
                  >
                    <Icon name="phone" size={15} /> WhatsApp
                  </a>
                </div>
              )}
            </div>

            <ul className="divide-y divide-borde-soft">
              {(p.detalles ?? []).map((d, i) => (
                <li key={i} className="flex items-start justify-between gap-3 py-2.5">
                  <p className="text-[13px] text-texto">
                    <span className="font-bold">{fmtNum(d.cantidad)}×</span> {d.producto}
                    {d.nota && (
                      <span className="block text-xs italic text-texto-3">{d.nota}</span>
                    )}
                  </p>
                  <span className="shrink-0 text-[13px] font-bold">{fmtMoney(d.subtotal)}</span>
                </li>
              ))}
            </ul>

            <dl className="space-y-1 border-t border-borde pt-3 text-sm">
              <div className="flex justify-between text-texto-2">
                <dt>Productos</dt>
                <dd>{fmtMoney(p.total)}</dd>
              </div>
              {p.tarifaEnvio > 0 && (
                <div className="flex justify-between text-texto-2">
                  <dt>Envío (tuyo)</dt>
                  <dd>{fmtMoney(p.tarifaEnvio)}</dd>
                </div>
              )}
              <div className="flex justify-between border-t border-borde pt-1.5 text-base font-extrabold text-texto">
                <dt>{p.prepagado ? "Ya pagado" : "A cobrar"}</dt>
                <dd>{fmtMoney(p.prepagado ? p.total : aCobrar)}</dd>
              </div>
              {!p.prepagado && (
                <p className="pt-1 text-xs text-texto-3">
                  De esto rendís {fmtMoney(p.montoRendicion ?? 0)} al negocio.
                </p>
              )}
            </dl>

            <ErrorMsg>{error}</ErrorMsg>
          </div>
        )}
      </Modal>

      {cobrando && (
        <DialogoCobroEntrega
          total={aRegistrar}
          aPedirEnMano={aCobrar}
          formasPago={formasPago}
          enviando={enviando}
          onClose={() => setCobrando(false)}
          onConfirmar={(pagos) => confirmarEntrega(pagos)}
        />
      )}

      <Confirmar
        abierto={cancelando}
        titulo="Cancelar pedido"
        texto="El pedido queda cancelado y el stock vuelve al inventario."
        etiquetaOk="Cancelar pedido"
        peligroso
        procesando={enviando}
        onCancel={() => setCancelando(false)}
        onOk={cancelar}
      />
    </>
  );
}

function DialogoCobroEntrega({
  total,
  aPedirEnMano,
  formasPago,
  enviando,
  onClose,
  onConfirmar,
}: {
  /** Lo que se registra como pago: sólo productos, sin el envío. */
  total: number;
  /** Lo que el repartidor cobra en mano, con la tarifa de envío incluida. */
  aPedirEnMano: number;
  formasPago: FormaPago[];
  enviando: boolean;
  onClose: () => void;
  onConfirmar: (pagos: PagoEntrega[]) => void;
}) {
  const { negocio } = useAuth();
  const efectivo = formasPago.find((f) => f.nombre.toLowerCase() === "efectivo");
  const qr = formasPago.find((f) => f.nombre.toLowerCase() === "qr");
  // El plan tiene que incluirlo Y la forma de pago tiene que existir: ofrecer
  // el método sin ella termina en un cobro que el backend rechaza, con el
  // cliente esperando en la puerta.
  const permiteQr = tieneFeature(negocio?.features, "pago_qr_mixto") && !!qr;

  const [metodo, setMetodo] = useState<"EFECTIVO" | "QR" | "MIXTO">("EFECTIVO");
  const [recibido, setRecibido] = useState("");
  const [montoQr, setMontoQr] = useState("");
  const [error, setError] = useState("");
  // El repartidor cobra fuera del local: es donde MÁS hace falta confirmar que
  // la transferencia llegó, porque nadie más lo va a mirar por él.
  const [qrConfirmado, setQrConfirmado] = useState(false);

  function elegirMetodo(m: "EFECTIVO" | "QR" | "MIXTO") {
    setMetodo(m);
    setQrConfirmado(false);
    setError("");
  }

  // Como en el cierre: "1.500" son mil quinientos, no Bs 1,50 (26-oct).
  const recibidoNum = leerMonto(recibido) ?? 0;
  const qrNum = leerMonto(montoQr) ?? 0;
  // La tarifa del repartidor: lo que se cobra en mano por encima de lo del negocio.
  const tarifa = Math.max(0, aCentavos(aPedirEnMano - total));
  const enEfectivo = metodo === "MIXTO" ? restoEnEfectivo(total, qrNum) : total;
  // El vuelto se calcula sobre lo que el cliente entrega en mano, que incluye
  // el envío: si no, el repartidor le devolvería de más.
  const efectivoEnMano =
    metodo === "MIXTO" ? restoEnEfectivo(aPedirEnMano, qrNum) : aPedirEnMano;
  const cambio = metodo === "QR" ? 0 : vuelto(recibidoNum, efectivoEnMano);
  // Los mismos atajos que el cobro del POS y que Android (CobroEntregaFragment):
  // el monto justo y los billetes de Bolivia que lo cubren (Kevin 25-oct: "en
  // todas las pantallas"). Sobre lo que entrega en mano, que incluye la tarifa.
  const sugerencias = esPositivo(efectivoEnMano)
    ? [aCentavos(efectivoEnMano), ...atajosDeEfectivo(efectivoEnMano)]
    : [];
  // Como "recibido" va lo que entra por la venta: lo del negocio más el
  // vuelto, sin el envío que se queda el repartidor, como la app
  // (`CobroEntregaFragment`). El backend guarda de cambio `recibido − monto`,
  // y con lo que el cliente dio en mano el envío quedaba como vuelto: un
  // pedido de Bs 42 con Bs 8 de envío pagado con Bs 50 justos decía en su
  // recibo "Cambio Bs 8,00" sin que hubiera cambio (REP-02, 28-oct).
  const recibidoDelNegocio = aCentavos(enEfectivo + cambio);
  // Mixto: cuánto pedir en mano, como la app (el resto de lo del negocio más
  // la tarifa), o hasta dónde llega el QR antes de tocar cobrar.
  const ayudaMixto =
    esPositivo(qrNum) && !excede(qrNum, total)
      ? `En efectivo: ${fmtMoney(efectivoEnMano)}${esPositivo(tarifa) ? ", con tu tarifa" : ""}.`
      : esPositivo(tarifa)
        ? `Por QR, hasta ${fmtMoney(total)}: tu tarifa va en efectivo.`
        : "";

  function confirmar() {
    setError("");
    if (metodo === "EFECTIVO") {
      if (!efectivo) return setError("Falta la forma de pago Efectivo.");
      if (recibidoNum < aPedirEnMano) return setError("Lo recibido no cubre el total.");
      return onConfirmar([{ formaPagoId: efectivo.id, monto: total, recibido: recibidoDelNegocio }]);
    }
    if (metodo === "QR") {
      if (!qr) return setError("Falta la forma de pago QR.");
      if (!qrConfirmado) return setError("Confirmá que el pago por QR llegó.");
      return onConfirmar([{ formaPagoId: qr.id, monto: total }]);
    }
    if (!efectivo || !qr) return setError("Faltan formas de pago para cobrar mixto.");
    if (!esPositivo(qrNum)) return setError("Poné cuánto se paga por QR.");
    if (!esPositivo(tarifa) && cubre(qrNum, total)) {
      return setError("Si el QR cubre todo, cobrá con el método QR.");
    }
    // Por QR va sólo lo del negocio, como la app: la tarifa queda en efectivo
    // para el repartidor (DEL-3). Sólo se frenaba un QR que cubriera también el
    // envío: uno igual a lo de los productos mandaba un pago en efectivo de
    // Bs 0, y uno mayor hacía pasar la suma del total, y el backend rebotaba
    // los dos con un 400 con el cliente en la puerta (BUG-pedidos-2). "Los 50
    // por QR y los 8 del envío en efectivo" es el mixto más común del reparto.
    if (excede(qrNum, total)) {
      return setError(
        `Por QR va sólo lo del negocio: hasta ${fmtMoney(total)}. Tu tarifa (${fmtMoney(tarifa)}) cobrala en efectivo.`,
      );
    }
    if (!qrConfirmado) return setError("Confirmá que el pago por QR llegó.");
    if (recibidoNum < efectivoEnMano) return setError("El efectivo no cubre lo que falta.");
    onConfirmar([
      { formaPagoId: qr.id, monto: aCentavos(qrNum) },
      // Con todo lo del negocio por QR, el efectivo es sólo la tarifa, que no
      // se registra: no hay pago en efectivo que mandar.
      ...(esPositivo(enEfectivo)
        ? [{ formaPagoId: efectivo.id, monto: enEfectivo, recibido: recibidoDelNegocio }]
        : []),
    ]);
  }

  return (
    <Modal
      abierto
      titulo="Cobrar la entrega"
      subtitulo={fmtMoney(aPedirEnMano)}
      onClose={onClose}
      ancho="max-w-sm"
      acciones={
        <>
          <Boton variante="ghost" onClick={onClose}>
            Cancelar
          </Boton>
          <Boton onClick={confirmar} disabled={enviando}>
            {enviando ? "Confirmando…" : "Cobrar y entregar"}
          </Boton>
        </>
      }
    >
      <div className="space-y-3">
        {/* Con envío son dos números distintos y el repartidor tiene que
            pedir el total: mostrar sólo uno se prestaba a cobrar de menos y
            poner la tarifa de su bolsillo. Y de quién es cada parte, con el
            texto de la app: lo del negocio es lo único que va por su QR. */}
        {esPositivo(tarifa) && (
          <div className="rounded-xl bg-muted px-3.5 py-2.5 text-[13px]">
            <div className="flex justify-between font-bold text-texto">
              <span>Cobrale al cliente</span>
              <span>{fmtMoney(aPedirEnMano)}</span>
            </div>
            <p className="mt-0.5 text-texto-2">
              {fmtMoney(total)} van al negocio · {fmtMoney(tarifa)} es tu tarifa
            </p>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          {(["EFECTIVO", "QR", "MIXTO"] as const).map((m) => (
            <button
              key={m}
              onClick={() => elegirMetodo(m)}
              disabled={m !== "EFECTIVO" && !permiteQr}
              className={`rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition-colors disabled:opacity-40 ${
                metodo === m
                  ? "border-primary bg-primary-50 text-primary-700"
                  : "border-borde bg-white text-texto-2"
              }`}
            >
              {m === "EFECTIVO" ? "Efectivo" : m === "QR" ? "QR" : "Mixto"}
            </button>
          ))}
        </div>

        {metodo === "MIXTO" && (
          <div className="space-y-1">
            <Campo label="Pagado por QR">
              <InputMonto
                value={montoQr}
                onChange={(texto) => {
                  // Que al salir "50" pase a "50,00" no cambia lo que entró al banco.
                  if ((leerMonto(texto) ?? 0) !== qrNum) setQrConfirmado(false);
                  setMontoQr(texto);
                }}
              />
            </Campo>
            {ayudaMixto && <p className="text-xs text-texto-3">{ayudaMixto}</p>}
          </div>
        )}

        {(metodo === "QR" || (metodo === "MIXTO" && esPositivo(qrNum))) && (
          <div className="rounded-xl border border-borde bg-white p-4">
            {/* Lo del negocio y no el total con envío (DEL-3): pedía por QR
                la tarifa del repartidor, que terminaba en el banco del negocio
                sin que nada dijera que se le debía, y lo registrado por QR no
                cuadraba con lo que entró. */}
            <QrParaCobrar
              confirmado={qrConfirmado}
              onConfirmar={() => setQrConfirmado(true)}
              monto={fmtMoney(metodo === "QR" ? total : qrNum)}
            />
          </div>
        )}

        {metodo === "QR" && esPositivo(tarifa) && (
          <p className="text-xs text-texto-3">
            Tu tarifa ({fmtMoney(tarifa)}) cobrala aparte, en efectivo: no va por el QR del
            negocio.
          </p>
        )}

        {metodo !== "QR" && (
          <>
            <Campo label="Efectivo recibido">
              <InputMonto
                value={recibido}
                onChange={setRecibido}
                autoFocus
                className="font-bold"
              />
            </Campo>
            <div className="flex flex-wrap gap-2">
              {sugerencias.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setRecibido(montoParaEditar(s))}
                  className="rounded-xl border border-borde bg-white px-3.5 py-2 text-[13px] font-semibold text-texto-2 transition-colors hover:border-primary hover:bg-primary-50 hover:text-primary-700"
                >
                  {fmtMoney(s)}
                </button>
              ))}
            </div>
            {recibido !== "" && (
              <p className="rounded-xl bg-primary-50 px-3.5 py-2.5 text-center text-[13px] font-semibold text-primary-700">
                Cambio: {fmtMoney(cambio)}
              </p>
            )}
          </>
        )}

        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </Modal>
  );
}
