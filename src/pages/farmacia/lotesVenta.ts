import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import type { LoteParaVender, LotesDelArticulo } from "../../types";

/**
 * Cómo se reparte una cantidad entre los lotes, igual que la venta.
 *
 * Es el `repartirFefo` del servidor (`src/lote/fefo.ts`) sin el orden: los
 * lotes ya llegan en orden FEFO. Se calcula acá para que el renglón cambie al
 * tocar la cantidad sin volver a preguntar: 5 cajas salen de un lote, 30 ya
 * se llevan el resto del siguiente.
 *
 * `sinLote` es lo que los lotes no cubren: stock cargado antes de manejar
 * lote. La venta no se frena por eso —el servidor tampoco la frena—, pero se
 * dice.
 */
export function repartirLotes(
  lotes: LoteParaVender[],
  cantidad: number,
): { reparto: { lote: LoteParaVender; cantidad: number }[]; sinLote: number } {
  const reparto: { lote: LoteParaVender; cantidad: number }[] = [];
  let falta = cantidad;
  for (const lote of lotes) {
    if (falta <= 0) break;
    const toma = Math.min(lote.cantidad, falta);
    if (toma > 0) {
      reparto.push({ lote, cantidad: toma });
      falta -= toma;
    }
  }
  return { reparto, sinLote: Math.max(0, falta) };
}

/**
 * Los lotes de cada artículo del carrito en la sucursal de la caja.
 *
 * Se pide de nuevo sólo cuando cambia QUÉ hay en el carrito, no cuánto: la
 * cantidad se reparte acá con `repartirLotes`. Mientras llega la respuesta
 * se sigue mostrando la anterior, para que el renglón no parpadee al sumar
 * otro artículo. Si falla, el carrito sigue sin la línea del lote: es un dato
 * para quien atiende, no una condición para cobrar.
 *
 * Devuelve null mientras no hay nada que mostrar. Cada artículo trae sus
 * lotes vigentes y cuántas unidades vencidas quedan en la sucursal.
 */
export function useLotesDelCarrito(
  ids: number[],
  sucursalId: number | null | undefined,
  activo: boolean,
): Map<number, LotesDelArticulo> | null {
  // El carrito cambia de arreglo en cada render: la clave es lo que importa.
  const clave = useMemo(() => [...new Set(ids)].sort((a, b) => a - b).join(","), [ids]);
  const [lotes, setLotes] = useState<Map<number, LotesDelArticulo> | null>(null);

  useEffect(() => {
    if (!activo || sucursalId == null || !clave) return;
    let vivo = true;
    api
      .lotesParaVender(clave.split(",").map(Number), sucursalId)
      .then((lista) => {
        if (vivo) setLotes(new Map(lista.map((x) => [x.productoId, x])));
      })
      .catch(() => {
        if (vivo) setLotes(null);
      });
    return () => {
      vivo = false;
    };
  }, [activo, sucursalId, clave]);

  return activo && clave ? lotes : null;
}
