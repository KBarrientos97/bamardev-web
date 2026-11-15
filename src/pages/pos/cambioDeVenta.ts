import { aCentavos } from "../../lib/dinero";
import { fmtMoney } from "../../lib/format";
import { esBelleza, esBillar, esFarmacia } from "../../lib/rubro";
import type { DetalleVentaInput, FormaPago, Producto, Venta } from "../../types";
import type { LineaCarrito } from "./useCarrito";

/**
 * Modificar una venta ya cobrada (15-nov): lo que la pantalla decide sin
 * preguntarle al servidor. El cliente pagó, se llevó su ticket y vuelve —
 * "mejor la gaseosa de 2 litros y el cuarto a la brasa"—: se cambian los
 * productos de ESA venta y la diferencia se cobra o se devuelve.
 *
 * El servidor es el que manda (`POST /ventas/:id/modificar`: vuelve a mirar
 * todo, pide el PIN de un encargado y deja el rastro). Esto es para no
 * ofrecer lo que va a rebotar y para mostrarle a la cajera la diferencia
 * ANTES de confirmar.
 */

/**
 * ¿En este rubro el Punto de venta ofrece modificar una venta?
 *
 * Donde se vende con la grilla de productos: el restaurante y los comercios
 * (ferretería, minimarket, repuestos). No en la farmacia (su venta lleva
 * lote y receta, y se arma con otro buscador), ni en belleza (profesional,
 * comisión, paquetes), ni en el billar ni en el instituto: ahí lo que se
 * cobra tiene algo atado y sigue siendo anular y volver a cobrar.
 */
export function rubroModificaVentas(rubro: string | null | undefined): boolean {
  return !esFarmacia(rubro) && !esBelleza(rubro) && !esBillar(rubro) && rubro !== "ACADEMIA";
}

/**
 * Por qué esta venta no se ofrece para modificar, o null si se puede. Las
 * mismas reglas que el servidor (`motivoNoModificable` en el backend): la de
 * mostrador, aprobada y del turno que sigue abierto, sin nada atado.
 */
export function motivoNoModificable(venta: Venta, cajaAbiertaId: number | null | undefined): string | null {
  if (venta.estado !== "APROBADO") return "La venta está anulada.";
  if (venta.pendienteSync) return "La venta todavía no subió al sistema.";
  if (venta.tipoPedido !== "LOCAL") return "Un pedido para recoger o a domicilio no se modifica.";
  // Un turno cerrado no se toca: su arqueo ya se contó.
  if (venta.cajaId == null || venta.cajaId !== cajaAbiertaId) return "Sólo se modifican las ventas del turno abierto.";
  if (venta.credito) return "Una venta a crédito no se modifica.";
  if (venta.mesa) return "Esta venta salió de una mesa del salón.";
  if (venta.citaId != null) return "Esta venta cobró una cita.";
  if ((venta.descuentoTotal ?? 0) > 0) return "Esta venta tiene un descuento o un cupón.";
  if ((venta.cuotas ?? []).length > 0) return "Esta venta cobró cuotas.";
  if ((venta.giftCards ?? []).length > 0 || (venta.propinas ?? []).length > 0) return "Esta venta tiene vales o propinas.";
  if ((venta.detalles ?? []).some((d) => d.recursoId != null || d.paquete != null || d.cuotaId != null)) {
    return "Esta venta tiene servicios con profesional, paquetes o cuotas.";
  }
  return null;
}

/** Cuánto lleva la venta de cada producto y a qué precio lo vendió. */
function vendidoPorProducto(venta: Venta): Map<number, { cantidad: number; precio: number; nombre: string }> {
  const m = new Map<number, { cantidad: number; precio: number; nombre: string }>();
  for (const d of venta.detalles ?? []) {
    const ya = m.get(d.productoId);
    if (ya) ya.cantidad += d.cantidad;
    else m.set(d.productoId, { cantidad: d.cantidad, precio: d.precio, nombre: d.producto });
  }
  return m;
}

/**
 * El catálogo como lo ve el cambio. Lo que YA está en la venta:
 *
 *  - sigue al precio al que se vendió (es lo que cobra el servidor: el cliente
 *    ya lo pagó así, aunque el dueño haya cambiado el catálogo después);
 *  - tiene de vuelta en el estante las unidades de la venta: ya están
 *    descontadas, así que dejarlas no "gasta" stock y el tope del carrito es
 *    lo que hay MÁS lo que la venta ya lleva.
 *
 * Y si un producto de la venta ya no está en el catálogo (lo deshabilitaron
 * después), se arma con lo que dice la venta: se puede dejar o bajar, no subir
 * (no se dibuja en la grilla, y su tope es lo que la venta ya tiene).
 */
