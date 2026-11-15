import { ApiError } from "../api";
import {
  encolarPedidoPlataforma,
  hayRespuesta,
  marcarSinSenal,
  sinSenal,
  type CuerpoPedidoEncolado,
} from "../offline/cola";
import { ventaSinInternet } from "../offline/modo";
import type { PedidoPlataforma, PedidoPlataformaInput } from "./tipos";

/**
 * Registrar un pedido de Yango o PedidosYa con o sin señal
 * (PLAN-PEDIDOS-PLATAFORMA §5). Es `venderOEncolar` de las ventas, con las
 * mismas reglas, para que el cajero viva lo mismo en las dos cosas:
 *
 *  - fuera de la app instalada (la pestaña de la compu, el iPhone en Safari)
 *    es el POST de siempre y un corte es un error que se ve;
 *  - en la app instalada, con señal va al servidor; si la red falla (status 0)
 *    se encola con el MISMO `clienteRequestId` y se le avisa al cajero que
 *    quedó guardado. Si el POST sí había llegado, subirlo después devuelve ese
 *    mismo pedido y no descuenta el stock otra vez;
 *  - cualquier respuesta del servidor (un 400, un 403 de feature apagada, un
 *    404) NO se encola: es un "no" que el cajero tiene que ver ahora;
 *  - con el corte reciente ("pegajoso", 3 min) va directo a la cola, sin
 *    esperar otro timeout con el repartidor esperando en la puerta.
 */
export interface PedidoRegistrado {
  /** Lo que devolvió el servidor; `null` si el pedido quedó en la cola. */
  pedido: PedidoPlataforma | null;
  /** true = no llegó al servidor: espera en el equipo hasta que vuelva la señal. */
  encolado: boolean;
}

export async function registrarPedidoOEncolar(
  cuerpo: PedidoPlataformaInput,
  enviar: (c: PedidoPlataformaInput) => Promise<PedidoPlataforma>,
  /**
   * Los precios que el cajero vio, por producto: la cola los manda (sin señal
   * el servidor no puede ponerlos) y de ahí también sale el total que se le
   * muestra al decirle que quedó guardado.
   */
  precios: ReadonlyMap<number, number>,
): Promise<PedidoRegistrado> {
  if (!ventaSinInternet()) {
    return { pedido: await enviar(cuerpo), encolado: false };
  }
  if (!sinSenal()) {
    try {
      const pedido = await enviar(cuerpo);
      hayRespuesta();
      return { pedido, encolado: false };
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 0) {
        if (e instanceof ApiError) hayRespuesta();
        throw e;
      }
      marcarSinSenal();
    }
  }
  const paraLaCola = cuerpoEncoladoDePedido(cuerpo, precios);
  const total = paraLaCola.detalles.reduce((s, d) => s + (d.precio ?? 0) * d.cantidad, 0);
  await encolarPedidoPlataforma(paraLaCola, Math.round(total * 100) / 100);
  return { pedido: null, encolado: true };
}

/**
 * El pedido como sube desde la cola: con la hora en que se tomó y `encolado`.
 * Cada línea lleva el precio que el cajero vio en pantalla; el servidor lo
 * respeta cuando viene de la cola, igual que con las ventas encoladas.
 */
export function cuerpoEncoladoDePedido(
  cuerpo: PedidoPlataformaInput,
  precios: ReadonlyMap<number, number>,
  ahora = new Date(),
): CuerpoPedidoEncolado {
  return {
    ...cuerpo,
    detalles: cuerpo.detalles.map((d) => ({ ...d, precio: d.precio ?? precios.get(d.productoId) })),
    fechaCliente: ahora.toISOString(),
    encolado: true,
  };
}
