import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Icon } from "../../components/Icon";
import { Vacio } from "../../components/ui";
import { ApiError } from "../../lib/api";
import { aCentavos } from "../../lib/dinero";
import { fmtMoney } from "../../lib/format";
import { tieneFeature, tienePermiso } from "../../lib/permisos";
import { useAuth } from "../../store/AuthContext";
import type { CreditoInput, PagoInput } from "../../types";
import PantallaCredito from "../pos/PantallaCredito";
import { useIntentoDeCobro } from "../pos/useIntentoDeCobro";
import {
  cuentaDe,
  devolucionDe,
  fmtCobrado,
  fmtCrono,
  fmtHace,
  horaDe,
  round2,
  segundosJugados,
  textoDevolucion,
} from "./calculo";
import { FormCobro } from "./Cobro";
import { useCobro } from "./useCobro";
import { useAccion } from "./useAccion";
import { CajaCerradaAviso } from "./ModalesCaja";
import { ahoraServidor, useAhora } from "./reloj";
import { agruparItems, billar, leerBillar, tipoDe, useBillar } from "./store";
import {
  avisoCuentaRecalculada,
  cobroQueFigura,
  CUENTA_MAX_MS,
  CUENTA_VIEJA_MS,
  inicioParaCobrarLaPausa,
  medioDelBoton,
  pagosFinales,
  type CobroIntentado,
  type CobroSugerido,
} from "./CerrarMesa.datos";
import { BotonB, Circulo, Encabezado, ErrorAccion, Nota, Rotulo } from "./ui";
import { textoMetodo } from "./vista";

/**
 * Aceptar la cuenta nueva. Con un QR a la vista sin confirmar no se sabe si el
 * cliente pagó, así que son dos botones: "ya pagó" deja la sugerencia del aviso
 * (Mixto con lo que entró) y "todavía no" deja el cobro de cero (ver
 * `avisoCuentaRecalculada`).
 */
function BotonesCuentaNueva({
  qrSinConfirmar,
  etiqueta,
  enviando,
  usar,
}: {
  qrSinConfirmar: boolean;
  etiqueta: string;
  enviando: boolean;
  usar: (pago?: boolean) => void;
}) {
  if (!qrSinConfirmar) {
    return (
      <BotonB variante="verde" className="w-full" disabled={enviando} onClick={() => usar()}>
        {etiqueta}
      </BotonB>
    );
  }
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <BotonB variante="verde" className="w-full" disabled={enviando} onClick={() => usar(true)}>
        Ya pagó el QR
      </BotonB>
      <BotonB className="w-full" disabled={enviando} onClick={() => usar(false)}>
        Todavía no pagó
      </BotonB>
    </div>
  );
}

/** Lo que dice el botón de la cuenta nueva: el saldo, o lo que hay que devolver si ya se pagó de más. */
function etiquetaCuenta(x: { total: number; saldo: number; pagado: number }): string {
  if (x.saldo > 0.005) return ` · ${fmtMoney(x.saldo)}`;
  const aFavor = round2(x.pagado - x.total);
  return aFavor > 0.005 ? ` · devolver ${fmtMoney(aFavor)}` : "";
}

/**
 * Un "no" del servidor que el aviso de la cuenta nueva ya explica: la mesa
 * cambió, o lo cobrado no es el saldo. Los otros (sin conexión, caja cerrada)
 * quedan a la vista: pueden decir que el cobro entró.
 */
const esDeLaCuenta = (codigo: string | null) =>
  !!codigo && (codigo.startsWith("MESA_") || codigo === "MONTO_DISTINTO");

/** Un cobro de antes cuya cuenta se recalculó (ver `recalculada` en CerrarMesa). */
type Recalculada = CobroIntentado & { vieja: boolean; porRechazo: boolean };

/**
 * Cerrar la mesa (§7.6): el resumen de la cuenta a la izquierda y el cobro del
 * saldo a la derecha. Confirmar crea una venta normal y deja la mesa libre.
 *
 * La cuenta se calcula al entrar y queda quieta mientras se cobra: si el
 * tiempo sube de tramo mientras se cuenta el vuelto, el monto no cambia bajo
 * los dedos del cajero. El servidor cobra hasta esa misma hora (`hasta`) con
 * las mismas fórmulas, y si su total no es el que se ve acá (otra caja cargó
 * algo, o pasaron más de 5 minutos), no cobra: la cuenta se recalcula a la
 * hora de ahora y el cajero confirma de nuevo viendo el monto nuevo.
 *
 * El fiado es la pantalla de crédito del POS: el cliente de Cuentas por
 * cobrar, el plazo, el adelanto y el límite con PIN, todo igual.
 */
