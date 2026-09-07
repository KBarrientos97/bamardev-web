import { useState } from "react";
import { Icon } from "../../components/Icon";
import { QrParaCobrar } from "../../components/QrCobro";
import {
  Badge,
  Boton,
  Campo,
  Cargando,
  ErrorMsg,
  Input,
  Modal,
  Vacio,
} from "../../components/ui";
import { api, type PagoEntrega } from "../../lib/api";
import { fmtHora, fmtMoney, fmtNum } from "../../lib/format";
import { puedeSupervisar } from "../../lib/permisos";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import type { Caja, Venta } from "../../types";

export default function PantallaHistorial({
  caja,
  onAtras,
  onCierre,
}: {
  caja: Caja;
  onAtras: () => void;
  onCierre: () => void;
}) {
  const ventas = useApi(() => api.getVentas(caja.id), [caja.id]);
  const pendientes = useApi(() => api.getPedidosPendientes(), []);
  const [detalle, setDetalle] = useState<Venta | null>(null);
  const [entregando, setEntregando] = useState<Venta | null>(null);

  const lista = ventas.datos ?? [];
  const aprobadas = lista.filter((v) => v.estado === "APROBADO");
  const totalVendido = aprobadas.reduce((s, v) => s + v.total, 0);
  const porEntregar = pendientes.datos ?? [];

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-3xl flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-borde bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            onClick={onAtras}
            aria-label="Volver"
            className="rounded-lg p-1.5 text-texto-2 hover:bg-muted"
          >
            <Icon name="arrowLeft" size={20} />
          </button>
          <div>
            <h1 className="text-[15px] font-bold text-texto">Ventas del turno</h1>
            <p className="text-xs text-texto-3">
              {aprobadas.length} {aprobadas.length === 1 ? "venta" : "ventas"} ·{" "}
              {fmtMoney(totalVendido)}
            </p>
          </div>
        </div>
        <Boton variante="ghost" icono="lock" onClick={onCierre}>
          Cerrar caja
        </Boton>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        {porEntregar.length > 0 && (
          <section>
            <h2 className="mb-2 text-[13px] font-bold uppercase tracking-wide text-texto-4">
              Pedidos pendientes ({porEntregar.length})
            </h2>
            <ul className="space-y-2">
              {porEntregar.map((p) => (
                <li key={p.id} className="card flex items-center gap-3 p-3.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warning-bg text-warning-text">
                    <Icon name={p.tipoPedido === "DELIVERY" ? "truck" : "clock"} size={19} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-bold text-texto">
                      {p.clienteNombre ?? "Sin nombre"}
                    </p>
                    <p className="truncate text-xs text-texto-3">
                      {p.tipoPedido === "DELIVERY" ? p.clienteDireccion : "Pasa a recoger"}
                      {p.repartidor ? ` · ${p.repartidor.nombre}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[13px] font-bold text-texto">{fmtMoney(p.total)}</p>
                    <Badge tono={p.prepagado ? "verde" : "amarillo"}>
                      {p.prepagado ? "Pagado" : "Cobra al entregar"}
                    </Badge>
                    {/* Un DELIVERY lo cierra el repartidor desde su pantalla.
                        Un RECOGER lo cierra quien está en la caja: el cliente
                        pasa por el mostrador y no hay nadie más que lo haga —
                        sin esto el pedido quedaba pendiente para siempre. */}
                    {p.tipoPedido === "RECOGER" && (
                      <button
                        onClick={() => setEntregando(p)}
                        className="mt-1.5 block w-full rounded-lg bg-primary px-2.5 py-1 text-xs font-bold text-white"
                      >
                        {p.prepagado ? "Entregar" : "Cobrar y entregar"}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h2 className="mb-2 text-[13px] font-bold uppercase tracking-wide text-texto-4">
            Ventas
          </h2>
          <ErrorMsg>{ventas.error}</ErrorMsg>
          {ventas.cargando ? (
            <Cargando />
          ) : lista.length === 0 ? (
            <div className="card">
              <Vacio
                icono="cart"
                titulo="Sin ventas todavía"
                texto="Las ventas de este turno aparecerán acá."
              />
            </div>
          ) : (
            <ul className="space-y-2">
              {lista.map((v) => (
                <li key={v.id}>
                  <button
                    onClick={() => setDetalle(v)}
                    className="card flex w-full items-center gap-3 p-3.5 text-left transition-shadow hover:shadow-md"
                  >
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                        v.estado === "ANULADO"
                          ? "bg-danger-bg text-danger-text"
                          : "bg-primary-50 text-primary-700"
                      }`}
                    >
                      <Icon name={v.estado === "ANULADO" ? "x" : "check"} size={19} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-bold text-texto">
                          {v.comprobante ?? `#${v.id}`}
                        </span>
                        {v.estado === "ANULADO" && <Badge tono="rojo">Anulada</Badge>}
                        {v.tipoPedido !== "LOCAL" && (
                          <Badge tono="azul">
                            {v.tipoPedido === "DELIVERY" ? "Delivery" : "Recojo"}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-texto-3">
                        {fmtHora(v.fecha)} · {v.items ?? 0}{" "}
                        {(v.items ?? 0) === 1 ? "artículo" : "artículos"}
                        {v.formasPago?.length ? ` · ${v.formasPago.join(" + ")}` : ""}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 text-sm font-bold ${
                        v.estado === "ANULADO"
                          ? "text-texto-4 line-through"
                          : "text-texto"
                      }`}
                    >
                      {fmtMoney(v.total)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {entregando && (
        <EntregarRecoger
          pedido={entregando}
          onClose={() => setEntregando(null)}
          onEntregado={() => {
            setEntregando(null);
            pendientes.recargar();
            ventas.recargar();
          }}
        />
      )}

      {detalle && (
        <DetalleVenta
          venta={detalle}
          onClose={() => setDetalle(null)}
          onAnulada={() => {
            setDetalle(null);
            ventas.recargar();
          }}
        />
      )}
    </div>
  );
}

function DetalleVenta({
  venta,
  onClose,
  onAnulada,
}: {
  venta: Venta;
  onClose: () => void;
  onAnulada: () => void;
}) {
  const { usuario, incluye } = useAuth();
  const completa = useApi(() => api.getVenta(venta.id), [venta.id]);
  const [anulando, setAnulando] = useState(false);

  const v = completa.datos ?? venta;

  /**
   * Sólo se anula lo cobrado 100% en efectivo. Anular devuelve la plata del
   * arqueo, y ese movimiento no tiene contrapartida en el banco: con un cobro
   * por QR el dinero ya entró a la cuenta y la anulación lo borraría del
   * sistema sin sacarlo de ningún lado. La app aplica la misma regla
   * (`DetalleVentaFragment.puedeAnular`).
   *
   * Se mira por NOMBRE y no por id: `FormaPago` es una tabla por negocio con id
   * autoincremental global, así que el "QR" de un cliente no tiene el mismo id
   * que el de otro.
   */
  const cobradaConQr = (v.pagos ?? []).some((p) =>
    (p.formaPago ?? "").toLowerCase().includes("qr"),
  );

  // Anular pasa siempre por el PIN de un encargado: sin esa capacidad el
  // negocio no compró forma de autorizarlo, así que no se ofrece.
  const puedeAnular =
    v.estado === "APROBADO" && incluye("autorizacion_pin") && !cobradaConQr;

  return (
    <>
      <Modal
        abierto
        titulo={v.comprobante ?? `Venta #${v.id}`}
        subtitulo={fmtHora(v.fecha)}
        onClose={onClose}
        acciones={
          puedeAnular && (
            <Boton variante="danger" icono="x" onClick={() => setAnulando(true)}>
              Anular venta
            </Boton>
          )
        }
      >
        {completa.cargando ? (
          <Cargando />
        ) : (
          <div className="space-y-4">
            {/* Sin esto el botón simplemente no está y el cajero cree que la
                app falla: hay que decir por qué no se puede. */}
            {v.estado === "APROBADO" && cobradaConQr && (
              <div className="rounded-xl bg-muted px-3.5 py-2.5 text-[13px] text-texto-2">
                <p className="font-bold text-texto">Esta venta no se puede anular</p>
                <p className="mt-0.5">
                  Se cobró por QR y esa plata ya entró a la cuenta del negocio. Devolvele
                  al cliente por el mismo medio y registrá la salida en movimientos de caja.
                </p>
              </div>
            )}

            {v.estado === "ANULADO" && (
              <div className="rounded-xl bg-danger-bg px-3.5 py-2.5 text-[13px] text-danger-text">
                <p className="font-bold">Venta anulada</p>
                {v.anulacionAutorizadaPor && (
                  <p className="mt-0.5">Autorizó: {v.anulacionAutorizadaPor}</p>
                )}
              </div>
            )}

            <ul className="divide-y divide-borde-soft">
              {(v.detalles ?? []).map((d, i) => (
                <li key={i} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-[13px] text-texto">
                      <span className="font-bold">{fmtNum(d.cantidad)}×</span> {d.producto}
                    </p>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <Badge tono={d.consumo === "MESA" ? "azul" : "gris"}>
                        {d.consumo === "MESA" ? "Mesa" : "Llevar"}
                      </Badge>
                      {d.nota && <span className="text-xs italic text-texto-3">{d.nota}</span>}
                    </div>
                  </div>
                  <span className="shrink-0 text-[13px] font-bold">{fmtMoney(d.subtotal)}</span>
                </li>
              ))}
            </ul>

            <dl className="space-y-1 border-t border-borde pt-3 text-sm">
              <div className="flex justify-between text-base font-extrabold text-texto">
                <dt>Total</dt>
                <dd>{fmtMoney(v.total)}</dd>
              </div>
              {(v.pagos ?? []).map((p, i) => (
                <div key={i} className="flex justify-between text-texto-2">
                  <dt>{p.formaPago ?? "Pago"}</dt>
                  <dd>{fmtMoney(p.monto)}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </Modal>

      {anulando && (
        <DialogoAnular
          venta={v}
          // El backend pide el PIN SIEMPRE, también al dueño. Un supervisor
          // se autoriza a sí mismo; un cajero necesita que un encargado
          // teclee su usuario y PIN en el momento, sin cerrar sesión.
          pideUsuario={!puedeSupervisar(usuario?.rol ?? "CAJERO")}
          onClose={() => setAnulando(false)}
          onAnulada={() => {
            setAnulando(false);
            onAnulada();
          }}
        />
      )}
    </>
  );
}

function DialogoAnular({
  venta,
  pideUsuario,
  onClose,
  onAnulada,
}: {
  venta: Venta;
  pideUsuario: boolean;
  onClose: () => void;
  onAnulada: () => void;
}) {
  const [autorizador, setAutorizador] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function anular() {
    setError("");
    if (!/^\d{4,6}$/.test(pin)) return setError("El PIN son 4 a 6 dígitos.");
    if (pideUsuario && autorizador.trim().length < 3)
      return setError("Poné el usuario del encargado que autoriza.");

    setEnviando(true);
    try {
      await api.anularVenta(venta.id, {
        ...(pideUsuario ? { autorizadorUsername: autorizador.trim() } : {}),
        autorizadorPin: pin,
      });
      onAnulada();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo anular");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      abierto
      titulo="Anular venta"
      subtitulo={`${venta.comprobante ?? `#${venta.id}`} · ${fmtMoney(venta.total)}`}
      onClose={onClose}
      ancho="max-w-sm"
      acciones={
        <>
          <Boton variante="ghost" onClick={onClose}>
            Cancelar
          </Boton>
          <Boton variante="danger" onClick={anular} disabled={enviando}>
            {enviando ? "Anulando…" : "Anular"}
          </Boton>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-[13px] text-texto-2">
          La venta queda anulada y el stock vuelve al inventario. No se puede deshacer.
        </p>

        {pideUsuario && (
          <Campo label="Usuario que autoriza" hint="Un encargado con PIN">
            <Input
              value={autorizador}
              onChange={(e) => setAutorizador(e.target.value)}
              autoComplete="off"
              autoFocus
            />
          </Campo>
        )}

        <Campo label="PIN de autorización">
          <Input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            autoComplete="off"
            autoFocus={!pideUsuario}
            className="tracking-[0.3em]"
          />
        </Campo>

        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </Modal>
  );
}

/**
 * Cierra un pedido "recoger" desde la caja: el cliente pasó por el mostrador.
 *
 * Existe porque un DELIVERY lo cierra el repartidor desde su pantalla, pero un
 * RECOGER no involucra a nadie más: sin esto el pedido quedaba pendiente para
 * siempre y su plata nunca entraba al turno. Es lo que hace `HistorialFragment`
 * en la app.
 *
 * Si venía prepagado sólo se confirma la entrega; si se cobraba al retirar, la
 * plata entra recién ahora.
 */
function EntregarRecoger({
  pedido,
  onClose,
  onEntregado,
}: {
  pedido: Venta;
  onClose: () => void;
  onEntregado: () => void;
}) {
  const { incluye } = useAuth();
  const formasPago = useApi(() => api.getFormasPago(), []);
  const [metodo, setMetodo] = useState<"EFECTIVO" | "QR">("EFECTIVO");
  const [recibido, setRecibido] = useState("");
  const [qrConfirmado, setQrConfirmado] = useState(false);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  const formas = formasPago.datos ?? [];
  const efectivo = formas.find((f) => f.nombre.toLowerCase() === "efectivo");
  const qr = formas.find((f) => f.nombre.toLowerCase() === "qr");
  const permiteQr = incluye("pago_qr_mixto") && !!qr;

  const total = pedido.total;
  const recibidoNum = Number(recibido) || 0;
  const cambio = metodo === "QR" ? 0 : Math.max(0, Math.round((recibidoNum - total) * 100) / 100);

  async function confirmar() {
    if (enviando) return;
    setError("");

    let pagos: PagoEntrega[] | undefined;
    // Un pedido ya cobrado en caja se entrega sin pagos: la plata entró cuando
    // se tomó, y volver a registrarla la contaría dos veces en el arqueo.
    if (!pedido.prepagado) {
      if (metodo === "EFECTIVO") {
        if (!efectivo) return setError("El negocio no tiene cargada la forma de pago Efectivo.");
        if (recibidoNum < total) return setError("Lo recibido no alcanza para cubrir el total.");
        pagos = [{ formaPagoId: efectivo.id, monto: total, recibido: recibidoNum }];
      } else {
        if (!qr) return setError("El negocio no tiene cargada la forma de pago QR.");
        if (!qrConfirmado) return setError("Confirmá que el pago por QR llegó antes de entregar.");
        pagos = [{ formaPagoId: qr.id, monto: total }];
      }
    }

    setEnviando(true);
    try {
      await api.entregarPedido(pedido.id, pagos);
      onEntregado();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo entregar el pedido");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      abierto
      titulo={pedido.prepagado ? "Entregar pedido" : "Cobrar y entregar"}
      subtitulo={pedido.clienteNombre ?? `Pedido #${pedido.id}`}
      onClose={onClose}
      acciones={
        <>
          <Boton variante="ghost" onClick={onClose}>
            Cancelar
          </Boton>
          <Boton onClick={confirmar} disabled={enviando}>
            {enviando ? "Confirmando…" : pedido.prepagado ? "Entregar" : "Cobrar y entregar"}
          </Boton>
        </>
      }
    >
      <div className="space-y-3">
        <div className="rounded-xl bg-muted px-3.5 py-2.5">
          <div className="flex justify-between text-[13px] font-bold text-texto">
            <span>Total del pedido</span>
            <span>{fmtMoney(total)}</span>
          </div>
        </div>

        {pedido.prepagado ? (
          <p className="text-[13px] text-texto-3">
            Este pedido ya se cobró al tomarlo. Confirmá que el cliente lo retiró.
          </p>
        ) : (
          <>
            {permiteQr && (
              <div className="grid grid-cols-2 gap-2">
                {(["EFECTIVO", "QR"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => {
                      setMetodo(m);
                      setQrConfirmado(false);
                      setError("");
                    }}
                    className={`rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition-colors ${
                      metodo === m
                        ? "border-primary bg-primary-50 text-primary-700"
                        : "border-borde bg-white text-texto-2"
                    }`}
                  >
                    {m === "EFECTIVO" ? "Efectivo" : "QR"}
                  </button>
                ))}
              </div>
            )}

            {metodo === "EFECTIVO" ? (
              <>
                <Campo label="Efectivo recibido">
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={recibido}
                    onChange={(e) => setRecibido(e.target.value)}
                    autoFocus
                    className="text-lg font-bold"
                  />
                </Campo>
                {cambio > 0 && (
                  <div className="rounded-xl bg-primary-50 px-3.5 py-2.5 text-[13px] font-bold text-primary-700">
                    Cambio: {fmtMoney(cambio)}
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-xl border border-borde bg-white p-4">
                <QrParaCobrar
                  confirmado={qrConfirmado}
                  onConfirmar={() => setQrConfirmado(true)}
                  monto={fmtMoney(total)}
                />
              </div>
            )}
          </>
        )}

        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </Modal>
  );
}
