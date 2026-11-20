import { agruparHijas } from "../../lib/agregados/hijas";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon, type NombreIcono } from "../../components/Icon";
import TirarParaActualizar from "../../components/TirarParaActualizar";
import InputMonto from "../../components/InputMonto";
import { QrParaCobrar } from "../../components/QrCobro";
import { Chips } from "../../components/filtros";
import {
  Badge,
  Boton,
  Campo,
  Cargando,
  ErrorMsg,
  Modal,
  Vacio,
} from "../../components/ui";
import { api, type PagoEntrega } from "../../lib/api";
import { aCentavos, cubre, esPositivo, excede, restoEnEfectivo, vuelto } from "../../lib/dinero";
import { fmtHora, fmtMoney, fmtNum, fmtPlata } from "../../lib/format";
import { atajosDeEfectivo } from "../../lib/billetes";
import { leerMonto, montoParaEditar } from "../../lib/montoTecleado";
import { tieneFeature } from "../../lib/permisos";
import { Telefono } from "../../lib/telefono";
import { useApi } from "../../lib/useApi";
import { useHayVariasSucursales, useRotuloSucursal } from "../../lib/useHayVariasSucursales";
import { enlaceWhatsApp, mensajePedido, pedidoDeVenta } from "../../lib/mensajePedido";
import { usePosicionRepartidor } from "../../lib/pedidosWeb/usePosicionRepartidor";
import { useAuth } from "../../store/AuthContext";
import { notaSinPago, recibidoSugerido } from "../../lib/pedidosWeb/cobro";
import AccionesPedidoWeb from "./AccionesPedidoWeb";
import ComoLlegar from "./ComoLlegar";
import { pinDeEntrega } from "../../lib/ubicacionEntrega";
import NoSePudoEntregar from "./NoSePudoEntregar";
import { enEspera, textoMotivo } from "../../lib/entregaFallida";
import type { FormaPago, Venta } from "../../types";
import { rendicionDelTurno } from "./rendicion";
import { reporteDelDia } from "./reporteDelDia";
import MiDia from "./MiDia";
import MapaDelDia from "./MapaDelDia";
import RendicionDelTurno from "./RendicionDelTurno";
import { EsqueletoFilas } from "../salon/Esqueletos";
import { activarSonido, useSonidoListo } from "../../lib/pedidosWeb/contador";
import { REFRESCO_ENTREGAS_MS, useAvisoPedidoNuevo } from "./avisoPedidoNuevo";
import { aEntregarDelRepartidor } from "../../lib/repartoRendicion";
import { pedirRendicionSiHay } from "../reparto/pedirRendicion";
import { direccionEscrita, direccionParaMostrar, direccionSinReferencia } from "./direccionEntrega";

type Vista = "pendientes" | "entregadas";

const VISTAS = [
  ["pendientes", "Por entregar"],
  ["entregadas", "Entregadas"],
] as const satisfies readonly (readonly [Vista, string])[];

/**
 * La respuesta al toque de los botones propios de esta pantalla, la misma que
 * `Boton`: se hunde un poco al apretar, con una transición corta que mueve
 * sólo `transform` y colores (nunca `transition-all`). El sombreado gris del
 * toque, la demora del doble toque y la selección de texto ya los apaga
 * `index.css` para toda la app.
 */
/**
 * Los botones del pie de una hoja: en el celular se reparten el ancho (dos
 * blancos grandes al alcance del pulgar, como el `PieHoja` del salón); en la
 * compu vuelven a su tamaño, a la derecha del modal.
 */
const PIE = "min-h-11 flex-1 sm:flex-none";