export default function CerrarMesa() {
  const { mesaId } = useParams();
  const e = useBillar();
  const ahora = useAhora();
  const navigate = useNavigate();
  const { usuario, negocio } = useAuth();
  const puedeCobrar = tienePermiso(usuario, "ventas.vender");
  const [hasta, setHasta] = useState(() => ahoraServidor());
  const [fiando, setFiando] = useState(false);
  const accion = useAccion();
  const intento = useIntentoDeCobro();
  /** Este equipo mandó un cobro de esta mesa (ver el texto de "no está abierta"). */
  const intentoCobro = useRef(false);
  /** Lo que se mandó a cobrar (ver `recalculada`). */
  const intentado = useRef<CobroIntentado | null>(null);
  /**
   * El cobro de antes, si la cuenta se recalculó a la hora de ahora: porque el
   * servidor dijo MESA_CAMBIO (`porRechazo`) o porque se estaba por vencer
   * (ver `vencida`). El tiempo siguió corriendo y la cuenta puede haber
   * cambiado: antes subía sola, lo recibido quedaba escrito con el vuelto de
   * la cuenta vieja y el botón seguía prendido. Bs 50 de vuelto por una cuenta
   * que pasó a Bs 55 dejaba el cajón Bs 5 corto (prueba profunda, 18-oct).
   * `vieja`: si fue por la hora (ver `CUENTA_VIEJA_MS`).
   */
  const [recalculada, setRecalculada] = useState<Recalculada | null>(null);
  /** El servidor rechazó el cobro con la hora al día y el mismo total (ver `errorVisible`). */
  const [sugerirRecargar, setSugerirRecargar] = useState(false);
  /**
   * Rechazado por la hora, se recalculó y dio lo mismo. Sin una nota, el
   * primer toque de Cobrar parecía no hacer nada (revisión del 18-oct).
   */
  const [actualizada, setActualizada] = useState(false);
  /**
   * El último cobro salió y no volvió respuesta (sin conexión, o un error del
   * servidor): pudo haber entrado. Mientras tanto la cuenta no se recalcula
   * sola (ver `vencida`).
   */
  const [sinRespuesta, setSinRespuesta] = useState(false);
  useEffect(() => {
    if (accion.codigo === "MESA_CAMBIO") {
      const ahoraMs = ahoraServidor();
      setHasta(ahoraMs);
      // Cada intento se mira una vez: un "no" que llegue después (el de
      // reanudar, por ejemplo) no es el de este cobro.
      const previo = intentado.current;
      intentado.current = null;
      setRecalculada(
        previo ? { ...previo, vieja: ahoraMs - previo.hasta >= CUENTA_VIEJA_MS, porRechazo: true } : null,
      );
    }
  }, [accion.codigo]);
  const mesa = e.mesas.find((m) => m.id === Number(mesaId));
  const sVivo = mesa?.estado === "abierta" ? mesa.sesion : undefined;
  // La cuenta sale de una FOTO de la sesión, no de la que trae el sondeo. Antes
  // se recalculaba cada 5 s: si otro equipo cargaba algo mientras se cobraba,
  // el monto cambiaba solo y `totalEsperado` viajaba ya actualizado, así que el
  // servidor lo aceptaba. Con "Recibido" vacío la venta asentaba en efectivo
  // más de lo que había entrado al cajón (QA del 12-oct).
  const [foto, setFoto] = useState(sVivo);
  /** El tablero ya mostró la mesa sin cuenta: una que se abra después no es la que se vino a cerrar. */
  const [vioSinCuenta, setVioSinCuenta] = useState(false);
  useEffect(() => {
    if (mesa && !sVivo && !foto) setVioSinCuenta(true);
  }, [mesa, sVivo, foto]);
  useEffect(() => {
    // Sólo si todavía no hay (se entró antes de que llegara el tablero). Otra
    // sesión en la misma mesa es OTRA cuenta: la cobró otro equipo y la
    // volvieron a abrir. Se la adoptaba sin avisar, con lo recibido de antes,
    // y se la cerraba (revisión del 18-oct). Esta pantalla queda en "no está
    // abierta".
    if (sVivo && !foto && !vioSinCuenta) setFoto(sVivo);
  }, [sVivo, foto, vioSinCuenta]);
  const s = foto ? (sVivo?.id === foto.id ? foto : undefined) : vioSinCuenta ? undefined : sVivo;
  const tipo = mesa ? tipoDe(e, mesa) : null;
  const c = s && tipo ? cuentaDe(s, tipo, hasta) : null;
  const cobro = useCobro(c?.saldo ?? 0);
  // Lo que debe la mesa con lo último que llegó. Si no es lo de la foto, se
  // avisa y no se cobra hasta que el cajero mire el monto nuevo.
  const cVivo = sVivo && tipo ? cuentaDe(sVivo, tipo, hasta) : null;
  const cambioLaCuenta =
    !!c && !!cVivo && (aCentavos(cVivo.total) !== aCentavos(c.total) || aCentavos(cVivo.saldo) !== aCentavos(c.saldo));
  const { setError } = accion;
  const codigo = accion.codigo;
  useEffect(() => {
    // Si la cuenta cambió después de un cobro sin respuesta, ese cobro no
    // entró: con la mesa cerrada nadie le podría cargar ni cobrar. Seguía el
    // rojo "pudo haber entrado, no le pidas ni le devuelvas nada" junto al
    // aviso que decía lo contrario, y la cuenta ya no se recalculaba sola
    // (revisión del 18-oct).
    if (!sinRespuesta || !cambioLaCuenta) return;
    setSinRespuesta(false);
    intentoCobro.current = false;
    if (!codigo) setError("");
  }, [sinRespuesta, cambioLaCuenta, codigo, setError]);

  // Lo que el cobro ya tiene encaminado con la cuenta de la foto: el QR a la
  // vista y el efectivo recibido. Si la cuenta cambia, el aviso dice qué hacer
  // con esa plata (ver `avisoCuentaRecalculada`). El QR cuenta aunque no esté
  // confirmado: el cliente pudo haberlo pagado mientras el cajero esperaba la
  // transferencia, y el aviso no lo nombraba (revisión del 18-oct). El aviso
  // es condicional ("si ya te pagaron…") y el QR se vuelve a confirmar igual.
  const cTotal = c?.total ?? null;
  const cSaldo = c?.saldo ?? 0;
  const cPagado = c?.pagado ?? 0;
  const qrALaVista =
    cobro.metodo === "QR" || (cobro.metodo === "Mixto" && cobro.montoQr > 0 && cobro.montoQr < cobro.monto);
  const qrEnCurso = qrALaVista ? cobro.montoQr : 0;
  // En efectivo, lo que hay en la mano: lo escrito, hasta el saldo (con menos,
  // el aviso mandaba a escribir el saldo entero como si estuviera).
  const efectivoEnCurso =
    cobro.metodo === "Efectivo"
      ? cobro.sinRecibido
        ? 0
        : Math.min(cobro.recibido, cSaldo)
      : cobro.metodo === "Mixto" && qrALaVista
        ? Math.max(0, round2(cSaldo - cobro.montoQr))
        : 0;
  const qrConfirmado = cobro.qrConfirmado;
  const enCurso = useMemo<CobroIntentado | null>(
    () =>
      cTotal === null
        ? null
        : {
            hasta,
            total: cTotal,
            saldo: cSaldo,
            pagado: cPagado,
            aFavor: Math.max(0, round2(cPagado - cTotal)),
            qr: qrEnCurso,
            qrConfirmado,
            efectivo: efectivoEnCurso,
          },
    [hasta, cTotal, cSaldo, cPagado, qrEnCurso, qrConfirmado, efectivoEnCurso],
  );

  // Se está por vencer: el servidor no cobra una cuenta de hace más de 5
  // minutos. Se recalcula sola, por el mismo camino que su MESA_CAMBIO. Antes
  // se veían el vuelto y "Cobrar" prendidos hasta el rechazo, y el cajero daba
  // un vuelto que después no servía (revisión del 18-oct). Con la hora de
  // este momento y no la del último segundo: así también se nota al escribir
  // o cuando llega el sondeo, aunque el reloj de la pestaña venga atrasado.
  //
  // También si la mesa se reanudó después de esa hora (otro equipo): con la
  // pausa ya descontada entera, a la hora de antes la cuenta bajaba un bloque
  // (revisión del 18-oct; el backend tampoco cobra con esa hora).
  //
  // Pero no después de un cobro sin respuesta: pudo haber entrado, y con otra
  // hora cambia la clave y el reintento ya no lo encuentra; el aviso le pedía
  // al cliente plata de más (revisión del 18-oct). El reintento va con la
  // misma hora y, si no había entrado, el servidor contesta MESA_CAMBIO.
  const ultimaReanudacion = Math.max(0, ...(sVivo?.pausas ?? []).map((p) => p.hasta));
  const vencida =
    enCurso !== null && !sinRespuesta && (ahoraServidor() - hasta >= CUENTA_VIEJA_MS || ultimaReanudacion > hasta);
  const enviando = accion.enviando;
  useEffect(() => {
    if (!vencida || enviando || recalculada !== null || enCurso === null) return;
    // Si en el mismo render llegó un MESA_CAMBIO, su efecto ya puso el cobro
    // rechazado y gana: pisarlo perdía el "por rechazo" y dejaba el rojo del
    // servidor a la vista (la e2e de la pantalla lo atrapó el 18-oct).
    setRecalculada(
      (previa) =>
        previa ?? { ...enCurso, vieja: ahoraServidor() - enCurso.hasta >= CUENTA_VIEJA_MS, porRechazo: false },
    );
    // Nunca antes de la reanudación: con el reloj de la pantalla atrasado
    // frente al servidor, quedaba antes y se volvía a recalcular a cada
    // render hasta pasarla (revisión del 18-oct).
    setHasta(Math.max(ahoraServidor(), ultimaReanudacion + 1));
    // Las notas de la vuelta anterior ya no dicen lo de ahora.
    setActualizada(false);
    setSugerirRecargar(false);
  }, [vencida, enviando, recalculada, enCurso, ultimaReanudacion]);

  /** Lo que un rechazo anterior dejó a la vista, si era de la mesa. Los otros (sin conexión, caja cerrada) quedan: pueden decir que el cobro entró. */
  const limpiarAvisos = () => {
    if (esDeLaCuenta(accion.codigo)) setError("");
    setSugerirRecargar(false);
    setActualizada(false);
  };
  /** Lo que ya entró por QR no se vuelve a cobrar (ver `avisoCuentaRecalculada`). El QR se confirma otra vez igual: la confirmación es por monto y medio. */
  const aplicarSugerido = (sugerido: CobroSugerido) => {
    if (!sugerido) return;
    cobro.setMetodo(sugerido.metodo);
    if (sugerido.metodo === "Mixto") cobro.setEfectivoTexto(String(sugerido.efectivo));
  };

  // Recalculada y con otro total: se avisa y no se cobra hasta que el cajero
  // la acepte, que reinicia lo recibido y el QR (como "Usar la cuenta nueva").
  const aviso =
    recalculada && c && !cambioLaCuenta
      ? avisoCuentaRecalculada(
          recalculada,
          {
            total: c.total,
            saldo: c.saldo,
            pagado: c.pagado,
            devolver: s ? textoDevolucion(devolucionDe(s.pagos, c.total)) : undefined,
          },
          // El reintento de un cobro sin respuesta que el servidor ya no aceptó
          // por la hora tiene su propio texto (ver `MOTIVOS.trasCorte`).
          recalculada.vieja ? (recalculada.trasCorte ? "trasCorte" : "vieja") : "hora",
        )
      : null;
  const cambioPorLaHora = aviso !== null;
  useEffect(() => {
    if (recalculada === null || cTotal === null || cambioLaCuenta) return;
    if (aCentavos(cTotal) !== aCentavos(recalculada.total)) return;
    // Recalculada y con el mismo total. Si el rechazo fue por la hora, el
    // "volvé a abrir el cierre" del servidor ya no aplica: se cobra de nuevo
    // con la cuenta de ahora. Si la hora estaba al día, el "no" fue por otra
    // cosa y su mensaje queda: se borraba igual, y si la web y el servidor
    // calculaban distinto (una pestaña vieja después de un pase) el cajero
    // tocaba Cobrar y no pasaba nada, sin ningún texto (revisión del 18-oct).
    // Recalculada antes de vencer, no hay nada que decir.
    if (recalculada.porRechazo) {
      if (recalculada.vieja) {
        setError("");
        setActualizada(true);
      } else {
        setSugerirRecargar(true);
      }
    }
    setRecalculada(null);
  }, [recalculada, cTotal, cambioLaCuenta, setError]);
  /** `pago`: "Todavía no pagó" (con el QR sin confirmar) deja el cobro de cero, sin la sugerencia. */
  const usarCuentaRecalculada = (pago = true) => {
    const sugerido = pago ? (aviso?.sugerido ?? null) : null;
    cobro.reiniciar();
    aplicarSugerido(sugerido);
    setRecalculada(null);
    limpiarAvisos();
  };

  // Otro equipo cargó o cobró algo: el mismo aviso, contra lo que el cobro ya
  // tenía encaminado. Decía sólo el saldo nuevo: el QR confirmado se perdía y
  // la devolución cambiaba sin decirlo (revisión del 18-oct).
  const vivo =
    sVivo && cVivo
      ? {
          total: cVivo.total,
          saldo: cVivo.saldo,
          pagado: cVivo.pagado,
          devolver: textoDevolucion(devolucionDe(sVivo.pagos, cVivo.total)),
        }
      : null;
  const avisoOtro =
    cambioLaCuenta && vivo && enCurso
      ? ((recalculada && avisoCuentaRecalculada(recalculada, vivo, "otroEquipo")) ??
        avisoCuentaRecalculada(enCurso, vivo, "otroEquipo"))
      : null;
  const usarCuentaNueva = (pago = true) => {
    const sugerido = pago ? (avisoOtro?.sugerido ?? null) : null;
    setFoto(sVivo);
    // La hora queda: el botón dice el monto de esa hora, y recalcular a la de
    // ahora podía dejar otro (revisión del 18-oct). Si ya es vieja, la
    // recalcula `vencida`, como siempre.
    cobro.reiniciar();
    aplicarSugerido(sugerido);
    setRecalculada(null);
    limpiarAvisos();
  };
  useEffect(() => {
    // Si la cuenta cambió mientras se fiaba (por la hora o porque otro equipo
    // cargó algo), se vuelve al cierre: ahí está el aviso con el saldo nuevo.
    // En la pantalla del fiado el total cambiaba sin decir nada, y el primer
    // rechazo no se veía (revisión del 18-oct).
    if (cambioPorLaHora || cambioLaCuenta) setFiando(false);
  }, [cambioPorLaHora, cambioLaCuenta]);
  /**
   * El "no" del servidor, si va a la vista. Con un aviso ámbar, el de la mesa
   * no: el aviso dice qué pasó y cómo seguir, y el rojo de abajo ("volvé a
   * abrir el cierre") contradecía al botón de arriba. Los otros sí (sin
   * conexión, caja cerrada): pueden decir que el cobro entró. Un MESA_CAMBIO
   * que queda es uno con la hora al día y el mismo total: el servidor calcula
   * otra cuenta, y su mensaje dice cuánto. Recargar trae la mesa y la web de
   * ahora.
   */
  const errorVisible =
    (cambioLaCuenta || cambioPorLaHora) && esDeLaCuenta(accion.codigo)
      ? ""
      : sugerirRecargar && accion.codigo === "MESA_CAMBIO" && accion.error
        ? `${accion.error} Si vuelve a pasar con el mismo monto, recargá la página (F5).`
        : sinRespuesta && accion.error
          ? `${accion.error} El cobro pudo haber entrado: tocá «Cobrar» otra vez cuando vuelva la conexión, que no se cobra dos veces, y no le pidas ni le devuelvas nada antes. Si vuelve después de las ${horaDe(hasta + CUENTA_MAX_MS)} y no había entrado, la cuenta se recalcula: anotá cuánto te pagó.`
          : accion.error;

  const reloj = (
    <span className="flex items-center gap-1.5 text-[13px] font-semibold tabular-nums text-texto-2">
      <Icon name="clock" size={16} />
      {horaDe(ahora)}
    </span>
  );

  if (!e.caja.abierta) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <Encabezado titulo={`Cerrar Mesa ${mesaId}`} />
        <CajaCerradaAviso />
      </div>
    );
  }
  if (!mesa || !s || !c || !tipo) {
    // Recién cobrada, la mesa ya figura libre pero todavía se traen las ventas
    // del turno: decía "Puede que ya la haya cerrado otra caja" justo después
    // de que este cajero la cobró.
    return (
      <div className="flex h-full min-h-0 flex-col">
        <Encabezado titulo={`Cerrar Mesa ${mesaId}`}>{reloj}</Encabezado>
        {accion.enviando ? (
          <Vacio icono="bola" titulo="Registrando la venta…" texto={`La Mesa ${mesaId} ya quedó libre.`} />
        ) : (
          <Vacio
            icono="bola"
            titulo={`La Mesa ${mesaId} no está abierta`}
            // Se cortó la respuesta del cobro y el tablero la vio cerrada antes
            // del reintento: el cobro entró, con el medio del primer intento,
            // y la pantalla culpaba a otra caja (revisión del 17-oct).
            texto={
              intentoCobro.current
                ? "El cobro pudo haber entrado aunque se cortó la conexión: revisá en Ventas con qué medio quedó y, si no es el que pagó, usá «Corregir pago»."
                : "Puede que ya la haya cerrado otra caja."
            }
            accion={<BotonB onClick={() => navigate("/billar")}>Volver al tablero</BotonB>}
          />
        )}
      </div>
    );
  }

  const terminar = (codigo: string | null, texto: string, figura: string | null = null) => {
    if (codigo && figura) {
      // El reintento devolvió una venta grabada con otro medio (ver
      // `cobroQueFigura`): que no salga el aviso verde con el medio nuevo.
      billar.avisar({
        tono: "ambar",
        titulo: `La Mesa ${mesa.id} ya se había cobrado (${codigo})`,
        texto: `Figura ${figura}. Si pagó de otra forma, usá «Corregir pago» en el detalle de la venta antes de cerrar la caja.`,
        accion: { tipo: "venta", codigo },
      });
    } else if (codigo) {
      billar.avisar({
        tono: "verde",
        titulo: `Venta ${codigo} completada · Mesa ${mesa.id} quedó libre`,
        texto,
        accion: { tipo: "ticket", codigo },
      });
    }
    navigate("/billar", { replace: true });
  };

  /** Lo pagado de más (la cuenta bajó después de un adelanto): hay que devolverlo. */
  const aFavor = round2(c.pagado - c.total);
  /** Y en qué: "Bs 40,00 en efectivo y Bs 20,00 por QR", como lo guarda la venta. */
  const devolver = textoDevolucion(devolucionDe(s.pagos, c.total));

  // Lo que identifica ESTE cobro: la sesión y la hora de la cuenta. Un
  // reintento de lo mismo manda el mismo id y, si el primero había entrado,
  // el backend devuelve esa venta en vez de cobrar dos veces.
  const huellaDe = (h: number) => `cerrar:${s.id}:${h}`;

  /**
   * La hora con que se manda el cobro: la de ahora, si da la misma cuenta. El
   * servidor cobra hasta 5 minutos después de esa hora, y contaba desde que se
   * abrió el cierre: con 3 minutos contando el vuelto, alcanzaban 2 sin
   * conexión para que el reintento se rechazara con el cliente ya ido
   * (revisión del 18-oct). El reintento de un cobro sin respuesta va con la
   * misma hora, y la misma clave: si entró, el servidor devuelve esa venta.
   */
  const horaDelEnvio = () => {
    if (sinRespuesta) return hasta;
    const ahoraMs = ahoraServidor();
    const cAhora = cuentaDe(s, tipo, ahoraMs);
    if (aCentavos(cAhora.total) !== aCentavos(c.total) || aCentavos(cAhora.saldo) !== aCentavos(c.saldo)) return hasta;
    setHasta(ahoraMs);
    return ahoraMs;
  };

  const cobrar = async (
    cobroFinal: Parameters<typeof billar.cerrar>[1],
    texto: string,
    finales: { metodo: string; monto: number }[] | null = null,
  ) => {
    intentoCobro.current = true;
    setSugerirRecargar(false);
    setActualizada(false);
    const parte = (metodo: string) =>
      round2((finales ?? []).filter((p) => p.metodo === metodo).reduce((t, p) => t + p.monto, 0));
    intentado.current = {
      hasta: cobroFinal.hasta,
      total: c.total,
      saldo: c.saldo,
      pagado: c.pagado,
      aFavor: Math.max(0, aFavor),
      qr: parte("QR"),
      // Un cobro con QR sale con el QR confirmado: sin eso no hay pago.
      qrConfirmado: true,
      efectivo: parte("Efectivo"),
      trasCorte: sinRespuesta,
    };
    let r: Awaited<ReturnType<typeof billar.cerrar>> | null = null;
    const ok = await accion.ejecutar(async () => {
      try {
        r = await billar.cerrar(mesa.id, cobroFinal);
        setSinRespuesta(false);
      } catch (err) {
        // Sin respuesta (o un 5xx), el cobro pudo haber entrado. Con un "no"
        // del servidor, no: la pantalla de "no está abierta" ya no dice que
        // pudo haber entrado si después la cobra otro equipo (revisión del
        // 18-oct). Un error de acá (sin el POST) tampoco.
        const sinResp = err instanceof ApiError && (err.status === 0 || err.status >= 500);
        setSinRespuesta(sinResp);
        if (!sinResp) intentoCobro.current = false;
        throw err;
      }
    });
    const hecho = r as Awaited<ReturnType<typeof billar.cerrar>> | null;
    if (!ok || !hecho) return;
    intento.registrado();
    // Sólo un reintento puede devolver una venta con otros pagos: la clave es
    // la misma aunque se haya cambiado de medio.
    const venta = hecho.reintento && finales ? leerBillar().ventas.find((v) => v.id === hecho.ventaId) : undefined;
    // Si las ventas no se pudieron traer, no se sabe con qué medio quedó: que
    // no salga el aviso verde con el medio nuevo como si fuera seguro.
    const figura =
      hecho.reintento && finales
        ? venta
          ? cobroQueFigura(venta.pagos, s.pagos, c.total, finales)
          : "un medio que no se pudo leer: revisalo en Ventas"
        : null;
    terminar(hecho.codigo, texto, figura);
  };

  const confirmar = () => {
    const pago = c.saldo > 0 ? cobro.pago : undefined;
    if (c.saldo > 0 && !pago) return;
    const h = horaDelEnvio();
    void cobrar(
      { hasta: h, totalEsperado: c.total, pago: pago ?? undefined, clienteRequestId: intento.actual(huellaDe(h)) },
      pago?.metodo === "Efectivo"
        ? `Cambio ${fmtMoney(cobro.cambio)}`
        : pago
          ? textoMetodo(pago)
          : aFavor > 0.005
            ? `Devolvé ${devolver} al cliente.`
            : "Estaba todo pagado.",
      pago ? pagosFinales(pago) : [],
    );
  };

  const fiar = (credito: CreditoInput, pagos: PagoInput[]) => {
    const adelanto = pagos.reduce((t, p) => t + p.monto, 0);
    const h = horaDelEnvio();
    void cobrar(
      {
        hasta: h,
        totalEsperado: c.total,
        credito: { credito, pagos },
        clienteRequestId: intento.actual(`${huellaDe(h)}:fiado`),
      },
      `${fmtMoney(c.saldo - adelanto)} a cuentas por cobrar${credito.clienteNombre ? ` (${credito.clienteNombre})` : ""}.`,
    );
  };

  if (fiando) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <Encabezado titulo={`Fiado · Mesa ${mesa.id}`}>{reloj}</Encabezado>
        <PantallaCredito
          total={c.saldo}
          formasPago={e.formasPago}
          onAtras={() => {
            accion.setError("");
            setFiando(false);
          }}
          onConfirmar={fiar}
          enviando={accion.enviando}
          error={
            errorVisible ||
            (actualizada
              ? `La cuenta se actualizó a las ${horaDe(hasta)} y el monto es el mismo: tocá «Registrar fiado» otra vez.`
              : "")
          }
        />
      </div>
    );
  }

  const secs = segundosJugados(s, hasta);
  /** Si está en pausa y en realidad siguieron jugando: a qué hora correr el inicio. */
  const pausaRecuperable = sVivo ? inicioParaCobrarLaPausa(sVivo, ahora) : null;
  const items = agruparItems(s.consumos);
  const detalleTiempo = s.prepago
    ? `cobrado ${fmtCobrado(c.cobradoMin)} (tiempo fijo ${s.prepago.min / 60} h${c.excedenteMin ? ` + ${fmtCobrado(c.excedenteMin)} de excedente` : ""})`
    : `cobrado ${fmtCobrado(c.cobradoMin)}`;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Encabezado titulo={`Cerrar Mesa ${mesa.id}`}>{reloj}</Encabezado>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
        <div className="mx-auto max-w-5xl">
          <Link
            to={`/billar?mesa=${mesa.id}`}
            className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-texto-2 hover:text-texto"
          >
            <Icon name="arrowLeft" size={15} />
            Volver al tablero
          </Link>
          <div className="grid items-start gap-4 lg:grid-cols-2 lg:gap-6">
            <section className="card overflow-hidden">
              <div className="flex items-center gap-3 border-b border-borde px-5 py-4">
                <Circulo icono="fileText" size={36} />
                <h2 className="flex-1 text-[15px] font-bold text-texto">Resumen de Mesa {mesa.id}</h2>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                  {tipo.nombre}
                </span>
              </div>
              <div className="space-y-4 px-5 py-4 text-[13px]">
                <div>
                  <Rotulo icono="clock">Tiempo</Rotulo>
                  <div className="mt-2 flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-texto">Jugado {fmtCrono(secs)}</p>
                      <p className="text-[12px] text-texto-3">
                        Inicio {horaDe(s.start)} · {detalleTiempo}
                      </p>
                    </div>
                    <span className="font-bold tabular-nums text-texto">
                      {fmtMoney(c.tiempoBs + (c.promo?.descuento ?? 0))}
                    </span>
                  </div>
                  {c.promo && (
                    <div className="mt-1 flex justify-between text-primary-700">
                      <span>
                        {c.promo.nombre} −{c.promo.pct} %
                      </span>
                      <span className="font-semibold tabular-nums">−{fmtMoney(c.promo.descuento)}</span>
                    </div>
                  )}
                </div>
                <div className="border-t border-borde-soft pt-4">
                  <Rotulo icono="cart" extra={fmtMoney(c.consumosBs)}>
                    Consumos
                  </Rotulo>
                  {items.length === 0 ? (
                    <p className="mt-2 text-texto-3">Sin consumos.</p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {items.map((i) => (
                        <li key={`${i.productoId}-${i.precio}`} className="flex items-center gap-3">
                          <span className="flex h-6 min-w-7 items-center justify-center rounded-md bg-slate-100 px-1 text-[12px] font-bold text-texto-2">
                            {i.cant}×
                          </span>
                          <span className="flex-1 text-texto">{i.nombre}</span>
                          <span className="font-semibold tabular-nums text-texto">{fmtMoney(i.precio * i.cant)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="space-y-1 border-t border-borde pt-4">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[15px] font-semibold text-texto">TOTAL</span>
                    <span className="text-xl font-extrabold tabular-nums text-texto">{fmtMoney(c.total)}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-amber-800">
                    <span>PAGADO</span>
                    <span className="tabular-nums">{fmtMoney(c.pagado)}</span>
                  </div>
                  {s.pagos.map((p) => (
                    <div key={p.id} className="flex justify-between pl-3 text-texto-3">
                      <span>
                        {textoMetodo(p)}
                        {p.nota ? ` · ${p.nota}` : ""}
                      </span>
                      <span className="tabular-nums">{fmtMoney(p.monto)}</span>
                    </div>
                  ))}
                  <div className="flex items-baseline justify-between pt-1">
                    <span className="font-bold text-amber-800">SALDO</span>
                    <span className="text-xl font-extrabold tabular-nums text-amber-800">{fmtMoney(c.saldo)}</span>
                  </div>
                </div>
                {(s.cliente || s.garantia) && (
                  <p className="text-[12px] text-texto-3">
                    {s.cliente ? `Cliente: ${s.cliente}` : ""}
                    {s.cliente && s.garantia && s.garantia !== "Ninguna" ? " · " : ""}
                    {s.garantia && s.garantia !== "Ninguna" ? `Garantía: ${s.garantia} (devolverla)` : ""}
                  </p>
                )}
              </div>
            </section>

            <section className="card space-y-4 p-4 sm:p-5">
              {/* En pausa el reloj no corre, y cobrarla así deja ese tiempo sin
                  cobrar: pausada a las 20:30 "salieron a comer" y cobrada a las
                  23:30 sin reanudar salía media hora (revisión del 16-oct). */}
              {sVivo?.pausedAt && (
                <div className="space-y-2">
                  <Nota tono="ambar" icono="alert">
                    La mesa está en pausa desde las {horaDe(sVivo.pausaDesde ?? sVivo.pausedAt)} (
                    {fmtHace(ahora - (sVivo.pausaDesde ?? sVivo.pausedAt))}
                    {sVivo.pauseMotivo ? ` · ${sVivo.pauseMotivo}` : ""}): ese tiempo no se cobra, aunque la reanudes
                    ahora.{" "}
                    {/* Cuánto y a qué hora, o que ya no se puede: decía "que el
                        encargado corrija la hora de inicio" sin más (prueba
                        profunda, 18-oct). */}
                    {pausaRecuperable
                      ? `Si en realidad siguieron jugando, el encargado tiene que correr el inicio ${fmtHace(pausaRecuperable.pausaMs)} antes, de las ${horaDe(sVivo.start)} a las ${horaDe(pausaRecuperable.inicio)}, con «Corregir inicio».`
                      : "Si en realidad siguieron jugando, ese tiempo ya no se puede cobrar desde acá."}
                  </Nota>
                  <BotonB
                    icono="play"
                    className="w-full"
                    disabled={accion.enviando}
                    onClick={async () => {
                      // Lo que se intentó cobrar antes no tiene que ver con este "no".
                      intentado.current = null;
                      setSugerirRecargar(false);
                      setActualizada(false);
                      const antes = enCurso;
                      let reanudada: typeof s | undefined;
                      const ok = await accion.ejecutar(async () => {
                        reanudada = (await billar.reanudar(mesa.id)).sesion;
                      });
                      // Reanudada, la cuenta es la de ahora: a la hora de antes,
                      // con la pausa ya descontada entera, bajaba un bloque y el
                      // aviso culpaba a "otro equipo" (revisión del 18-oct). Se
                      // compara con lo de antes como cualquier recálculo: si da
                      // lo mismo no pasa nada (lo recibido queda), y si otro
                      // equipo cargó algo mientras, avisa.
                      if (ok && reanudada) {
                        const ultima = Math.max(0, ...(reanudada.pausas ?? []).map((p) => p.hasta));
                        if (antes) setRecalculada((previa) => previa ?? { ...antes, vieja: false, porRechazo: false });
                        setFoto(reanudada);
                        setHasta(Math.max(ahoraServidor(), ultima + 1));
                        // Una mesa que se pudo reanudar no estaba cobrada: el
                        // cobro sin respuesta, si hubo, no había entrado.
                        setSinRespuesta(false);
                        intentoCobro.current = false;
                      }
                    }}
                  >
                    Reanudar la mesa (siguen jugando)
                  </BotonB>
                </div>
              )}
              <div className="rounded-2xl bg-gradient-to-br from-primary-boton to-primary-700 px-5 py-4 text-white">
                <p className="text-[11px] font-bold uppercase tracking-wider text-white/80">Total a cobrar</p>
                <p className="text-3xl font-extrabold tabular-nums">{fmtMoney(c.saldo)}</p>
                <p className="text-[13px] text-white/85">
                  Mesa {mesa.id} · Total {fmtMoney(c.total)} · Pagado {fmtMoney(c.pagado)}
                </p>
              </div>
              {cambioLaCuenta && cVivo && (
                <div className="space-y-2">
                  <Nota tono="ambar" icono="alert">
                    {avisoOtro?.texto ??
                      `La cuenta cambió mientras cobrabas (otro equipo cargó o cobró algo): ahora el saldo es ${fmtMoney(cVivo.saldo)}.`}
                  </Nota>
                  <BotonesCuentaNueva
                    qrSinConfirmar={!!avisoOtro?.qrSinConfirmar}
                    etiqueta={`Usar la cuenta nueva${etiquetaCuenta(cVivo)}`}
                    enviando={accion.enviando}
                    usar={usarCuentaNueva}
                  />
                </div>
              )}
              {aviso && (
                <div className="space-y-2">
                  <Nota tono="ambar" icono="alert">
                    {aviso.texto}
                  </Nota>
                  <BotonesCuentaNueva
                    qrSinConfirmar={!!aviso.qrSinConfirmar}
                    etiqueta={`Usar la cuenta nueva${etiquetaCuenta(c)}`}
                    enviando={accion.enviando}
                    usar={usarCuentaRecalculada}
                  />
                </div>
              )}
              {actualizada && !errorVisible && (
                <Nota tono="gris">
                  La cuenta se actualizó a las {horaDe(hasta)} y el monto es el mismo: tocá «
                  {c.saldo > 0.005 ? "Cobrar" : "Cerrar mesa"}» otra vez.
                </Nota>
              )}
              {/* Sin "Vender" el backend no deja cerrar (cerrar la mesa es una
                  venta). Antes se veía el cobro entero, se contaba el vuelto y
                  recién al confirmar decía que no (revisión del 16-oct). */}
              {!puedeCobrar ? (
                <Nota tono="ambar" icono="alert">
                  Tu usuario no puede cobrar: pedile a un encargado que cierre la mesa.
                </Nota>
              ) : c.saldo > 0 ? (
                <>
                  <FormCobro cobro={cobro} />
                  <ErrorAccion texto={errorVisible} />
                  <BotonB
                    variante="verde"
                    grande
                    className="w-full"
                    disabled={!cobro.pago || accion.enviando || cambioLaCuenta || cambioPorLaHora}
                    onClick={confirmar}
                  >
                    {accion.enviando ? "Cobrando…" : `Cobrar ${fmtMoney(c.saldo)} ${medioDelBoton(cobro.metodo)} y cerrar la mesa`}
                  </BotonB>
                  {/* Sin permiso de fiar, el servidor lo rechaza: el botón ni aparece.
                      Y sin fiado en el plan tampoco (el billar no fía, 17-oct): el
                      permiso ya viene recortado por el plan, esto es por si la
                      lista de permisos todavía no se refrescó. */}
                  {tieneFeature(negocio?.features, "fiado") && tienePermiso(usuario, "credito.otorgar") && (
                    <BotonB
                      icono="fileText"
                      className="w-full"
                      disabled={accion.enviando || cambioLaCuenta || cambioPorLaHora}
                      onClick={() => setFiando(true)}
                    >
                      Pasar saldo a fiado
                    </BotonB>
                  )}
                </>
              ) : (
                <>
                  {/* Lo pagado puede pasar el total si la cuenta bajó después de
                      un adelanto (entró una promo, se anuló un consumo). El
                      arqueo ya da ese sobrante por devuelto, pero la pantalla
                      decía "Ya está todo pagado" y nadie se lo devolvía: el
                      cliente pagaba de más y la caja cerraba con sobrante. */}
                  {aFavor > 0.005 ? (
                    <Nota tono="ambar" icono="alert">
                      Pagó {fmtMoney(aFavor)} de más (la cuenta bajó después de pagar): al cerrar, devolvé {devolver}.
                    </Nota>
                  ) : (
                    <Nota icono="checkCirculo">Ya está todo pagado. Cerrar la deja libre y registra la venta.</Nota>
                  )}
                  <ErrorAccion texto={errorVisible} />
                  <BotonB
                    variante="verde"
                    grande
                    icono="check"
                    className="w-full"
                    disabled={accion.enviando || cambioLaCuenta || cambioPorLaHora}
                    onClick={confirmar}
                  >
                    {accion.enviando ? "Cerrando…" : "Cerrar mesa"}
                  </BotonB>
                </>
              )}
              {/* Sin punto final: la hora ya termina en "p. m." y quedaba "p. m..". */}
              <p className="text-center text-[12px] text-texto-4">Calculado a las {horaDe(hasta)}</p>
            </section>
          </div>
        </div>
      </div>

    </div>
  );
}
