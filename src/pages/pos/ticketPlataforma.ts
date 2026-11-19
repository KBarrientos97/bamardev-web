import {
  NOMBRE_PLATAFORMA,
  descuentoDelPedido,
  observacionesDelPedido,
  type PedidoPlataforma,
  type Plataforma,
} from "../../lib/pedidosPlataforma/tipos";
import { cantidadTicket, montoTicket } from "./ticketCierre";
import {
  RAYA_TICKET,
  bsTicket,
  centradoTicket,
  fechaHoraTicket,
  lineasTicketDeDetalles,
  partirTicket,
  renglonTicket,
  renglonesDeProductos,
  totalDeLineas,
  unidadesDeLineas,
  type LineaTicket,
} from "./ticketTexto";

/**
 * El ticket de un pedido de Yango o PedidosYa (CONTRATO-DELIVERY-FULL-18NOV
 * §9): sale al registrarlo, si «Imprimir el pedido al registrarlo» está
 * prendido en Configuración › Punto de venta, y se reimprime desde «Ventas del
 * turno». Va a la cocina y a la bolsa: qué lleva, de qué app es y su N°.
 *
 *        NOMBRE DEL NEGOCIO
 *           Sucursal            ← sólo con 2+ sucursales, como el de cierre
 *     --------------------------------
 *     PEDIDO YANGO
 *     N° de la app: 12345        ← sólo si se cargó
 *     18/11/2026 00:41
 *     Atendió: Admin Demo
 *     --------------------------------
 *     2 x Brasa entero          224.00
 *       + Arroz (porción)         6.00
 *     --------------------------------
 *     TOTAL                  Bs 248.00
 *     3 unidades
 *     --------------------------------
 *
 * Con el descuento de la app y las observaciones (CONTRATO-PRECIO-PLATAFORMA,
 * 19-nov), sólo cuando hay algo que decir; sin ellos el papel es el de
 * arriba, carácter por carácter:
 *
 *     2 x Brasa economico        42.00
 *     --------------------------------
 *     Subtotal                   42.00   ← sólo con descuento
 *     Descuento                  -1.00   ← sólo con descuento
 *     TOTAL                   Bs 41.00
 *     2 unidades
 *     Obs: sin aji                       ← sólo con observaciones
 *     --------------------------------
 *
 * Función pura: arma los renglones y la prueba compara el texto.
 */

export interface DatosTicketPlataforma {
  /** El mismo nombre que usa el ticket de cierre. */
  negocio: string;
  /** El local, sólo si corresponde mostrarlo (lo decide quien llama, como en el cierre). */
  sede?: string | null;
  plataforma: Plataforma;
  codigoExterno?: string | null;
  /** Cuándo se tomó. */
  fecha: string | Date;
  /** Quién lo registró. */
  atendio?: string | null;
  lineas: LineaTicket[];
  /**
   * El total que guardó el servidor (ya con el descuento); sin él (en la cola
   * sin señal) se suman las líneas y se resta el descuento.
   */
  total?: number | null;
  /** Lo que descontó la app, del pedido entero. 0 o ausente = sin renglones de descuento. */
  descuento?: number | null;
  /** La nota del cajero; vacía o ausente = sin renglón. */
  observaciones?: string | null;
}

const centavos = (n: number) => Math.round(n * 100) / 100;

/** «3 unidades», «1 unidad». */
export const textoUnidades = (n: number): string => `${cantidadTicket(n)} ${n === 1 ? "unidad" : "unidades"}`;

export function lineasTicketPlataforma(d: DatosTicketPlataforma): string[] {
  const lineas: string[] = [];
  if (d.negocio.trim()) lineas.push(...centradoTicket(d.negocio.toUpperCase()));
  if (d.sede?.trim()) lineas.push(...centradoTicket(d.sede));
  lineas.push(RAYA_TICKET);

  lineas.push(`PEDIDO ${(NOMBRE_PLATAFORMA[d.plataforma] ?? d.plataforma).toUpperCase()}`);
  if (d.codigoExterno?.trim()) lineas.push(...partirTicket(`N° de la app: ${d.codigoExterno}`));
  const fecha = fechaHoraTicket(d.fecha);
  if (fecha) lineas.push(fecha);
  if (d.atendio?.trim()) lineas.push(...partirTicket(`Atendió: ${d.atendio}`));
  lineas.push(RAYA_TICKET);

  lineas.push(...renglonesDeProductos(d.lineas));
  lineas.push(RAYA_TICKET);

  const descuento = d.descuento != null && d.descuento > 0 ? centavos(d.descuento) : 0;
  const total = d.total ?? centavos(totalDeLineas(d.lineas) - descuento);
  if (descuento > 0) {
    // El subtotal es el total más el descuento, como lo guarda el backend: así
    // las tres cifras del papel siempre cierran entre sí.
    lineas.push(renglonTicket("Subtotal", montoTicket(centavos(total + descuento))));
    lineas.push(renglonTicket("Descuento", `-${montoTicket(descuento)}`));
  }
  lineas.push(renglonTicket("TOTAL", bsTicket(total)));
  lineas.push(textoUnidades(unidadesDeLineas(d.lineas)));
  if (d.observaciones?.trim()) lineas.push(...partirTicket(`Obs: ${d.observaciones}`));
  lineas.push(RAYA_TICKET);
  return lineas;
}

