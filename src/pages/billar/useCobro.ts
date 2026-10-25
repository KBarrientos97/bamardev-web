import { useMemo, useState } from "react";
import { aCentavos, parsearMonto } from "../../lib/dinero";
import { atajosDeEfectivo } from "../../lib/billetes";
import { round2 } from "./calculo";
import type { PagoNuevo } from "./store";

export type Metodo = PagoNuevo["metodo"];

/**
 * Lo que el cliente suele entregar para pagar `total`: los billetes y monedas
 * que existen en Bolivia y lo cubren solos, por encima del total (el justo es
 * aparte). Bs 30 → Bs 50, 100 y 200; Bs 80 → Bs 100 y 200.
 *
 * Antes se completaba con montos redondos (Bs 150, 300, 400…) y salía "Bs 300",
 * que no es un billete (QA de Kevin, 25-oct): ahora sólo lo que existe, y de
 * Bs 200 para arriba, ninguno (ver `atajosDeEfectivo`).
 */
export function sugerencias(total: number): number[] {
  return atajosDeEfectivo(total);
}

/** "Bs 30" sin decimales cuando no hacen falta, "Bs 30,50" si los tiene: el botón «Justo» dice cuánto. */
export function montoCorto(n: number): string {
  return Number.isInteger(n) ? `Bs ${n}` : `Bs ${n.toFixed(2).replace(".", ",")}`;
}

/**
 * El efectivo de un cobro. Lo recibido hay que escribirlo (o tocar «Justo»):
 * vacío ya no es "le dieron justo". Con el total en gris adentro del campo
 * parecía escrito, y se cobraba sin que nadie contara nada (QA del dueño,
 * 17-oct). Es como ya cobraba el POS.
 */
export function efectivoDelCobro(monto: number, recibidoTexto: string) {
  const escrito = recibidoTexto.trim() !== "";
  const recibido = escrito ? round2(parsearMonto(recibidoTexto) ?? 0) : 0;
  return {
    escrito,
    recibido,
    falta: escrito ? Math.max(0, round2(monto - recibido)) : 0,
    cambio: escrito ? Math.max(0, round2(recibido - monto)) : 0,
  };
}

export interface EstadoCobro {
  metodo: Metodo;
  setMetodo: (m: Metodo) => void;
  /** Lo que se cobra: el total, o lo que se escribió si el monto se edita. */
  monto: number;
  montoTexto: string;
  setMontoTexto: (t: string) => void;
  recibidoTexto: string;
  setRecibidoTexto: (t: string) => void;
  efectivoTexto: string;
  setEfectivoTexto: (t: string) => void;
  recibido: number;
  /** En efectivo, todavía no se escribió lo recibido: no hay cambio que mostrar ni se puede cobrar. */
  sinRecibido: boolean;
  cambio: number;
  /** Lo que falta para cubrir (efectivo corto o mixto mal repartido). */
  falta: number;
  /** null mientras no se pueda confirmar. */
  pago: PagoNuevo | null;
  /** Lo que va por QR (todo, o la parte QR del mixto). */
  montoQr: number;
  /** El cajero vio entrar el QR por este monto (si cambia el monto, hay que volver a confirmar). */
  qrConfirmado: boolean;
  confirmarQr: () => void;
  /**
   * Deja el cobro como recién abierto, confirmación del QR incluida. La venta
   * rápida usa el mismo cobro venta tras venta: limpiaba el método y los
   * montos pero no `qrVisto`, y la siguiente venta por QR del mismo monto
   * salía "Pago confirmado" sin que nadie mirara el banco (QA del 12-oct).
   */
  reiniciar: () => void;
  editable: boolean;
  tope: number;
}

/**
 * El estado del cobro. `editable` deja cambiar el monto (pago parcial), con
 * `total` como tope: un adelanto no puede pasar lo que se debe.
 */
export function useCobro(total: number, editable = false): EstadoCobro {
  const [metodo, setMetodo] = useState<Metodo>("Efectivo");
  const [montoTexto, setMontoTexto] = useState(editable ? String(total) : "");
  const [recibidoTexto, setRecibidoTexto] = useState("");
  const [efectivoTexto, setEfectivoTexto] = useState("");
  // Como en el POS (`QrParaCobrar`): elegir QR no es cobrar. Hasta que el
  // cajero mira su banco y confirma, no hay pago. La confirmación vale para
  // ESE monto: si después cambia, se vuelve a pedir.
  const [qrVisto, setQrVisto] = useState<string | null>(null);

  return useMemo(() => {
    const monto = editable ? round2(parsearMonto(montoTexto) ?? 0) : round2(total);
    const montoOk = monto > 0 && aCentavos(monto) <= aCentavos(total);
    const efectivo = efectivoDelCobro(monto, recibidoTexto);
    let falta = 0;
    let cambio = 0;
    let pago: PagoNuevo | null = null;
    const efectivoMixto = round2(parsearMonto(efectivoTexto) ?? 0);
    const montoQr = metodo === "QR" ? monto : metodo === "Mixto" ? Math.max(0, round2(monto - efectivoMixto)) : 0;
    const huellaQr = `${metodo}|${montoQr}`;
    const qrConfirmado = qrVisto === huellaQr;
    if (metodo === "Efectivo") {
      falta = efectivo.falta;
      cambio = efectivo.cambio;
      if (montoOk && efectivo.escrito && falta === 0) pago = { metodo, monto, recibido: efectivo.recibido };
    } else if (metodo === "QR") {
      if (montoOk && qrConfirmado) pago = { metodo, monto };
    } else {
      const qr = round2(monto - efectivoMixto);
      if (montoOk && efectivoMixto > 0 && qr > 0 && qrConfirmado) {
        pago = { metodo, monto, partes: { efectivo: efectivoMixto, qr } };
      }
    }
    return {
      metodo,
      setMetodo,
      monto,
      montoTexto,
      setMontoTexto,
      recibidoTexto,
      setRecibidoTexto,
      efectivoTexto,
      setEfectivoTexto,
      recibido: efectivo.recibido,
      sinRecibido: !efectivo.escrito,
      cambio,
      falta,
      pago,
      montoQr,
      qrConfirmado,
      confirmarQr: () => setQrVisto(huellaQr),
      reiniciar: () => {
        setMetodo("Efectivo");
        setMontoTexto(editable ? String(total) : "");
        setRecibidoTexto("");
        setEfectivoTexto("");
        setQrVisto(null);
      },
      editable,
      tope: total,
    };
  }, [metodo, montoTexto, recibidoTexto, efectivoTexto, total, editable, qrVisto]);
}
