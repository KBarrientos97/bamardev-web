import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Chips } from "../../components/filtros";
import { Icon } from "../../components/Icon";
import InputMonto from "../../components/InputMonto";
import { QrParaCobrar } from "../../components/QrCobro";
import CuentasPorCobrar from "./CuentasPorCobrar";
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
import { leerMonto } from "../../lib/montoTecleado";
import { fmtFechaHora, fmtHora, fmtMoney, fmtNum } from "../../lib/format";
import { Telefono } from "../../lib/telefono";
import { tienePermiso, tieneFeature } from "../../lib/permisos";
import { esBelleza, marcaConsumo } from "../../lib/rubro";
import { modulosDeCuotaVenta, nombreDeLinea, textoAnularCuotas } from "../../lib/academia/cobroCuotas";
import { useApi } from "../../lib/useApi";
import { enlaceWhatsApp, mensajePedido, pedidoDeVenta } from "../../lib/mensajePedido";
import { conCopia } from "../../lib/offline/copias";
import { formaPagoFaltante } from "../../lib/formaPagoFaltante";
import { porSubir, useColaOffline } from "../../lib/offline/cola";
import { motivosRevision, requiereRevision } from "../../lib/revisionVenta";
import AvisoSinSubir from "../../components/offline/AvisoSinSubir";
import VentasSinSubir from "../../components/offline/VentasSinSubir";
import { useAuth } from "../../store/AuthContext";
import { useCupo } from "../../store/useCupo";
import type { Caja, Venta } from "../../types";

