import { useMemo, useState } from "react";
import { Icon } from "../../components/Icon";
import { QrParaCobrar } from "../../components/QrCobro";
import { Boton, Campo, ErrorMsg, Input } from "../../components/ui";
import {
  cubre,
  esPositivo,
  excede,
  parsearMontoO,
  restoEnEfectivo,
  vuelto,
} from "../../lib/dinero";
import { fmtMoney } from "../../lib/format";
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

/** Montos redondos que el cliente suele entregar, por encima del total. */
function sugerenciasEfectivo(total: number): number[] {
  const base = [10, 20, 50, 100, 200];
  const out = new Set<number>();
  // El total exacto siempre sirve: es el caso de "justo".
  out.add(Math.ceil(total * 100) / 100);
  for (const b of base) {
    const redondeado = Math.ceil(total / b) * b;
    if (redondeado > total) out.add(redondeado);
  }
  return [...out].sort((a, b) => a - b).slice(0, 4);
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
  /** `extra` sólo viaja con propinas (belleza); el cobro de siempre no lo trae. */
  onConfirmar: (pagos: PagoInput[], extra?: { propinas?: PropinaInput[] }) => void;
  /** Sólo se ofrece si el plan incluye fiado. Lleva las propinas anotadas acá. */
  onCredito?: (extra?: { propinas?: PropinaInput[] }) => void;
  enviando: boolean;
  error: string;
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

  const recibidoNum = parsearMontoO(recibido);
  const qrNum = parsearMontoO(montoQr);

  /** Cambiar de método o el monto del QR obliga a confirmar de nuevo. */
  function elegirMetodo(m: Metodo) {
    setMetodo(m);
    setQrConfirmado(false);
    setErrorLocal("");
  }

  // En mixto, el QR cubre una parte y el efectivo el resto.
  const aCubrirEnEfectivo = metodo === "MIXTO" ? restoEnEfectivo(aCubrir, qrNum) : aCubrir;
  // Lo que hay que recibir en mano: la parte en efectivo y la propina en
  // efectivo (sin propinas, es exactamente lo de siempre).
  const enMano = Math.round((aCubrirEnEfectivo + extraEfectivo) * 100) / 100;
  const cambio = metodo === "QR" ? 0 : vuelto(recibidoNum, enMano);
  const falta =
    metodo === "QR" ? 0 : Math.max(0, Math.round((enMano - recibidoNum) * 100) / 100);

  const sugerencias = useMemo(() => sugerenciasEfectivo(enMano), [enMano]);
  /** Lo que tiene que entrar por QR: la parte de la venta más la propina por QR. */
  const qrConPropina = (deLaVenta: number) => Math.round((deLaVenta + extraQr) * 100) / 100;

  /** Las propinas viajan sólo si hay: el cobro de siempre llama igual que antes. */
  function enviar(pagos: PagoInput[]) {
    if (extra) onConfirmar(pagos, extra);
    else onConfirmar(pagos);
  }

  function confirmar() {
    setErrorLocal("");

    // El vale cubre todo (o no hay nada que cobrar): ni efectivo ni QR. La
    // propina en efectivo se recibe en mano y la registra el backend.
    if (nadaQueCobrar) return enviar(extras.pagosVale);

    if (metodo === "EFECTIVO") {
      if (!formaEfectivo) return setErrorLocal("El negocio no tiene cargada la forma de pago Efectivo.");
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
      if (!formaQr) return setErrorLocal("El negocio no tiene cargada la forma de pago QR.");
      if (!qrConfirmado)
        return setErrorLocal("Confirmá que el pago por QR llegó antes de cobrar.");
      return enviar([...extras.pagosVale, { formaPagoId: formaQr.id, monto: aCubrir }]);
    }

    // Mixto: se reparte entre QR y efectivo, y la suma tiene que dar el total.
    if (!formaEfectivo || !formaQr)
      return setErrorLocal("Faltan formas de pago cargadas para cobrar mixto.");
    if (!esPositivo(qrNum)) return setErrorLocal("Poné cuánto se paga por QR.");
    if (!excede(aCubrir, qrNum))
      return setErrorLocal("Si el QR cubre todo, cobrá con el método QR.");
    if (!qrConfirmado)
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
        <div className="min-w-0">
          <h1 className="text-[15px] font-bold text-texto">Cobrar</h1>
          {/* Qué se está cobrando. Sin esto la cabecera decía sólo "Cobrar", y
              la cajera que atiende mostrador y salón a la vez —con dos mesas
              esperando— no tenía cómo verificar que estaba cobrando la
              correcta: el único chequeo posible era que el monto le sonara. */}
          {subtitulo && (
            <p className="truncate text-xs text-texto-3">{subtitulo}</p>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
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
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={montoQr}
                onChange={(e) => {
                  setMontoQr(e.target.value);
                  // Cambiar el monto invalida lo confirmado: lo que entró al
                  // banco ya no es lo que dice la pantalla.
                  setQrConfirmado(false);
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
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={recibido}
                onChange={(e) => setRecibido(e.target.value)}
                placeholder="0,00"
                // Con un vale aplicado no se roba el foco: el campo aparece mientras
                // la cajera todavía está tecleando cuánto usar del vale.
                autoFocus={extras.montoVale === 0}
                className="text-lg font-bold"
              />
            </Campo>

            <div className="flex flex-wrap gap-2">
              {sugerencias.map((s) => (
                <button
                  key={s}
                  onClick={() => setRecibido(String(s))}
                  className="rounded-xl border border-borde bg-white px-3.5 py-2 text-[13px] font-semibold text-texto-2 transition-colors hover:border-primary hover:bg-primary-50 hover:text-primary-700"
                >
                  {fmtMoney(s)}
                </button>
              ))}
            </div>

            {/* Pagando la venta en efectivo, la propina por QR es una
                transferencia aparte: que no se olvide. */}
            {metodo === "EFECTIVO" && extraQr > 0 && (
              <p role="note" className="rounded-xl bg-info-bg px-4 py-2.5 text-[13px] font-semibold text-info-text">
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

      </div>

      <div className="space-y-2 border-t border-borde bg-white p-4">
        {/* El error va en el PIE, pegado al botón, y no al final del área que
            scrollea: en un celular cobrando con método MIXTO la pantalla es
            larga (total, métodos, QR, efectivo, sugerencias, vuelto) y el
            mensaje se escribía arriba, fuera de la vista. El cajero tocaba
            "Confirmar", no veía pasar nada y volvía a tocar. */}
        <ErrorMsg>{errorLocal || error}</ErrorMsg>
        <Boton onClick={confirmar} disabled={enviando} className="w-full py-3 text-base">
          {enviando
            ? "Registrando…"
            : `Confirmar cobro · ${fmtMoney(total)}${propinasTotal > 0 ? ` + ${fmtMoney(propinasTotal)} de propina` : ""}`}
        </Boton>
        {onCredito && (
          <Boton variante="ghost" onClick={() => onCredito(extra)} disabled={enviando} className="w-full">
            Vender a crédito (fiado)
          </Boton>
        )}
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
