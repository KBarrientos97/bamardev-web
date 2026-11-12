import { qs, request } from "../../lib/api";
import type { Producto } from "../../types";
import { controlaStock, paraVender } from "../pos/useCarrito";
import { conUnidad } from "./medicamento";
import { sePuedeVender } from "./ventaFarmacia";

/**
 * Los equivalentes de un medicamento: mismo principio activo y misma
 * concentración, de otro laboratorio (#11 del informe de farmacia, 11-nov).
 *
 * "No hay BAGÓ, hay INTI a Bs 0,45" es la pregunta más frecuente del
 * mostrador, y hasta ahora quien atendía buscaba la droga a mano y comparaba
 * a ojo entre los resultados. El backend (`GET /productos/:id/equivalentes`)
 * los devuelve en la misma forma que la búsqueda del mostrador —precio y stock
 * de la sucursal, lotes vencidos aparte— y sin costo para quien no lo ve.
 * Lista vacía si el medicamento no tiene principio activo cargado o no hay
 * otro igual: no es un error.
 *
 * Vive acá y no en `lib/api.ts` por lo mismo que `billar/api.ts`: es de un
 * rubro, y la pollería que ya trabaja no tiene por qué cargar el catálogo de
 * la farmacia.
 */

/**
 * Pide los equivalentes con el stock y el precio de esa sucursal. Sin
 * sucursal, el backend usa la de quien pregunta (o todo el negocio, si no
 * pertenece a ninguna).
 *
 * `async` a propósito: cualquier falla antes de salir a la red llega como
 * rechazo, que la pantalla muestra como error con Reintentar, en vez de
 * reventar el efecto que la pidió.
 */
export async function pedirEquivalentes(
  id: number,
  sucursalId?: number | null,
): Promise<Producto[]> {
  return request<Producto[]>(`/productos/${id}/equivalentes${qs({ sucursalId })}`);
}

/** Si la ficha tiene la droga cargada: sin ella no hay equivalentes que pedir. */
export function tienePrincipioActivo(p: Pick<Producto, "principioActivo">): boolean {
  return !!p.principioActivo?.trim();
}

/**
 * "Ibuprofeno 400 mg": la droga y la concentración, que es lo que los
 * equivalentes comparten. Sin concentración cargada, la droga sola.
 */
export function drogaDe(p: Pick<Producto, "principioActivo" | "concentracion">): string {
  return [p.principioActivo?.trim(), p.concentracion?.trim()].filter(Boolean).join(" ");
}

/**
 * El orden en que se ofrecen: primero lo que se puede vender ahora, y dentro
 * de cada grupo el más barato antes. La pregunta es "¿qué tenés en vez de
 * éste?", y la respuesta útil empieza por lo que hay y sale menos.
 *
 * Lo agotado se sigue mostrando, al final: "de INTI tampoco hay" también es
 * información (y de ahí sale el encargo), pero no puede encabezar la lista,
 * que es lo que pasaba ordenando sólo por precio: el más barato era justo el
 * que no había.
 */
export function ordenarEquivalentes(lista: Producto[]): Producto[] {
  return [...lista].sort((a, b) => {
    const grupo = Number(!sePuedeVender(a)) - Number(!sePuedeVender(b));
    if (grupo !== 0) return grupo;
    if (a.precio !== b.precio) return a.precio - b.precio;
    return a.nombre.localeCompare(b.nombre, "es");
  });
}

/**
 * Lo que se le dice al cliente de cuánto hay de un equivalente. Mismo criterio
 * que la tarjeta del punto de venta: lo vencido sigue en el estante pero no
 * se vende, así que cuenta como "no hay" y dice por qué.
 */
export function textoStock(p: Producto): { texto: string; sinStock: boolean } {
  const hay = paraVender(p);
  const vencidas = p.stockVencido ?? 0;
  if (controlaStock(p) && hay <= 0) {
    return { texto: vencidas > 0 ? "Vencido" : "Agotado", sinStock: true };
  }
  if (p.disponible === false) return { texto: "No se vende acá", sinStock: true };
  return { texto: conUnidad(hay, p.unidadMedida?.nombre), sinStock: false };
}
