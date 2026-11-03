import { ApiError } from "../api";
import type { DetalleVentaInput, Producto } from "../../types";
import { almacenEnMemoria, almacenIndexedDb, type Almacen } from "./almacen";
import { ventaSinInternet } from "./modo";
import { ambitoSesion } from "./sesionLocal";

/**
 * Lo último que se leyó del servidor, para abrir el POS sin señal. Port de
 * `CacheLectura.kt` (Android): con red se pide y se guarda la copia; si no hay
 * red, se usa la copia; si tampoco hay copia, se avisa que hay que conectarse
 * una vez.
 *
 * Sólo en la app instalada del iPhone (`ventaSinInternet`): en el navegador
 * común es exactamente el pedido de siempre, sin guardar nada.
 */

let almacen: Almacen = typeof indexedDB === "undefined" ? almacenEnMemoria() : almacenIndexedDb;

/** Para los tests. */
export function usarAlmacenCopias(a: Almacen) {
  almacen = a;
}

const claveDe = (ambito: string, nombre: string) => `copia:${ambito}:${nombre}`;

/** La copia del catálogo es por sucursal: de ahí salen el precio y el stock. */
export const claveCatalogo = (almacenId: number | null) => `productos:${almacenId ?? "todos"}`;

export const SIN_COPIA =
  "Sin conexión y sin datos guardados. Conectate al menos una vez para usar el modo offline.";

export async function conCopia<T>(nombre: string, pedir: () => Promise<T>): Promise<T> {
  if (!ventaSinInternet()) return pedir();
  const ambito = ambitoSesion();
  if (!ambito) return pedir();
  try {
    const datos = await pedir();
    // Guardar no puede romper la pantalla: si el disco falla, se sigue online.
    almacen.guardar(claveDe(ambito, nombre), datos).catch(() => {});
    return datos;
  } catch (e) {
    // Sólo la falta de red usa la copia. Un 403 o un 500 son respuestas del
    // servidor: mostrar datos viejos ahí escondería el problema.
    if (!(e instanceof ApiError) || e.status !== 0) throw e;
    const copia = await almacen.leer<T>(claveDe(ambito, nombre)).catch(() => undefined);
    if (copia === undefined) throw new ApiError(SIN_COPIA, 0);
    return copia;
  }
}

/**
 * Después de una venta encolada, el stock de la copia baja lo vendido: si no,
 * al recargar el catálogo sin señal volvía el stock de antes y el cajero podía
 * vender lo que ya no hay. Android lo descuenta en memoria
 * (`descontarVendidos`); acá la "memoria" del catálogo es la copia. Cuando
 * vuelve la red, la primera lectura la pisa con el stock real.
 *
 * Todo menos el elaborado (SERVICIO), que no lleva stock: el combo también
 * baja, porque tiene su PROPIO stock y el backend lo descuenta al vender (la
 * receta no descuenta nada). Antes sólo bajaba el almacenable, y sin señal la
 * copia seguía ofreciendo los combos que ya se habían vendido. Es la regla de
 * `controlaStock` en el carrito y de `PuntoVentaCatalogoViewModel.descontar`
 * en la app.
 */
export async function descontarDeLaCopia(nombre: string, detalles: DetalleVentaInput[]) {
  const ambito = ambitoSesion();
  if (!ambito) return;
  const k = claveDe(ambito, nombre);
  const catalogo = await almacen.leer<Producto[]>(k).catch(() => undefined);
  if (!Array.isArray(catalogo)) return;
  const vendido = new Map<number, number>();
  for (const d of detalles) vendido.set(d.productoId, (vendido.get(d.productoId) ?? 0) + d.cantidad);
  const nuevo = catalogo.map((p) =>
    p.tipoProducto !== "SERVICIO" && vendido.has(p.id)
      ? { ...p, stockTotal: Math.max(0, p.stockTotal - (vendido.get(p.id) ?? 0)) }
      : p,
  );
  await almacen.guardar(k, nuevo).catch(() => {});
}

/** La copia tal cual, sin pedir nada (para armar el ticket de una venta encolada). */
export async function leerCopia<T>(nombre: string): Promise<T | undefined> {
  const ambito = ambitoSesion();
  if (!ambito) return undefined;
  return almacen.leer<T>(claveDe(ambito, nombre)).catch(() => undefined);
}
