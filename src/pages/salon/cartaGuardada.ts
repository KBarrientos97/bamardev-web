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
// Una por local (PLAN-SUCURSAL-TOTAL, etapa 5): el de organización toma pedidos
// de mesas de distintos locales y cada uno tiene sus precios y su stock. La
// clave 0 es "sin local": la carta por defecto, la del propio local de quien la
// pide (el backend le fuerza el suyo) o el consolidado.
let guardadas = new Map<number, Producto[]>();
let enCamino = new Map<number, Promise<Producto[]>>();

const claveDe = (sucursalId?: number | null) => sucursalId ?? 0;

/** La última carta bajada, si hay. */
export function cartaGuardada(sucursalId?: number | null): Producto[] | null {
  return guardadas.get(claveDe(sucursalId)) ?? null;
}

/** Baja la carta (una sola vez a la vez por local) y la guarda. */
export function bajarCarta(sucursalId?: number | null): Promise<Producto[]> {
  const clave = claveDe(sucursalId);
  const viva = enCamino.get(clave);
  if (viva) return viva;
  const promesa = api
    .cartaSalon(sucursalId)
    .then((c) => {
      guardadas.set(clave, c);
      return c;
    })
    .finally(() => {
      enCamino.delete(clave);
    });
  enCamino.set(clave, promesa);
  return promesa;
}

/** Para adelantarla sin esperar: un error acá no le importa a nadie. */
export function precargarCarta(): void {
  bajarCarta().catch(() => {});
}

/** Para los tests: arrancar sin carta guardada. */
export function olvidarCarta(): void {
  guardadas = new Map();
  enCamino = new Map();
}
