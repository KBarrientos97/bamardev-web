import type { Venta } from "../types";
import { fmtMontoCliente } from "./format";

/**
 * Lo que hace falta de un pedido para escribirle al cliente.
 *
 * Cada pantalla trae el pedido con otra forma (el repartidor y el historial de
 * la caja leen endpoints distintos): las dos lo traducen a esto.
 */
export interface PedidoParaMensaje {
  comprobante: string;
  tipoPedido: string;
  lineas: { cantidad: number; nombre: string; total: number }[];
  /** Lo de los productos, sin el envío. */
  total: number;
  tarifaEnvio: number;
  /** Lo que el cliente paga al recibirlo. */
  totalACobrar: number;
  /** Ya lo pagó en caja: el total lo aclara. */
  prepagado: boolean;
}

/**
 * El WhatsApp que se le manda al cliente por su pedido: el repartidor al llegar
 * y la caja al que pasa a recoger.
 *
 * Es el mismo texto que la app (`EntregaDetalleFragment.construirMensajeWhatsApp`,
 * pedido de Kevin del 15-oct): si cambia uno, cambia el otro. Antes la web abría
 * el chat vacío y el repartidor tenía que escribir todo a mano.
 *
 * - El nombre es el del negocio de la sesión, así cada negocio firma con el suyo
 *   sin tocar código. Sin nombre no va la cabecera y se agradece "por elegirnos",
 *   antes que firmar con el de otro.
 * - "Nuestro delivery ya llegó" va sólo a domicilio: al que pasa a recoger sería
 *   falso.
 * - La plata va sin ".00" cuando es entera ("Bs 40"): ver `fmtMontoCliente`.
 */
export function mensajePedido(p: PedidoParaMensaje, negocio?: string | null): string {
  const nombre = negocio?.trim() || null;
  const partes: string[] = [];

  if (nombre) partes.push(`🐔 ${nombre} 👋`);
  partes.push(`¡Hola! Te escribimos por tu pedido ${p.comprobante}. 🛵`);

  if (p.lineas.length) {
    partes.push(
      [
        "🛒 *Resumen de tu pedido:*",
        ...p.lineas.map((l) => `• ${l.cantidad} × ${l.nombre} — ${fmtMontoCliente(l.total)}`),
      ].join("\n"),
    );
  }

  const totales = [
    `💰 Total del pedido: ${fmtMontoCliente(p.total)}${p.prepagado ? " (ya pagado en caja)" : ""}`,
  ];
  if (p.tipoPedido === "DELIVERY" && p.tarifaEnvio > 0) {
    totales.push(`🛵 Costo de envío: ${fmtMontoCliente(p.tarifaEnvio)}`);
  }
  totales.push(`💵 *Total a pagar: ${fmtMontoCliente(p.totalACobrar)}*`);
  partes.push(totales.join("\n"));

  if (p.tipoPedido === "DELIVERY") {
    partes.push(
      "📍 ¡Nuestro delivery ya llegó a tu ubicación y está esperándote afuera para entregarte tu pedido!",
    );
  }
  partes.push(nombre ? `¡Gracias por elegir ${nombre}! ❤️🍗` : "¡Gracias por elegirnos! ❤️🍗");

  return partes.join("\n\n");
}

/** Un pedido como lo traen el repartidor y el historial de la caja (`Venta`). */
export function pedidoDeVenta(v: Venta): PedidoParaMensaje {
  return {
    comprobante: v.comprobante ?? `#${v.id}`,
    tipoPedido: v.tipoPedido,
    lineas: (v.detalles ?? []).map((d) => ({ cantidad: d.cantidad, nombre: d.producto, total: d.subtotal })),
    total: v.total,
    tarifaEnvio: v.tarifaEnvio ?? 0,
    totalACobrar: v.totalACobrar ?? 0,
    prepagado: !!v.prepagado,
  };
}

/** El enlace de WhatsApp con el mensaje ya escrito. [numero] ya normalizado para wa.me. */
export function enlaceWhatsApp(numero: string, mensaje: string): string {
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
}
