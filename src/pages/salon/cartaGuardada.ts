import { api } from "../../lib/api";
import type { Producto } from "../../types";

/**
 * La carta del salón, guardada en memoria para que "Agregar pedido" abra al
 * instante (UX nativa, 10-nov).
 *
 * Antes se pedía recién al tocar "Agregar pedido", y el mesero esperaba con la
 * ruedita delante del cliente. Ahora el panel la baja al entrar y cada vez que
 * vuelve al salón, y la pantalla del pedido arranca con esa copia mientras
 * pide la fresca (el stock cambia con cada mesa que pide): primero se ve,
 * después se actualiza.
 *
 * Vive sólo en memoria: al cerrar la app se pierde, y no guarda nada en el
 * celular.
 */
let guardada: Producto[] | null = null;
let enCamino: Promise<Producto[]> | null = null;

/** La última carta bajada, si hay. */
export function cartaGuardada(): Producto[] | null {
  return guardada;
}

/** Baja la carta (una sola vez a la vez) y la guarda. */
export function bajarCarta(): Promise<Producto[]> {
  if (enCamino) return enCamino;
  enCamino = api
    .cartaSalon()
    .then((c) => {
      guardada = c;
      return c;
    })
    .finally(() => {
      enCamino = null;
    });
  return enCamino;
}

/** Para adelantarla sin esperar: un error acá no le importa a nadie. */
export function precargarCarta(): void {
  bajarCarta().catch(() => {});
}

/** Para los tests: arrancar sin carta guardada. */
export function olvidarCarta(): void {
  guardada = null;
  enCamino = null;
}
