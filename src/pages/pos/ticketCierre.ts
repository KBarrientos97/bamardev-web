import { aCentavos } from "../../lib/dinero";
import { NOMBRE_PLATAFORMA } from "../../lib/pedidosPlataforma/tipos";
import type { CategoriaVendida, ReporteCierreProductos } from "../../types";
import { redondearCantidad } from "./productosVendidos";

/**
 * El «Ticket de cierre» de 58 mm (PLAN-ELGANADERO-16NOV §4.2): lo vendido en
 * el turno, un renglón por producto, para que el encargado vea de un vistazo
 * «Chubi ×20 · 100.00» sin partirlo por categoría ni por forma de pago.
 *
 * Es una función pura que devuelve los renglones ya armados, de 32 columnas
 * (lo que entra en una térmica de 58 mm con la letra de siempre): el papel se
 * imprime tal cual y la prueba compara el texto. Sin categorías, sin precio
 * unitario y sin logo, para gastar poco rollo.
 */

/** Columnas del rollo de 58 mm. */
export const COLUMNAS_TICKET = 32;

const RAYA = "-".repeat(COLUMNAS_TICKET);

/** Lo que el ticket dice del turno y del arqueo; lo de los productos viene aparte. */
export interface DatosTicketCierre {
  negocio: string;
  /** El local, sólo con 2+ sucursales (lo decide quien llama). */
  sede?: string | null;
  abrio: string | Date;
  /** Sin esto el turno sigue abierto: el ticket dice «Turno» y no «Cierre». */
  cerro?: string | Date | null;
  cajero?: string | null;
  /** Sin esto no sale el renglón (un backend anterior no manda el arqueo). */
  esperado?: number | null;
  /** Sólo ya cerrada la caja: antes de cerrar no hay nada contado. */
  contado?: number | null;
  /** Si falta y hay `contado`, se calcula contra el esperado. */
  diferencia?: number | null;
}

type Item = CategoriaVendida["items"][number];

const dos = (n: number) => String(n).padStart(2, "0");

/** «16/11»: en la hora de este equipo, que es la del local. */
const diaMes = (d: Date) => `${dos(d.getDate())}/${dos(d.getMonth() + 1)}`;
/** «11:44», en 24 horas: «11:44 a. m.» come seis columnas. */
const hora = (d: Date) => `${dos(d.getHours())}:${dos(d.getMinutes())}`;