export function catalogoParaModificar(catalogo: Producto[], venta: Venta): Producto[] {
  const vendido = vendidoPorProducto(venta);
  const salida = catalogo.map((p) => {
    const v = vendido.get(p.id);
    return v ? { ...p, precio: v.precio, stockTotal: p.stockTotal + v.cantidad } : p;
  });
  const enCatalogo = new Set(catalogo.map((p) => p.id));
  for (const [id, v] of vendido) {
    if (enCatalogo.has(id)) continue;
    salida.push({
      id,
      nombre: v.nombre,
      descripcion: null,
      codBarra: null,
      tipoProducto: "ALMACENABLE",
      precio: v.precio,
      costo: 0,
      stockMinimo: 0,
      habilitado: false,
      icono: null,
      categoria: null,
      unidadMedida: null,
      stockTotal: v.cantidad,
      componentes: [],
    } as Producto);
  }
  return salida;
}

/**
 * Las líneas con las que arranca el carrito del cambio: una por producto (la
 * venta lo guarda partido en mesa y llevar), con su reparto y su nota. Los
 * productos salen del catálogo ya ajustado (`catalogoParaModificar`).
 */
export function lineasDeVenta(venta: Venta, catalogo: Producto[]): LineaCarrito[] {
  const porId = new Map(catalogo.map((p) => [p.id, p]));
  const lineas = new Map<number, LineaCarrito>();
  for (const d of venta.detalles ?? []) {
    const producto = porId.get(d.productoId);
    if (!producto) continue;
    const ya = lineas.get(d.productoId) ?? { producto, cantidad: 0, enMesa: 0, nota: "" };
    ya.cantidad += d.cantidad;
    if (d.consumo === "MESA") ya.enMesa += d.cantidad;
    if (!ya.nota && d.nota) ya.nota = d.nota;
    lineas.set(d.productoId, ya);
  }
  return [...lineas.values()];
}

type Basico = { productoId: number; cantidad: number; consumo?: string | null; nota?: string | null };

const clave = (r: Basico) => `${r.productoId}|${r.consumo === "MESA" ? "MESA" : "LLEVAR"}|${(r.nota ?? "").trim()}`;

/**
 * ¿La venta quedaría distinta? Compara producto, cantidad, mesa/llevar y nota
 * sin mirar el orden: lo mismo que mira el servidor para rechazar un cambio
 * que no cambia nada.
 */
export function hayCambios(venta: Venta, detalles: DetalleVentaInput[]): boolean {
  const contar = (rs: Basico[]) => {
    const m = new Map<string, number>();
    for (const r of rs) m.set(clave(r), (m.get(clave(r)) ?? 0) + r.cantidad);
    return m;
  };
  const antes = contar(venta.detalles ?? []);
  const despues = contar(detalles);
  if (antes.size !== despues.size) return true;
  for (const [k, n] of antes) if (Math.abs((despues.get(k) ?? 0) - n) > 0.0005) return true;
  return false;
}

export interface CambioDeProducto {
  producto: string;
  cantidad: number;
}

/**
 * Qué sale del pedido y qué entra, producto por producto: lo que se le muestra
 * a la cajera (y a la encargada que pone el PIN) antes de confirmar.
 */
export function cambioDeProductos(
  antes: { productoId: number; producto: string; cantidad: number }[],
  despues: { productoId: number; producto: string; cantidad: number }[],
): { sale: CambioDeProducto[]; entra: CambioDeProducto[] } {
  const nombres = new Map<number, string>();
  const delta = new Map<number, number>();
  for (const r of antes) {
    nombres.set(r.productoId, r.producto);
    delta.set(r.productoId, (delta.get(r.productoId) ?? 0) - r.cantidad);
  }
  for (const r of despues) {
    nombres.set(r.productoId, r.producto);
    delta.set(r.productoId, (delta.get(r.productoId) ?? 0) + r.cantidad);
  }
  const sale: CambioDeProducto[] = [];
  const entra: CambioDeProducto[] = [];
  for (const [id, d] of delta) {
    const cantidad = Math.round(Math.abs(d) * 1000) / 1000;
    if (cantidad < 0.0005) continue;
    (d < 0 ? sale : entra).push({ producto: nombres.get(id) ?? String(id), cantidad });
  }
  return { sale, entra };
}

/** La diferencia de plata del cambio: negativa = hay que devolverle al cliente. */
export function diferenciaDelCambio(venta: Venta, totalNuevo: number): number {
  return aCentavos(totalNuevo - venta.total);
}

const esEfectivo = (nombre: string | null | undefined) => /efectivo/i.test(nombre ?? "");
const esVale = (nombre: string | null | undefined) => (nombre ?? "").trim().toLowerCase() === "gift card";

