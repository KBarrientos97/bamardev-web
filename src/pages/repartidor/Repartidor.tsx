import { useMemo, useState } from "react";
import { Icon } from "../../components/Icon";
import { Chips } from "../../components/filtros";
import {
  Badge,
  Boton,
  Campo,
  Cargando,
  Confirmar,
  ErrorMsg,
  Input,
  Kpi,
  Modal,
  Vacio,
} from "../../components/ui";
import { api, type PagoEntrega } from "../../lib/api";
import { restoEnEfectivo, vuelto } from "../../lib/dinero";
import { fmtHora, fmtMoney, fmtNum } from "../../lib/format";
import { tieneFeature } from "../../lib/permisos";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import type { FormaPago, Venta } from "../../types";

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
  const formasPago = useApi(() => api.getFormasPago(), []);

  const [vista, setVista] = useState<Vista>("pendientes");
  const [detalle, setDetalle] = useState<Venta | null>(null);
  const [rendicionAbierta, setRendicionAbierta] = useState(false);

  const lista = entregas.datos ?? [];

  const { pendientes, entregadas, aRendir, cobradoEnvios } = useMemo(() => {
    const pend = lista.filter((p) => p.estadoEntrega === "PENDIENTE");
    const ent = lista.filter((p) => p.estadoEntrega === "ENTREGADO");
    return {
      pendientes: pend,
      entregadas: ent,
      // Lo que el repartidor le debe al negocio al cerrar el turno.
      aRendir: ent.reduce((s, p) => s + (p.montoRendicion ?? 0), 0),
      cobradoEnvios: ent.reduce((s, p) => s + p.tarifaEnvio, 0),
    };
  }, [lista]);

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
        <Kpi etiqueta="A rendir" valor={fmtMoney(aRendir)} icono="dollar" tono="azul" />
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
                    <Badge tono={p.prepagado ? "verde" : "amarillo"}>
                      {p.prepagado ? "Ya pagado" : "Cobra al entregar"}
                    </Badge>
                    <span className="text-xs text-texto-4">{fmtHora(p.fecha)}</span>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold text-texto">
                    {fmtMoney(p.totalACobrar ?? 0)}
                  </p>
                  {p.tarifaEnvio > 0 && (
                    <p className="text-xs text-texto-3">+{fmtMoney(p.tarifaEnvio)} envío</p>
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
            <div className="rounded-2xl bg-marca p-5 text-center text-white">
              <p className="text-xs font-semibold uppercase tracking-wide opacity-90">
                A entregar al negocio
              </p>
              <p className="mt-1 text-3xl font-extrabold">{fmtMoney(aRendir)}</p>
            </div>

            <p className="rounded-xl bg-info-bg px-3.5 py-2.5 text-[13px] text-info-text">
              Las tarifas de envío ({fmtMoney(cobradoEnvios)}) son tuyas: no entran en la
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
                        {p.prepagado ? " · ya estaba pagado" : ""}
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

  const telefono = (p.clienteTelefono ?? "").replace(/\D/g, "");

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
              {telefono && (
                <div className="mt-2.5 flex gap-2">
                  <a
                    href={`tel:${telefono}`}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-borde bg-white px-3 py-3 text-[13px] font-semibold text-texto-2 hover:bg-muted"
                  >
                    <Icon name="phone" size={15} /> Llamar
                  </a>
                  <a
                    href={`https://wa.me/${telefono.length <= 8 ? `591${telefono}` : telefono}`}
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
  const permiteQr = tieneFeature(negocio?.features, "pago_qr_mixto");

  const efectivo = formasPago.find((f) => f.nombre.toLowerCase() === "efectivo");
  const qr = formasPago.find((f) => f.nombre.toLowerCase() === "qr");

  const [metodo, setMetodo] = useState<"EFECTIVO" | "QR" | "MIXTO">("EFECTIVO");
  const [recibido, setRecibido] = useState("");
  const [montoQr, setMontoQr] = useState("");
  const [error, setError] = useState("");

  const recibidoNum = Number(recibido) || 0;
  const qrNum = Number(montoQr) || 0;
  const enEfectivo = metodo === "MIXTO" ? restoEnEfectivo(total, qrNum) : total;
  // El vuelto se calcula sobre lo que el cliente entrega en mano, que incluye
  // el envío: si no, el repartidor le devolvería de más.
  const efectivoEnMano =
    metodo === "MIXTO" ? restoEnEfectivo(aPedirEnMano, qrNum) : aPedirEnMano;
  const cambio = metodo === "QR" ? 0 : vuelto(recibidoNum, efectivoEnMano);

  function confirmar() {
    setError("");
    if (metodo === "EFECTIVO") {
      if (!efectivo) return setError("Falta la forma de pago Efectivo.");
      if (recibidoNum < aPedirEnMano) return setError("Lo recibido no cubre el total.");
      return onConfirmar([{ formaPagoId: efectivo.id, monto: total, recibido: recibidoNum }]);
    }
    if (metodo === "QR") {
      if (!qr) return setError("Falta la forma de pago QR.");
      return onConfirmar([{ formaPagoId: qr.id, monto: total }]);
    }
    if (!efectivo || !qr) return setError("Faltan formas de pago para cobrar mixto.");
    if (qrNum <= 0) return setError("Poné cuánto se paga por QR.");
    if (qrNum >= aPedirEnMano) return setError("Si el QR cubre todo, cobrá con el método QR.");
    if (recibidoNum < efectivoEnMano) return setError("El efectivo no cubre lo que falta.");
    onConfirmar([
      { formaPagoId: qr.id, monto: qrNum },
      { formaPagoId: efectivo.id, monto: enEfectivo, recibido: recibidoNum },
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
            pedir el de arriba: mostrar sólo uno se prestaba a cobrar de
            menos y poner la tarifa de su bolsillo. */}
        {aPedirEnMano !== total && (
          <dl className="rounded-xl bg-muted px-3.5 py-2.5 text-[13px]">
            <div className="flex justify-between text-texto-2">
              <dt>Productos</dt>
              <dd>{fmtMoney(total)}</dd>
            </div>
            <div className="flex justify-between text-texto-2">
              <dt>Envío</dt>
              <dd>{fmtMoney(Math.round((aPedirEnMano - total) * 100) / 100)}</dd>
            </div>
            <div className="mt-1 flex justify-between border-t border-borde pt-1 font-bold text-texto">
              <dt>Cobrale al cliente</dt>
              <dd>{fmtMoney(aPedirEnMano)}</dd>
            </div>
          </dl>
        )}

        <div className="grid grid-cols-3 gap-2">
          {(["EFECTIVO", "QR", "MIXTO"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMetodo(m)}
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
          <Campo label="Pagado por QR">
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={montoQr}
              onChange={(e) => setMontoQr(e.target.value)}
            />
          </Campo>
        )}

        {metodo !== "QR" && (
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
                className="font-bold"
              />
            </Campo>
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
