import { aCentavos, esPositivo } from "../../lib/dinero";
import { fmtMoney } from "../../lib/format";
import type { PagoInput } from "../../types";
import type { Mesa } from "../../types/salon";
import { consumoDeMesa, etiquetaMesa } from "./logicaSalon";

/**
 * Lo que comparten los dos cobros de una mesa: el de la caja (el POS) y el del
 * mesero que la cobra él mismo (`CobrarMesa`). Es la misma plata y el mismo
 * endpoint (POST salon/mesas/:id/cobrar), así que el cuerpo y la lectura del
 * error salen de un solo lugar y no pueden discrepar.
 */

/**
 * El cuerpo del cobro de una mesa.
 *
 *  - `totalEsperado`: el total que se cobró en pantalla. Con él, si el mesero
 *    le sumó algo a la mesa en el medio, el backend frena con "cambió mientras
 *    cobrabas" y no con "Los pagos (197) deben sumar el total de la venta
 *    (217)", que es cierto y no le explica a nadie qué pasó.
 *  - `propina`: sólo si hay. No entra al total ni al cajón: va al turno del
 *    mesero (Mi turno, Ventas por mesero). Ningún cobro de la web la mandaba,
 *    así que esas pantallas sólo mostraban las propinas cargadas desde la app.
 */
export function cuerpoCobroDeMesa(
  total: number,
  pagos: PagoInput[],
  propina: number | undefined,
  clienteRequestId: string,
) {
  return {
    pagos,
    ...(propina != null && esPositivo(propina) ? { propina: aCentavos(propina) } : {}),
    totalEsperado: aCentavos(total),
    clienteRequestId,
  };
}

/**
 * ¿El backend frenó el cobro porque la cuenta cambió mientras se cobraba?
 *
 * Es un 400 sin código propio ("La mesa M1 cambió mientras cobrabas: ahora son
 * Bs 217.00…", `SalonService.cobrar`), así que se reconoce por el texto. Si un
 * día el texto cambia no se rompe nada: queda el mensaje del backend, que
 * también lo explica, sólo que sin la cuenta recargada.
 */
export function esCuentaCambiada(e: unknown): boolean {
  return e instanceof Error && /cambi[oó] mientras cobrabas/i.test(e.message);
}

/** El aviso, con la cuenta ya recargada: cuánto es ahora y qué hacer. */
export function avisoCuentaCambiada(mesa: Mesa, quien: "caja" | "mesero"): string {
  const queCambio = `La cuenta de ${etiquetaMesa(mesa)} cambió mientras cobrabas: ahora son ${fmtMoney(consumoDeMesa(mesa))}.`;
  return quien === "caja"
    ? `${queCambio} Revisá el total con el cliente y cobrá de nuevo.`
    : `${queCambio} Revisala con el cliente antes de cobrar.`;
}
