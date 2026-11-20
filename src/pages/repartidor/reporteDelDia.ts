import { aCentavos, esPositivo } from "../../lib/dinero";
import type { Venta } from "../../types";
import { cobradoPorQr } from "./rendicion";

/**
 * El reporte corto del repartidor (20-nov, pedido del dueño): cuántos pedidos
 * llevó hoy y cuánto se cobró de envío en cada uno.
 *
 * Sale SÓLO de `GET /ventas/mis-entregas`, lo mismo que ya pide la pantalla:
 * lo entregado desde las 6:00 (`inicioEntregasDeHoy` del backend) y lo que
 * sigue en camino. Por eso no hay «la semana»: la lista corta en la jornada y
 * días anteriores no llegan (queda anotado como pendiente de backend).
 *
 * «Envío cobrado» y no «lo que ganaste»: es la tarifa que se le cobró al
 * cliente. La regla de la casa dice que es del repartidor (no entra a la caja
 * ni a la rendición), pero si el negocio le paga otra cosa por viaje el
 * sistema no lo sabe, y el reporte no lo inventa.
 */
export interface FilaReporte {
  id: number;
  /** El comprobante («V-000031») o, sin él, «#31». */
  numero: string;
  cliente: string;
  /** Cuándo se entregó (ISO). */
  entregadoEn: string;
  /** La tarifa de envío que se le cobró al cliente. */
  envio: number;
  /** Cómo pagó el pedido: «Efectivo», «QR», «QR + efectivo», «Ya estaba pagado»… */
  pago: string;
}

export interface ReporteDelDia {
  /** Pedidos entregados hoy. */
  entregados: number;
  /** Asignados y todavía sin entregar. */
  enCamino: number;
  /** La suma de los envíos cobrados en lo entregado. */
  envioCobrado: number;
  /** Lo entregado, del primero al último: el orden en que salió. */
  filas: FilaReporte[];
}

/**
 * Cómo pagó el cliente lo del negocio. Con los montos (`pagos`) se distingue
 * un mixto de verdad; sin ellos (un backend anterior), los nombres tal cual,
 * que no mienten. Un prepagado lo cobró la caja.
 */
export function comoPago(p: Venta): string {
  if (p.prepagado) return "Ya estaba pagado";
  const rinde = p.montoRendicion ?? 0;
  if (!esPositivo(rinde)) return "Sin cobro";
  if (!p.pagos) return p.formasPago?.length ? p.formasPago.join(" + ") : "Sin detalle";
  const qr = cobradoPorQr(p);
  if (!esPositivo(qr)) return "Efectivo";
  return esPositivo(aCentavos(rinde - qr)) ? "QR + efectivo" : "QR";
}

export function reporteDelDia(lista: readonly Venta[]): ReporteDelDia {
  const entregadas = lista
    .filter((p) => p.estadoEntrega === "ENTREGADO")
    .slice()
    // Del más viejo al más nuevo: se lee como el recorrido del día.
    .sort((a, b) => (a.entregadoEn ?? a.fecha).localeCompare(b.entregadoEn ?? b.fecha));
  return {
    entregados: entregadas.length,
    enCamino: lista.filter((p) => p.estadoEntrega === "PENDIENTE").length,
    envioCobrado: aCentavos(entregadas.reduce((s, p) => s + (p.tarifaEnvio ?? 0), 0)),
    filas: entregadas.map((p) => ({
      id: p.id,
      numero: p.comprobante ?? `#${p.id}`,
      cliente: p.clienteNombre ?? "Sin nombre",
      entregadoEn: p.entregadoEn ?? p.fecha,
      envio: aCentavos(p.tarifaEnvio ?? 0),
      pago: comoPago(p),
    })),
  };
}
