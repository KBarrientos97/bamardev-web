import { aCentavos, esPositivo } from "../../lib/dinero";
import type { Venta } from "../../types";

/**
 * La rendición del turno del repartidor: cuánta plata le entrega al negocio,
 * cuánto es suyo y cómo se cobró. Port de `RendicionRepartidor.kt` de la app:
 * si las dos cuentan distinto, el mismo repartidor rinde una cosa en el
 * celular y otra en la compu.
 *
 * Qué mide: lo cobrado al entregar en las entregas del turno. Dos reglas de la
 * casa deciden qué se entrega:
 *  - **La tarifa de envío es del repartidor.** No entra en lo que se rinde: el
 *    backend ya la deja afuera de `montoRendicion`.
 *  - **Lo cobrado por QR no lo tiene él.** Entró directo a la cuenta del
 *    negocio, así que lo que entrega al cerrar es sólo el efectivo
 *    (`enEfectivo`). Hasta el 29-oct "A entregar al negocio" y el KPI "A
 *    rendir" sumaban el QR junto con el efectivo (BUG-pedidos-3): al
 *    repartidor que cobró por QR se le pedía en mano una plata que nunca tuvo.
 *
 * Qué no mide: los prepagados (los cobró la caja: rinden 0) ni lo que sigue
 * pendiente.
 */
export interface Rendicion {
  pendientes: Venta[];
  entregadas: Venta[];
  /** Lo que se rinde de los pedidos cobrados al entregar, QR y efectivo juntos (sin tarifas). */
  rendido: number;
  /** La parte de `rendido` que entró por QR: ya está en la cuenta del negocio. */
  porQr: number;
  /** La parte de `rendido` cobrada en efectivo: lo único que se le entrega al negocio. */
  enEfectivo: number;
  /** Las tarifas de envío de las entregas del turno: del repartidor. */
  tarifas: number;
}

/** Si la forma de pago es el QR, con el mismo criterio que la app ("contiene QR"). */
function esQr(forma: string | null | undefined): boolean {
  return /qr/i.test(forma ?? "");
}

/**
 * La parte de lo que rinde el pedido que entró por QR.
 *
 * Con los montos de cada pago (`pagos`, que el backend manda en el resumen de
 * Mis entregas) se usa lo real, acotado a lo que se rinde. Antes se miraban
 * sólo los NOMBRES: si alguna forma decía "qr", el pedido entero contaba como
 * QR (DEL-2). Un pedido de Bs 100 cobrado con 60 por QR y 40 en efectivo daba
 * "Efectivo en mano Bs 0 · Ya cobrado por QR Bs 100" a un repartidor con Bs 40
 * en el bolsillo.
 *
 * Sin `pagos` (un backend anterior) se cae a los nombres como la app: todo QR
 * sólo si se cobró únicamente con QR; un mixto sin montos cuenta como
 * efectivo, que es lo que el negocio le va a pedir.
 */
export function cobradoPorQr(p: Venta): number {
  const rinde = p.montoRendicion ?? 0;
  if (!esPositivo(rinde)) return 0;
  if (p.pagos) {
    const qr = aCentavos(p.pagos.filter((x) => esQr(x.formaPago)).reduce((s, x) => s + x.monto, 0));
    return Math.min(Math.max(0, qr), rinde);
  }
  const formas = p.formasPago ?? [];
  return formas.length > 0 && formas.every(esQr) ? rinde : 0;
}

export function rendicionDelTurno(lista: Venta[]): Rendicion {
  const entregadas = lista.filter((p) => p.estadoEntrega === "ENTREGADO");
  // Sólo las cobradas al entregar aportan: un prepagado rinde 0 (lo cobró la
  // caja) y de ahí el repartidor sólo se llevó su tarifa.
  const cobradas = entregadas.filter((p) => esPositivo(p.montoRendicion ?? 0));
  const rendido = aCentavos(cobradas.reduce((s, p) => s + (p.montoRendicion ?? 0), 0));
  const porQr = aCentavos(cobradas.reduce((s, p) => s + cobradoPorQr(p), 0));
  return {
    pendientes: lista.filter((p) => p.estadoEntrega === "PENDIENTE"),
    entregadas,
    rendido,
    porQr,
    enEfectivo: aCentavos(rendido - porQr),
    tarifas: aCentavos(entregadas.reduce((s, p) => s + (p.tarifaEnvio ?? 0), 0)),
  };
}