/** El ticket entero, para imprimirlo en un `<pre>`. */
export function textoTicketPlataforma(d: DatosTicketPlataforma): string {
  return lineasTicketPlataforma(d).join("\n");
}

/** Los productos de un pedido que ya guardó el servidor (los toppings llegan como líneas hijas). */
export function lineasDePedidoPlataforma(p: Pick<PedidoPlataforma, "detalles">): LineaTicket[] {
  return lineasTicketDeDetalles(p.detalles ?? [], (d) => d.nombre);
}

/** Una línea del carrito del POS, lo justo para el papel. Los toppings vienen POR UNIDAD del producto. */
export interface LineaDelCarritoParaTicket {
  nombre: string;
  cantidad: number;
  /** El precio de una unidad, sin los toppings. */
  precio: number;
  hijas?: { nombre: string; cantidad: number; subtotal: number; incluido: boolean }[];
}

/**
 * Los productos tal como se cargaron en el carrito: lo que se imprime cuando
 * el pedido quedó en la cola sin señal (o si el servidor no devolvió las
 * líneas). Los toppings se escalan por la cantidad del producto, como hace el
 * backend al guardarlos.
 */
export function lineasDelCarrito(lineas: LineaDelCarritoParaTicket[]): LineaTicket[] {
  const centavos = (n: number) => Math.round(n * 100) / 100;
  return lineas.map((l) => ({
    nombre: l.nombre,
    cantidad: l.cantidad,
    subtotal: centavos(l.precio * l.cantidad),
    ...(l.hijas?.length
      ? {
          agregados: l.hijas.map((h) => ({
            nombre: h.nombre,
            cantidad: Math.round(h.cantidad * l.cantidad * 1000) / 1000,
            subtotal: h.incluido ? 0 : centavos(h.subtotal * l.cantidad),
            incluido: h.incluido,
          })),
        }
      : {}),
  }));
}

/** Lo que el ticket dice de un pedido guardado, salvo el negocio y la sucursal (los pone quien imprime). */
export function datosDePedidoPlataforma(
  p: PedidoPlataforma,
): Omit<DatosTicketPlataforma, "negocio" | "sede"> & { sede: string | null } {
  return {
    plataforma: p.plataforma,
    codigoExterno: p.codigoExterno,
    fecha: p.fecha,
    atendio: p.usuario?.nombre ?? null,
    lineas: lineasDePedidoPlataforma(p),
    total: p.total,
    // Un backend viejo no los manda: sin descuento ni nota, el papel de siempre.
    descuento: descuentoDelPedido(p),
    observaciones: observacionesDelPedido(p),
    sede: p.almacen?.nombre ?? null,
  };
}

/** El ticket del pedido recién registrado, salvo el negocio (lo pone la ventana que lo imprime). */
export type PedidoParaImprimir = Omit<DatosTicketPlataforma, "negocio" | "sede"> & {
  /** El local del pedido; sale en el papel sólo con 2+ sucursales, como en el de cierre. */
  sede: string | null;
  /** No llegó al servidor: espera en el equipo y se imprime con lo que se cargó. */
  encolado: boolean;
};

/**
 * Lo que se imprime al registrar: lo que guardó el servidor (con su hora, su
 * total y quién lo registró) o, si quedó en la cola sin señal, lo que se cargó
 * en el carrito, con la hora de este equipo y quien está en la caja.
 */
export function pedidoParaImprimir(o: {
  plataforma: Plataforma;
  codigoExterno?: string;
  /** Lo que devolvió el servidor; `null` si quedó en la cola. */
  pedido: PedidoPlataforma | null;
  /** Con el precio de la APP de cada producto (el del diálogo), no el del local. */
  carrito: LineaDelCarritoParaTicket[];
  /** El descuento y la nota del diálogo: los usa el papel de la cola, que no tiene respuesta. */
  descuento?: number;
  observaciones?: string;
  /** El local de la caja abierta. */
  sede: string | null;
  /** Quien está en la caja. */
  atendio: string | null;
  ahora?: Date;
}): PedidoParaImprimir {
  const p = o.pedido;
  if (p && p.detalles?.length) {
    return {
      ...datosDePedidoPlataforma(p),
      fecha: p.fecha ?? o.ahora ?? new Date(),
      atendio: p.usuario?.nombre ?? o.atendio,
      sede: p.almacen?.nombre ?? o.sede,
      encolado: false,
    };
  }
  const lineas = lineasDelCarrito(o.carrito);
  const descuento = p ? descuentoDelPedido(p) : o.descuento && o.descuento > 0 ? centavos(o.descuento) : 0;
  return {
    plataforma: o.plataforma,
    codigoExterno: p?.codigoExterno ?? o.codigoExterno ?? null,
    fecha: p?.fecha ?? o.ahora ?? new Date(),
    atendio: p?.usuario?.nombre ?? o.atendio,
    lineas,
    total: p?.total ?? centavos(totalDeLineas(lineas) - descuento),
    descuento,
    observaciones: p ? observacionesDelPedido(p) : o.observaciones?.trim() || null,
    sede: p?.almacen?.nombre ?? o.sede,
    encolado: !p,
  };
}
