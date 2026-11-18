import { agruparHijas } from "../../lib/agregados/hijas";
import { COLUMNAS_TICKET, cantidadTicket, montoTicket } from "./ticketCierre";

/**
 * Las piezas de los tickets de texto de 58 mm que no son el de cierre
 * (CONTRATO-DELIVERY-FULL-18NOV §9): el pedido de Yango/PedidosYa y el del
 * pedido web. Usan las MISMAS columnas y la misma plata que el ticket de cierre
 * (`ticketCierre.ts`): 32 columnas, «224.00» sin símbolo en los renglones de
 * productos. La app arma el mismo texto (`TicketCierre.kt` y los suyos): las
 * pruebas de los dos lados comparan letra por letra los ejemplos del contrato.
 *
 * Reglas comunes:
 *  - Nada se corta con «…»: un nombre largo sigue en el renglón de abajo.
 *  - Un producto es «2 x Brasa entero» con su monto pegado al borde derecho;
 *    si el nombre no entra, el monto queda en el PRIMER renglón y lo que sigue
 *    va debajo del nombre (con la sangría de «2 x »).
 *  - El topping/agregado va con sangría («  + Arroz (porción)»); el incluido,
 *    sin monto.
 *  - El nombre del negocio y la sucursal, centrados (los espacios que sobran,
 *    la mitad para abajo adelante; nada al final del renglón).
 */

export const RAYA_TICKET = "-".repeat(COLUMNAS_TICKET);

/** Un texto «de afuera» (nombre, nota, dirección) en una sola tira: sin saltos ni espacios dobles, con las tildes compuestas. */
const limpio = (t: string | null | undefined): string => (t ?? "").normalize("NFC").replace(/\s+/g, " ").trim();

/**
 * Partir por palabras con un ancho para el primer renglón y otro para los
 * demás. Una palabra que sola no entra se parte donde llega al borde, sin
 * perder letras (como `partirEnRenglones` del cierre).
 */
export function partirEnAnchos(texto: string, primero: number, resto: number): string[] {
  const renglones: string[] = [];
  const ancho = () => Math.max(1, renglones.length === 0 ? primero : resto);
  let actual = "";
  for (const palabra of limpio(texto).split(" ").filter(Boolean)) {
    const junto = actual ? `${actual} ${palabra}` : palabra;
    if (junto.length <= ancho()) {
      actual = junto;
      continue;
    }
    if (actual) renglones.push(actual);
    actual = "";
    let pedazo = palabra;
    while (pedazo.length > ancho()) {
      const a = ancho();
      renglones.push(pedazo.slice(0, a));
      pedazo = pedazo.slice(a);
    }
    actual = pedazo;
  }
  if (actual) renglones.push(actual);
  return renglones;
}

/** Un dato en renglones de hasta 32 columnas («Cliente: …», «Nota: …»). */
export const partirTicket = (texto: string): string[] => partirEnAnchos(texto, COLUMNAS_TICKET, COLUMNAS_TICKET);

/** Un renglón centrado en las 32 columnas, sin espacios al final. */
export function centrarTicket(renglon: string): string {
  const libre = COLUMNAS_TICKET - renglon.length;
  return libre > 1 ? " ".repeat(Math.floor(libre / 2)) + renglon : renglon;
}

/** Un dato centrado, partido en renglones si no entra en uno. */
export const centradoTicket = (texto: string): string[] => partirTicket(texto).map(centrarTicket);

/** «izquierda ........ derecha», la derecha pegada al borde. Para los totales, que son cortos. */
export function renglonTicket(izquierda: string, derecha: string): string {
  const lugar = COLUMNAS_TICKET - derecha.length - 1;
  return `${izquierda.padEnd(Math.max(lugar, 0))} ${derecha}`;
}

/** «Bs 248.00»: los totales del papel. */
export const bsTicket = (n: number): string => `Bs ${montoTicket(n)}`;

/** «Bs 300» o «Bs 12.50»: lo que se le dice al cliente, sin «.00» (como `fmtMontoCliente`). */
export function bsCortoTicket(n: number): string {
  const centavos = Math.round(Number(n || 0) * 100);
  return centavos % 100 === 0 ? `Bs ${centavos / 100}` : `Bs ${(centavos / 100).toFixed(2)}`;
}

const dos = (n: number) => String(n).padStart(2, "0");

