import type { DetalleVentaInput, Producto } from "../../types";
import type { CarritoCita } from "./tiposAgenda";

/**
 * Cobro de la cita en caja (PLAN-AGENDA-BELLEZA §10), del lado de la web.
 *
 * "Cobrar" en la agenda no cobra nada: abre el POS con el carrito de la cita
 * precargado. El cobro es la venta de siempre más `citaId` y el profesional de
 * cada línea; el backend la completa en la misma transacción. Acá viven las
 * piezas puras de ese viaje, para probarlas sin pantalla.
 */

/** Adónde lleva "Cobrar": el POS, que lee la cita del `?cita=`. */
export function rutaCobroCita(citaId: number): string {
  return `/pos?cita=${citaId}`;
}

/** El `?cita=` de la URL del POS, o null si no hay (o no es un id). */
export function citaDeLaUrl(buscar: string | URLSearchParams): number | null {
  const params = typeof buscar === "string" ? new URLSearchParams(buscar) : buscar;
  const id = Number(params.get("cita"));
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Los productos del catálogo que hay que cargar al carrito, uno por línea de
 * la cita (dos líneas del mismo servicio son dos unidades). `faltan` son los
 * servicios que el catálogo ya no tiene —uno eliminado después de agendar—:
 * la pantalla lo avisa en vez de cobrar de menos sin decir nada.
 */
export function productosDeLaCita(
  cita: CarritoCita,
  catalogo: Producto[],
): { productos: Producto[]; faltan: string[] } {
  const porId = new Map(catalogo.map((p) => [p.id, p]));
  const productos: Producto[] = [];
  const faltan: string[] = [];
  for (const l of cita.lineas) {
    const p = porId.get(l.productoId);
    if (p) productos.push(p);
    else faltan.push(l.descripcion);
  }
  return { productos, faltan };
}

/**
 * Le pone a cada detalle el profesional que hizo ese servicio.
 *
 * El carrito junta por producto (dos "Corte" son una línea de 2), pero cada
 * corte pudo hacerlo otra persona y la comisión es de cada una: una línea con
 * varios profesionales se parte en una por unidad. Lo que se agregó de más en
 * el POS (otra unidad, un producto de reventa) va sin profesional.
 */
export function detallesConProfesional(
  detalles: DetalleVentaInput[],
  cita: CarritoCita | null,
): DetalleVentaInput[] {
  if (!cita) return detalles;
  const pendientes = new Map<number, number[]>();
  for (const l of cita.lineas) {
    if (l.recursoId == null) continue;
    pendientes.set(l.productoId, [...(pendientes.get(l.productoId) ?? []), l.recursoId]);
  }
  const salida: DetalleVentaInput[] = [];
  for (const d of detalles) {
    const cola = pendientes.get(d.productoId);
    if (!cola?.length) {
      salida.push(d);
      continue;
    }
    // Una fracción no se parte: va entera con el primero.
    if (d.cantidad < 1 || !Number.isInteger(d.cantidad)) {
      salida.push({ ...d, recursoId: cola.shift() });
      continue;
    }
    let resto = d.cantidad;
    while (resto > 0 && cola.length) {
      const recursoId = cola.shift()!;
      // Las unidades seguidas del mismo profesional van juntas.
      let n = 1;
      while (n < resto && cola[0] === recursoId) {
        cola.shift();
        n++;
      }
      salida.push({ ...d, cantidad: n, recursoId });
      resto -= n;
    }
    if (resto > 0) salida.push({ ...d, cantidad: resto });
  }
  return salida;
}

/**
 * ¿La venta sigue cobrando la cita? Sólo si en el carrito quedó al menos uno
 * de sus servicios: si la cajera los sacó todos, mandar `citaId` completaría
 * la cita con una venta que no la cobra.
 */
export function citaQueCobra(
  detalles: DetalleVentaInput[],
  cita: CarritoCita | null,
): number | null {
  if (!cita) return null;
  const suyos = new Set(cita.lineas.map((l) => l.productoId));
  return detalles.some((d) => suyos.has(d.productoId)) ? cita.citaId : null;
}

/**
 * La cita que se está cobrando sobrevive a un F5, igual que el carrito
 * (`useCarrito` guarda las líneas en sessionStorage): sin esto, recargar a
 * mitad del cobro dejaba el carrito lleno pero sin cita, y la venta no la
 * completaba.
 */
const CLAVE = "bamar.citaCobrando";

export function guardarCitaCobrando(cita: CarritoCita | null): void {
  try {
    if (cita) sessionStorage.setItem(CLAVE, JSON.stringify(cita));
    else sessionStorage.removeItem(CLAVE);
  } catch {
    /* sin storage se sigue igual: es una comodidad */
  }
}

export function leerCitaCobrando(): CarritoCita | null {
  try {
    const crudo = sessionStorage.getItem(CLAVE);
    if (!crudo) return null;
    const c = JSON.parse(crudo) as CarritoCita;
    return typeof c?.citaId === "number" && Array.isArray(c.lineas) ? c : null;
  } catch {
    return null;
  }
}
