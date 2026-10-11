import { useMemo, useState } from "react";
import { aCentavos, parsearMonto } from "../../lib/dinero";
import { round2 } from "./calculo";
import type { PagoNuevo } from "./store";

export type Metodo = PagoNuevo["metodo"];

/** Montos redondos que el cliente suele entregar, arriba del total. */
export function sugerencias(total: number): number[] {
  const out = new Set<number>();
  for (const b of [10, 20, 50, 100, 200]) {
    const r = Math.ceil(total / b) * b;
    if (r > total) out.add(r);
  }
  return [...out].sort((a, b) => a - b).slice(0, 3);
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
  cambio: number;
  /** Lo que falta para cubrir (efectivo corto o mixto mal repartido). */
  falta: number;
  /** null mientras no se pueda confirmar. */
  pago: PagoNuevo | null;
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

  return useMemo(() => {
    const monto = editable ? round2(parsearMonto(montoTexto) ?? 0) : round2(total);
    const montoOk = monto > 0 && aCentavos(monto) <= aCentavos(total);
    // Vacío = le dieron justo: es lo más común y no obliga a escribir.
    const recibido = recibidoTexto.trim() ? round2(parsearMonto(recibidoTexto) ?? 0) : monto;
    let falta = 0;
    let cambio = 0;
    let pago: PagoNuevo | null = null;
    if (metodo === "Efectivo") {
      falta = Math.max(0, round2(monto - recibido));
      cambio = Math.max(0, round2(recibido - monto));
      if (montoOk && falta === 0) pago = { metodo, monto, recibido };
    } else if (metodo === "QR") {
      if (montoOk) pago = { metodo, monto };
    } else {
      const efectivo = round2(parsearMonto(efectivoTexto) ?? 0);
      const qr = round2(monto - efectivo);
      if (montoOk && efectivo > 0 && qr > 0) pago = { metodo, monto, partes: { efectivo, qr } };
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
      recibido,
      cambio,
      falta,
      pago,
      editable,
      tope: total,
    };
  }, [metodo, montoTexto, recibidoTexto, efectivoTexto, total, editable]);
}
