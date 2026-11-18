import { useCallback, useEffect, useRef, useState } from "react";
import { sonarPedido } from "../../lib/pedidosWeb/contador";
import type { Venta } from "../../types";

/**
 * Cada cuánto se vuelve a pedir «Mis entregas» con la pantalla a la vista
 * (18-nov: era un minuto). Con la app abierta, el aviso de un pedido nuevo
 * llega a lo sumo en este tiempo; con la pantalla apagada avisa la push.
 */
export const REFRESCO_ENTREGAS_MS = 20_000;

/**
 * Los pedidos por entregar que son de este repartidor. La lista ya viene sólo
 * con lo suyo, salvo a quien además maneja el reparto: ése recibe todas y no
 * tiene por qué sonarle el pedido de otro. Sin repartidor en la fila, cuenta
 * (un backend que no lo manda).
 */
export function pendientesDe(lista: Venta[], usuarioId: number | null | undefined): number[] {
  return lista
    .filter((v) => v.estadoEntrega === "PENDIENTE" && (!v.repartidor || v.repartidor.id === usuarioId))
    .map((v) => v.id);
}

/**
 * Los que llegaron desde la última vez. La primera carga (`antes` null) no
 * trae nada nuevo: lo que ya estaba asignado al abrir la pantalla no es un
 * aviso, y sonar al entrar sería ruido.
 */
export function llegados(antes: ReadonlySet<number> | null, ahora: number[]): number[] {
  if (!antes) return [];
  return ahora.filter((id) => !antes.has(id));
}

/**
 * El aviso de pedido nuevo con la pantalla abierta (18-nov): cuando en un
 * refresco aparece un pedido por entregar que antes no estaba, suena el mismo
 * aviso de los pedidos web y se cuenta para el cartel de arriba. El sonido
 * necesita un toque previo en la página (lo resuelve `contador.ts`); si no
 * puede sonar, queda el cartel.
 */
export function useAvisoPedidoNuevo(lista: Venta[] | null, usuarioId: number | null | undefined) {
  const conocidos = useRef<Set<number> | null>(null);
  const [nuevos, setNuevos] = useState(0);

  useEffect(() => {
    if (!lista) return;
    const ahora = pendientesDe(lista, usuarioId);
    const recien = llegados(conocidos.current, ahora);
    conocidos.current = new Set(ahora);
    if (recien.length > 0) sonarPedido();
    // Nunca más nuevos que los que siguen por entregar: uno que se canceló
    // antes de que lo viera no queda anunciado.
    setNuevos((n) => Math.min(n + recien.length, ahora.length));
  }, [lista, usuarioId]);

  const visto = useCallback(() => setNuevos(0), []);
  return { nuevos, visto };
}
