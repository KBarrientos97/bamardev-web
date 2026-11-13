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
  /** El local, sólo si el negocio tiene varios: sin él, el mensaje de siempre. */
  sucursal?: string | null;
  /** Cómo llama el rubro al local («Sucursal» por defecto; «Sede» en un instituto). */
  rotuloSucursal?: string;
  /**
   * Cuándo salió el repartidor, si es un pedido de la página y ya salió. Sólo
   * lo mira el texto de los rubros que no son el de siempre: así no dicen
   * «ya llegó» de un pedido que sigue en el local (QA R1, N8).
   */
  salioEn?: string | null;
}

/** De qué negocio es el mensaje: lo que decide el tono (emoji y cierre). */
export interface RubroMensaje {
  tipoNegocio?: string | null;
  variante?: string | null;
}

/**
 * El mensaje de siempre —el de la pollería, con 🐔, ❤️🍗 y «ya llegó»— es el de
 * un RESTAURANTE sin variante (Pollos Don Omar). Un restaurante que no dice su
 * rubro, o una sesión vieja sin `tipoNegocio`, también: ante la duda, no se
 * toca lo que ya andaba. Cualquier otro rubro, o una variante como «Postres»,
 * lleva un texto que no habla de pollo ni de un delivery que ya llegó.
 */
export function esMensajeClasico(rubro?: RubroMensaje | null): boolean {
  if (rubro?.variante) return false;
  const tipo = rubro?.tipoNegocio;
  return !tipo || tipo === "RESTAURANTE";
}

/** El emoji de la cabecera y el del cierre, según el negocio (sólo fuera del texto clásico). */
function adornosDe(rubro?: RubroMensaje | null): { cabecera: string; cierre: string } {
  if (rubro?.variante === "POSTRES") return { cabecera: "🍮", cierre: "❤️🍮" };
  return { cabecera: "🛍️", cierre: "❤️" };
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
export function mensajePedido(p: PedidoParaMensaje, negocio?: string | null, rubro?: RubroMensaje | null): string {
  const nombre = negocio?.trim() || null;
  const partes: string[] = [];
  const clasico = esMensajeClasico(rubro);
  const { cabecera, cierre } = adornosDe(rubro);

  if (nombre) partes.push(`${clasico ? "🐔" : cabecera} ${nombre} 👋`);
  partes.push(`¡Hola! Te escribimos por tu pedido ${p.comprobante}. 🛵`);
  // Con varios locales, de cuál sale (el cliente que pidió al de Sur no espera
  // al de Centro). Sin esto, el mismo texto que la app.
  if (p.sucursal) partes.push(`🏪 ${p.rotuloSucursal ?? "Sucursal"}: ${p.sucursal}`);

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
      clasico
        ? "📍 ¡Nuestro delivery ya llegó a tu ubicación y está esperándote afuera para entregarte tu pedido!"
        : // El mensaje se puede mandar antes de salir: no se afirma lo que no se sabe.
          p.salioEn
          ? "📍 Tu pedido ya salió del local y va en camino a tu ubicación."
          : "📍 Te escribimos para coordinar la entrega de tu pedido.",
    );
  }
  const emojiCierre = clasico ? "❤️🍗" : cierre;
  partes.push(nombre ? `¡Gracias por elegir ${nombre}! ${emojiCierre}` : `¡Gracias por elegirnos! ${emojiCierre}`);

  return partes.join("\n\n");
}

/** Un pedido como lo traen el repartidor y el historial de la caja (`Venta`). */
export function pedidoDeVenta(v: Venta, sucursal?: string | null, rotuloSucursal?: string): PedidoParaMensaje {
  return {
    comprobante: v.comprobante ?? `#${v.id}`,
    tipoPedido: v.tipoPedido,
    lineas: (v.detalles ?? []).map((d) => ({ cantidad: d.cantidad, nombre: d.producto, total: d.subtotal })),
    total: v.total,
    tarifaEnvio: v.tarifaEnvio ?? 0,
    totalACobrar: v.totalACobrar ?? 0,
    prepagado: !!v.prepagado,
    ...(v.pedidoWeb?.salioEn ? { salioEn: v.pedidoWeb.salioEn } : {}),
    ...(sucursal ? { sucursal, ...(rotuloSucursal ? { rotuloSucursal } : {}) } : {}),
  };
}

/** El enlace de WhatsApp con el mensaje ya escrito. [numero] ya normalizado para wa.me. */
export function enlaceWhatsApp(numero: string, mensaje: string): string {
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
}
