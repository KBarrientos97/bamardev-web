import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Icon } from "../../components/Icon";
import { Cargando, ErrorMsg } from "../../components/ui";
import { api } from "../../lib/api";
import { apiAgenda, mensajeDe } from "../../lib/agenda/apiAgenda";
import {
  citaDeLaUrl,
  citaQueCobra,
  detallesConProfesional,
  guardarCitaCobrando,
  leerCitaCobrando,
  productosDeLaCita,
} from "../../lib/agenda/cobroCita";
import type { CarritoCita, Cita } from "../../lib/agenda/tiposAgenda";
import type { PropinaInput } from "../../lib/belleza/apiExtras";
import { useConsultaPeriodica } from "../../lib/agenda/useConsultaPeriodica";
import CitasPorCobrar from "./CitasPorCobrar";
import { fmtHora, fmtMoney } from "../../lib/format";
import { tieneFeature } from "../../lib/permisos";
import { esFarmacia } from "../../lib/rubro";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import type {
  Caja,
  CreditoInput,
  DetalleVentaInput,
  PagoInput,
  TipoPedido,
  Venta,
} from "../../types";
import AperturaCaja from "./AperturaCaja";
import PantallaCierre, { CierreOk } from "./PantallaCierre";
import PantallaCobro from "./PantallaCobro";
import PantallaCredito from "./PantallaCredito";
import PantallaEntrega, { type DatosEntrega } from "./PantallaEntrega";
import MesasPorCobrar from "./MesasPorCobrar";
import Entregas from "../salon/Entregas";
import { consumoDeMesa, etiquetaMesa } from "../salon/logicaSalon";
import type { Mesa as MesaSalon } from "../../types/salon";
import PantallaHistorial from "./PantallaHistorial";
import PantallaRecibo from "./PantallaRecibo";
import PantallaVenta from "./PantallaVenta";
import { useVentaFarmacia } from "../farmacia/ventaFarmacia";
import { useCarrito } from "./useCarrito";
import { useIntentoDeCobro } from "./useIntentoDeCobro";

type Pantalla =
  | "venta"
  | "entrega"
  | "cobro"
  | "credito"
  | "recibo"
  | "pedidoOk"
  | "historial"
  | "cierre"
  | "cierreOk"
  /** Las cuentas que el salón mandó a caja. */
  | "mesasPorCobrar"
  /** El efectivo que los meseros cobraron y todavía no está en el cajón. */
  | "entregas"
  /** Belleza: las citas terminadas que nadie cobró. */
  | "citasPorCobrar";

