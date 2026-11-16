import { aCentavos } from "../../lib/dinero";
import type { PedidoPlataformaEncolado } from "../../lib/offline/cola";
import {
  NOMBRE_PLATAFORMA,
  PLATAFORMAS,
  type PedidoPlataforma,
  type Plataforma,
} from "../../lib/pedidosPlataforma/tipos";
import type { Venta } from "../../types";

/**
 * Los pedidos de Yango y PedidosYa en «Ventas del turno»
 * (PLAN-PEDIDOS-PLATAFORMA §10.2). No son ventas: se muestran mezclados con
 * ellas por hora, marcados, y NO suman a «N ventas · Bs X», a «Vendido» ni a
 * ningún total del turno. Lo único que se suma es la línea de resumen aparte,
 * sin los anulados.
 */

/** Una fila de la lista del turno: una venta o un pedido de plataforma. */
export type FilaDelTurno =
  | { tipo: "venta"; venta: Venta }
  | { tipo: "pedido"; pedido: PedidoPlataforma };

const aMs = (iso: string): number => {
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
};

/**
 * Las ventas y los pedidos en una sola lista, del más nuevo al más viejo. Es
 * una mezcla de dos listas ya ordenadas y no un `sort` general: las ventas
 * conservan el orden con que llegan del servidor aunque dos compartan minuto,
 * y un pedido se mete justo donde le toca por hora.
 */
export function mezclarPorHora(ventas: Venta[], pedidos: PedidoPlataforma[]): FilaDelTurno[] {
  const ps = [...pedidos].sort((a, b) => aMs(b.fecha) - aMs(a.fecha) || b.id - a.id);
  const filas: FilaDelTurno[] = [];
  let i = 0;
  for (const venta of ventas) {
    const hora = aMs(venta.fecha);
    while (i < ps.length && aMs(ps[i].fecha) > hora) filas.push({ tipo: "pedido", pedido: ps[i++] });
    filas.push({ tipo: "venta", venta });
  }
  while (i < ps.length) filas.push({ tipo: "pedido", pedido: ps[i++] });
  return filas;
}

/**
 * Los pedidos de la cola que van a este turno: los tomados sin internet con la
 * caja de acá (o sin caja anotada, de antes de que la cola la guardara) que
 * todavía no subieron. Uno que ya está en la lista del servidor (subió entre
 * una lectura y otra, o la copia es de después) no se cuenta dos veces.
 */
export function pendientesDelTurno(
  cola: PedidoPlataformaEncolado[],
  cajaId: number,
  delServidor: PedidoPlataforma[],
): PedidoPlataformaEncolado[] {
  const yaSubidos = new Set(delServidor.map((p) => p.clienteRequestId));
  return cola.filter(
    (p) => p.estado !== "RECHAZADA" && (p.cuerpo.cajaId == null || p.cuerpo.cajaId === cajaId) && !yaSubidos.has(p.id),
  );
}

/** La línea de cada plataforma del resumen. */
export interface ResumenPlataforma {
  plataforma: Plataforma;
  cantidad: number;
  total: number;
}

/**
 * Cuántos pedidos y cuánta plata por plataforma, sin los anulados. Sólo
 * aparecen las que tienen algún pedido: una línea con «Yango: 0 pedidos» no
 * dice nada.
 */
export function resumenDePedidos(
  pedidos: Pick<PedidoPlataforma, "plataforma" | "total" | "anuladoEn">[],
): ResumenPlataforma[] {
  return PLATAFORMAS.map((plataforma) => {
    const vivos = pedidos.filter((p) => p.plataforma === plataforma && !p.anuladoEn);
    return {
      plataforma,
      cantidad: vivos.length,
      total: aCentavos(vivos.reduce((s, p) => s + p.total, 0)),
    };
  }).filter((r) => r.cantidad > 0);
}

/** «Yango: 3 pedidos · Bs 120,00 · PedidosYa: 1 pedido · Bs 40,00», o null si no hay. */
export function textoResumenPedidos(resumen: ResumenPlataforma[], fmtMoney: (n: number) => string): string | null {
  if (resumen.length === 0) return null;
  return resumen
    .map(
      (r) =>
        `${NOMBRE_PLATAFORMA[r.plataforma]}: ${r.cantidad} ${r.cantidad === 1 ? "pedido" : "pedidos"} · ${fmtMoney(r.total)}`,
    )
    .join(" · ");
}
