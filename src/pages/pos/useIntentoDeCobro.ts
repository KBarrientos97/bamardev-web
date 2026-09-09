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
 * El id se renueva SÓLO ante un éxito confirmado: renovarlo ante un error
 * rompería justamente la protección que da este hook.
 */
export function useIntentoDeCobro() {
  const id = useRef<string>(nuevo());

  /** El id a mandar. Se repite mientras el cobro no se haya concretado. */
  const actual = useCallback(() => id.current, []);

  /**
   * La venta quedó registrada: el próximo cobro es otra venta y necesita otra
   * identidad. Llamar sólo ante un éxito.
   */
  const registrado = useCallback(() => {
    id.current = nuevo();
  }, []);

  return { actual, registrado };
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