export default function PantallaHistorial({
  caja,
  onAtras,
  onCierre,
  onVerComprobante,
}: {
  caja: Caja;
  onAtras: () => void;
  onCierre: () => void;
  /** Abre el recibo de una venta ya hecha (el POS es quien tiene esa pantalla). */
  onVerComprobante: (venta: Venta) => void;
}) {
  const { puede, negocio } = useAuth();
  // Con copia en la app del iPhone (Android: `historial_ventas_{caja}`): sin
  // señal se ve lo que ya había subido, más lo cobrado sin internet.
  const ventas = useApi(() => conCopia(`historial:${caja.id}`, () => api.getVentas(caja.id)), [caja.id]);
  // Los pedidos por entregar: los de delivery son del reparto y los de
  // recoger, de la caja (el backend le da a quien vende sólo los RECOGER).
  // Sin ninguna de las dos features no se piden (QA M-11, un salón de
  // belleza: era un 403). Con sólo `delivery` acá, un restaurante Básico no
  // veía sus pedidos para recoger de otro turno y quedaban sin cobrar (14-oct).
  const conPedidos = tieneFeature(negocio?.features, "delivery") || tieneFeature(negocio?.features, "recoger");
  const pendientes = useApi(
    () => (conPedidos ? api.getPedidosPendientes() : Promise.resolve([] as Venta[])),
    [conPedidos],
  );
  const [detalle, setDetalle] = useState<Venta | null>(null);
  const [entregando, setEntregando] = useState<Venta | null>(null);

  const todas = ventas.datos ?? [];
  /**
   * Las marcadas "a revisar" (C1). El filtro es local, sobre la misma lista del
   * turno: así funciona también con la copia offline. Sólo se ofrece si hay
   * alguna, y si deja de haberlas el filtro se apaga solo: si no, quedaría
   * prendido y oculto, con la lista vacía.
   */
  const aRevisar = todas.filter(requiereRevision).length;
  const [soloRevisar, setSoloRevisar] = useState(false);
  const filtrando = soloRevisar && aRevisar > 0;
  const lista = filtrando ? todas.filter(requiereRevision) : todas;
  // Las cobradas sin internet también son del turno: cuentan en el resumen,
  // como en Android (las rechazadas no, porque no van a llegar).
  const sinSubir = porSubir(useColaOffline()).map((v) => v.recibo);
  const aprobadas = [...sinSubir, ...todas.filter((v) => v.estado === "APROBADO")];
  const totalVendido = aprobadas.reduce((s, v) => s + v.total, 0);
  const porEntregar = pendientes.datos ?? [];

  const navigate = useNavigate();
  /**
   * Lo fiado que sigue abierto. Falla en silencio: si el plan no incluye
   * "fiado" el backend responde 403 y el bloque simplemente no aparece.
   */
  const creditos = useApi(() => api.getCreditos().catch(() => []), []);

  // En la PC (26-oct): la barra de lado a lado y dos columnas, las ventas a
  // la izquierda y el turno a la derecha. Antes era la columna del celular en
  // el medio, con la barra blanca cortada. En el celular queda igual.
  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-borde bg-white py-3 px-[max(1rem,calc(50%-24rem+1rem))] lg:px-[max(1.5rem,calc(50%-36rem+1.5rem))]">
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

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto py-4 px-[max(1rem,calc(50%-24rem+1rem))] lg:px-[max(1.5rem,calc(50%-36rem+1.5rem))] lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:content-start lg:items-start lg:gap-6 lg:space-y-0 lg:py-6">
        {/* En el celular va arriba de las ventas; en la PC, a la derecha. */}
        <aside className="space-y-5 lg:sticky lg:top-0 lg:col-start-2 lg:row-start-1">
          <ResumenTurno caja={caja} ventas={aprobadas.length} total={totalVendido} />
          {/* Antes que las ventas: es la plata que NO está en el cajón, y es lo
              que la cajera necesita ver antes de cerrar. */}
          {puede("creditos") && (
            <CuentasPorCobrar
              creditos={creditos.datos ?? []}
              onVerTodos={() => navigate("/creditos")}
            />
          )}

          <AvisoSinSubir />
          {/* Lo cobrado sin internet va primero, como en la app: es lo que
              todavía no está en el servidor (ni en el arqueo). */}
          <VentasSinSubir onVerTicket={(v) => onVerComprobante(v)} />

          {porEntregar.length > 0 && (
            <section>
              <h2 className="mb-2 text-[13px] font-bold uppercase tracking-wide text-texto-4">
                Pedidos pendientes ({porEntregar.length})
              </h2>
              <ul className="space-y-2">
                {porEntregar.map((p) => (
                  // Toda la fila abre el detalle, igual que en la app desde
                  // `eab8574`: antes acá no pasaba nada al tocarla, y el cajero no
                  // tenía forma de ver el teléfono o la nota del pedido sin ir a
                  // buscar la venta.
                  <li
                    key={p.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setDetalle(p)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setDetalle(p);
                      }
                    }}
                    className="card flex cursor-pointer items-center gap-3 p-3.5 transition-shadow hover:shadow-md"
                  >
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
                          onClick={(e) => {
                            // Que el botón no abra además el detalle de la fila.
                            e.stopPropagation();
                            setEntregando(p);
                          }}
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
        </aside>

        <section className="lg:col-start-1 lg:row-start-1">
          <h2 className="mb-2 text-[13px] font-bold uppercase tracking-wide text-texto-4">
            Ventas
          </h2>
          {aRevisar > 0 && (
            <div className="mb-2">
              <Chips
                valor={filtrando ? "revisar" : "todas"}
                opciones={[
                  ["todas", "Todas"],
                  ["revisar", `Sólo a revisar (${aRevisar})`],
                ]}
                onChange={(k) => setSoloRevisar(k === "revisar")}
              />
            </div>
          )}
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
            // En la PC, una sola tarjeta con renglones: diez tarjetas sueltas a
            // lo ancho se leen como el celular estirado.
            <ul className="space-y-2 lg:card lg:space-y-0 lg:divide-y lg:divide-borde-soft lg:overflow-hidden">
              {lista.map((v) => (
                <li key={v.id}>
                  <button
                    onClick={() => setDetalle(v)}
                    className="card flex w-full items-center gap-3 p-3.5 text-left transition-shadow hover:shadow-md lg:rounded-none lg:border-0 lg:px-5 lg:shadow-none lg:hover:bg-muted lg:hover:shadow-none"
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
                          <Badge tono="marca">
                            {v.tipoPedido === "DELIVERY" ? "Delivery" : "Recojo"}
                          </Badge>
                        )}
                        {requiereRevision(v) && <Badge tono="amarillo">A revisar</Badge>}
                      </div>
                      <p className="mt-0.5 text-xs text-texto-3">
                        {fmtHora(v.fecha)} · {v.items ?? 0}{" "}
                        {(v.items ?? 0) === 1 ? "artículo" : "artículos"}
                        {comoSePago(v) ? ` · ${comoSePago(v)}` : ""}
                      </p>
                      {/* El porqué en la misma fila: la marca sola obliga a
                          abrir cada venta para saber si es grave. */}
                      {requiereRevision(v) && motivosRevision(v).length > 0 && (
                        <p className="mt-0.5 text-xs font-semibold text-warning-text">
                          {motivosRevision(v).join(" · ")}
                        </p>
                      )}
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
            // Un pedido anulado deja de estar pendiente.
            pendientes.recargar();
          }}
          onEntregar={(v) => {
            setDetalle(null);
            setEntregando(v);
          }}
          onVerComprobante={(v) => {
            setDetalle(null);
            onVerComprobante(v);
          }}
        />
      )}
    </div>
  );
}

