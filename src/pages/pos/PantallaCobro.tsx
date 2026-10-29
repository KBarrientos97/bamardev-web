import { useMemo, useState, type ReactNode } from "react";
import { Icon } from "../../components/Icon";
import { QrParaCobrar } from "../../components/QrCobro";
import InputMonto from "../../components/InputMonto";
import { Boton, Campo, ErrorMsg } from "../../components/ui";
import { atajosDeEfectivo } from "../../lib/billetes";
import { formaPagoFaltante } from "../../lib/formaPagoFaltante";
import {
  aCentavos,
  cubre,
  esPositivo,
  excede,
  restoEnEfectivo,
  vuelto,
} from "../../lib/dinero";
import { fmtMoney } from "../../lib/format";
import { leerMonto, montoParaEditar } from "../../lib/montoTecleado";
import { useAuth } from "../../store/AuthContext";
import type { FormaPago, PagoInput } from "../../types";
import type { PropinaInput } from "../../lib/belleza/apiExtras";
import { useExtrasCobro, type ProfesionalCobro } from "./belleza/ExtrasCobro";

type Metodo = "EFECTIVO" | "QR" | "MIXTO";

/**
 * Las formas de pago se resuelven por NOMBRE: los ids son autoincrementales
 * por negocio, así que el "Efectivo" de un negocio no tiene el mismo id que
 * el de otro.
 */
function buscarForma(formas: FormaPago[], nombre: string): FormaPago | undefined {
  return formas.find((f) => f.nombre.toLowerCase() === nombre.toLowerCase());
}

/** El tope de la propina de una mesa: el `@Max` de `CobrarMesaDto` en el backend. */
const PROPINA_MESA_MAXIMA = 100_000;

/**
 * Lo que el cliente suele entregar: el total justo y los billetes o monedas de
 * Bolivia que lo cubren solos. Antes se redondeaba a múltiplos (Bs 40, Bs 150…)
 * y salían montos que no son un billete (QA de Kevin, 25-oct).
 */
function sugerenciasEfectivo(total: number): number[] {
  // El total exacto siempre sirve: es el caso de "justo".
  // `aCentavos` y no `Math.ceil(total * 100)`: en punto flotante 35.2 * 100
  // da 3520.0000000000005 y el chip "justo" decía un centavo de más.
  return [aCentavos(total), ...atajosDeEfectivo(total)];
}