export default function Pos() {
  const { negocio, rubro, puede } = useAuth();
  // La caja manda: sin turno abierto el POS no deja vender, porque toda venta
  // tiene que caer dentro de un arqueo.
  const caja = useApi(() => api.cajaActual(), []);
  /**
   * El catálogo de la grilla.
   *
   * En farmacia NO se pide: esa pantalla busca contra el servidor y traerse
   * 2.000 artículos para no usarlos sería pagar la espera de abrir el POS por
   * nada. La lista vacía es correcta ahí — la grilla no se dibuja.
   */
  const productos = useApi(
    () => (esFarmacia(rubro) ? Promise.resolve([]) : api.getProductos()),
    [rubro],
  );
  const categorias = useApi(() => api.getCategorias(false), []);
  const formasPago = useApi(() => api.getFormasPago(), []);
  const repartidores = useApi(() => api.getRepartidores(), []);

  // Identidad del cobro en curso: sobrevive a los reintentos para que un 504 o
  // un corte de red no terminen en dos ventas. Ver useIntentoDeCobro.
  const intento = useIntentoDeCobro();
  const [pantalla, setPantalla] = useState<Pantalla>("venta");

  /**
   * Las mesas que el salón mandó a caja.
   *
   * Falla en silencio a propósito: un negocio sin salón responde 403 y eso no
   * es un error que mostrarle a la cajera — simplemente no hay mesas.
   */
  const porCobrar = useApi(() => api.mesasPorCobrar().catch(() => []), []);

  /**
   * El efectivo que los meseros cobraron y todavía no está en el cajón.
   *
   * Antes la web no lo mostraba en el POS: la pantalla de entregas existía,
   * pero sólo se llegaba desde "Mesas por cobrar", y ese botón aparece si hay
   * una mesa esperando. Con el mesero cobrando él mismo no hay ninguna, así
   * que el mesero decía "llevala a caja" y la cajera no tenía dónde recibirla.
   * Falla en silencio por lo mismo que `porCobrar`: sin salón, 403.
   */
  const entregas = useApi(() => api.entregasMesero().catch(() => null), []);
  const mesasEsperando: MesaSalon[] = porCobrar.datos ?? [];
  const pendientesEntrega = (entregas.datos?.items ?? []).filter(
    (e) => e.estado === "PENDIENTE",
  );
  /** De dónde se abrió Entregas: el aviso, las mesas o el cierre. */
  const [volverDeEntregas, setVolverDeEntregas] = useState<Pantalla>("venta");
  const irAEntregas = (desde: Pantalla) => {
    setVolverDeEntregas(desde);
    setPantalla("entregas");
  };

  /**
   * Los dos avisos se refrescan solos mientras la cajera está vendiendo, cada
   * 10 s como en la app. Cargados una sola vez, la mesa que el mesero manda a
   * caja o la plata que trae no aparecían hasta recargar la página.
   */
  const { recargar: recargarPorCobrar } = porCobrar;
  const { recargar: recargarEntregas } = entregas;
  useEffect(() => {
    if (pantalla !== "venta") return;
    const id = window.setInterval(() => {
      // Pestaña en segundo plano: nadie mira, no vale el pedido.
      if (document.hidden) return;
      recargarPorCobrar();
      recargarEntregas();
    }, SONDEO_SALON_MS);
    return () => window.clearInterval(id);
  }, [pantalla, recargarPorCobrar, recargarEntregas]);

  /**
   * La mesa que se está cobrando. Mientras hay una, la pantalla de cobro
   * trabaja con SU total y no con el del carrito: el consumo ya lo cargó el
   * mesero y la cajera no retipea nada.
   */
  const [mesaCobrando, setMesaCobrando] = useState<MesaSalon | null>(null);
  const [venta, setVenta] = useState<Venta | null>(null);
  const [cajaCerrada, setCajaCerrada] = useState<Caja | null>(null);
  const [tipoPedido, setTipoPedido] = useState<TipoPedido>("LOCAL");
  // El carrito necesita el tipo de pedido: en el local lo nuevo arranca en
  // MESA, en un delivery o un "recoger" siempre es LLEVAR.
  // El catalogo va al hook para poder rehidratar el carrito despues de un F5:
  // se guardan ids, no productos, asi que las lineas se rearman contra el
  // catalogo fresco (y con el precio de hoy, no el de cuando se cargaron).
  const carritoPropio = useCarrito(tipoPedido, productos.datos ?? []);
  // En una farmacia la venta vive por encima del POS (ver VentaFarmaciaProvider.tsx):
  // ir a Buscar medicamento y volver no la borra. En los demás rubros no hay
  // tal venta y el POS usa la suya, como siempre.
  const carrito = useVentaFarmacia()?.carrito ?? carritoPropio;
  const [datosEntrega, setDatosEntrega] = useState<DatosEntrega | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  const permiteDelivery = tieneFeature(negocio?.features, "delivery");
  const permiteRecoger = tieneFeature(negocio?.features, "recoger");

  // ── Agenda (belleza): cobrar una cita ─────────────────────────────────────
  //
  // Sólo existe donde existe la agenda (feature `agenda` y rubro de belleza,
  // ver permisos.ts): Omar y la farmacia no hacen ni un pedido de más.
  const conAgenda = puede("hoy");
  /**
   * La cita que se está cobrando: sus servicios ya están en el carrito y la
   * venta la completa. Sobrevive a un F5 igual que el carrito.
   */
  const [citaCobrando, setCitaCobrandoEstado] = useState<CarritoCita | null>(() =>
    conAgenda ? leerCitaCobrando() : null,
  );
  const setCitaCobrando = useCallback((c: CarritoCita | null) => {
    setCitaCobrandoEstado(c);
    guardarCitaCobrando(c);
  }, []);
  const [errorCita, setErrorCita] = useState("");
  const [cargandoCitaId, setCargandoCitaId] = useState<number | null>(null);
  const sucursalCaja = caja.datos?.caja?.almacenId ?? null;
  const citasPorCobrar = useConsultaPeriodica<Cita[]>(
    () =>
      conAgenda && caja.datos?.caja
        ? apiAgenda
            .hoy(sucursalCaja)
            .then((d) => d.citas.filter((c) => c.estado === "POR_COBRAR"))
            // Como las mesas: si falla no es un error que mostrarle a la
            // cajera en medio de una venta, simplemente no hay aviso.
            .catch(() => [])
        : Promise.resolve([]),
    [conAgenda, sucursalCaja, !!caja.datos?.caja],
    { cadaMs: 30_000, pausado: pantalla !== "venta" && pantalla !== "citasPorCobrar" },
  );
  const citasEsperando = (citasPorCobrar.datos ?? []).filter((c) => c.id !== citaCobrando?.citaId);
  const { refrescar: refrescarCitas } = citasPorCobrar;

  /**
   * Carga la cita al carrito: vacía lo que hubiera (era de otro cliente) y
   * suma un renglón por servicio. El precio lo pone el backend al cobrar,
   * como en cualquier venta.
   */
  const cargarCita = useCallback(
    (c: CarritoCita) => {
      const { productos: suyos, faltan } = productosDeLaCita(c, productos.datos ?? []);
      carrito.vaciar();
      setTipoPedido("LOCAL");
      setDatosEntrega(null);
      for (const p of suyos) carrito.agregar(p);
      setCitaCobrando(c);
      setErrorCita(
        faltan.length
          ? `No están en el catálogo: ${faltan.join(", ")}. Agregalos a mano o revisá el servicio.`
          : "",
      );
      setPantalla("venta");
    },
    [carrito, productos.datos, setCitaCobrando],
  );

  const cobrarCita = useCallback(
    async (citaId: number) => {
      setErrorCita("");
      setCargandoCitaId(citaId);
      try {
        cargarCita(await apiAgenda.carrito(citaId));
      } catch (e) {
        setErrorCita(mensajeDe(e, "No se pudo cargar la cita"));
        setPantalla("venta");
      } finally {
        setCargandoCitaId(null);
      }
    },
    [cargarCita],
  );

  // "Cobrar" en la agenda llega acá con `?cita=`: se carga una vez, con el
  // catálogo a mano, y se saca de la URL para que un F5 no la vuelva a cargar
  // encima de lo que la cajera haya sumado.
  const [params, setParams] = useSearchParams();
  const citaPedida = conAgenda ? citaDeLaUrl(params) : null;
  const catalogoListo = !productos.cargando && productos.datos !== null;
  // Una sola vez por pedido: sacar el `?cita=` de la URL no es instantáneo, y
  // un render en el medio la volvería a cargar.
  const citaYaPedida = useRef<number | null>(null);
  useEffect(() => {
    if (citaPedida == null || !catalogoListo) return;
    if (citaYaPedida.current === citaPedida) return;
    citaYaPedida.current = citaPedida;
    setParams({}, { replace: true });
    void cobrarCita(citaPedida);
  }, [citaPedida, catalogoListo, cobrarCita, setParams]);

  /** Arma el cuerpo de la venta juntando carrito y datos de entrega. */
  const cuerpoVenta = useCallback(
    (pagos?: PagoInput[]) => ({
      ...conCita(carrito.aDetalles(), citaCobrando),
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
    [carrito, tipoPedido, datosEntrega, citaCobrando],
  );

  const limpiar = useCallback(() => {
    carrito.vaciar();
    setTipoPedido("LOCAL");
    setDatosEntrega(null);
    setError("");
    setCitaCobrando(null);
    setErrorCita("");
  }, [carrito, setCitaCobrando]);

  const cobrar = useCallback(
    async (pagos: PagoInput[], extra?: { propinas?: PropinaInput[] }) => {
      setError("");
      setEnviando(true);
      try {
        // Cobrar una mesa es otro endpoint: la cuenta ya existe en el salón,
        // acá sólo se dice con qué se pagó. La venta la arma el backend con lo
        // que el mesero cargó.
        const creada = mesaCobrando
          ? await api.cobrarMesa(mesaCobrando.id, {
              pagos,
              clienteRequestId: intento.actual(),
            })
          : await api.crearVenta({
              ...cuerpoVenta(pagos),
              // Belleza: la propina viaja aparte (no suma a la venta).
              ...(extra?.propinas?.length ? { propinas: extra.propinas } : {}),
              clienteRequestId: intento.actual(),
            });
        intento.registrado();
        setVenta(creada);
        if (mesaCobrando) {
          setMesaCobrando(null);
          porCobrar.recargar();
        } else {
          limpiar();
        }
        // La cita cobrada sale de "por cobrar" en el acto, sin esperar el sondeo.
        if (conAgenda) refrescarCitas();
        setPantalla("recibo");
        // El stock cambió al vender: el catálogo tiene que reflejarlo.
        productos.recargar();
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo registrar la venta");
      } finally {
        setEnviando(false);
      }
    },
    [cuerpoVenta, limpiar, productos, intento, conAgenda, refrescarCitas],
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
          clienteRequestId: intento.actual(),
        });
        intento.registrado();
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
    [carrito, tipoPedido, limpiar, productos, intento],
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
          // Una cita también se puede fiar (§10): la venta la completa igual.
          ...conCita(carrito.aDetalles(), citaCobrando),
          tipoPedido: "LOCAL",
          credito,
          ...(pagos.length ? { pagos } : {}),
          clienteRequestId: intento.actual(),
        });
        intento.registrado();
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
    [carrito, limpiar, productos, intento, citaCobrando],
  );

  if (caja.cargando) return <Cargando texto="Buscando tu caja…" />;
  if (caja.error)
    return (
      <div className="p-5">
        <ErrorMsg onReintentar={caja.recargar}>{caja.error}</ErrorMsg>
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
        onIrAEntregas={() => irAEntregas("cierre")}
        onCerrada={(cerrada) => {
          // La caja llega del propio cierre, con la diferencia y el monto que
          // calculó el backend. Antes se releía con /caja/actual, que responde
          // null justo despues de cerrar: caía al fallback y el resumen mostraba
          // "Efectivo contado Bs 0,00" y la hora de cierre vacía.
          setCajaCerrada(cerrada);
          setPantalla("cierreOk");
        }}
      />
    );

  if (pantalla === "entregas")
    return (
      <Entregas
        onVolver={() => {
          // Al volver el aviso tiene que decir lo que quedó, no lo de antes
          // de aprobar: si no, la cajera ve la plata "pendiente" que recién
          // recibió.
          recargarEntregas();
          setPantalla(volverDeEntregas);
        }}
      />
    );

  if (pantalla === "mesasPorCobrar")
    return (
      <MesasPorCobrar
        onAtras={() => setPantalla("venta")}
        onIrAEntregas={() => irAEntregas("mesasPorCobrar")}
        // El cobro de una mesa reusa la pantalla de cobro del POS: es la misma
        // plata y la misma caja. Todavía falta cablearlo.
        onCobrar={(mesa) => {
          setMesaCobrando(mesa);
          setPantalla("cobro");
        }}
      />
    );

  if (pantalla === "citasPorCobrar")
    return (
      <CitasPorCobrar
        citas={citasEsperando}
        cargando={citasPorCobrar.cargando}
        error={citasPorCobrar.error}
        onReintentar={citasPorCobrar.recargar}
        onAtras={() => setPantalla("venta")}
        onCobrar={(c) => void cobrarCita(c.id)}
        cobrandoId={cargandoCitaId}
      />
    );

  if (pantalla === "historial")
    return (
      <PantallaHistorial
        caja={abierta}
        onAtras={() => setPantalla("venta")}
        onCierre={() => setPantalla("cierre")}
        // Reimprimir el comprobante de un pedido: es la misma pantalla del
        // recibo de una venta recién cobrada, y su "volver" ya lleva al historial.
        onVerComprobante={(v) => {
          setVenta(v);
          setPantalla("recibo");
        }}
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
        //
        // Cobrando una mesa el total es el consumo que cargó el mesero, no el
        // carrito: la cajera no retipea nada de lo que el cliente comió.
        total={mesaCobrando ? consumoDeMesa(mesaCobrando) : carrito.total}
        subtitulo={
          mesaCobrando
            ? etiquetaMesa(mesaCobrando)
            : citaCobrando
              ? `Cita de ${citaCobrando.cliente.nombre}`
              : undefined
        }
        avisoEnvio={
          datosEntrega?.tarifaEnvio
            ? `El envío (${fmtMoney(datosEntrega.tarifaEnvio)}) lo cobra el repartidor aparte.`
            : undefined
        }
        formasPago={formasPago.datos ?? []}
        // Belleza (propinas): los profesionales de la cita que se cobra.
        profesionales={mesaCobrando ? undefined : profesionalesDeCita(citaCobrando)}
        onAtras={() => {
          // Sin esto, el error del cobro fallido seguía visible al volver y
          // reaparecía sobre el intento nuevo, que todavía no falló.
          setError("");
          if (mesaCobrando) {
            setMesaCobrando(null);
            setPantalla("mesasPorCobrar");
            return;
          }
          setPantalla(datosEntrega ? "entrega" : "venta");
        }}
        onConfirmar={cobrar}
        // Fiar sólo tiene sentido en una venta de mostrador: un pedido de
        // delivery ya define quién y cuándo paga, y una mesa se fía desde el
        // salón — el flujo de crédito arma la venta desde el carrito, que
        // cobrando una mesa está vacío.
        onCredito={
          tieneFeature(negocio?.features, "fiado") && !datosEntrega && !mesaCobrando
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
      sucursalId={abierta.almacenId}
      cabecera={
        <>
        {/* flex-wrap: con el texto en los botones, en una pantalla angosta
            (o con el carrito abierto al lado) los botones bajan a una segunda
            línea en vez de aplastar el título. */}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-borde bg-white px-4 py-3">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-[15px] font-bold text-texto">
              Punto de venta
              {/* La sucursal del turno, al lado del título y no escondida en un
                  menú: acá se descuenta el stock y de acá salen los precios, así
                  que quien cobra tiene que poder verlo sin buscarlo. Sólo
                  aparece si el backend la manda — un negocio de un local no ve
                  nada, que es lo correcto. */}
              {abierta.almacen && (
                <span className="truncate rounded-lg bg-primary-50 px-2 py-0.5 text-[12px] font-semibold text-primary-700">
                  {abierta.almacen}
                </span>
              )}
            </h1>
            <p className="flex items-center gap-1.5 truncate text-xs text-texto-3">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              Caja abierta {fmtHora(abierta.fechaApertura)} ·{" "}
              {fmtMoney(abierta.montoApertura)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {permiteDelivery && (
              <BotonTipo
                icono="truck"
                etiqueta="Delivery"
                titulo={
                  carrito.lineas.length === 0
                    ? "Agregá productos para armar el pedido a domicilio"
                    : "Pedido a domicilio"
                }
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
                etiqueta="Para recoger"
                titulo={
                  carrito.lineas.length === 0
                    ? "Agregá productos para armar el pedido para recoger"
                    : "Pedido para recoger"
                }
                deshabilitado={carrito.lineas.length === 0}
                onClick={() => {
                  setTipoPedido("RECOGER");
                  setPantalla("entrega");
                }}
              />
            )}
            {/* Igual que las mesas: sólo con citas terminadas sin cobrar, y
                sólo en un negocio con agenda. */}
            {citasEsperando.length > 0 && (
              <BotonTipo
                icono="calendar"
                etiqueta={`Citas (${citasEsperando.length})`}
                titulo={`Citas por cobrar (${citasEsperando.length})`}
                onClick={() => setPantalla("citasPorCobrar")}
              />
            )}
            {/* Sólo aparece cuando hay cuentas esperando: si el negocio no
                usa el salón, no existe. */}
            {mesasEsperando.length > 0 && (
              <BotonTipo
                icono="grid"
                etiqueta={`Mesas (${mesasEsperando.length})`}
                titulo={`Mesas por cobrar (${mesasEsperando.length})`}
                onClick={() => setPantalla("mesasPorCobrar")}
              />
            )}
            <BotonTipo
              icono="fileText"
              etiqueta="Ventas"
              titulo="Ventas del turno"
              onClick={() => setPantalla("historial")}
            />
            <BotonTipo
              icono="lock"
              etiqueta="Cerrar caja"
              titulo="Cerrar caja"
              onClick={() => setPantalla("cierre")}
            />
          </div>
        </div>

        {/* Los mismos dos avisos que el POS de la app. Van arriba del catálogo
            y no sólo como ícono: el mesero llega con la cuenta o con la plata
            en medio del servicio, y un ícono chico en la esquina no se ve.
            Un negocio sin salón no ve ninguno de los dos. */}
        {(citaCobrando || errorCita) && (
          <div className="space-y-2 border-b border-borde bg-white px-4 py-3">
            {citaCobrando && (
              <BannerCita
                cita={citaCobrando}
                onSoltar={() => {
                  // Soltar la cita no vacía el carrito: lo que se cargó queda
                  // como una venta común, por si sólo se quería cobrar eso.
                  setCitaCobrando(null);
                  setErrorCita("");
                }}
              />
            )}
            <ErrorMsg>{errorCita}</ErrorMsg>
          </div>
        )}
        {(mesasEsperando.length > 0 || pendientesEntrega.length > 0 || citasEsperando.length > 0) && (
          <div className="space-y-2 border-b border-borde bg-white px-4 py-3">
            {citasEsperando.length > 0 && (
              <AvisoSalon
                tono="ambar"
                icono="calendar"
                titulo={
                  citasEsperando.length === 1
                    ? "1 cita terminada sin cobrar"
                    : `${citasEsperando.length} citas terminadas sin cobrar`
                }
                detalle={`${citasEsperando.map((c) => c.cliente.nombre).join(", ")} · tocá para cobrarlas`}
                onClick={() => setPantalla("citasPorCobrar")}
              />
            )}
            {mesasEsperando.length > 0 && (
              <AvisoSalon
                tono="verde"
                icono="grid"
                titulo={
                  mesasEsperando.length === 1
                    ? "1 mesa esperando cobro"
                    : `${mesasEsperando.length} mesas esperando cobro`
                }
                detalle={`${fmtMoney(
                  mesasEsperando.reduce((a, m) => a + consumoDeMesa(m), 0),
                )} · tocá para cobrarlas`}
                onClick={() => setPantalla("mesasPorCobrar")}
              />
            )}
            {/* Ámbar: es plata del negocio que todavía tiene otro. */}
            {pendientesEntrega.length > 0 && (
              <AvisoSalon
                tono="ambar"
                icono="users"
                titulo={
                  pendientesEntrega.length === 1
                    ? "1 entrega de mesero"
                    : `${pendientesEntrega.length} entregas de meseros`
                }
                detalle={`${fmtMoney(entregas.datos?.pendiente ?? 0)} por recibir · tocá para confirmarlas`}
                onClick={() => irAEntregas("venta")}
              />
            )}
          </div>
        )}
        </>
      }
    />
  );
}

/** Cada cuánto se refrescan los avisos del salón. El mismo que la app. */
const SONDEO_SALON_MS = 10_000;

/** Los profesionales de la cita (sin repetir), para anotarles la propina. */
function profesionalesDeCita(cita: CarritoCita | null): { id: number; nombre: string }[] {
  const vistos = new Map<number, string>();
  for (const l of cita?.lineas ?? []) {
    if (l.recursoId != null && !vistos.has(l.recursoId)) vistos.set(l.recursoId, l.recurso ?? "Profesional");
  }
  return [...vistos.entries()].map(([id, nombre]) => ({ id, nombre }));
}

/** Los detalles con el profesional de cada servicio y, si sigue cobrándola, la cita. */
function conCita(detalles: DetalleVentaInput[], cita: CarritoCita | null) {
  const conProfesional = detallesConProfesional(detalles, cita);
  const citaId = citaQueCobra(conProfesional, cita);
  return { detalles: conProfesional, ...(citaId != null ? { citaId } : {}) };
}

/**
 * La cita que se está cobrando, arriba del catálogo: de quién es, qué se le
 * hizo y con quién. Si ya estaba cobrada lo dice antes de cobrar: la segunda
 * venta se acepta, pero queda para revisar en el cierre.
 */
function BannerCita({ cita, onSoltar }: { cita: CarritoCita; onSoltar: () => void }) {
  const servicios = cita.lineas
    .map((l) => (l.recurso ? `${l.descripcion} · ${l.recurso}` : l.descripcion))
    .join(", ");
  const yaCobrada = cita.ventaId != null || cita.estado === "COMPLETADA";
  const cerrada = cita.estado === "CANCELADA" || cita.estado === "NO_ASISTIO";
  return (
    <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary-50 px-3.5 py-2.5 text-primary-700">
      <Icon name="calendar" size={20} />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-bold">
          Cobrando la cita de {cita.cliente.nombre} · {cita.codigo}
        </p>
        <p className="truncate text-xs opacity-90">{servicios}</p>
        {(yaCobrada || cerrada) && (
          <p className="mt-1 text-xs font-semibold text-warning-text">
            {yaCobrada
              ? "Esta cita ya se cobró. Si la cobrás de nuevo, queda para revisar en el cierre de caja."
              : "Esta cita está cerrada (cancelada o no vino). El cobro se registra y queda para revisar."}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onSoltar}
        className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold hover:bg-primary-100"
      >
        Soltar cita
      </button>
    </div>
  );
}

function AvisoSalon({
  tono,
  icono,
  titulo,
  detalle,
  onClick,
}: {
  tono: "verde" | "ambar";
  icono: "grid" | "users" | "calendar";
  titulo: string;
  detalle: string;
  onClick: () => void;
}) {
  const colores =
    tono === "verde"
      ? "border-primary/30 bg-primary-50 text-primary-700 hover:bg-primary-100"
      : "border-warning-text/20 bg-warning-bg text-warning-text hover:brightness-95";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors ${colores}`}
    >
      <Icon name={icono} size={20} />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-bold">{titulo}</span>
        <span className="block truncate text-xs opacity-90">{detalle}</span>
      </span>
      <Icon name="chevronRight" size={18} />
    </button>
  );
}

/**
 * Botón del encabezado del POS: ícono + texto.
 *
 * Eran sólo íconos con el nombre en el `title`, y un camión, un reloj y un
 * papel no dicen "delivery", "para recoger" y "ventas del turno": la cajera
 * tenía que pasar el mouse por cada uno (y en una tablet no hay mouse). El
 * `titulo` sigue como ayuda larga, y cuando el botón está apagado dice por qué.
 */
function BotonTipo({
  icono,
  etiqueta,
  titulo,
  onClick,
  deshabilitado,
}: {
  icono: "truck" | "clock" | "fileText" | "lock" | "grid" | "calendar";
  etiqueta: string;
  titulo: string;
  onClick: () => void;
  deshabilitado?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={deshabilitado}
      title={titulo}
      className="inline-flex items-center gap-1.5 rounded-lg border border-borde px-2.5 py-1.5 text-xs font-semibold text-texto-2 transition-colors enabled:hover:border-primary enabled:hover:bg-primary-50 enabled:hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Icon name={icono} size={16} />
      <span className="whitespace-nowrap">{etiqueta}</span>
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