/**
 * El turno de un vistazo, sólo en la PC: en el celular ya lo dice la barra de
 * arriba y no hay lugar para repetirlo.
 */
function ResumenTurno({ caja, ventas, total }: { caja: Caja; ventas: number; total: number }) {
  return (
    <section aria-label="Resumen del turno" className="card hidden p-5 lg:block">
      <p className="text-[12px] font-bold uppercase tracking-wide text-texto-4">Turno</p>
      <p className="mt-1 text-sm text-texto-3">
        Abierta desde {fmtHora(caja.fechaApertura)}
        {caja.almacen ? ` · ${caja.almacen}` : ""}
      </p>
      <p className="mt-4 text-[12px] font-semibold text-texto-3">Vendido</p>
      <p className="text-3xl font-extrabold tabular-nums text-texto">{fmtMoney(total)}</p>
      <dl className="mt-4 space-y-1.5 border-t border-borde-soft pt-3 text-sm">
        <div className="flex justify-between">
          <dt className="text-texto-3">Ventas</dt>
          <dd className="font-semibold tabular-nums text-texto">{ventas}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-texto-3">Fondo de apertura</dt>
          <dd className="font-semibold tabular-nums text-texto">{fmtMoney(caja.montoApertura)}</dd>
        </div>
      </dl>
    </section>
  );
}