/** «18/11/2026 00:41», en la hora de este equipo (la del local) y en 24 horas. Vacío si la fecha no se entiende. */
export function fechaHoraTicket(v: string | Date | null | undefined): string {
  if (!v) return "";
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return `${dos(d.getDate())}/${dos(d.getMonth() + 1)}/${d.getFullYear()} ${dos(d.getHours())}:${dos(d.getMinutes())}`;
}

/** Un topping o agregado del producto, ya multiplicado por la cantidad del producto. */
export interface AgregadoTicket {
  nombre: string;
  cantidad: number;
  subtotal: number;
  /** Va dentro de lo incluido: sin monto. */
  incluido?: boolean;
}

/** Un producto del papel con sus toppings. `subtotal` es el del producto solo, sin los toppings. */
export interface LineaTicket {
  nombre: string;
  cantidad: number;
  subtotal: number;
  agregados?: AgregadoTicket[];
}

/**
 * Un producto en uno o más renglones: el monto (si hay) pegado al borde del
 * primero y el resto del nombre debajo, alineado con el nombre.
 */
export function renglonesConMonto(prefijo: string, nombre: string, monto: string): string[] {
  const primero = monto ? COLUMNAS_TICKET - monto.length - 1 : COLUMNAS_TICKET;
  const sangria = " ".repeat(prefijo.length);
  const partes = partirEnAnchos(nombre, primero - prefijo.length, COLUMNAS_TICKET - prefijo.length);
  if (partes.length === 0) partes.push("");
  const cabeza = `${prefijo}${partes[0]}`;
  return [monto ? `${cabeza.padEnd(primero)} ${monto}` : cabeza, ...partes.slice(1).map((p) => `${sangria}${p}`)];
}

/** Los renglones de los productos, cada uno con sus toppings debajo. */
export function renglonesDeProductos(lineas: LineaTicket[]): string[] {
  const salida: string[] = [];
  for (const l of lineas) {
    salida.push(...renglonesConMonto(`${cantidadTicket(l.cantidad)} x `, l.nombre, montoTicket(l.subtotal)));
    for (const a of l.agregados ?? []) {
      // «  + 2 x Oreo» sólo con más de uno; con la `x` común, como el producto.
      const cant = a.cantidad > 1 ? `${cantidadTicket(a.cantidad)} x ` : "";
      const sinMonto = a.incluido || Math.round(a.subtotal * 100) === 0;
      salida.push(...renglonesConMonto(`  + ${cant}`, a.nombre, sinMonto ? "" : montoTicket(a.subtotal)));
    }
  }
  return salida;
}

/** Lo que suman los productos con sus toppings. */
export function totalDeLineas(lineas: LineaTicket[]): number {
  const centavos = lineas.reduce(
    (s, l) => s + Math.round(l.subtotal * 100) + (l.agregados ?? []).reduce((t, a) => t + Math.round(a.subtotal * 100), 0),
    0,
  );
  return centavos / 100;
}

/**
 * Las unidades del pedido: las de los productos, sin contar los toppings
 * (van dentro del producto: el ejemplo del contrato da «3 unidades» para
 * 2 brasas con su arroz y una gaseosa).
 */
export function unidadesDeLineas(lineas: LineaTicket[]): number {
  return Math.round(lineas.reduce((s, l) => s + l.cantidad, 0) * 1000) / 1000;
}

/** Lo mínimo de una línea guardada (de un pedido o una venta) para el papel: los toppings llegan como hijas. */
export interface LineaConHijasParaTicket {
  id?: number | null;
  lineaPadreId?: number | null;
  incluido?: boolean;
  cantidad: number;
  subtotal: number;
}

/** Las líneas guardadas (vaso + hijas) como productos del papel. */
export function lineasTicketDeDetalles<L extends LineaConHijasParaTicket>(detalles: L[], nombreDe: (l: L) => string): LineaTicket[] {
  return agruparHijas(detalles).map(({ linea, hijas }) => ({
    nombre: nombreDe(linea),
    cantidad: linea.cantidad,
    subtotal: linea.subtotal,
    ...(hijas.length
      ? { agregados: hijas.map((h) => ({ nombre: nombreDe(h), cantidad: h.cantidad, subtotal: h.subtotal, incluido: h.incluido === true })) }
      : {}),
  }));
}
