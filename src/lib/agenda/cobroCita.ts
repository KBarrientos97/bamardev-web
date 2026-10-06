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
 * El producto que representa un servicio de la cita que el catálogo del POS ya
 * no trae (lo desactivaron después de agendar). Se arma con lo que manda el
 * carrito de la cita: id, nombre y precio vigente. Un servicio no lleva stock.
 */
function productoDeLinea(l: CarritoCita["lineas"][number]): Producto {
  return {
    id: l.productoId,
    nombre: l.descripcion,
    descripcion: null,
    codBarra: null,
    tipoProducto: "SERVICIO",
    precio: l.precio,
    costo: 0,
    stockMinimo: 0,
    // No está habilitado para la venta suelta: entra sólo porque es de esta
    // cita, y el backend lo acepta en una venta con su `citaId`.
    habilitado: false,
    icono: null,
    categoria: null,
    unidadMedida: null,
    stockTotal: 0,
    componentes: [],
    principioActivo: null,
    concentracion: null,
    formaFarmaceutica: null,
    laboratorio: null,
    registroSanitario: null,
    condicionVenta: "LIBRE",
    manejaLote: false,
    controlado: false,
  };
}

/**
 * El catálogo del POS más los servicios de la cita que no están en él. Es lo
 * que se le pasa al carrito para que esas líneas también vuelvan después de un
 * F5 (el carrito rehidrata por id contra el catálogo). Sin cita, el mismo
 * catálogo, sin copiarlo.
 */
export function catalogoConCita(catalogo: Producto[], cita: CarritoCita | null): Producto[] {
  if (!cita) return catalogo;
  const ids = new Set(catalogo.map((p) => p.id));
  const extra: Producto[] = [];
  for (const l of cita.lineas) {
    if (ids.has(l.productoId)) continue;
    ids.add(l.productoId);
    extra.push(productoDeLinea(l));
  }
  return extra.length ? [...catalogo, ...extra] : catalogo;
}

/**
 * Los productos que hay que cargar al carrito, uno por línea de la cita (dos
 * líneas del mismo servicio son dos unidades).
 *
 * Un servicio que el catálogo ya no trae —lo desactivaron después de
 * agendar— se arma igual con lo que manda el carrito de la cita (QA A-03):
 * antes quedaba en "faltan" y la cita no se podía cobrar nunca. Va en
 * `desactivados` sólo para poder decirlo.
 */
export function productosDeLaCita(
  cita: CarritoCita,
  catalogo: Producto[],
): { productos: Producto[]; desactivados: string[] } {
  const porId = new Map(catalogo.map((p) => [p.id, p]));
  const productos: Producto[] = [];
  const desactivados: string[] = [];
  for (const l of cita.lineas) {
    const p = porId.get(l.productoId);
    if (p) {
      productos.push(p);
    } else {
      productos.push(productoDeLinea(l));
      desactivados.push(l.descripcion);
    }
  }
  return { productos, desactivados };
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

/** Lo que una venta deja sin cobrar de la cita (QA A-02). */
export interface CoberturaCita {
  /** ¿La venta cubre la cita: todos sus servicios y al menos su total? */
  cubre: boolean;
  /** Los servicios de la cita que ya no están en el carrito, uno por unidad. */
  faltan: string[];
  /** Lo que se va a cobrar. */
  cobrado: number;
  /** El total de la cita, como lo armó el backend. */
  totalCita: number;
}

/**
 * ¿La venta cubre la cita que va a completar?
 *
 * Se compara por servicio como multiconjunto (dos cortes agendados piden dos
 * en el carrito) y por plata (cobrar menos que el total de la cita). Lo que
 * se sume de más —un producto, otra unidad— no la descubre. `null` si la venta
 * no cobra ninguna cita: sin cita, o si la cajera sacó todos sus servicios
 * (ahí `citaQueCobra` ya no manda el `citaId`).
 */
export function coberturaCita(
  detalles: DetalleVentaInput[],
  cita: CarritoCita | null,
  cobrado: number,
): CoberturaCita | null {
  if (!cita || citaQueCobra(detalles, cita) == null) return null;
  const enCarrito = new Map<number, number>();
  for (const d of detalles) {
    enCarrito.set(d.productoId, (enCarrito.get(d.productoId) ?? 0) + d.cantidad);
  }
  const faltan: string[] = [];
  for (const l of cita.lineas) {
    const quedan = enCarrito.get(l.productoId) ?? 0;
    if (quedan >= 1) enCarrito.set(l.productoId, quedan - 1);
    else faltan.push(l.descripcion);
  }
  // Medio centavo de tolerancia: los totales vienen de sumas de decimales.
  const deMenos = cobrado < cita.total - 0.005;
  return { cubre: faltan.length === 0 && !deMenos, faltan, cobrado, totalCita: cita.total };
}

/**
 * La cobertura de una cita con lo que trajeron las otras ramas de la ola 2:
 *
 *   · las líneas que paga una sesión de paquete (fase 3) no están en el
 *     carrito (van aparte, a 0): se sacan de la cita que se mide, con su
 *     plata;
 *   · el precio propio del profesional (fase 2) es el que trae la cita y el
 *     que cobra el backend, no el de lista del catálogo: lo cobrado se mide a
 *     precio de la cita, así la colorista cara no "cobra de menos";
 *   · un cupón o una promoción (G) son un descuento legítimo: se compara el
 *     bruto, antes de descuentos.
 *
 * `null` igual que `coberturaCita`.
 */
export function coberturaConPaquetes(
  detalles: DetalleVentaInput[],
  cita: CarritoCita | null,
): CoberturaCita | null {
  if (!cita) return null;
  const sinSesiones = cita.lineas.filter((l) => !l.paquete);
  const medida: CarritoCita = {
    ...cita,
    lineas: sinSesiones,
    total: Math.round(sinSesiones.reduce((t, l) => t + l.precio, 0) * 100) / 100,
  };
  // Precio de la cita por servicio, unidad por unidad; lo que sobre (otra
  // unidad, un producto de reventa) va al precio del carrito.
  const precios = new Map<number, number[]>();
  for (const l of sinSesiones) {
    precios.set(l.productoId, [...(precios.get(l.productoId) ?? []), l.precio]);
  }
  let cobrado = 0;
  for (const d of detalles) {
    const cola = precios.get(d.productoId) ?? [];
    let resto = d.cantidad;
    while (resto >= 1 && cola.length) {
      cobrado += cola.shift()!;
      resto -= 1;
    }
    cobrado += resto * (d.precio ?? 0);
  }
  return coberturaCita(detalles, medida, Math.round(cobrado * 100) / 100);
}

/**
 * El texto de la confirmación cuando la venta no cubre la cita. La plata se
 * formatea afuera para no atar esta pieza a la moneda del negocio.
 */
export function textoCoberturaIncompleta(
  c: CoberturaCita,
  dinero: (n: number) => string,
): string {
  const partes: string[] = [];
  if (c.faltan.length) partes.push(`faltan: ${c.faltan.join(", ")}`);
  partes.push(`cobrás ${dinero(c.cobrado)} de ${dinero(c.totalCita)}`);
  return (
    `Esta venta no cubre toda la cita (${partes.join(" · ")}). ` +
    "La cita se dará por cobrada pero quedará marcada para revisar en el cierre de caja."
  );
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