export interface MedioDeDevolucion {
  formaPagoId: number;
  nombre: string;
  /** Sale del cajón (efectivo) o no (QR, transferencia). */
  saleDelCajon: boolean;
}

/**
 * Por dónde se le puede devolver la diferencia al cliente:
 *
 *  - en efectivo, siempre que el negocio tenga esa forma de pago: sale del
 *    cajón, también si la venta se pagó por QR (la cajera no tiene el banco
 *    del negocio para transferir Bs 5);
 *  - por un medio por el que la venta se cobró (QR, transferencia), si por ahí
 *    entró al menos lo que hay que devolver: no sale del cajón.
 *
 * El efectivo va primero: es lo que pasa casi siempre en el mostrador.
 */
export function mediosDeDevolucion(venta: Venta, formasPago: FormaPago[], monto: number): MedioDeDevolucion[] {
  const medios: MedioDeDevolucion[] = [];
  const efectivo = formasPago.find((f) => esEfectivo(f.nombre));
  if (efectivo) medios.push({ formaPagoId: efectivo.id, nombre: efectivo.nombre, saleDelCajon: true });
  const porForma = new Map<number, { nombre: string; monto: number }>();
  for (const p of venta.pagos ?? []) {
    const ya = porForma.get(p.formaPagoId) ?? { nombre: p.formaPago ?? "", monto: 0 };
    ya.monto += p.monto;
    porForma.set(p.formaPagoId, ya);
  }
  for (const [formaPagoId, f] of porForma) {
    if (esEfectivo(f.nombre) || esVale(f.nombre) || !f.nombre) continue;
    if (f.monto + 0.001 < monto) continue;
    medios.push({ formaPagoId, nombre: f.nombre, saleDelCajon: false });
  }
  return medios;
}

/** "en efectivo", "por QR", "por QR y en efectivo": por dónde se movió la plata. */
export function medioDeLaPlata(pagos: { formaPago: string }[]): string {
  const medios = [...new Set(pagos.map((p) => (esEfectivo(p.formaPago) ? "en efectivo" : `por ${p.formaPago}`)))];
  return medios.join(" y ");
}

/**
 * La plata de un cambio ya hecho, en palabras: "se devolvieron Bs 3,00 en
 * efectivo", "se cobraron Bs 4,00 más por QR" o "sin diferencia de plata".
 */
export function plataDelCambio(c: { diferencia: number; pagos: { formaPago: string }[] }): string {
  if (Math.abs(c.diferencia) < 0.005) return "sin diferencia de plata";
  const medio = medioDeLaPlata(c.pagos);
  const cola = medio ? ` ${medio}` : "";
  return c.diferencia < 0
    ? `se devolvieron ${fmtMoney(-c.diferencia)}${cola}`
    : `se cobraron ${fmtMoney(c.diferencia)} más${cola}`;
}

/** Lo que hay que hacer con la plata de un cambio recién guardado: lo dice el recibo. */
export interface PlataDelCambio {
  /** Negativa: se le devuelve al cliente. Positiva: pagó la diferencia. */
  diferencia: number;
  /** Por dónde se devuelve (sólo si es negativa). */
  devolucion: MedioDeDevolucion | null;
}

/**
 * El recordatorio para la cajera al terminar: "Devolvele Bs 3,00 al cliente
 * en efectivo", "El cliente pagó Bs 4,00 de diferencia" o que no hubo plata.
 */
export function recordatorioDeLaPlata(p: PlataDelCambio): string {
  if (Math.abs(p.diferencia) < 0.005) return "Sin diferencia de plata: no se cobra ni se devuelve nada.";
  if (p.diferencia > 0) return `El cliente pagó ${fmtMoney(p.diferencia)} de diferencia.`;
  const monto = fmtMoney(-p.diferencia);
  if (!p.devolucion || p.devolucion.saleDelCajon) return `Devolvele ${monto} al cliente en efectivo.`;
  return `Devolvele ${monto} al cliente por ${p.devolucion.nombre} o transferencia: no salen de la caja.`;
}

/** Los motivos de un cambio, en el orden en que más pasan. */
export const MOTIVOS_DE_CAMBIO = [
  ["El cliente cambió de idea", "El cliente cambió de idea"],
  ["Error al cobrar", "Error al cobrar"],
  ["Producto agotado", "Producto agotado"],
  ["Otro", "Otro"],
] as const;
export type MotivoDeCambio = (typeof MOTIVOS_DE_CAMBIO)[number][0];

/** El motivo como se guarda: el elegido y, si hay, el detalle escrito. */
export function textoDelMotivo(motivo: MotivoDeCambio, detalle: string): string {
  const d = detalle.trim();
  return motivo === "Otro" ? d : [motivo, d].filter(Boolean).join(" · ");
}