export default function PantallaCobro({
  total,
  subtitulo,
  avisoEnvio,
  formasPago,
  profesionales,
  onAtras,
  onConfirmar,
  onCredito,
  enviando,
  error,
  titulo = "Cobrar",
  encabezado,
  bloqueado = false,
  recibidoVacioEsExacto = false,
  qrEnUnPaso = false,
  cobroDeMesa,
}: {
  total: number;
  /** Qué se está cobrando ("Mesa 4 · Juan"), para no cobrar la mesa equivocada. */
  subtitulo?: string;
  /** Nota al pie cuando hay una tarifa de envío que no entra en este cobro. */
  avisoEnvio?: string;
  formasPago: FormaPago[];
  /** Belleza (propinas): los profesionales de la venta. Sin esto, no hay propina. */
  profesionales?: ProfesionalCobro[];
  onAtras: () => void;
  /**
   * `extra` sólo viaja con propinas (las de belleza, o la de una mesa en
   * `propinaMesa`); el cobro de siempre no lo trae.
   */
  onConfirmar: (
    pagos: PagoInput[],
    extra?: { propinas?: PropinaInput[]; propinaMesa?: number },
  ) => void;
  /** Sólo se ofrece si el plan incluye fiado. Lleva las propinas anotadas acá. */
  onCredito?: (extra?: { propinas?: PropinaInput[] }) => void;
  enviando: boolean;
  error: string;
  /** El título de la cabecera. El POS dice "Cobrar"; el instituto, "Cobrar a estudiante". */
  titulo?: string;
  /**
   * Lo que va arriba del total, dentro del área que scrollea. Academia (A1)
   * pone ahí al estudiante, sus cuotas y el monto editable: así elegir cuánto
   * y con qué se paga es UNA pantalla y se confirma una sola vez. El POS no
   * lo pasa y se ve como siempre.
   */
  encabezado?: ReactNode;
  /** Confirmar apagado sin decir "Registrando…": falta algo de arriba (el monto). */
  bloqueado?: boolean;
  /**
   * "Efectivo recibido" vacío = el monto justo, sin "no alcanza" (Cobrar a
   * estudiante, QA 23-oct). El POS no lo pasa: ahí se sigue pidiendo.
   */
  recibidoVacioEsExacto?: boolean;
  /**
   * El QR se confirma con el mismo botón de cobrar («Llegó el QR · Confirmar
   * cobro»), sin el paso previo de marcar que llegó (Cobrar a estudiante,
   * auditoría 26-oct D4). El aviso de revisar el banco queda. El POS, belleza
   * y billar no lo pasan: siguen con las dos confirmaciones.
   */
  qrEnUnPaso?: boolean;
  /**
   * Se cobra una mesa del salón: desde la caja, o el mesero que la cobra él
   * mismo. Suma el campo de la propina de la mesa —no entra al cajón: va al
   * turno del mesero— y, si cobra el mesero, el aviso del efectivo que se
   * queda encima. Sin esto (el POS de mostrador, belleza, el instituto) el
   * cobro es el de siempre.
   */
  cobroDeMesa?: "caja" | "mesero";
}) {
  const { incluye, negocio, usuario } = useAuth();
  const formaEfectivo = buscarForma(formasPago, "Efectivo");
  const formaQr = buscarForma(formasPago, "QR");

  // Dos condiciones, como en la app: que el plan incluya QR/mixto y que el
  // negocio TENGA la forma de pago dada de alta. Normalmente van juntas, pero
  // si faltara la segunda, ofrecer el método termina en un cobro que el backend
  // rechaza con el cliente enfrente.
  const permiteQr = incluye("pago_qr_mixto") && !!formaQr;

  // Belleza fase 4: vale como pago y propinas. Fuera de belleza (o sin las
  // features) no dibuja nada y deja todo en cero: el cobro de siempre.
  const extras = useExtrasCobro({
    ctx: { features: negocio?.features, rubro: negocio?.tipoNegocio, usuario },
    total,
    profesionales: profesionales ?? [],
    formasPago,
    permiteQr,
  });
  /** Lo que queda por cobrar en efectivo o QR, después del vale. */
  const aCubrir = Math.round((total - extras.montoVale) * 100) / 100;
  /**
   * No hay efectivo ni QR que pedir: el vale cubre todo, o la venta sale en 0
   * (una sesión de paquete, QA PER-10) y se pasa por acá sólo por la propina.
   */
  const nadaQueCobrar = aCubrir <= 0.004;
  /** La propina en efectivo se recibe en mano junto con el cobro. */
  const extraEfectivo = extras.propinasEfectivo;
  /**
   * La propina por QR llega en la MISMA transferencia que la venta (QA
   * DIA-02): la pantalla pide el total que el cliente transfiere. Al backend
   * los pagos van sin ella (suman el total de la venta) y la propina aparte.
   */
  const extraQr = extras.propinasQr;
  const propinasTotal = Math.round((extraEfectivo + extraQr) * 100) / 100;
  const extra = extras.propinas.length ? { propinas: extras.propinas } : undefined;

  const [metodo, setMetodo] = useState<Metodo>("EFECTIVO");
  const [recibido, setRecibido] = useState("");
  const [montoQr, setMontoQr] = useState("");
  const [errorLocal, setErrorLocal] = useState("");
  /**
   * El cajero vio el pago acreditado en su banco. Nadie verifica la
   * transferencia por nosotros: sin este paso la venta quedaba registrada como
   * cobrada por el solo hecho de haber elegido QR. Igual que en la app.
   */
  const [qrConfirmado, setQrConfirmado] = useState(false);
  /**
   * La propina de una mesa, tecleada como cualquier monto de la caja. Viaja
   * aparte de los pagos y no toca el vuelto: no es plata del cajón.
   */
  const [propinaMesa, setPropinaMesa] = useState("");
  const propinaMesaNum = cobroDeMesa ? Math.max(0, aCentavos(leerMonto(propinaMesa) ?? 0)) : 0;

  // En centavos, como los guarda el backend: con tres decimales el QR más el
  // efectivo dejaban de sumar el total (400). Y se lee como en el cierre:
  // "1.500" son mil quinientos, no Bs 1,50 (26-oct).
  const recibidoTecleado = aCentavos(leerMonto(recibido) ?? 0);
  const qrNum = aCentavos(leerMonto(montoQr) ?? 0);

  /** Cambiar de método o el monto del QR obliga a confirmar de nuevo. */
  function elegirMetodo(m: Metodo) {
    setMetodo(m);
    setQrConfirmado(false);
    setErrorLocal("");
  }

  /**
   * Tocar un atajo o escribir lo recibido borra el error de antes: quedaba
   * "Lo recibido no alcanza…" en rojo debajo de "CAMBIO Bs 19,00" hasta el
   * próximo Confirmar, y se leía como si el billete no alcanzara.
   */
  function cambiarRecibido(valor: string) {
    setRecibido(valor);
    setErrorLocal("");
  }

  // En mixto, el QR cubre una parte y el efectivo el resto.
  const aCubrirEnEfectivo = metodo === "MIXTO" ? restoEnEfectivo(aCubrir, qrNum) : aCubrir;
  // Lo que hay que recibir en mano: la parte en efectivo y la propina en
  // efectivo (sin propinas, es exactamente lo de siempre).
  const enMano = Math.round((aCubrirEnEfectivo + extraEfectivo) * 100) / 100;
  // Vacío y con `recibidoVacioEsExacto`: lo recibido es justo lo que hay que recibir.
  const recibidoNum = recibidoVacioEsExacto && recibido.trim() === "" ? enMano : recibidoTecleado;
  const cambio = metodo === "QR" ? 0 : vuelto(recibidoNum, enMano);
  const falta =
    metodo === "QR" ? 0 : Math.max(0, Math.round((enMano - recibidoNum) * 100) / 100);
  /**
   * Cobrando el mesero: el efectivo de la venta que se queda encima. Es la
   * entrega que nace en el backend y que la caja le va a pedir; lo que entra
   * por QR no pasa por su mano y no se entrega.
   */
  const efectivoDelMesero =
    cobroDeMesa === "mesero" && !nadaQueCobrar && metodo !== "QR" ? aCubrirEnEfectivo : 0;

  const sugerencias = useMemo(() => sugerenciasEfectivo(enMano), [enMano]);
  /** Lo que tiene que entrar por QR: la parte de la venta más la propina por QR. */
  const qrConPropina = (deLaVenta: number) => Math.round((deLaVenta + extraQr) * 100) / 100;

  /**
   * Las propinas viajan sólo si hay: el cobro de siempre llama igual que antes.
   * La de una mesa va en `propinaMesa`, aparte de los pagos.
   */
  function enviar(pagos: PagoInput[]) {
    const conTodo = esPositivo(propinaMesaNum) ? { ...extra, propinaMesa: propinaMesaNum } : extra;
    if (conTodo) onConfirmar(pagos, conTodo);
    else onConfirmar(pagos);
  }

  function confirmar() {
    setErrorLocal("");

    // El tope del backend (CobrarMesaDto). Más que esto es un monto tecleado en
    // el campo equivocado, y el rechazo del backend viene en inglés.
    if (excede(propinaMesaNum, PROPINA_MESA_MAXIMA))
      return setErrorLocal(`La propina no puede pasar de ${fmtMoney(PROPINA_MESA_MAXIMA)}.`);

    // El vale cubre todo (o no hay nada que cobrar): ni efectivo ni QR. La
    // propina en efectivo se recibe en mano y la registra el backend.
    if (nadaQueCobrar) return enviar(extras.pagosVale);

    if (metodo === "EFECTIVO") {
      if (!formaEfectivo) return setErrorLocal(formaPagoFaltante(formasPago, "Efectivo"));
      // Con tolerancia: 3 x 8.90 da 26.700000000000003 y el cajero que teclea
      // 26.70 quedaba "faltando Bs 0.00".
      if (!cubre(recibidoNum, enMano))
        return setErrorLocal("Lo recibido no alcanza para cubrir el total.");
      return enviar(
        [
          ...extras.pagosVale,
          // Lo recibido de la VENTA: la propina en efectivo va aparte.
          { formaPagoId: formaEfectivo.id, monto: aCubrir, recibido: recibidoNum - extraEfectivo },
        ],
      );
    }

    if (metodo === "QR") {
      if (!formaQr) return setErrorLocal(formaPagoFaltante(formasPago, "QR"));
      if (!qrConfirmado && !qrEnUnPaso)
        return setErrorLocal("Confirmá que el pago por QR llegó antes de cobrar.");
      return enviar([...extras.pagosVale, { formaPagoId: formaQr.id, monto: aCubrir }]);
    }

    // Mixto: se reparte entre QR y efectivo, y la suma tiene que dar el total.
    if (!formaEfectivo || !formaQr)
      return setErrorLocal("Faltan formas de pago cargadas para cobrar mixto.");
    if (!esPositivo(qrNum)) return setErrorLocal("Poné cuánto se paga por QR.");
    if (!excede(aCubrir, qrNum))
      return setErrorLocal("Si el QR cubre todo, cobrá con el método QR.");
    if (!qrConfirmado && !qrEnUnPaso)
      return setErrorLocal("Confirmá que el pago por QR llegó antes de cobrar.");
    if (!cubre(recibidoNum, enMano))
      return setErrorLocal("El efectivo recibido no cubre lo que falta.");

    enviar(
      [
        ...extras.pagosVale,
        { formaPagoId: formaQr.id, monto: qrNum },
        {
          formaPagoId: formaEfectivo.id,
          monto: aCubrirEnEfectivo,
          recibido: recibidoNum - extraEfectivo,
        },
      ],
    );
  }

  // El total y cómo paga. Con lugar va a la izquierda; si arriba hay un
  // detalle (el del instituto), ése ocupa la izquierda y esto encabeza la
  // derecha, donde se cobra: abajo del detalle el total quedaba fuera de la
  // vista. En una columna el orden es el mismo de siempre.
  const conDetalle = encabezado != null && encabezado !== false;
  /** El botón de abajo hace también de «llegó el QR»: sólo cuando hay un QR que esperar. */
  const conQrEnUnPaso = qrEnUnPaso && !nadaQueCobrar && (metodo === "QR" || (metodo === "MIXTO" && qrNum > 0));
  const totalYMetodo = (
    <>
      <div className="rounded-2xl bg-marca p-5 text-center text-white">
        <p className="text-xs font-semibold uppercase tracking-wide opacity-90">
          Total a cobrar
        </p>
        <p className="mt-1 text-4xl font-extrabold tracking-tight">{fmtMoney(total)}</p>
        {avisoEnvio && (
          <p className="mt-1.5 text-[13px] opacity-90">{avisoEnvio}</p>
        )}
        {extras.montoVale > 0 && (
          <p className="mt-1.5 text-[13px] opacity-90">
            Gift card −{fmtMoney(extras.montoVale)} · resta {fmtMoney(aCubrir)}
          </p>
        )}
      </div>

      {extras.ui}

      {/* Sin la capacidad no se dibujan botones apagados: el cobro es en
          efectivo y punto, como en un negocio que no cobra por QR. */}
      {permiteQr && !nadaQueCobrar && (
        <div className="grid grid-cols-3 gap-2">
          <BotonMetodo
            activo={metodo === "EFECTIVO"}
            icono="dollar"
            label="Efectivo"
            onClick={() => elegirMetodo("EFECTIVO")}
          />
          <BotonMetodo
            activo={metodo === "QR"}
            icono="qr"
            label="QR"
            onClick={() => elegirMetodo("QR")}
          />
          <BotonMetodo
            activo={metodo === "MIXTO"}
            icono="swap"
            label="Mixto"
            onClick={() => elegirMetodo("MIXTO")}
          />
        </div>
      )}
    </>
  );

  // Con lugar (26-oct), en dos columnas: el total y cómo paga a la izquierda,
  // lo que se recibe a la derecha, con "Confirmar" debajo. Se mide el lugar
  // que tiene (`@container`) y no la ventana: también vive en el panel de
  // "Cobrar a estudiante", que es angosto aun en la PC.
  return (
    <div className="@container flex h-full min-h-0 w-full flex-col">
      <div className="flex items-center gap-2 border-b border-borde bg-white py-3 px-[max(1rem,calc(50%-16rem+1rem))] @3xl:px-[max(1.5rem,calc(50%-30rem+1.5rem))]">
        <button
          onClick={onAtras}
          aria-label="Volver"
          className="rounded-lg p-1.5 text-texto-2 hover:bg-muted"
        >
          <Icon name="arrowLeft" size={20} />
        </button>
        <div className="min-w-0">
          <h1 className="text-[15px] font-bold text-texto">{titulo}</h1>
          {/* Qué se está cobrando. Sin esto la cabecera decía sólo "Cobrar", y
              la cajera que atiende mostrador y salón a la vez —con dos mesas
              esperando— no tenía cómo verificar que estaba cobrando la
              correcta: el único chequeo posible era que el monto le sonara. */}
          {subtitulo && (
            <p className="truncate text-xs text-texto-3">{subtitulo}</p>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-4 px-[max(1rem,calc(50%-16rem+1rem))] @3xl:px-[max(1.5rem,calc(50%-30rem+1.5rem))] @3xl:grid @3xl:grid-cols-2 @3xl:content-start @3xl:items-start @3xl:gap-6 @3xl:space-y-0 @3xl:py-6">
        <div className="space-y-4">
          {conDetalle ? encabezado : totalYMetodo}
        </div>

        <div className="space-y-4">
          {conDetalle && totalYMetodo}
          {metodo === "MIXTO" && (
            <>
              <Campo
                label="Monto pagado por QR"
                hint={
                  extraQr > 0
                    ? `De la venta; el resto, en efectivo. La propina por QR (${fmtMoney(extraQr)}) se suma aparte`
                    : "El resto se cobra en efectivo"
                }
              >
                <InputMonto
                  value={montoQr}
                  onChange={(texto) => {
                    // Cambiar el monto invalida lo confirmado: lo que entró al
                    // banco ya no es lo que dice la pantalla. Que al salir del
                    // campo "50" pase a "50,00" no lo cambia.
                    if (leerMonto(texto) !== leerMonto(montoQr)) setQrConfirmado(false);
                    setMontoQr(texto);
                  }}
                  placeholder="0,00"
                  className="text-lg font-bold"
                />
              </Campo>

              {qrNum > 0 && (
                <div className="rounded-2xl border border-borde bg-white p-5">
                  {extraQr > 0 && (
                    <p className="mb-3 text-center text-sm font-semibold text-texto">
                      Cobrá {fmtMoney(qrConPropina(qrNum))} por QR
                      <span className="block text-xs font-normal text-texto-3">
                        incluye {fmtMoney(extraQr)} de propina
                      </span>
                    </p>
                  )}
                  <QrParaCobrar
                    confirmado={qrConfirmado}
                    onConfirmar={() => setQrConfirmado(true)}
                    sinBoton={qrEnUnPaso}
                    monto={fmtMoney(qrConPropina(qrNum))}
                  />
                </div>
              )}
            </>
          )}

          {metodo !== "QR" && !nadaQueCobrar && (
            <>
              <Campo
                label="Efectivo recibido"
                hint={
                  // En mixto, lo que falta en mano es el resto de la venta MÁS la
                  // propina en efectivo (QA DIA-02: decía sólo el resto).
                  metodo === "MIXTO"
                    ? `Falta cubrir ${fmtMoney(enMano)}${extraEfectivo > 0 ? " (incluye la propina)" : ""}`
                    : extraEfectivo > 0
                      ? `Incluye la propina en efectivo (${fmtMoney(extraEfectivo)})`
                      : undefined
                }
              >
                <InputMonto
                  value={recibido}
                  onChange={cambiarRecibido}
                  placeholder="0,00"
                  // Con un vale aplicado no se roba el foco: el campo aparece mientras
                  // la cajera todavía está tecleando cuánto usar del vale.
                  // Con encabezado (el cobro del instituto) tampoco: en el celular
                  // el teclado tapaba de quién es el cobro y cuánto se reparte.
                  autoFocus={extras.montoVale === 0 && !encabezado}
                  className="text-lg font-bold"
                />
              </Campo>

              <div className="flex flex-wrap gap-2">
                {sugerencias.map((s) => (
                  <button
                    key={s}
                    onClick={() => cambiarRecibido(montoParaEditar(s))}
                    className="rounded-xl border border-borde bg-white px-3.5 py-2 text-[13px] font-semibold text-texto-2 transition-colors hover:border-primary hover:bg-primary-50 hover:text-primary-700"
                  >
                    {fmtMoney(s)}
                  </button>
                ))}
              </div>

              {/* Pagando la venta en efectivo, la propina por QR es una
                  transferencia aparte: que no se olvide. */}
              {metodo === "EFECTIVO" && extraQr > 0 && (
                <p role="note" className="rounded-xl bg-primary-50 px-4 py-2.5 text-[13px] font-semibold text-primary-700">
                  Además, la propina de {fmtMoney(extraQr)} se cobra por QR, aparte.
                </p>
              )}

              <div
                className={`rounded-xl px-4 py-3 text-center ${
                  falta > 0 ? "bg-warning-bg text-warning-text" : "bg-primary-50 text-primary-700"
                }`}
              >
                {falta > 0 ? (
                  <>
                    <p className="text-xs font-semibold uppercase tracking-wide">Falta</p>
                    <p className="text-2xl font-extrabold">{fmtMoney(falta)}</p>
                  </>
                ) : (
                  <>
                    <p className="text-xs font-semibold uppercase tracking-wide">Cambio</p>
                    <p className="text-2xl font-extrabold">{fmtMoney(cambio)}</p>
                  </>
                )}
              </div>
            </>
          )}

          {metodo === "QR" && !nadaQueCobrar && (
            <div className="rounded-2xl border border-borde bg-white p-5">
              <p className="mb-3 text-center text-sm font-semibold text-texto">
                Cobrá {fmtMoney(qrConPropina(aCubrir))} por QR
                {extraQr > 0 && (
                  <span className="block text-xs font-normal text-texto-3">
                    incluye {fmtMoney(extraQr)} de propina
                  </span>
                )}
              </p>
              <QrParaCobrar
                confirmado={qrConfirmado}
                onConfirmar={() => setQrConfirmado(true)}
                sinBoton={qrEnUnPaso}
                monto={fmtMoney(qrConPropina(aCubrir))}
              />
              {/* QA DIA-02 (c): el QR no lleva la propina en efectivo, pero la
                  caja la espera. Sin el aviso, nadie la cobraba. */}
              {extraEfectivo > 0 && (
                <p
                  role="alert"
                  className="mt-3 rounded-xl bg-warning-bg px-4 py-2.5 text-center text-[13px] font-semibold text-warning-text"
                >
                  Además, recibí {fmtMoney(extraEfectivo)} de propina en efectivo: el QR no la incluye.
                </p>
              )}
            </div>
          )}

          {/* Nada que cobrar de la venta (vale o sesión de paquete) pero sí
              propina: lo que se recibe es sólo eso (QA DIA-02 d). */}
          {nadaQueCobrar && propinasTotal > 0 && (
            <div className="space-y-1 rounded-2xl border border-borde bg-white p-4 text-center text-sm font-semibold text-texto">
              {extraEfectivo > 0 && <p>Recibí {fmtMoney(extraEfectivo)} de propina en efectivo</p>}
              {extraQr > 0 && <p>Cobrá {fmtMoney(extraQr)} de propina por QR</p>}
            </div>
          )}

          {/* La propina de la mesa, como en la app (caja y "Cobrar yo"). No
              suma al total ni al vuelto: se anota para el turno del mesero
              (Mi turno, Ventas por mesero), que desde la web nunca la recibía. */}
          {cobroDeMesa && (
            <Campo
              label="Propina (opcional)"
              hint={
                cobroDeMesa === "mesero"
                  ? "No entra al cajón ni se entrega en caja: se anota en tu turno."
                  : "No entra al cajón: va al turno del mesero."
              }
            >
              <InputMonto value={propinaMesa} onChange={setPropinaMesa} placeholder="0,00" />
            </Campo>
          )}
        </div>
      </div>

      <div className="border-t border-borde bg-white py-4 px-[max(1rem,calc(50%-16rem+1rem))] @3xl:px-[max(1.5rem,calc(50%-30rem+1.5rem))]">
        <div className="space-y-2 @3xl:ml-auto @3xl:w-[calc(50%-0.75rem)]">
          {/* El error va en el PIE, pegado al botón, y no al final del área que
              scrollea: en un celular cobrando con método MIXTO la pantalla es
              larga (total, métodos, QR, efectivo, sugerencias, vuelto) y el
              mensaje se escribía arriba, fuera de la vista. El cajero tocaba
              "Confirmar", no veía pasar nada y volvía a tocar. */}
          {/* Antes de cobrar, el mesero lee cuánto efectivo se queda encima y
              que la caja se lo va a pedir: es lo que hace seguro que cobre él
              (la entrega nace sola en el backend). Va en el pie, junto al
              botón, como en la app. */}
          {esPositivo(efectivoDelMesero) && (
            <p role="note" className="rounded-xl bg-warning-bg px-4 py-2.5 text-[13px] font-semibold text-warning-text">
              Te quedás con {fmtMoney(efectivoDelMesero)} en efectivo. Entregalos en caja y esperá que te los aprueben.
            </p>
          )}
          <ErrorMsg>{errorLocal || error}</ErrorMsg>
          <Boton onClick={confirmar} disabled={enviando || bloqueado} className="w-full py-3 text-base">
            {enviando
              ? "Registrando…"
              : `${conQrEnUnPaso ? "Llegó el QR · " : ""}Confirmar cobro · ${fmtMoney(total)}${propinasTotal > 0 ? ` + ${fmtMoney(propinasTotal)} de propina` : ""}`}
          </Boton>
          {onCredito && (
            <Boton variante="ghost" onClick={() => onCredito(extra)} disabled={enviando} className="w-full">
              Vender a crédito (fiado)
            </Boton>
          )}
        </div>
      </div>
    </div>
  );
}

function BotonMetodo({
  activo,
  icono,
  label,
  onClick,
  deshabilitado,
}: {
  activo: boolean;
  icono: "dollar" | "qr" | "swap";
  label: string;
  onClick: () => void;
  deshabilitado?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={deshabilitado}
      className={`flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-[13px] font-semibold transition-colors disabled:opacity-40 ${
        activo
          ? "border-primary bg-primary-50 text-primary-700"
          : "border-borde bg-white text-texto-2 enabled:hover:bg-muted"
      }`}
    >
      <Icon name={icono} size={20} />
      {label}
    </button>
  );
}
