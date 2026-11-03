/**
 * El historial de pagos de una cuenta por cobrar, con el estado en que quedó
 * la deuda **después de cada pago**. Port de `HistorialPagos.kt` (Android).
 *
 * Existe por una razón concreta: el recibo de un pago tiene que decir cómo
 * quedaba la cuenta ESE día, no cómo está hoy. El maquetado original de la app
 * imprimía en el recibo el pagado y el saldo actuales, y salían recibos
 * imposibles: el del primer abono de una cuenta de Bs 219 decía "pagado
 * acumulado Bs 370" y "DEUDA CANCELADA" cuando ese día todavía debía Bs 68. Un
 * papel que el cliente se lleva no puede contradecir a la cuenta.
 *
 * El adelanto va como el primer pago aunque el backend lo guarde en la venta y
 * no entre los abonos: para el cliente que mira el papel es plata que entregó
 * contra esta deuda, igual que las demás.
 */
import { aCentavos, esPositivo } from "./dinero";
import type { CreditoDetalle } from "../types";

/** Un pago de la cuenta, con la foto de la deuda justo después de hacerlo. */
export interface PagoDelHistorial {
  /** El id del pago en el backend; null en el adelanto, que no es un abono. */
  id: number | null;
  esAdelanto: boolean;
  monto: number;
  /**
   * Cómo pagó ("Efectivo", "QR", "Efectivo + QR"). Vacío en el adelanto: no se
   * guarda aparte (viajó en los pagos de la venta) y escribir "Efectivo" por
   * defecto sería inventar un dato en un papel que el cliente se lleva.
   */
  formaPago: string;
  /** Las partes de un cobro mixto, para que el recibo diga cuánto fue por QR. */
  partes?: { formaPago: string; monto: number }[];
  /** ISO 8601. En el adelanto es la fecha de la venta. */
  fecha: string | null;
  /** Quién lo cobró. */
  usuario: string | null;
  /** Todo lo entregado hasta este pago inclusive (el adelanto incluido). */
  pagadoAcumulado: number;
  /** Lo que quedaba debiendo justo después de este pago. */
  saldoDespues: number;
  /** Con este pago la cuenta quedó saldada: el único que lleva el sello. */
  cancela: boolean;
}

/** Saldada con la tolerancia de medio centavo: un saldo de 0,004 no es deuda. */
const saldada = (saldo: number) => !esPositivo(saldo);

/**
 * Los pagos de la cuenta en orden (el adelanto primero), con el acumulado
 * corrido.
 *
 * El acumulado se suma de los montos reales y no se toma de `credito.pagado`:
 * ése es el de hoy, y acá hace falta el de cada momento. En el último pago los
 * dos coinciden.
 */
export function historialDePagos(credito: CreditoDetalle): PagoDelHistorial[] {
  const pagos: PagoDelHistorial[] = [];
  let acumulado = 0;

  if (esPositivo(credito.adelanto)) {
    acumulado = aCentavos(credito.adelanto);
    const saldoDespues = aCentavos(credito.montoTotal - acumulado);
    pagos.push({
      id: null,
      esAdelanto: true,
      monto: credito.adelanto,
      formaPago: "",
      fecha: credito.fechaVenta ?? null,
      usuario: credito.registradoPor ?? null,
      pagadoAcumulado: acumulado,
      saldoDespues,
      cancela: saldada(saldoDespues),
    });
  }

  for (const abono of credito.pagos ?? []) {
    acumulado = aCentavos(acumulado + abono.monto);
    const saldoDespues = aCentavos(credito.montoTotal - acumulado);
    pagos.push({
      id: abono.id,
      esAdelanto: false,
      monto: abono.monto,
      formaPago: abono.formaPago,
      fecha: abono.fecha,
      usuario: abono.usuario,
      pagadoAcumulado: acumulado,
      saldoDespues,
      cancela: saldada(saldoDespues),
    });
  }
  return pagos;
}

/**
 * Lo que entró en abonos, sin el adelanto: la fila "Abonos recibidos (n)" del
 * comprobante. Sin ella, un comprobante reimpreso después de un abono mostraba
 * un saldo que no se podía sacar de lo que se veía en el papel.
 *
 * Si el detalle no trajo los pagos, se deriva de los montos (total − adelanto −
 * saldo) para que el papel cierre igual.
 */
export function abonosDe(credito: CreditoDetalle): { cantidad: number | null; monto: number } {
  if (credito.pagos) {
    return {
      cantidad: credito.pagos.length,
      monto: aCentavos(credito.pagos.reduce((s, p) => s + p.monto, 0)),
    };
  }
  return {
    cantidad: null,
    monto: Math.max(0, aCentavos(credito.montoTotal - credito.adelanto - credito.saldo)),
  };
}

/**
 * El recibo del cobro que se acaba de registrar, con las partes como se
 * mandaron (BUG-finanzas-7: el recibo de después del abono no decía la forma de
 * pago, y en un mixto no se sabía qué parte había entrado por QR).
 *
 * `despues` es la cuenta que devuelve el backend al registrar el abono: su
 * saldo es el de verdad. Si no vino, se descuenta a mano del de antes.
 */
export function reciboDelCobro({
  antes,
  partes,
  despues,
  fecha,
  usuario,
}: {
  antes: { saldo: number; montoTotal: number };
  partes: { formaPago: string; monto: number }[];
  despues?: { saldo?: number } | null;
  fecha: string;
  usuario: string | null;
}): PagoDelHistorial {
  const monto = aCentavos(partes.reduce((s, p) => s + p.monto, 0));
  const saldoDespues =
    typeof despues?.saldo === "number"
      ? despues.saldo
      : Math.max(0, aCentavos(antes.saldo - monto));
  return {
    id: null,
    esAdelanto: false,
    monto,
    formaPago: partes.map((p) => p.formaPago).join(" + "),
    ...(partes.length > 1 ? { partes } : {}),
    fecha,
    usuario,
    pagadoAcumulado: aCentavos(antes.montoTotal - saldoDespues),
    saldoDespues,
    cancela: saldada(saldoDespues),
  };
}