function aDate(v: string | Date | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** El turno en una línea: «Cierre 16/11 11:44-19:30», o con las dos fechas si cruzó la medianoche. */
export function lineaDelTurno(abrio: string | Date, cerro?: string | Date | null): string {
  const a = aDate(abrio);
  const c = aDate(cerro);
  if (!a) return c ? `Cierre ${diaMes(c)} ${hora(c)}` : "";
  if (!c) return `Turno ${diaMes(a)} desde ${hora(a)}`;
  const mismoDia = diaMes(a) === diaMes(c) && a.getFullYear() === c.getFullYear();
  return mismoDia
    ? `Cierre ${diaMes(a)} ${hora(a)}-${hora(c)}`
    : `Cierre ${diaMes(a)} ${hora(a)}-${diaMes(c)} ${hora(c)}`;
}

/** Plata del papel: punto y dos decimales, sin símbolo, como el recibo ("100.00"). */
export function montoTicket(n: number): string {
  const v = aCentavos(n);
  return (Object.is(v, -0) ? 0 : v).toFixed(2);
}

/** Una cantidad sin ceros de más: «20», «0.5», «1.25». */
export function cantidadTicket(n: number): string {
  return String(redondearCantidad(n) || 0);
}

const recortar = (t: string, ancho: number) => (t.length > ancho ? t.slice(0, Math.max(ancho, 0)) : t);

/** «izquierda ........ derecha»: la derecha pegada al borde; si no entra todo, se recorta la izquierda. */
function renglon(izquierda: string, derecha: string): string {
  const lugar = COLUMNAS_TICKET - derecha.length - 1;
  return `${recortar(izquierda, lugar).padEnd(Math.max(lugar, 0))} ${derecha}`;
}

interface Consolidado {
  nombre: string;
  cantidad: number;
  total: number;
}

/**
 * Todo lo vendido sumado entre las categorías: un producto, un renglón. La
 * clave es el artículo (dos con el mismo nombre no se mezclan); el producto
 * borrado (`productoId` 0) y el viejo sin id se juntan por nombre. Del más
 * vendido al menos vendido; a igual cantidad, el de más plata primero.
 */
export function consolidarProductos(categorias: CategoriaVendida[]): Consolidado[] {
  const por = new Map<string, Consolidado>();
  for (const c of categorias) {
    for (const i of c.items as Item[]) {
      // El tiempo de mesa del billar no es un producto que salió.
      if (i.tiempoMesa) continue;
      const clave = i.productoId != null && i.productoId > 0 ? `p${i.productoId}` : `n:${i.nombre}`;
      const previo = por.get(clave);
      if (previo) {
        previo.cantidad += i.cantidad;
        previo.total += i.total;
      } else {
        por.set(clave, { nombre: i.nombre, cantidad: i.cantidad, total: i.total });
      }
    }
  }
  return [...por.values()]
    .map((p) => ({ ...p, cantidad: redondearCantidad(p.cantidad), total: aCentavos(p.total) }))
    .sort((a, b) => b.cantidad - a.cantidad || b.total - a.total || a.nombre.localeCompare(b.nombre));
}

/** El ancho de la columna de cantidades: el de la más larga entre TODOS los renglones del papel. */
function anchoCantidad(grupos: Consolidado[][]): number {
  return Math.max(1, ...grupos.flat().map((p) => cantidadTicket(p.cantidad).length));
}

function renglonDeProducto(p: Consolidado, ancho: number): string {
  const cant = cantidadTicket(p.cantidad).padStart(ancho);
  return renglon(`${cant} ${p.nombre}`, montoTicket(p.total));
}

/**
 * Los renglones del ticket, uno por elemento (sin saltos de línea). Sin
 * `porMedio` ni `plataformas` (un backend anterior) salen sólo los productos
 * y el total.
 */
export function lineasTicketCierre(d: ReporteCierreProductos, o: DatosTicketCierre): string[] {
  const productos = consolidarProductos(d.categorias);
  const plataformas = (d.plataformas ?? [])
    .filter((p) => p.pedidos > 0 || p.unidades > 0)
    .map((p) => ({ p, items: consolidarProductos(p.categorias) }));
  const ancho = anchoCantidad([productos, ...plataformas.map((x) => x.items)]);

  const lineas: string[] = [];
  if (o.negocio) lineas.push(recortar(o.negocio.toUpperCase(), COLUMNAS_TICKET));
  if (o.sede) lineas.push(recortar(o.sede, COLUMNAS_TICKET));
  const turno = lineaDelTurno(o.abrio, o.cerro);
  if (turno) lineas.push(recortar(turno, COLUMNAS_TICKET));
  if (o.cajero) lineas.push(recortar(`Cajero: ${o.cajero}`, COLUMNAS_TICKET));
  lineas.push(RAYA);

  if (productos.length === 0) lineas.push("Sin ventas en el turno");
  else for (const p of productos) lineas.push(renglonDeProducto(p, ancho));
  lineas.push(RAYA);

  lineas.push(renglon(`Vendido ${cantidadTicket(d.unidades)} u`, montoTicket(d.total)));
  for (const m of (d.porMedio ?? []).filter((x) => x.ventas > 0 || x.unidades > 0)) {
    lineas.push(renglon(`  ${m.nombre}`, montoTicket(m.total)));
  }
  lineas.push(RAYA);

  // Lo de las apps no está en la caja: «(no se cobra)» se dice una vez, en el primer bloque.
  plataformas.forEach(({ p, items }, n) => {
    const nombre = (NOMBRE_PLATAFORMA[p.plataforma] ?? p.plataforma).toUpperCase();
    lineas.push(recortar(`${nombre} ${cantidadTicket(p.pedidos)} ped${n === 0 ? " (no se cobra)" : ""}`, COLUMNAS_TICKET));
    for (const it of items) lineas.push(renglonDeProducto(it, ancho));
  });
  if (plataformas.length > 0) lineas.push(RAYA);

  if (o.esperado != null) lineas.push(renglon("Efectivo esperado", montoTicket(o.esperado)));
  if (o.contado != null) {
    lineas.push(renglon("Contado", montoTicket(o.contado)));
    const dif = o.diferencia ?? (o.esperado != null ? o.contado - o.esperado : null);
    if (dif != null) lineas.push(renglon("Diferencia", montoTicket(dif)));
  }
  // Sin nada abajo (ni esperado ni contado) la última raya sobra.
  if (lineas[lineas.length - 1] === RAYA) lineas.pop();
  return lineas;
}

/** El ticket entero como texto, para imprimirlo en un `<pre>`. */
export function textoTicketCierre(d: ReporteCierreProductos, o: DatosTicketCierre): string {
  return lineasTicketCierre(d, o).join("\n");
}
