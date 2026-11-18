import type { FormaPagoWeb, PedidoWeb, TipoPedidoWeb } from "../../lib/pedidosWeb/tipos";
import { TEXTO_SIN_DIRECCION } from "../../lib/pedidosWeb/direccion";
import { totalDe } from "../pedidos-web/logica";
import {
  RAYA_TICKET,
  bsCortoTicket,
  bsTicket,
  centradoTicket,
  fechaHoraTicket,
  lineasTicketDeDetalles,
  partirTicket,
  renglonTicket,
  renglonesDeProductos,
  type LineaTicket,
} from "./ticketTexto";

/**
 * El ticket de un pedido de la página («Imprimir pedido» del detalle,
 * CONTRATO-DELIVERY-FULL-18NOV §9): para la cocina y para la bolsa. El mismo
 * formato que el de Yango/PedidosYa, con lo del cliente y la plata a cobrar.
 *
 *        NOMBRE DEL NEGOCIO
 *     --------------------------------
 *     PEDIDO WEB N° 07 - DELIVERY      ← o «RECOGER»
 *     18/11/2026 00:41
 *     --------------------------------
 *     Cliente: Carla Mamani
 *     Tel: 70000000
 *     Dir: Calle Sucre 450             ← sin dirección: «Ubicación marcada en el mapa»
 *     Ref: Portón negro                ← sólo si hay
 *     Repartidor: Pedro Rojas          ← sólo si hay
 *     --------------------------------
 *     2 x Brasa entero          224.00
 *     Nota: sin ají                    ← sólo si hay
 *     --------------------------------
 *     Productos              Bs 242.00
 *     Envío                    Bs 7.00 ← sólo delivery
 *     TOTAL A COBRAR         Bs 249.00
 *     Paga con Bs 300 - cambio Bs 51   ← o «Paga por QR»
 *     --------------------------------
 */

export interface DatosTicketPedidoWeb {
  negocio: string;
  /** El local, sólo si corresponde mostrarlo (lo decide quien llama, como en el cierre). */
  sede?: string | null;
  numero: number;
  tipo: TipoPedidoWeb;
  fecha: string | Date;
  cliente: string;
  telefono?: string | null;
  /** Sólo delivery. Vacía o null: «Ubicación marcada en el mapa». */
  direccion?: string | null;
  referencia?: string | null;
  repartidor?: string | null;
  lineas: LineaTicket[];
  nota?: string | null;
  /** Lo de los productos (sin el envío). */
  productos: number;
  /** El envío; sólo sale en delivery. */
  envio?: number | null;
  /** Lo que se le cobra al cliente: productos + envío. */
  total: number;
  formaPago: FormaPagoWeb;
  pagaCon?: number | null;
}

/**
 * «Paga por QR», «Paga con Bs 300 - cambio Bs 51», «Paga con Bs 300» (si no
 * se sabe el cambio o el billete no alcanza: la caja subió el envío al
 * aceptar) o «Paga en efectivo» (no dijo con cuánto). La plata, corta.
 */
export function textoPagoPedidoWeb(formaPago: FormaPagoWeb, pagaCon: number | null | undefined, total: number | null | undefined): string {
  if (formaPago === "QR") return "Paga por QR";
  if (pagaCon == null || !Number.isFinite(pagaCon)) return "Paga en efectivo";
  const con = `Paga con ${bsCortoTicket(pagaCon)}`;
  if (total == null || !Number.isFinite(total)) return con;
  const cambio = Math.round((pagaCon - total) * 100) / 100;
  return cambio >= 0 ? `${con} - cambio ${bsCortoTicket(cambio)}` : con;
}

export function lineasTicketPedidoWeb(d: DatosTicketPedidoWeb): string[] {
  const delivery = d.tipo === "DELIVERY";
  const lineas: string[] = [];
  if (d.negocio.trim()) lineas.push(...centradoTicket(d.negocio.toUpperCase()));
  if (d.sede?.trim()) lineas.push(...centradoTicket(d.sede));
  lineas.push(RAYA_TICKET);

  lineas.push(`PEDIDO WEB N° ${String(d.numero).padStart(2, "0")} - ${delivery ? "DELIVERY" : "RECOGER"}`);
  const fecha = fechaHoraTicket(d.fecha);
  if (fecha) lineas.push(fecha);
  lineas.push(RAYA_TICKET);

  lineas.push(...partirTicket(`Cliente: ${d.cliente}`));
  if (d.telefono?.trim()) lineas.push(...partirTicket(`Tel: ${d.telefono}`));
  // Para recoger no va nada de la entrega: ni dirección, ni referencia, ni repartidor (ni envío, abajo).
  if (delivery) {
    lineas.push(...partirTicket(`Dir: ${d.direccion?.trim() || TEXTO_SIN_DIRECCION}`));
    if (d.referencia?.trim()) lineas.push(...partirTicket(`Ref: ${d.referencia}`));
    if (d.repartidor?.trim()) lineas.push(...partirTicket(`Repartidor: ${d.repartidor}`));
  }
  lineas.push(RAYA_TICKET);

  lineas.push(...renglonesDeProductos(d.lineas));
  if (d.nota?.trim()) lineas.push(...partirTicket(`Nota: ${d.nota}`));
  lineas.push(RAYA_TICKET);

  lineas.push(renglonTicket("Productos", bsTicket(d.productos)));
  if (delivery) lineas.push(renglonTicket("Envío", bsTicket(d.envio ?? 0)));
  lineas.push(renglonTicket("TOTAL A COBRAR", bsTicket(d.total)));
  lineas.push(...partirTicket(textoPagoPedidoWeb(d.formaPago, d.pagaCon, d.total)));
  lineas.push(RAYA_TICKET);
  return lineas;
}

/** El ticket entero, para imprimirlo en un `<pre>`. */
export function textoTicketPedidoWeb(d: DatosTicketPedidoWeb): string {
  return lineasTicketPedidoWeb(d).join("\n");
}

/**
 * Lo que el ticket dice de un pedido de la bandeja, salvo el negocio y la
 * sucursal (los pone quien imprime). El envío y el total son los mismos que
 * muestra el detalle: el confirmado al aceptar o, antes, el sugerido.
 */
export function datosDePedidoWeb(p: PedidoWeb): Omit<DatosTicketPedidoWeb, "negocio" | "sede"> {
  const delivery = p.tipo === "DELIVERY";
  return {
    numero: p.numero,
    tipo: p.tipo,
    fecha: p.creadoEn,
    cliente: p.nombre,
    telefono: p.telefono,
    direccion: delivery ? p.direccion : null,
    referencia: delivery ? p.referencia : null,
    repartidor: p.repartidor?.nombre ?? null,
    lineas: lineasTicketDeDetalles(p.lineas ?? [], (l) => l.titulo),
    nota: p.nota,
    productos: p.subtotal,
    envio: delivery ? (p.estado !== "NUEVO" && p.envio != null ? p.envio : p.envioSugerido) : null,
    total: totalDe(p),
    formaPago: p.formaPago,
    pagaCon: p.pagaCon,
  };
}
