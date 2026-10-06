import type { Carrito, LineaCarrito } from "../../pages/pos/useCarrito";
import type { DetalleVentaInput, Producto } from "../../types";
import type { Recurso } from "./tiposConfigAgenda";

/**
 * Venta directa en el POS con profesional (N2-13, PLAN-DESARROLLO-BELLEZA §12
 * punto 7): un servicio que se cobra sin pasar por una cita —el cliente entró,
 * se cortó y paga— lleva quién lo hizo. Con eso la línea cobra el precio
 * propio del profesional, le congela su comisión y el cobro le ofrece la
 * propina, exactamente como el cobro de una cita: la venta manda `recursoId`
 * por línea y el backend hace el resto.
 *
 * En el mostrador casi siempre atiende una sola persona: se elige UNA para
 * toda la venta y, si hace falta, se cambia por servicio. Sólo los servicios
 * llevan profesional (igual que lo que se suma en el cobro de una cita): un
 * champú de reventa o un paquete van sin nadie.
 *
 * Piezas puras, sin pantalla: el POS las usa sólo en un negocio con agenda.
 */

/** Un profesional que se puede elegir en el POS, con sus precios propios. */
export interface ProfesionalPos {
  id: number;
  nombre: string;
  /** Precio propio por servicio (fase 2). Sólo los que lo tienen. */
  precios: Record<number, number>;
}

/** Quién hizo qué: uno para toda la venta y, si se cambió, por servicio. */
export interface AsignacionProfesional {
  /** El de toda la venta (null = nadie, la venta sale como siempre). */
  general: number | null;
  /** Por producto: el de esa línea en vez del general (null = nadie). */
  porServicio: Record<number, number | null>;
}

export const SIN_ASIGNAR: AsignacionProfesional = { general: null, porServicio: {} };

/**
 * Los profesionales que se ofrecen: activos, personas (no cabinas) y de la
 * sucursal de la caja (sin sucursales cargadas, de todas). En el orden de la
 * agenda.
 */
export function profesionalesParaPos(recursos: Recurso[], sucursalId: number | null): ProfesionalPos[] {
  return recursos
    .filter(
      (r) =>
        r.tipo === "PROFESIONAL" &&
        r.activo &&
        (sucursalId == null || !r.sucursalIds?.length || r.sucursalIds.includes(sucursalId)),
    )
    .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre))
    .map((r) => {
      const precios: Record<number, number> = {};
      for (const p of r.serviciosPropios ?? []) {
        if (p.precio != null) precios[p.servicioId] = Number(p.precio);
      }
      return { id: r.id, nombre: r.nombre, precios };
    });
}

/** ¿Esta línea lleva profesional? Sólo un servicio que no es un paquete. */
export function llevaProfesional(p: Producto): boolean {
  return p.tipoProducto === "SERVICIO" && !p.esPaquete;
}

/** Quién hizo este servicio: el suyo si se cambió, si no el de toda la venta. */
export function profesionalDe(productoId: number, a: AsignacionProfesional): number | null {
  return productoId in a.porServicio ? a.porServicio[productoId] : a.general;
}

/**
 * Lo que dice el selector de toda la venta (QA PER-07): el profesional de
 * todos los servicios si es uno solo, o "VARIOS" si "Por servicio" los
 * separó. Antes seguía diciendo el general aunque una línea fuera de otro.
 */
export function profesionalDeTodos(productoIds: number[], a: AsignacionProfesional): number | null | "VARIOS" {
  if (!productoIds.length) return a.general;
  const quienes = new Set(productoIds.map((id) => profesionalDe(id, a)));
  return quienes.size > 1 ? "VARIOS" : [...quienes][0];
}

/**
 * El carrito como lo cobra el backend: cada servicio con su profesional, al
 * precio propio de éste si lo tiene (el backend impone ese precio; mostrar el
 * de lista haría que los pagos no sumen y la venta rebote). Sin nadie
 * asignado devuelve el MISMO carrito, sin copiarlo: la venta de siempre.
 */
export function carritoConProfesional(
  carrito: Carrito,
  a: AsignacionProfesional,
  profesionales: ProfesionalPos[],
): Carrito {
  const porId = new Map(profesionales.map((p) => [p.id, p]));
  const de = (l: LineaCarrito) => {
    if (!llevaProfesional(l.producto)) return null;
    const id = profesionalDe(l.producto.id, a);
    return id != null ? (porId.get(id) ?? null) : null;
  };
  if (!carrito.lineas.some((l) => de(l) != null)) return carrito;

  let subtotal = 0;
  const lineas = carrito.lineas.map((l) => {
    const propio = de(l)?.precios[l.producto.id];
    const linea = propio != null && propio !== l.producto.precio
      ? { ...l, producto: { ...l.producto, precio: propio } }
      : l;
    subtotal += linea.cantidad * linea.producto.precio;
    return linea;
  });
  const precio = new Map(lineas.map((l) => [l.producto.id, l.producto.precio]));
  const recurso = new Map(carrito.lineas.map((l) => [l.producto.id, de(l)?.id]));
  return {
    ...carrito,
    lineas,
    subtotal,
    total: Math.round(subtotal * 100) / 100,
    aDetalles: (): DetalleVentaInput[] =>
      carrito.aDetalles().map((d) => {
        const recursoId = recurso.get(d.productoId);
        if (recursoId == null) return d;
        // El precio es informativo (lo impone el backend): se manda el que
        // se mostró, así no queda un aviso de "precio distinto" en el log.
        return { ...d, precio: precio.get(d.productoId) ?? d.precio, recursoId };
      }),
  };
}

/** Los profesionales de la venta, sin repetir: a quiénes se les deja propina. */
export function profesionalesDeLaVenta(
  carrito: Carrito,
  a: AsignacionProfesional,
  profesionales: ProfesionalPos[],
): { id: number; nombre: string }[] {
  const ids = new Set<number>();
  for (const l of carrito.lineas) {
    if (!llevaProfesional(l.producto)) continue;
    const id = profesionalDe(l.producto.id, a);
    if (id != null) ids.add(id);
  }
  return profesionales.filter((p) => ids.has(p.id)).map((p) => ({ id: p.id, nombre: p.nombre }));
}

/**
 * La asignación sobrevive a un F5 igual que el carrito (sessionStorage): si
 * no, recargar a mitad de la venta dejaba los servicios sin profesional y la
 * venta salía sin comisión, sin avisar.
 */
const CLAVE = "bamar.profesionalVenta";

export function guardarAsignacion(a: AsignacionProfesional): void {
  try {
    if (a.general == null && !Object.keys(a.porServicio).length) sessionStorage.removeItem(CLAVE);
    else sessionStorage.setItem(CLAVE, JSON.stringify(a));
  } catch {
    /* sin storage se sigue igual: es una comodidad */
  }
}

export function leerAsignacion(): AsignacionProfesional {
  try {
    const crudo = sessionStorage.getItem(CLAVE);
    if (!crudo) return SIN_ASIGNAR;
    const a = JSON.parse(crudo) as AsignacionProfesional;
    return {
      general: typeof a?.general === "number" ? a.general : null,
      porServicio: a?.porServicio && typeof a.porServicio === "object" ? a.porServicio : {},
    };
  } catch {
    return SIN_ASIGNAR;
  }
}
