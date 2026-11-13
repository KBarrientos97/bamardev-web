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
  /**
   * Si el pedido vino de la página. Un delivery cargado a mano no tiene «Ya
   * salí»: el repartidor escribe al llegar, como siempre. Uno de la página sí,
   * así que el texto sigue el momento (por salir o en camino).
   */
  dePagina?: boolean;
}

/** Quién manda el mensaje: el repartidor (en la calle) o la caja (en el local). */
export type DesdeMensaje = "REPARTIDOR" | "CAJA";

const YA_LLEGO = "📍 ¡Nuestro delivery ya llegó a tu ubicación y está esperándote afuera para entregarte tu pedido!";

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
export function mensajePedido(
  p: PedidoParaMensaje,
  negocio?: string | null,
  rubro?: RubroMensaje | null,
  desde: DesdeMensaje = "REPARTIDOR",
): string {
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

  const llegada = lineaDeEntrega(p, clasico, desde);
  if (llegada) partes.push(llegada);
  const emojiCierre = clasico ? "❤️🍗" : cierre;
  partes.push(nombre ? `¡Gracias por elegir ${nombre}! ${emojiCierre}` : `¡Gracias por elegirnos! ${emojiCierre}`);

  return partes.join("\n\n");
}

/**
 * La línea de la entrega, o null. Es del domicilio: a quien pasa a recoger,
 * «ya llegó a tu ubicación» le sería falso.
 *
 * Omar conserva su frase en todos los casos (el texto de hoy, fijado por test).
 * Los demás dicen sólo lo que es verdad en ese momento, con las mismas frases
 * que la app (`MensajeEntregaWhatsApp.kt`): la caja no habla de la llegada; un
 * pedido de la página dice «por salir» o «en camino» según «Ya salí»; y «ya
 * llegó» queda para el delivery cargado a mano, que el repartidor manda en la
 * puerta.
 */
function lineaDeEntrega(p: PedidoParaMensaje, clasico: boolean, desde: DesdeMensaje): string | null {
  if (p.tipoPedido !== "DELIVERY") return null;
  if (clasico) return YA_LLEGO;
  if (desde === "CAJA") return null;
  if (p.dePagina) {
    return p.salioEn
      ? "🛵 ¡Tu pedido ya va en camino hacia tu ubicación!"
      : "🛵 ¡Tu pedido ya está por salir hacia tu ubicación!";
  }
  return YA_LLEGO;
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
    ...(v.pedidoWeb ? { dePagina: true } : {}),
    ...(v.pedidoWeb?.salioEn ? { salioEn: v.pedidoWeb.salioEn } : {}),
    ...(sucursal ? { sucursal, ...(rotuloSucursal ? { rotuloSucursal } : {}) } : {}),
  };
}

/** El enlace de WhatsApp con el mensaje ya escrito. [numero] ya normalizado para wa.me. */
export function enlaceWhatsApp(numero: string, mensaje: string): string {
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
}
