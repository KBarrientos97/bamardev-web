import { useCallback, useRef } from "react";

/**
 * Identidad del **cobro** en curso, estable entre reintentos.
 *
 * Port de `IntentoDeCobro.kt` (Android). Viaja al backend como
 * `clienteRequestId` y es lo que le permite deduplicar: si un intento anterior
 * alcanzó a grabar la venta, el reintento con el mismo id devuelve esa venta en
 * vez de crear otra y volver a descontar stock.
 *
 * Por qué hace falta acá y no alcanza con `disabled={enviando}`: ese flag cubre
 * el doble clic, pero no el reintento MANUAL. Si el servidor contesta con un
 * error, el cajero lo ve, toca "Confirmar" otra vez y —sin este id— sale una
 * venta nueva. Para un 4xx o un 502 da igual (no se creó nada), pero un **504**
 * es un corte del proxy con el backend todavía trabajando: ahí el reintento
 * duplica la venta y descuenta el stock dos veces. Lo mismo vale para el fallo
 * de red, donde la respuesta se pierde pero el POST pudo haber llegado.
 *
 * El id se renueva ante un éxito confirmado, o cuando lo que se cobra ya no
 * es lo mismo (`huella`): renovarlo ante un error con el mismo carrito
 * rompería justamente la protección que da este hook. Pero con OTRO carrito
 * el mismo id era peor: si el intento fallido sí se grabó, el backend
 * devolvía esa venta vieja como si fuera la nueva, el ticket decía
 * "registrada" y la venta nueva no existía. Android lo resuelve igual: volver
 * al carrito a corregir estrena id (ver `IntentoDeCobro.kt`).
 */
export function useIntentoDeCobro() {
  const id = useRef<string>(nuevo());
  /** De qué cobro es el id vigente; null = todavía no se mandó nada. */
  const huellaDelId = useRef<string | null>(null);

  /**
   * El id a mandar. Se repite mientras el cobro no se haya concretado y lo
   * que se cobra (`huella`: las líneas de la venta, o la mesa) sea lo mismo.
   */
  const actual = useCallback((huella?: string) => {
    if (huella !== undefined) {
      if (huellaDelId.current !== null && huellaDelId.current !== huella) id.current = nuevo();
      huellaDelId.current = huella;
    }
    return id.current;
  }, []);

  /**
   * La venta quedó registrada: el próximo cobro es otra venta y necesita otra
   * identidad. Llamar sólo ante un éxito.
   */
  const registrado = useCallback(() => {
    id.current = nuevo();
    huellaDelId.current = null;
  }, []);

  return { actual, registrado };
}

/**
 * Lo que identifica QUÉ se cobra: las líneas (artículo, cantidad, consumo) y
 * el tipo de pedido. Los pagos no entran a propósito: reintentar con otro
 * monto entregado es el mismo cobro.
 */
export function huellaDeCobro(detalles: unknown, tipoPedido?: string): string {
  return JSON.stringify([tipoPedido ?? null, detalles]);
}

/**
 * `crypto.randomUUID` sólo existe en contexto seguro (https o localhost). El
 * fallback no necesita ser criptográfico: alcanza con que dos cobros del mismo
 * dispositivo no colisionen, y el backend indexa el valor por negocio.
 */
function nuevo(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `web-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