function DetalleVenta({
  venta,
  onClose,
  onAnulada,
  onEntregar,
  onVerComprobante,
}: {
  venta: Venta;
  onClose: () => void;
  onAnulada: () => void;
  /** Entregar (o cobrar y entregar) un pedido de recoger que sigue pendiente. */
  onEntregar?: (venta: Venta) => void;
  /** Reimprimir el comprobante de un pedido ya cobrado. */
  onVerComprobante?: (venta: Venta) => void;
}) {
  const { usuario, incluye, rubro, negocio } = useAuth();
  const completa = useApi(() => api.getVenta(venta.id), [venta.id]);
  const [anulando, setAnulando] = useState(false);

  const v = completa.datos ?? venta;

  // En una farmacia no hay mesas: la venta se guarda como de local y cada
  // renglón salía marcado "Mesa". Misma regla que el ticket (PantallaRecibo):
  // se pregunta por el RUBRO, no por `incluye("mesa_llevar")`, que depende del
  // plan y le borraría la marca a un restaurante que siempre la tuvo.
  const mostrarConsumo = marcaConsumo(rubro);

  /**
   * Se anula también lo cobrado por QR o mixto (desde el 1-oct-2026).
   *
   * Antes sólo se anulaba lo cobrado 100% en efectivo: con QR la plata ya
   * estaba en la cuenta y anular "la borraba del sistema". Pero anular no es
   * devolver la plata, es el asiento: el stock vuelve, la venta sale del total
   * y, en una farmacia, el libro de controlados la marca anulada. Bloquearlo no
   * evitaba la devolución (el cliente igual se iba con su plata), dejaba el
   * stock y el libro mintiendo. La plata vuelve por el mismo medio por el que
   * entró, y el diálogo lo dice antes de confirmar (`DialogoAnular`).
   *
   * La app todavía tiene la regla vieja (`DetalleVentaFragment.puedeAnular`).
   */
  // Anular pasa siempre por el PIN de un encargado: sin esa capacidad el
  // negocio no compró forma de autorizarlo, así que no se ofrece.
  const puedeAnular = v.estado === "APROBADO" && incluye("autorizacion_pin");

  /**
   * El bloque de pedido (recoger / domicilio), con las mismas reglas que la
   * app (`HostEntregaDetalle.accionPara`):
   *
   * - un RECOGER pendiente lo entrega quien está en la caja: el cliente pasa
   *   por el mostrador y no hay nadie más que lo haga;
   * - un DELIVERY no tiene acción acá: lo cobra y entrega el repartidor;
   * - el comprobante se ofrece sólo cuando ya no queda nada por cobrar
   *   (prepagado o entregado): un comprobante de algo impago se lee como
   *   recibo de pago.
   */
  const esPedido = v.tipoPedido !== "LOCAL";
  const entregado = v.estadoEntrega === "ENTREGADO";
  const pendiente = esPedido && v.estado === "APROBADO" && v.estadoEntrega === "PENDIENTE";
  // Una venta de mostrador ya está cobrada: su recibo se puede volver a dar
  // (QA PER-08: una vez que se salía del recibo no había forma de reimprimirlo).
  const conComprobante = v.estado === "APROBADO" && (!esPedido || v.prepagado || entregado);

  return (
    <>
      <Modal
        abierto
        titulo={v.comprobante ?? `Venta #${v.id}`}
        subtitulo={fmtHora(v.fecha)}
        onClose={onClose}
        acciones={
          <>
            {conComprobante && onVerComprobante && (
              <Boton variante="ghost" icono="fileText" onClick={() => onVerComprobante(v)}>
                Ver comprobante
              </Boton>
            )}
            {pendiente && v.tipoPedido === "RECOGER" && onEntregar && (
              <Boton icono="check" onClick={() => onEntregar(v)}>
                {v.prepagado ? "Entregar" : "Cobrar y entregar"}
              </Boton>
            )}
            {puedeAnular && (
              <Boton variante="danger" icono="x" onClick={() => setAnulando(true)}>
                Anular venta
              </Boton>
            )}
          </>
        }
      >
        {completa.cargando ? (
          <Cargando />
        ) : (
          <div className="space-y-4">
            {v.estado === "ANULADO" && (
              <div className="rounded-xl bg-danger-bg px-3.5 py-2.5 text-[13px] text-danger-text">
                <p className="font-bold">Venta anulada</p>
                {v.motivoAnulacion && <p className="mt-0.5">Motivo: {v.motivoAnulacion}</p>}
                {v.anulacionAutorizadaPor && (
                  <p className="mt-0.5">Autorizó: {v.anulacionAutorizadaPor}</p>
                )}
              </div>
            )}

            {/* La venta vale (ya se cobró); la marca dice qué mirar. Casi
                siempre viene de un equipo que vendió sin señal con datos
                viejos: precio, cupo, límite de fiado o stock. */}
            {requiereRevision(v) && (
              <div className="rounded-xl bg-warning-bg px-3.5 py-2.5 text-[13px] text-warning-text">
                <p className="font-bold">A revisar</p>
                {motivosRevision(v).length > 0 ? (
                  <ul className="mt-0.5 list-disc pl-4">
                    {motivosRevision(v).map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-0.5">El sistema la marcó para que alguien la mire.</p>
                )}
              </div>
            )}

            {esPedido && (
              <div className="rounded-xl bg-muted p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-bold text-texto">
                      {v.clienteNombre ?? "Sin nombre"}
                    </p>
                    <p className="mt-0.5 text-xs text-texto-3">
                      {v.tipoPedido === "DELIVERY"
                        ? (v.clienteDireccion ?? "Sin dirección")
                        : "Recoge en tienda"}
                    </p>
                    <p className={`mt-0.5 text-xs ${v.clienteTelefono ? "text-texto-2" : "text-texto-4"}`}>
                      {v.clienteTelefono ? Telefono.paraMostrar(v.clienteTelefono) : "Sin teléfono"}
                    </p>
                  </div>
                  <Badge tono={entregado || v.prepagado ? "verde" : "amarillo"}>
                    {entregado ? "Entregado" : v.prepagado ? "Pagado en caja" : "Cobra a la entrega"}
                  </Badge>
                </div>

                {v.clienteTelefono && (
                  <div className="mt-2.5 grid grid-cols-2 gap-2">
                    <a
                      href={`tel:${Telefono.paraLlamada(v.clienteTelefono)}`}
                      className="flex items-center justify-center gap-1.5 rounded-lg border border-borde bg-white px-3 py-2 text-xs font-semibold text-texto-2 hover:border-primary hover:text-primary-700"
                    >
                      <Icon name="phone" size={14} />
                      Llamar al cliente
                    </a>
                    <a
                      href={
                        // Sin entregar: el chat abre con el mensaje del pedido ya
                        // escrito, el mismo de la app (Kevin, 15-oct). Para recoger
                        // no dice que el delivery llegó (ver mensajePedido).
                        entregado
                          ? `https://wa.me/${Telefono.paraWhatsApp(v.clienteTelefono)}`
                          : enlaceWhatsApp(
                              Telefono.paraWhatsApp(v.clienteTelefono),
                              mensajePedido(pedidoDeVenta(v), negocio?.nombre),
                            )
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-center gap-1.5 rounded-lg border border-borde bg-white px-3 py-2 text-xs font-semibold text-texto-2 hover:border-primary hover:text-primary-700"
                    >
                      <Icon name="phone" size={14} />
                      WhatsApp al cliente
                    </a>
                  </div>
                )}

                {v.notaPedido && (
                  <p className="mt-2.5 rounded-lg bg-white px-3 py-2 text-[13px] italic text-texto-2">
                    <span className="font-semibold not-italic text-texto-3">Nota del pedido: </span>
                    {v.notaPedido}
                  </p>
                )}

                {/* Uno por renglón, con las mismas etiquetas que la app. "Atendido
                    por" es el que tomó el pedido en caja, no el repartidor. */}
                <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5">
                  <DatoPedido etiqueta="Pedido realizado" valor={fmtFechaHora(v.fecha)} />
                  {v.tipoPedido === "RECOGER" && v.minutosEstimados != null && (
                    <DatoPedido etiqueta="Recoge estimado" valor={`~${v.minutosEstimados} min`} />
                  )}
                  {v.tipoPedido === "DELIVERY" && (
                    <DatoPedido etiqueta="Repartidor" valor={v.repartidor?.nombre ?? "Sin asignar"} />
                  )}
                  <DatoPedido etiqueta="Atendido por" valor={v.cajero ?? "—"} />
                </dl>
              </div>
            )}

            <ul className="divide-y divide-borde-soft">
              {(v.detalles ?? []).map((d, i) => (
                <li key={i} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-[13px] text-texto">
                      <span className="font-bold">{fmtNum(d.cantidad)}×</span> {nombreDeLinea(d, v)}
                    </p>
                    {/* D6: qué módulos cubre la cuota, con su nombre. */}
                    {textoModulosDeLinea(d, v) && <p className="text-xs text-texto-3">{textoModulosDeLinea(d, v)}</p>}
                    {(mostrarConsumo || d.nota) && (
                      <div className="mt-0.5 flex items-center gap-1.5">
                        {mostrarConsumo && (
                          <Badge tono={d.consumo === "MESA" ? "marca" : "gris"}>
                            {d.consumo === "MESA" ? "Mesa" : "Llevar"}
                          </Badge>
                        )}
                        {d.nota && <span className="text-xs italic text-texto-3">{d.nota}</span>}
                      </div>
                    )}
                  </div>
                  <span className="shrink-0 text-[13px] font-bold">{fmtMoney(d.subtotal)}</span>
                </li>
              ))}
            </ul>

            <dl className="space-y-1 border-t border-borde pt-3 text-sm">
              <div className="flex justify-between text-base font-extrabold text-texto">
                <dt>{esPedido ? "Total del pedido" : "Total"}</dt>
                <dd>{fmtMoney(v.total)}</dd>
              </div>
              {esPedido && v.tarifaEnvio > 0 && (
                <div className="flex justify-between text-texto-2">
                  <dt>Tarifa de envío</dt>
                  <dd>{fmtMoney(v.tarifaEnvio)}</dd>
                </div>
              )}
              {/* Sólo mientras falte cobrar: ya cobrado, "a cobrar" sería 0 y confunde. */}
              {esPedido && !v.prepagado && !entregado && (
                <div className="flex justify-between font-bold text-texto">
                  <dt>Total a cobrar</dt>
                  <dd>{fmtMoney(v.totalACobrar ?? v.total + v.tarifaEnvio)}</dd>
                </div>
              )}
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
          // Con el detalle leído (trae las cuotas) ya no hace falta adivinar por el rubro.
          detalleCompleto={!!completa.datos}
          // El backend pide el PIN SIEMPRE, también al dueño. Quien autoriza
          // con PIN se autoriza a sí mismo; el resto necesita que alguien que
          // autoriza teclee su usuario y PIN en el momento, sin cerrar sesión.
          pideUsuario={!tienePermiso(usuario, "autorizar.pin")}
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

/** Los motivos de una anulación, en el orden en que más pasan. */
const MOTIVOS_ANULACION = [
  ["Devolución del cliente", "Devolución del cliente"],
  ["Error al cobrar", "Error al cobrar"],
  ["Producto equivocado", "Producto equivocado"],
  ["Otro", "Otro"],
] as const;
type MotivoAnulacion = (typeof MOTIVOS_ANULACION)[number][0];

/**
 * Si un pago entró por QR. Se mira por NOMBRE y no por id: `FormaPago` es una
 * tabla por negocio con id autoincremental global, así que el "QR" de un
 * cliente no tiene el mismo id que el de otro.
 */
function esPagoQr(p: { formaPago?: string }): boolean {
  return (p.formaPago ?? "").toLowerCase().includes("qr");
}

function DialogoAnular({
  venta,
  detalleCompleto,
  pideUsuario,
  onClose,
  onAnulada,
}: {
  venta: Venta;
  /** Ya se leyó `GET /ventas/:id`: si no trae cuotas, la venta no cobró cuotas. */
  detalleCompleto: boolean;
  pideUsuario: boolean;
  onClose: () => void;
  onAnulada: () => void;
}) {
  const { rubro } = useAuth();
  const { aplica: conCupo, refrescarCupo } = useCupo();
  const [autorizador, setAutorizador] = useState("");
  const [pin, setPin] = useState("");
  const [motivo, setMotivo] = useState<MotivoAnulacion | "">("");
  const [detalle, setDetalle] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  /**
   * Por dónde vuelve la plata: por el mismo medio por el que entró. Lo de QR
   * ya está en la cuenta del negocio y se devuelve con una transferencia: no
   * sale de la caja. Lo de efectivo sí, y la anulación ya lo descuenta del
   * arqueo del turno. Decirlo antes de confirmar es lo que evita que alguien
   * devuelva en efectivo una venta de QR y la caja cierre con un faltante.
   */
  const pagos = venta.pagos ?? [];
  const redondear = (n: number) => Math.round(n * 100) / 100;
  const porQr = redondear(pagos.filter(esPagoQr).reduce((acc, p) => acc + p.monto, 0));
  const enEfectivo = redondear(
    pagos.filter((p) => !esPagoQr(p)).reduce((acc, p) => acc + p.monto, 0),
  );

  async function anular() {
    setError("");
    // Quedaba el quién y el cuándo, nunca el porqué: en una venta de QR el
    // porqué es toda la historia. Un toque en un chip alcanza.
    if (!motivo) return setError("Elegí el motivo: queda guardado con la anulación.");
    if (motivo === "Otro" && detalle.trim().length < 3)
      return setError("Contá en pocas palabras por qué se anula.");
    // El PIN es de 4 (18-oct); uno viejo de 5 o 6 sigue entrando.
    if (!/^\d{4,6}$/.test(pin)) return setError("El PIN son 4 dígitos.");
    if (pideUsuario && autorizador.trim().length < 3)
      return setError("Poné el usuario del encargado que autoriza.");

    const textoMotivo =
      motivo === "Otro" ? detalle.trim() : [motivo, detalle.trim()].filter(Boolean).join(" · ");

    setEnviando(true);
    try {
      await api.anularVenta(venta.id, {
        ...(pideUsuario ? { autorizadorUsername: autorizador.trim() } : {}),
        autorizadorPin: pin,
        motivo: textoMotivo,
      });
      // Plan Emprendedor (D10): la anulación devuelve el lugar del día (o
      // los créditos) y la respuesta no trae el contador. Sin pedirlo, el
      // POS seguía bloqueando con 50/50 hasta el chequeo de los 15 min.
      if (conCupo) refrescarCupo();
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
          {/* En un salón lo que se vende es sobre todo servicios, que no tienen
              stock (QA B-21): se dice sólo lo que pasa de verdad. */}
          {textoAnularCuotas(venta, rubro, detalleCompleto) ??
            (esBelleza(rubro)
              ? "La venta queda anulada y, si tenía productos, vuelven al inventario. No se puede deshacer."
              : "La venta queda anulada y el stock vuelve al inventario. No se puede deshacer.")}
        </p>

        {(porQr > 0 || enEfectivo > 0) && (
          <ul className="space-y-1.5 rounded-xl bg-muted px-3.5 py-2.5 text-[13px] text-texto-2">
            {porQr > 0 && (
              <li>
                <span className="font-bold text-texto">{fmtMoney(porQr)} por QR:</span> devolvelos
                por QR o transferencia desde la cuenta del negocio. No salen de la caja.
              </li>
            )}
            {enEfectivo > 0 && (
              <li>
                <span className="font-bold text-texto">{fmtMoney(enEfectivo)} en efectivo:</span>{" "}
                salen de la caja. La anulación ya los descuenta del turno.
              </li>
            )}
          </ul>
        )}

        <div>
          <p className="mb-1.5 text-[13px] font-semibold text-texto-2">Motivo</p>
          {/* Vacío al abrir a propósito: un motivo marcado de antemano se
              confirmaría sin leerlo, y el dato no diría nada. */}
          <Chips
            valor={motivo as MotivoAnulacion}
            opciones={MOTIVOS_ANULACION}
            onChange={setMotivo}
          />
          {motivo && (
            <Input
              className="mt-2"
              value={detalle}
              onChange={(e) => setDetalle(e.target.value.slice(0, 150))}
              placeholder={motivo === "Otro" ? "¿Por qué se anula?" : "Detalle (opcional)"}
              aria-label="Detalle del motivo"
              autoComplete="off"
            />
          )}
        </div>

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
            placeholder="4 dígitos"
            className="tracking-[0.3em]"
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
  // Con parseo de coma: en Bolivia se teclea "20,50" y `Number()` da NaN, que
  // el `|| 0` convertía en CERO sin avisar. El cajero veía su número en
  // pantalla y el sistema le respondía "lo recibido no alcanza para cubrir el
  // total" — sin forma de entender por qué. Era el único punto del cobro que
  // no usaba el helper (ver `dinero.ts`, que documenta este mismo bug). Y como
  // en el cierre: "1.500" son mil quinientos, no Bs 1,50 (26-oct).
  const recibidoNum = leerMonto(recibido) ?? 0;
  const cambio = metodo === "QR" ? 0 : Math.max(0, Math.round((recibidoNum - total) * 100) / 100);

  async function confirmar() {
    if (enviando) return;
    setError("");

    let pagos: PagoEntrega[] | undefined;
    // Un pedido ya cobrado en caja se entrega sin pagos: la plata entró cuando
    // se tomó, y volver a registrarla la contaría dos veces en el arqueo.
    if (!pedido.prepagado) {
      if (metodo === "EFECTIVO") {
        if (!efectivo) return setError(formaPagoFaltante(formas, "Efectivo"));
        if (recibidoNum < total) return setError("Lo recibido no alcanza para cubrir el total.");
        pagos = [{ formaPagoId: efectivo.id, monto: total, recibido: recibidoNum }];
      } else {
        if (!qr) return setError(formaPagoFaltante(formas, "QR"));
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
                  <InputMonto
                    value={recibido}
                    onChange={setRecibido}
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

/** Un dato del pedido: etiqueta chica arriba, valor abajo. */
function DatoPedido({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wide text-texto-4">{etiqueta}</dt>
      <dd className="truncate text-[13px] font-semibold text-texto">{valor}</dd>
    </div>
  );
}

/**
 * Cómo se pagó, para la lista del turno. Un fiado decía sólo "Efectivo" (el
 * adelanto), igual que una venta pagada (QA DIA-15): ahora dice que es fiado
 * y, si dejó algo, cuánto de cada cosa.
 */
function comoSePago(v: Pick<Venta, "formasPago" | "credito">): string {
  const formas = v.formasPago?.join(" + ") ?? "";
  const c = v.credito;
  if (!c) return formas;
  const fiado = Math.round((c.montoTotal - c.adelanto) * 100) / 100;
  if (!(c.adelanto > 0) || !formas) return "Fiado/Crédito";
  return `${formas} ${fmtMoney(c.adelanto)} · Fiado ${fmtMoney(fiado)}`;
}

/** D6: los módulos de la cuota que cobró un renglón («M2 Degradados»); vacío si no es de una cuota. */
function textoModulosDeLinea(d: NonNullable<Venta["detalles"]>[number], venta: Venta): string | undefined {
  const q = d.cuotaId != null ? venta.cuotas?.find((x) => x.cuotaId === d.cuotaId) : undefined;
  return q ? modulosDeCuotaVenta(q) : undefined;
}