const TOQUE =
  "transition-[transform,background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] motion-reduce:active:scale-100";

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
   * El cuadre con la caja (`GET /reparto/rendicion`, 18-nov): cuánto ya le
   * recibió la caja y cuánto le falta entregar. Con él, «A rendir» y «A
   * entregar al negocio» dicen lo mismo que «Te falta entregar»; sin él
   * (backend anterior, sin señal), la cuenta de siempre. Se refresca con la
   * lista, pero sólo si alguna vez cargó: a un backend que no lo tiene no se
   * le pregunta cada 20 s.
   */
  const cuadre = useApi(() => pedirRendicionSiHay(), []);
  const cuadreRef = useRef(cuadre);
  cuadreRef.current = cuadre;
  const refrescarCuadre = () => {
    if (cuadreRef.current.datos) cuadreRef.current.recargar();
  };

  /**
   * Refresco periódico: un pedido recién asignado no aparecía hasta salir y
   * volver a entrar, y el repartidor se quedaba esperando sin saber que ya
   * tenía trabajo. Cada 20 s desde el 18-nov (era un minuto), para que el
   * aviso del pedido nuevo llegue a tiempo. Sólo con la pestaña visible —
   * refrescar en segundo plano gasta datos del celular sin que nadie lo esté
   * mirando (con la pantalla apagada avisa la push).
   */
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      entregas.recargar();
      refrescarCuadre();
    }, REFRESCO_ENTREGAS_MS);
    const alVolver = () => {
      if (document.visibilityState !== "visible") return;
      entregas.recargar();
      refrescarCuadre();
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
  // Un pedido que le asignan con la pantalla abierta (18-nov): suena y avisa arriba.
  const aviso = useAvisoPedidoNuevo(entregas.datos, usuario?.id);
  const sonidoListo = useSonidoListo();

  const [vista, setVista] = useState<Vista>("pendientes");
  const [detalle, setDetalle] = useState<Venta | null>(null);
  const [rendicionAbierta, setRendicionAbierta] = useState(false);
  const [miDiaAbierto, setMiDiaAbierto] = useState(false);
  const [mapaAbierto, setMapaAbierto] = useState(false);

  // Lo que se le entrega al negocio es SÓLO el efectivo (`enEfectivo`): lo
  // cobrado por QR ya está en su cuenta. La cuenta vive en `rendicion.ts`.
  const { pendientes, entregadas, tarifas, enEfectivo, porQr } = useMemo(
    () => rendicionDelTurno(entregas.datos ?? []),
    [entregas.datos],
  );
  // El efectivo que le falta entregar: el del cuadre con la caja si cargó
  // (baja cuando la caja le recibe la plata); si no, lo de siempre.
  const aRendir = aEntregarDelRepartidor(cuadre.datos, usuario?.id) ?? enEfectivo;
  const reporte = useMemo(() => reporteDelDia(entregas.datos ?? []), [entregas.datos]);

  const mostradas = vista === "pendientes" ? pendientes : entregadas;

  // Pedidos web en camino (ya tocó «Ya salí del local»): mientras esta pantalla
  // está abierta, el cliente ve la moto. Si la lista falla un momento, se
  // sigue con las últimas entregas conocidas en vez de cortar el envío.
  const enCaminoWeb = useRef<number[]>([]);
  if (entregas.datos) {
    enCaminoWeb.current = entregas.datos
      // Sólo las SUYAS: quien también tiene `delivery.asignar` recibe todas las
      // entregas, y mandar la posición de una ajena da 403 cada 15 s (PW-16).
      .filter((v) => v.pedidoWeb?.salioEn && v.estadoEntrega === "PENDIENTE" && v.repartidor?.id === usuario?.id)
      .map((v) => v.id);
  }
  const posicion = usePosicionRepartidor(enCaminoWeb.current);

  // El primer «Cargando»: después, el refresco (cada 20 s o al tirar para
  // abajo) conserva la lista. Antes cada refresco la cambiaba por la ruedita
  // y la pantalla parpadeaba con el pulgar encima.
  const primeraCarga = entregas.cargando && !entregas.datos;

  /**
   * Tirar para actualizar (20-nov, como el salón de los meseros): vuelve a
   * pedir exactamente lo del refresco automático, la lista y el cuadre si
   * alguna vez cargó. Si ya había un pedido en vuelo, `useApi` se queda con
   * la respuesta del último: no se pisan.
   */
  const actualizar = () => {
    entregas.recargar();
    refrescarCuadre();
  };

  const abrirRendicion = () => {
    setRendicionAbierta(true);
    // Al día al abrirla (y la primera vez que no cargó, se reintenta).
    cuadre.recargar();
  };

  return (
    <TirarParaActualizar onActualizar={actualizar} cargando={entregas.cargando} className="h-full">
      <div className="mx-auto max-w-3xl space-y-4 p-4 pb-8 sm:p-5">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-texto">Mis entregas</h1>
            <p className="mt-0.5 truncate text-[13px] text-texto-3">{usuario?.nombre ?? usuario?.username}</p>
          </div>
          <Boton variante="ghost" icono="dollar" className="min-h-11 shrink-0" onClick={abrirRendicion}>
            Rendición
          </Boton>
        </header>

        {aviso.nuevos > 0 && (
          <div
            role="alert"
            className="flex items-center gap-3 rounded-xl border border-warning-text/20 bg-warning-bg px-3.5 py-2 text-warning-text"
          >
            <Icon name="bell" size={18} />
            <p className="min-w-0 flex-1 text-[13px] font-bold">
              {aviso.nuevos === 1
                ? "Tenés un pedido nuevo para entregar"
                : `Tenés ${aviso.nuevos} pedidos nuevos para entregar`}
            </p>
            <button
              type="button"
              onClick={() => {
                setVista("pendientes");
                aviso.visto();
              }}
              className={`min-h-11 shrink-0 rounded-lg border border-warning-text/30 px-4 text-xs font-semibold hover:bg-warning-text/10 ${TOQUE}`}
            >
              Ver
            </button>
          </div>
        )}
        {/* El navegador sólo deja sonar después de un toque: cualquiera lo
            habilita, y mientras tanto se ofrece a propósito. */}
        {!sonidoListo && (
          <button
            type="button"
            onClick={activarSonido}
            className={`flex min-h-11 w-full items-center gap-2 rounded-xl border border-borde bg-white px-3.5 py-2.5 text-left text-[13px] font-semibold text-texto-2 hover:bg-muted ${TOQUE}`}
          >
            <Icon name="volumen" size={16} />
            <span className="min-w-0 flex-1">Activar el sonido de los pedidos nuevos</span>
          </button>
        )}

        {posicion.compartiendo && (
          <p role="status" className="flex items-center gap-2 rounded-xl bg-primary-50 px-3.5 py-2.5 text-[13px] font-semibold text-primary-700">
            <Icon name="pin" size={16} /> Compartiendo tu ubicación con el cliente
          </p>
        )}
        <ErrorMsg>{posicion.falla}</ErrorMsg>

        {/* Dos tarjetas y no tres (20-nov, pedido del dueño): «Entregadas»
            era un número suelto que ocupaba su propia tarjeta, y en el
            celular «A rendir» quedaba sola en un segundo renglón (UX-DELIVERY
            P10). Ahora va debajo de «Por entregar», que es lo que se mira, y
            las dos entran en un renglón: la lista sube. Tocar cada una abre
            su detalle: los pedidos, «Mi día»; la plata, la rendición. */}
        <div className="grid grid-cols-2 gap-3">
          <TarjetaResumen
            etiqueta="Por entregar"
            valor={primeraCarga ? "—" : String(pendientes.length)}
            pie={primeraCarga ? "" : entregadas.length === 1 ? "1 entregada hoy" : `${entregadas.length} entregadas hoy`}
            icono="truck"
            tonoIcono="bg-warning-bg text-warning-text"
            onClick={() => setMiDiaAbierto(true)}
            ayuda="Ver mi día"
          />
          {/* El efectivo, como "A entregar al negocio" de la rendición: con el QR
              adentro le pedía plata que ya estaba en el banco (BUG-pedidos-3). */}
          <TarjetaResumen
            etiqueta="A rendir"
            valor={primeraCarga ? "—" : fmtPlata(aRendir)}
            pie="en efectivo"
            icono="dollar"
            tonoIcono="bg-primary-100 text-primary-700"
            onClick={abrirRendicion}
            ayuda="Ver la rendición"
          />
        </div>

        {/* «Ver en el mapa»: todas las por entregar de un vistazo (20-nov).
            Sólo si alguna tiene pin: sin ninguno, el mapa no tiene qué dibujar. */}
        <div className="flex items-center justify-between gap-2">
          <Chips valor={vista} opciones={VISTAS} onChange={setVista} />
          {vista === "pendientes" && pendientes.some((p) => pinDeEntrega(p)) && (
            <button
              type="button"
              onClick={() => setMapaAbierto(true)}
              className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-borde bg-white px-3 text-[13px] font-semibold text-primary-700 hover:bg-primary-50 ${TOQUE}`}
            >
              <Icon name="pin" size={15} /> Ver en el mapa
            </button>
          )}
        </div>

        <ErrorMsg onReintentar={actualizar}>{entregas.error}</ErrorMsg>

        {primeraCarga ? (
          <EsqueletoFilas filas={3} etiqueta="Cargando tus entregas" />
        ) : mostradas.length === 0 ? (
          <div className="card">
            <Vacio
              icono="truck"
              titulo={vista === "pendientes" ? "Sin pedidos pendientes" : "Sin entregas todavía"}
              texto={
                vista === "pendientes"
                  ? "Cuando te asignen un pedido lo vas a ver acá. Tirá para abajo para actualizar."
                  : "Las entregas del turno aparecerán acá."
              }
            />
          </div>
        ) : (
          <ul className="space-y-2.5">
            {mostradas.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => {
                    setDetalle(p);
                    aviso.visto();
                  }}
                  // 0.98 y no 0.97: la tarjeta ocupa todo el ancho y el mismo
                  // porcentaje se ve como un salto.
                  className="card flex w-full flex-col gap-2 p-4 text-left transition-[transform,box-shadow] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:shadow-md active:scale-[0.98] motion-reduce:active:scale-100"
                >
                  {/* Arriba el cliente y lo que se cobra; la insignia va en su propio renglón:
                      en 360 px «COBRA AL ENTREGAR» (sin partirse) se metía debajo del monto. */}
                  <div className="flex w-full items-center gap-3">
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
                      <p className="truncate text-xs text-texto-3">{direccionParaMostrar(p)}</p>
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
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 pl-14">
                    {/* Entregado ya no debe nada: seguía en ámbar "Cobra al
                        entregar" al lado de "Cobrado Bs 35,00" (QA 29-oct). */}
                    {/* En espera (avisó «No se pudo entregar»): lo primero que se
                        lee, para que no salga otra vez a entregarlo. */}
                    {enEspera(p) ? (
                      <Badge tono="rojo" className="whitespace-nowrap">
                        En espera de la caja
                      </Badge>
                    ) : (
                      <Badge tono={p.prepagado || p.estadoEntrega === "ENTREGADO" ? "verde" : "amarillo"} className="whitespace-nowrap">
                        {p.estadoEntrega === "ENTREGADO" ? "Entregado" : p.prepagado ? "Ya pagado" : "Cobra al entregar"}
                      </Badge>
                    )}
                    {enEspera(p) && <span className="text-xs font-semibold text-danger-text">{textoMotivo(p.entregaFallidaMotivo)}</span>}
                    {/* Se distingue de un delivery cargado en la caja: trae el pin y «Ya salí» (QA R1, N14). */}
                    {p.pedidoWeb && (
                      <Badge tono="azul" className="whitespace-nowrap">
                        Pedido de la página
                      </Badge>
                    )}
                    <span className="text-xs text-texto-4">{fmtHora(p.fecha)}</span>
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
              // Entregó (o avisó que no pudo): cambia lo que tiene que entregar.
              refrescarCuadre();
            }}
            onSalio={entregas.recargar}
            sinUbicacion={!!posicion.falla}
          />
        )}

        {rendicionAbierta && (
          <RendicionDelTurno
            entregadas={entregadas}
            aRendir={aRendir}
            porQr={porQr}
            tarifas={tarifas}
            cuadre={cuadre.datos}
            usuarioId={usuario?.id}
            onClose={() => setRendicionAbierta(false)}
          />
        )}

        {miDiaAbierto && <MiDia reporte={reporte} onClose={() => setMiDiaAbierto(false)} />}

        {mapaAbierto && (
          <MapaDelDia
            pendientes={pendientes}
            onClose={() => setMapaAbierto(false)}
            onElegir={(v) => {
              // El detalle reemplaza al mapa: dos hojas apiladas tapan el pie.
              setMapaAbierto(false);
              setDetalle(v);
              aviso.visto();
            }}
          />
        )}
      </div>
    </TirarParaActualizar>
  );
}

/**
 * Una de las dos tarjetas de arriba: el número grande y, al tocarla, su
 * detalle. Es un botón con el aspecto del `Kpi` de los reportes (mismas
 * letras y radios), más el chevron que dice que se puede tocar.
 */
function TarjetaResumen({
  etiqueta,
  valor,
  pie,
  icono,
  tonoIcono,
  onClick,
  ayuda,
}: {
  etiqueta: string;
  valor: string;
  pie: string;
  icono: NombreIcono;
  tonoIcono: string;
  onClick: () => void;
  /** Lo que abre, para el lector de pantalla (el chevron no se lee). */
  ayuda: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={ayuda}
      className={`card flex min-w-0 flex-col p-3.5 text-left hover:shadow-md ${TOQUE}`}
    >
      <span className="flex w-full items-center justify-between gap-2">
        <span className="truncate text-[12px] font-semibold uppercase tracking-wide text-texto-4">{etiqueta}</span>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tonoIcono}`}>
          <Icon name={icono} size={16} />
        </span>
      </span>
      <span className="mt-1.5 block w-full truncate text-2xl font-bold tracking-tight text-texto">{valor}</span>
      <span className="mt-0.5 flex w-full items-center justify-between gap-1 text-xs text-texto-3">
        <span className="truncate">{pie}</span>
        <Icon name="chevronRight" size={14} className="shrink-0 text-texto-4" />
      </span>
    </button>
  );
}

function DetalleEntrega({
  pedido,
  formasPago,
  onClose,
  onCambio,
  onSalio,
  sinUbicacion,
}: {
  pedido: Venta;
  formasPago: FormaPago[];
  onClose: () => void;
  onCambio: () => void;
  /** Tocó «Ya salí del local»: la lista se refresca y empieza a compartirse la posición. */
  onSalio: () => void;
  /** Sin permiso de ubicación: «Ya saliste» no puede decir que el cliente ve la moto (QA R2, S5). */
  sinUbicacion: boolean;
}) {
  const completo = useApi(() => api.getVenta(pedido.id), [pedido.id]);
  const { negocio } = useAuth();
  // El local del pedido va en el mensaje al cliente sólo si el negocio tiene
  // varios: con uno, el mismo texto de siempre (PLAN-SUCURSAL-TOTAL §1).
  const hayVariasSucursales = useHayVariasSucursales();
  const rotuloSede = useRotuloSucursal();
  const [cobrando, setCobrando] = useState(false);
  const [noEntrega, setNoEntrega] = useState(false);
  // Volvió de «Cobrar» o de «No se pudo entregar»: el detalle reaparece en la
  // misma hoja, sin volver a subir desde abajo.
  const [volvio, setVolvio] = useState(false);
  // El rechazo al cobrar, para mostrarlo EN la hoja de cobro (que tapa el detalle).
  const [rechazoCobro, setRechazoCobro] = useState<{ sinCaja: boolean; texto: string } | null>(null);
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
  // «Ya salí» recién tocado: el detalle conserva la fila de la lista de antes,
  // así que la hora se recuerda acá hasta que la lista se refresque.
  const [salioAca, setSalioAca] = useState<string | null>(null);
  const webBase = p.pedidoWeb ?? pedido.pedidoWeb ?? null;
  const webDelPedido = webBase ? { ...webBase, salioEn: webBase.salioEn ?? salioAca } : null;
  // Un pedido prepagado sólo se confirma: la plata ya entró a la caja.
  const soloConfirmar = pendiente && (p.prepagado || aCobrar <= 0);
  // «No se pudo entregar» ya avisado: la lista lo sabe aunque el detalle
  // completo (`GET /ventas/:id`) no lo traiga. En espera no se entrega ni se
  // cobra: el backend lo rechaza («la caja tiene que decidir»).
  const espera = {
    entregaFallidaEn: p.entregaFallidaEn ?? pedido.entregaFallidaEn ?? null,
    motivo: p.entregaFallidaMotivo ?? pedido.entregaFallidaMotivo ?? null,
    nota: p.entregaFallidaNota ?? pedido.entregaFallidaNota ?? null,
  };
  const enEsperaAhora = enEspera({ estadoEntrega: p.estadoEntrega, entregaFallidaEn: espera.entregaFallidaEn });
  // El pin: el de la venta o el del pedido de la página. El detalle completo
  // puede no traerlo (lo trae la lista): se usa el que haya.
  const pin = pinDeEntrega({
    latitud: p.latitud ?? pedido.latitud,
    longitud: p.longitud ?? pedido.longitud,
    precisionM: p.precisionM ?? pedido.precisionM,
    pedidoWeb: webBase,
  });

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
      ? enlaceWhatsApp(
          numeroWhatsApp,
          // `GET /ventas/:id` no trae `pedidoWeb` (sí la lista de entregas): sin
          // pasarlo aparte, un pedido de la página decía «ya llegó» aunque el
          // repartidor ni hubiera salido (QA R2, M1).
          mensajePedido(pedidoDeVenta({ ...p, pedidoWeb: webDelPedido }, hayVariasSucursales ? p.almacen?.nombre : null, rotuloSede), negocio?.nombre, negocio),
        )
      : `https://wa.me/${numeroWhatsApp}`;

  async function confirmarEntrega(pagos?: PagoEntrega[]) {
    setError("");
    setRechazoCobro(null);
    setEnviando(true);
    try {
      await api.entregarPedido(p.id, pagos);
      onCambio();
    } catch (err) {
      const texto = err instanceof Error ? err.message : "No se pudo confirmar la entrega";
      // R4 (20-nov): cobró en efectivo y no hay caja abierta para recibir esa
      // plata. No es una falla del repartidor ni de la señal: el pedido sigue
      // pendiente y alguien tiene que abrir la caja. Se dice en la hoja de
      // cobro, que es lo que tiene a la vista, y no como un error rojo más.
      // Por la forma y no con `instanceof ApiError`: los tests mockean el módulo del API.
      const f = err as { status?: number; codigo?: string } | null;
      const sinCaja = f?.status === 409 && f?.codigo === "SIN_CAJA_ABIERTA";
      if (pagos) setRechazoCobro({ sinCaja, texto });
      else setError(texto);
    } finally {
      setEnviando(false);
    }
  }

  // Una hoja a la vez (regla del dueño, 20-nov): «Cobrar» y «No se pudo
  // entregar» reemplazan al detalle en vez de abrirse encima, y «Volver» lo
  // trae de nuevo. Apiladas, la de abajo asomaba y había dos cruces de cerrar.
  const volverAlDetalle = () => {
    setVolvio(true);
    setCobrando(false);
    setNoEntrega(false);
    setRechazoCobro(null);
  };

  return (
    <>
      {!cobrando && !noEntrega && (
      <Modal
        abierto
        titulo={p.clienteNombre ?? "Pedido"}
        subtitulo={p.comprobante ?? `#${p.id}`}
        onClose={onClose}
        continua={volvio ? "atras" : undefined}
        acciones={
          pendiente &&
          !enEsperaAhora && (
            <>
              {/* El repartidor ya no cancela (20-nov, regla del dueño):
                  cancelar anula la venta y devuelve el stock, y eso lo
                  decide la caja. Él avisa por qué no pudo. */}
              <Boton variante="ghost" className={PIE} onClick={() => setNoEntrega(true)}>
                No se pudo entregar
              </Boton>
              {soloConfirmar ? (
                <Boton icono="check" className={PIE} onClick={() => confirmarEntrega()} disabled={enviando}>
                  {enviando ? "Confirmando…" : "Marcar entregado"}
                </Boton>
              ) : (
                <Boton icono="dollar" className={PIE} onClick={() => setCobrando(true)}>
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
            {enEsperaAhora && (
              <div role="status" className="rounded-xl border border-danger-borde bg-danger-suave px-3.5 py-3 text-[13px] text-danger-text">
                <p className="font-bold">En espera de la caja · {textoMotivo(espera.motivo)}</p>
                {espera.nota && <p className="mt-0.5 italic">«{espera.nota}»</p>}
                <p className="mt-1">Volvé al local con el pedido; la caja decide si lo reintentás, lo lleva otro o se cancela.</p>
              </div>
            )}
            <div className="rounded-xl bg-muted p-3.5">
              <p className="text-[13px] text-texto">
                {/* Con el bloque de la página a la vista, la referencia va ahí
                    («Referencia: …»): acá no se repite (QA 18-nov). */}
                {webBase && pendiente
                  ? direccionSinReferencia(direccionParaMostrar({ ...p, pedidoWeb: webBase }), webBase.referencia)
                  : direccionParaMostrar({ ...p, pedidoWeb: p.pedidoWeb ?? pedido.pedidoWeb })}
              </p>
              {/* De la página, «Paga con…» ya lo dice el bloque de cobro de abajo (con el cambio): no se repite. */}
              {(webDelPedido ? notaSinPago(p.notaPedido) : p.notaPedido) && (
                <p className="mt-1 text-[13px] italic text-texto-3">{webDelPedido ? notaSinPago(p.notaPedido) : p.notaPedido}</p>
              )}
              {paraLlamar && hrefWhatsApp && (
                <div className="mt-2.5 flex gap-2">
                  <a
                    href={`tel:${paraLlamar}`}
                    className={`flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-lg border border-borde bg-white px-3 py-3 text-[13px] font-semibold text-texto-2 hover:bg-muted ${TOQUE}`}
                  >
                    <Icon name="phone" size={15} /> Llamar
                  </a>
                  <a
                    href={hrefWhatsApp}
                    target="_blank"
                    rel="noreferrer"
                    className={`flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-lg border border-borde bg-white px-3 py-3 text-[13px] font-semibold text-texto-2 hover:bg-muted ${TOQUE}`}
                  >
                    <Icon name="phone" size={15} /> WhatsApp
                  </a>
                </div>
              )}
            </div>

            {/* El mapa y la navegación, para TODA entrega pendiente (20-nov):
                antes sólo los pedidos de la página tenían Maps y Waze. */}
            {pendiente && !enEsperaAhora && (
              <ComoLlegar
                pin={pin}
                direccion={direccionEscrita(p.clienteDireccion ?? pedido.clienteDireccion)}
                origen={p.ubicacionOrigen ?? pedido.ubicacionOrigen ?? null}
              />
            )}

            {webBase && pendiente && !enEsperaAhora && (
              <AccionesPedidoWeb
                ventaId={p.id}
                direccion={p.clienteDireccion}
                web={webBase}
                cobro={{ productos: p.total ?? 0, envio: p.tarifaEnvio ?? 0, aCobrar }}
                onSalio={(salioEn) => {
                  setSalioAca(salioEn);
                  onSalio();
                }}
                sinUbicacion={sinUbicacion}
              />
            )}

            <ul className="divide-y divide-borde-soft">
              {agruparHijas(p.detalles ?? []).map(({ linea: d, hijas }, i) => (
                <li key={i} className="py-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-[13px] text-texto">
                      <span className="font-bold">{fmtNum(d.cantidad)}×</span> {d.producto}
                      {d.nota && (
                        <span className="block text-xs italic text-texto-3">{d.nota}</span>
                      )}
                    </p>
                    <span className="shrink-0 text-[13px] font-bold">{fmtMoney(d.subtotal)}</span>
                  </div>
                  {/* Los toppings del vaso, indentados debajo: el repartidor sabe qué lleva y qué se cobró aparte. */}
                  {hijas.length > 0 && (
                    <ul className="mt-0.5 space-y-0.5 border-l-2 border-borde pl-3" data-testid="toppings-entrega">
                      {hijas.map((h, j) => (
                        <li key={j} className="flex items-start justify-between gap-3 text-xs text-texto-2">
                          <span>
                            + {h.cantidad !== 1 ? `${fmtNum(h.cantidad)} × ` : ""}
                            {h.producto}
                          </span>
                          <span className={`shrink-0 ${h.incluido ? "text-texto-3" : "font-semibold text-texto"}`}>
                            {h.incluido ? "incluido" : fmtMoney(h.subtotal)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
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
      )}

      {cobrando && (
        <DialogoCobroEntrega
          total={aRegistrar}
          aPedirEnMano={aCobrar}
          pagaCon={webDelPedido?.formaPago === "EFECTIVO" ? webDelPedido.pagaCon : null}
          formasPago={formasPago}
          enviando={enviando}
          rechazo={rechazoCobro}
          onClose={volverAlDetalle}
          onConfirmar={(pagos) => confirmarEntrega(pagos)}
        />
      )}

      {noEntrega && (
        <NoSePudoEntregar
          ventaId={p.id}
          cliente={p.clienteNombre ?? "Pedido"}
          onClose={volverAlDetalle}
          onAvisado={() => {
            setNoEntrega(false);
            onCambio();
          }}
        />
      )}
    </>
  );
}

function DialogoCobroEntrega({
  total,
  aPedirEnMano,
  pagaCon,
  formasPago,
  enviando,
  rechazo,
  onClose,
  onConfirmar,
}: {
  /**
   * Lo que contestó el servidor al cobrar. `sinCaja` (409 SIN_CAJA_ABIERTA,
   * R4): no hay caja abierta para recibir el efectivo; el pedido sigue pendiente.
   */
  rechazo?: { sinCaja: boolean; texto: string } | null;
  /** Lo que se registra como pago: sólo productos, sin el envío. */
  total: number;
  /** Lo que el repartidor cobra en mano, con la tarifa de envío incluida. */
  aPedirEnMano: number;
  /** Con cuánto dijo el cliente que paga (pedido de la página en efectivo): «Efectivo recibido» arranca ahí. */
  pagaCon?: number | null;
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
  const [recibido, setRecibido] = useState(() => {
    const dicho = recibidoSugerido(pagaCon, aPedirEnMano);
    return dicho != null ? montoParaEditar(dicho) : "";
  });
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
      continua="adelante"
      // Con el efectivo recibido a medio escribir, un roce afuera lo borraba.
      cerrarAlClicAfuera={false}
      acciones={
        <>
          {/* «Volver» y no «Cancelar»: en un pedido, «Cancelar» se leía como
              cancelar el pedido. Vuelve al detalle. */}
          <Boton variante="ghost" className={PIE} onClick={onClose}>
            Volver
          </Boton>
          <Boton className={PIE} onClick={confirmar} disabled={enviando}>
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
              className={`min-h-11 rounded-xl border px-3 py-2.5 text-[13px] font-semibold disabled:opacity-40 disabled:active:scale-100 ${TOQUE} ${
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
                  className={`min-h-11 rounded-xl border border-borde bg-white px-3.5 py-2 text-[13px] font-semibold text-texto-2 hover:border-primary hover:bg-primary-50 hover:text-primary-700 ${TOQUE}`}
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
        {rechazo?.sinCaja ? (
          <div role="alert" className="rounded-xl border border-warning-borde bg-warning-suave px-3.5 py-3 text-[13px] text-warning-text">
            <p className="font-bold">No hay ninguna caja abierta</p>
            <p className="mt-0.5">{rechazo.texto}</p>
          </div>
        ) : (
          <ErrorMsg>{rechazo?.texto}</ErrorMsg>
        )}
      </div>
    </Modal>
  );
}
