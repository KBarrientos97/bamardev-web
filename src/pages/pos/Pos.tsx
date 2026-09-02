import { useCallback, useState } from "react";
import { Icon } from "../../components/Icon";
import { Cargando, ErrorMsg } from "../../components/ui";
import { api } from "../../lib/api";
import { fmtHora, fmtMoney } from "../../lib/format";
import { tieneFeature } from "../../lib/permisos";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import type { Caja, CreditoInput, PagoInput, TipoPedido, Venta } from "../../types";
import AperturaCaja from "./AperturaCaja";
import PantallaCierre, { CierreOk } from "./PantallaCierre";
import PantallaCobro from "./PantallaCobro";
import PantallaCredito from "./PantallaCredito";
import PantallaEntrega, { type DatosEntrega } from "./PantallaEntrega";
import PantallaHistorial from "./PantallaHistorial";
import PantallaRecibo from "./PantallaRecibo";
import PantallaVenta from "./PantallaVenta";
import { useCarrito } from "./useCarrito";

type Pantalla =
  | "venta"
  | "entrega"
  | "cobro"
  | "credito"
  | "recibo"
  | "pedidoOk"
  | "historial"
  | "cierre"
  | "cierreOk";

export default function Pos() {
  const { negocio } = useAuth();
  // La caja manda: sin turno abierto el POS no deja vender, porque toda venta
  // tiene que caer dentro de un arqueo.
  const caja = useApi(() => api.cajaActual(), []);
  const productos = useApi(() => api.getProductos(), []);
  const categorias = useApi(() => api.getCategorias(false), []);
  const formasPago = useApi(() => api.getFormasPago(), []);
  const repartidores = useApi(() => api.getRepartidores(), []);

  const carrito = useCarrito();
  const [pantalla, setPantalla] = useState<Pantalla>("venta");
  const [venta, setVenta] = useState<Venta | null>(null);
  const [cajaCerrada, setCajaCerrada] = useState<Caja | null>(null);
  const [tipoPedido, setTipoPedido] = useState<TipoPedido>("LOCAL");
  const [datosEntrega, setDatosEntrega] = useState<DatosEntrega | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  const permiteDelivery = tieneFeature(negocio?.features, "delivery");
  const permiteRecoger = tieneFeature(negocio?.features, "recoger");

  /** Arma el cuerpo de la venta juntando carrito y datos de entrega. */
  const cuerpoVenta = useCallback(
    (pagos?: PagoInput[]) => ({
      detalles: carrito.aDetalles(),
      tipoPedido,
      ...(pagos ? { pagos } : {}),
      ...(datosEntrega
        ? {
            clienteNombre: datosEntrega.clienteNombre,
            clienteDireccion: datosEntrega.clienteDireccion,
            clienteTelefono: datosEntrega.clienteTelefono,
            repartidorId: datosEntrega.repartidorId,
            tarifaEnvio: datosEntrega.tarifaEnvio,
            minutosEstimados: datosEntrega.minutosEstimados,
            notaPedido: datosEntrega.notaPedido,
            prepagado: datosEntrega.prepagado,
          }
        : {}),
    }),
    [carrito, tipoPedido, datosEntrega],
  );

  const limpiar = useCallback(() => {
    carrito.vaciar();
    setTipoPedido("LOCAL");
    setDatosEntrega(null);
    setError("");
  }, [carrito]);

  const cobrar = useCallback(
    async (pagos: PagoInput[]) => {
      setError("");
      setEnviando(true);
      try {
        const creada = await api.crearVenta(cuerpoVenta(pagos));
        setVenta(creada);
        limpiar();
        setPantalla("recibo");
        // El stock cambió al vender: el catálogo tiene que reflejarlo.
        productos.recargar();
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo registrar la venta");
      } finally {
        setEnviando(false);
      }
    },
    [cuerpoVenta, limpiar, productos],
  );

  /**
   * Pedido que se cobra al entregar: la venta se crea SIN pagos y queda
   * pendiente. La plata la cobra el repartidor y entra a su rendición, no a
   * la caja de quien lo tomó.
   */
  const crearPedidoPendiente = useCallback(
    async (datos: DatosEntrega) => {
      setError("");
      setEnviando(true);
      try {
        const creada = await api.crearVenta({
          detalles: carrito.aDetalles(),
          tipoPedido,
          clienteNombre: datos.clienteNombre,
          clienteDireccion: datos.clienteDireccion,
          clienteTelefono: datos.clienteTelefono,
          repartidorId: datos.repartidorId,
          tarifaEnvio: datos.tarifaEnvio,
          minutosEstimados: datos.minutosEstimados,
          notaPedido: datos.notaPedido,
          prepagado: false,
        });
        setVenta(creada);
        limpiar();
        setPantalla("pedidoOk");
        productos.recargar();
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo crear el pedido");
      } finally {
        setEnviando(false);
      }
    },
    [carrito, tipoPedido, limpiar, productos],
  );

  /**
   * Venta fiada: se manda con el bloque `credito` y el adelanto como pago.
   * El backend crea la venta y el crédito juntos, y el saldo aparece después
   * en Cuentas por cobrar.
   */
  const venderACredito = useCallback(
    async (credito: CreditoInput, pagos: PagoInput[]) => {
      setError("");
      setEnviando(true);
      try {
        const creada = await api.crearVenta({
          detalles: carrito.aDetalles(),
          tipoPedido: "LOCAL",
          credito,
          ...(pagos.length ? { pagos } : {}),
        });
        setVenta(creada);
        limpiar();
        setPantalla("recibo");
        productos.recargar();
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo registrar el fiado");
      } finally {
        setEnviando(false);
      }
    },
    [carrito, limpiar, productos],
  );

  if (caja.cargando) return <Cargando texto="Buscando tu caja…" />;
  if (caja.error)
    return (
      <div className="p-5">
        <ErrorMsg>{caja.error}</ErrorMsg>
      </div>
    );

  const abierta = caja.datos?.caja ?? null;

  if (pantalla === "cierreOk" && cajaCerrada)
    return (
      <CierreOk
        caja={cajaCerrada}
        onSalir={() => {
          setCajaCerrada(null);
          setPantalla("venta");
          caja.recargar();
        }}
      />
    );

  if (!abierta) return <AperturaCaja onAbierta={() => caja.recargar()} />;

  if (pantalla === "cierre")
    return (
      <PantallaCierre
        caja={abierta}
        onAtras={() => setPantalla("venta")}
        onCerrada={async () => {
          // Se relee la caja para mostrar el arqueo con la diferencia que
          // calculó el backend, no la que estimamos en pantalla.
          const actual = await api.cajaActual().catch(() => null);
          setCajaCerrada(actual?.caja ?? { ...abierta, estado: "CERRADA" });
          setPantalla("cierreOk");
        }}
      />
    );

  if (pantalla === "historial")
    return (
      <PantallaHistorial
        caja={abierta}
        onAtras={() => setPantalla("venta")}
        onCierre={() => setPantalla("cierre")}
      />
    );

  if (pantalla === "entrega")
    return (
      <PantallaEntrega
        tipo={tipoPedido === "DELIVERY" ? "DELIVERY" : "RECOGER"}
        total={carrito.total}
        unidades={carrito.unidades}
        repartidores={repartidores.datos ?? []}
        enviando={enviando}
        onAtras={() => {
          setError("");
          setTipoPedido("LOCAL");
          setPantalla("venta");
        }}
        onContinuar={(datos) => {
          setDatosEntrega(datos);
          if (datos.prepagado) setPantalla("cobro");
          else void crearPedidoPendiente(datos);
        }}
      />
    );

  if (pantalla === "cobro")
    return (
      <PantallaCobro
        // Sólo los productos: el backend arma el total de la venta desde las
        // líneas y exige que los pagos sumen exactamente eso. La tarifa de
        // envío viaja aparte y se la cobra el repartidor, así que sumarla acá
        // hacía que el backend rechazara la venta entera con un 400.
        total={carrito.total}
        avisoEnvio={
          datosEntrega?.tarifaEnvio
            ? `El envío (${fmtMoney(datosEntrega.tarifaEnvio)}) lo cobra el repartidor aparte.`
            : undefined
        }
        formasPago={formasPago.datos ?? []}
        onAtras={() => {
          // Sin esto, el error del cobro fallido seguía visible al volver y
          // reaparecía sobre el intento nuevo, que todavía no falló.
          setError("");
          setPantalla(datosEntrega ? "entrega" : "venta");
        }}
        onConfirmar={cobrar}
        // Fiar sólo tiene sentido en una venta de mostrador: un pedido de
        // delivery ya define quién y cuándo paga.
        onCredito={
          tieneFeature(negocio?.features, "fiado") && !datosEntrega
            ? () => setPantalla("credito")
            : undefined
        }
        enviando={enviando}
        error={error}
      />
    );

  if (pantalla === "credito")
    return (
      <PantallaCredito
        total={carrito.total}
        formasPago={formasPago.datos ?? []}
        onAtras={() => {
          setError("");
          setPantalla("cobro");
        }}
        onConfirmar={venderACredito}
        enviando={enviando}
        error={error}
      />
    );

  if (pantalla === "recibo" && venta)
    return (
      <PantallaRecibo
        venta={venta}
        onNuevaVenta={() => {
          setVenta(null);
          setPantalla("venta");
        }}
        onHistorial={() => {
          setVenta(null);
          setPantalla("historial");
        }}
      />
    );

  if (pantalla === "pedidoOk" && venta)
    return (
      <PedidoOk
        venta={venta}
        onNuevo={() => {
          setVenta(null);
          setPantalla("venta");
        }}
        onHistorial={() => {
          setVenta(null);
          setPantalla("historial");
        }}
      />
    );

  if (productos.cargando) return <Cargando texto="Cargando el catálogo…" />;

  return (
    <PantallaVenta
      productos={productos.datos ?? []}
      categorias={categorias.datos ?? []}
      carrito={carrito}
      onCobrar={() => setPantalla("cobro")}
      cabecera={
        <div className="flex items-center justify-between gap-3 border-b border-borde bg-white px-4 py-3">
          <div className="min-w-0">
            <h1 className="text-[15px] font-bold text-texto">Punto de venta</h1>
            <p className="flex items-center gap-1.5 truncate text-xs text-texto-3">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              Caja abierta {fmtHora(abierta.fechaApertura)} ·{" "}
              {fmtMoney(abierta.montoApertura)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {permiteDelivery && (
              <BotonTipo
                icono="truck"
                titulo="Pedido a domicilio"
                deshabilitado={carrito.lineas.length === 0}
                onClick={() => {
                  setTipoPedido("DELIVERY");
                  setPantalla("entrega");
                }}
              />
            )}
            {permiteRecoger && (
              <BotonTipo
                icono="clock"
                titulo="Pedido para recoger"
                deshabilitado={carrito.lineas.length === 0}
                onClick={() => {
                  setTipoPedido("RECOGER");
                  setPantalla("entrega");
                }}
              />
            )}
            <BotonTipo
              icono="fileText"
              titulo="Ventas del turno"
              onClick={() => setPantalla("historial")}
            />
            <BotonTipo
              icono="lock"
              titulo="Cerrar caja"
              onClick={() => setPantalla("cierre")}
            />
          </div>
        </div>
      }
    />
  );
}

function BotonTipo({
  icono,
  titulo,
  onClick,
  deshabilitado,
}: {
  icono: "truck" | "clock" | "fileText" | "lock";
  titulo: string;
  onClick: () => void;
  deshabilitado?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={deshabilitado}
      title={titulo}
      aria-label={titulo}
      className="rounded-lg border border-borde p-2 text-texto-2 transition-colors enabled:hover:border-primary enabled:hover:bg-primary-50 enabled:hover:text-primary-700 disabled:opacity-40"
    >
      <Icon name={icono} size={18} />
    </button>
  );
}

function PedidoOk({
  venta,
  onNuevo,
  onHistorial,
}: {
  venta: Venta;
  onNuevo: () => void;
  onHistorial: () => void;
}) {
  const esDelivery = venta.tipoPedido === "DELIVERY";
  return (
    <div className="flex min-h-full items-center justify-center p-5">
      <div className="w-full max-w-sm text-center">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-50 text-primary-700">
          <Icon name={esDelivery ? "truck" : "clock"} size={30} />
        </span>
        <h1 className="mt-4 text-xl font-bold text-texto">Pedido registrado</h1>
        <p className="mt-1 text-[13px] text-texto-3">
          {venta.comprobante ?? `#${venta.id}`}
        </p>

        <dl className="card mt-5 space-y-2 p-4 text-left text-sm">
          <div className="flex justify-between">
            <dt className="text-texto-2">Cliente</dt>
            <dd className="font-semibold text-texto">{venta.clienteNombre}</dd>
          </div>
          {esDelivery && (
            <>
              <div className="flex justify-between gap-3">
                <dt className="shrink-0 text-texto-2">Dirección</dt>
                <dd className="text-right text-texto">{venta.clienteDireccion}</dd>
              </div>
              {venta.repartidor && (
                <div className="flex justify-between">
                  <dt className="text-texto-2">Repartidor</dt>
                  <dd className="font-semibold text-texto">{venta.repartidor.nombre}</dd>
                </div>
              )}
              {venta.tarifaEnvio > 0 && (
                <div className="flex justify-between">
                  <dt className="text-texto-2">Envío</dt>
                  <dd className="text-texto">{fmtMoney(venta.tarifaEnvio)}</dd>
                </div>
              )}
            </>
          )}
          {venta.minutosEstimados && (
            <div className="flex justify-between">
              <dt className="text-texto-2">Listo en</dt>
              <dd className="font-semibold text-texto">{venta.minutosEstimados} min</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-borde pt-2 text-base font-extrabold text-texto">
            <dt>A cobrar al entregar</dt>
            <dd>{fmtMoney(venta.totalACobrar ?? venta.total)}</dd>
          </div>
        </dl>

        <div className="mt-5 flex gap-2">
          <button
            onClick={onHistorial}
            className="flex-1 rounded-xl border border-borde bg-white px-4 py-2.5 text-sm font-semibold text-texto-2 hover:bg-muted"
          >
            Ver pedidos
          </button>
          <button
            onClick={onNuevo}
            className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-600"
          >
            Nueva venta
          </button>
        </div>
      </div>
    </div>
  );
}
