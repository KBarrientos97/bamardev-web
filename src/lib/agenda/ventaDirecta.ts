import type { Carrito, LineaCarrito } from "../../pages/pos/useCarrito";
import type { DetalleVentaInput, Producto } from "../../types";
import type { Recurso } from "./tiposConfigAgenda";
import type { PaqueteDelCliente } from "./tiposSpa";

/**
 * Venta directa en el POS con profesional (N2-13, PLAN-DESARROLLO-BELLEZA §12
 * punto 7): un servicio que se cobra sin pasar por una cita —el cliente entró,
 * se cortó y paga— lleva quién lo hizo. Con eso la línea cobra el precio
 * propio del profesional, le congela su comisión y el cobro le ofrece la
 * propina, exactamente como el cobro de una cita: la venta manda `recursoId`
 * por línea y el backend hace el resto.
 *
 * En el mostrador casi siempre atiende una sola persona: se elige UNA para
 * toda la venta y, si hace falta, se cambia por servicio. Lo de "toda la
 * venta" vale para los servicios. Un producto de reventa (un champú) lleva a
 * alguien sólo si se lo elige en su línea, y sólo entre quienes cobran % de
 * productos (QA DIA-07): así su comisión de venta se genera, y una venta de
 * mostrador sin vendedor sigue saliendo sin nadie. Un paquete nunca lleva.
 *
 * Piezas puras, sin pantalla: el POS las usa sólo en un negocio con agenda.
 */

/** Un profesional que se puede elegir en el POS, con sus precios propios. */
export interface ProfesionalPos {
  id: number;
  nombre: string;
  /** Precio propio por servicio (fase 2). Sólo los que lo tienen. */
  precios: Record<number, number>;
  /** Los servicios que hace (para "Por servicio", QA VER-04). */
  servicioIds: number[];
  /** Cobra % sobre los productos de reventa: se le puede asignar uno (QA DIA-07). */
  comisionaProductos: boolean;
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
      return {
        id: r.id,
        nombre: r.nombre,
        precios,
        servicioIds: r.servicioIds ?? [],
        comisionaProductos: r.comisionProductoPct != null,
      };
    });
}

/** ¿Esta línea lleva profesional? Sólo un servicio que no es un paquete. */
export function llevaProfesional(p: Producto): boolean {
  return p.tipoProducto === "SERVICIO" && !p.esPaquete;
}

/** Un producto de reventa (ni servicio ni paquete): lleva vendedor sólo si se elige. */
export function esReventa(p: Producto): boolean {
  return p.tipoProducto !== "SERVICIO" && !p.esPaquete;
}

/** Quién hizo este servicio: el suyo si se cambió, si no el de toda la venta. */
export function profesionalDe(productoId: number, a: AsignacionProfesional): number | null {
  return productoId in a.porServicio ? a.porServicio[productoId] : a.general;
}

/**
 * El profesional de una línea cualquiera: el servicio sigue al de toda la
 * venta; el producto de reventa, sólo al suyo; el paquete, a nadie.
 */
export function profesionalDeLinea(p: Producto, a: AsignacionProfesional): number | null {
  if (llevaProfesional(p)) return profesionalDe(p.id, a);
  if (esReventa(p)) return a.porServicio[p.id] ?? null;
  return null;
}

/**
 * Para "Por servicio" (QA VER-04): quienes hacen ese servicio, más el que ya
 * tiene la línea (si no, el select no lo podría mostrar). Si nadie lo tiene
 * cargado, todos: no se frena una venta por la configuración de la agenda.
 */
export function profesionalesDelServicio(
  servicioId: number,
  profesionales: ProfesionalPos[],
  actual: number | null,
): ProfesionalPos[] {
  const lo = profesionales.filter((p) => p.servicioIds.includes(servicioId) || p.id === actual);
  return lo.some((p) => p.servicioIds.includes(servicioId)) ? lo : profesionales;
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
    const id = profesionalDeLinea(l.producto, a);
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

// ── Sesiones de paquete sin cita (QA DIA-08) ────────────────────────────────

/** Un servicio del carrito que el paquete del cliente cubre. */
export interface SesionOfrecida {
  productoId: number;
  descripcion: string;
  cantidad: number;
  paquete: string;
  /** Las que le quedan después de usar éstas. */
  restantes: number;
  ultimoDia: string;
}

/**
 * La clienta con bono que llega sin cita: qué servicios del carrito cubre un
 * paquete suyo vigente y con saldo (el que vence antes, como lo consume el
 * backend). La línea entera va con el paquete: hace falta un paquete con
 * tantas sesiones como la cantidad.
 */
export function sesionesParaLaVenta(lineas: LineaCarrito[], paquetes: PaqueteDelCliente[]): SesionOfrecida[] {
  const usables = paquetes
    .filter((p) => p.estado === "ACTIVO" && !p.vencido)
    .sort((a, b) => a.venceEn.localeCompare(b.venceEn));
  const quedan = new Map<string, number>();
  const out: SesionOfrecida[] = [];
  for (const l of lineas) {
    if (!llevaProfesional(l.producto) || !Number.isInteger(l.cantidad)) continue;
    for (const p of usables) {
      const item = p.items.find((i) => i.servicioId === l.producto.id);
      if (!item) continue;
      const clave = `${p.id}:${item.servicioId}`;
      const restantes = quedan.get(clave) ?? item.restantes;
      if (restantes < l.cantidad) continue;
      quedan.set(clave, restantes - l.cantidad);
      out.push({
        productoId: l.producto.id,
        descripcion: l.producto.nombre,
        cantidad: l.cantidad,
        paquete: p.nombre,
        restantes: restantes - l.cantidad,
        ultimoDia: p.ultimoDia,
      });
      break;
    }
  }
  return out;
}

/**
 * El carrito con las sesiones elegidas: esas líneas van a 0 y con
 * `usarPaquete` (el backend descuenta la sesión y comisiona sobre lo que vale).
 * Sin ninguna elegida devuelve el MISMO carrito.
 */
export function carritoConSesiones(carrito: Carrito, productoIds: number[]): Carrito {
  const usar = new Set(productoIds.filter((id) => carrito.lineas.some((l) => l.producto.id === id)));
  if (!usar.size) return carrito;
  let subtotal = 0;
  const lineas = carrito.lineas.map((l) => {
    const linea = usar.has(l.producto.id) ? { ...l, producto: { ...l.producto, precio: 0 } } : l;
    subtotal += linea.cantidad * linea.producto.precio;
    return linea;
  });
  return {
    ...carrito,
    lineas,
    subtotal,
    total: Math.round(subtotal * 100) / 100,
    aDetalles: (): DetalleVentaInput[] =>
      carrito
        .aDetalles()
        .map((d) => (usar.has(d.productoId) ? { ...d, precio: 0, usarPaquete: true } : d)),
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
