import { aCentavos } from "../../../lib/dinero";
import { fmtCantidad, fmtMoney } from "../../../lib/format";
import { fechaDeJornada } from "../../../lib/jornada";
import type { CobroApi } from "../api";
import { duracion } from "./Supervision.datos";

/**
 * Los cobros del billar (26-oct): un renglón por cada pago, con la hora en
 * que entró de verdad, de qué venta es y qué se vendió. Lo comparten el
 * detalle de una caja (Supervisión) y "Cobrado por QR" (Reportes › Métodos de
 * pago), y el "Cómo se pagó" del detalle de una venta.
 *
 * El pedido (Miguel, administrador del billar, con capturas): "Sería bien que
 * ahí me salga cuál fue lo que me pagaron por QR para saber". Compara cada QR
 * del sistema contra su banco, por hora y monto: un QR que figura acá y no
 * llegó al banco es plata que falta.
 */

/** Cómo se reconoce un medio en la pantalla: su ícono y su color salen de acá. */
export type TipoMedio = "efectivo" | "qr" | "fiado" | "otro";

/**
 * Qué medio es, por el nombre de la forma de pago. El efectivo con el mismo
 * criterio que el backend (`esEfectivo`: "EFECTIVO", "Efectivo Bs"), el QR por
 * contener "qr", como Métodos de pago (`colorMetodo`).
 */
export function tipoDeMedio(nombre: string): TipoMedio {
  const n = nombre.trim().toLowerCase();
  if (n.includes("efectivo")) return "efectivo";
  if (n.includes("qr")) return "qr";
  if (n.includes("fiado")) return "fiado";
  return "otro";
}

/**
 * El nombre de un QR que no es "QR" a secas ("QR BNB", "QR BCP"): un negocio
 * con dos cuentas tiene dos formas de QR, y cada cobro se busca en el extracto
 * de SU banco. Null para "QR" y para lo que no es QR.
 */
export function qrConNombre(medio: string): string | null {
  const n = medio.trim();
  return tipoDeMedio(n) === "qr" && n.toLowerCase() !== "qr" ? n : null;
}

/**
 * Como `porElMedio`, pero un QR con nombre propio dice cuál es ("por QR BNB").
 * Es para lo que se separa por el nombre exacto de la forma, como Métodos de
 * pago y lo cobrado con una de sus filas: con dos QR, las dos filas abrían
 * "Cobrado por QR" y no se sabía en el extracto de qué banco buscar. Donde los
 * QR se juntan (lo pagado de una venta, el detalle de una caja) va
 * `porElMedio`: "por QR BNB" le pondría ese banco a la plata del otro.
 */
export function porLaForma(nombre: string): string {
  const qr = qrConNombre(nombre);
  return qr ? `por ${qr}` : porElMedio(nombre);
}

/** "Cobrado por QR BNB": el título de lo cobrado con una forma de pago, por su nombre exacto. */
export function tituloDeLaForma(nombre: string): string {
  return `Cobrado ${porLaForma(nombre)}`;
}

/** "por QR", "en efectivo", "con Tarjeta": lo que va después de "Cobrado" o de "Pagados sólo". */
export function porElMedio(medio: string): string {
  const t = tipoDeMedio(medio);
  if (t === "efectivo") return "en efectivo";
  if (t === "qr") return "por QR";
  if (t === "fiado") return "fiado";
  return `con ${medio.trim()}`;
}

/** "Cobrado por QR", "Cobrado en efectivo", "Cobrado con Tarjeta": el título de una lista de cobros. */
export function tituloDeMedio(medio: string): string {
  return `Cobrado ${porElMedio(medio)}`;
}

/** "En efectivo", "Por QR", "Con Tarjeta": la parte de un medio en una venta pagada con varios. */
export function textoPorMedio(medio: string): string {
  const t = porElMedio(medio);
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * Lo pagado por cada medio en una venta, en el orden en que aparece: el
 * efectivo y el QR juntan sus renglones aunque se llamen distinto; los demás,
 * por su nombre. Con dos o más, la venta se pagó parte y parte.
 */
export function porMedio(pagos: { metodo: string; monto: number }[]): { medio: string; monto: number }[] {
  const grupos = new Map<string, { medio: string; monto: number }>();
  for (const p of pagos) {
    const t = tipoDeMedio(p.metodo);
    const clave = t === "otro" ? `otro:${p.metodo.trim().toLowerCase()}` : t;
    const g = grupos.get(clave);
    if (g) g.monto = aCentavos(g.monto + p.monto);
    else grupos.set(clave, { medio: p.metodo, monto: aCentavos(p.monto) });
  }
  return [...grupos.values()];
}

/**
 * El concepto de un cobro hecho antes de cerrar la mesa, como lo dice la
 * cajera: el tiempo fijo se cobra al abrir, la extensión al sumarle horas y el
 * adelanto cuando el cliente paga a cuenta. Sin concepto se cobró al cerrar.
 */
export function textoConcepto(concepto: string | null | undefined): string | null {
  if (!concepto) return null;
  if (concepto === "PREPAGO") return "Tiempo fijo";
  if (concepto === "EXTENSION") return "Extensión";
  // Uno que no se conoce también se cobró antes de cerrar: es un adelanto.
  return "Adelanto";
}

/**
 * Lo que se vendió, dicho corto: "Tiempo 1:30 · 2 × Paceña · Coca Cola". Hasta
 * `max` productos y "y 3 más": el detalle completo está al tocar la venta. Lo
 * de uno solo va sin "1 ×".
 */
export function resumenVendido(v: { tiempoMin: number; items: { nombre: string; cant: number }[] }, max = 3): string {
  const partes: string[] = [];
  // "1 h 30 min", como el detalle de la venta que se abre desde el renglón:
  // "Tiempo 1:30" debajo de "01:50 · V-000013" se leía como una hora.
  if (v.tiempoMin > 0) partes.push(`Tiempo ${duracion(v.tiempoMin * 60_000)}`);
  const items = v.items.filter((i) => i.cant > 0);
  for (const i of items.slice(0, max)) partes.push(i.cant === 1 ? i.nombre : `${fmtCantidad(i.cant)} × ${i.nombre}`);
  if (items.length > max) partes.push(`y ${items.length - max} más`);
  return partes.join(" · ");
}

/** "Mesa 2", "Cuenta «Juan»" o "Venta rápida": de dónde es el cobro. Null si no se sabe. */
export function lugarDeCobro(c: Pick<CobroApi, "venta" | "sesion">): string | null {
  const v = c.venta;
  if (v) {
    if (v.origen === "rapida") return "Venta rápida";
    if (v.origen === "cuenta") return `Cuenta «${v.cuenta ?? ""}»`;
    return v.mesaId != null ? `Mesa ${v.mesaId}` : "Mesa";
  }
  const s = c.sesion;
  if (s?.mesaId != null) return `Mesa ${s.mesaId}`;
  if (s?.cuenta != null) return `Cuenta «${s.cuenta}»`;
  return null;
}

/**
 * "parte de Bs 160,00": el cobro es sólo una parte de una venta pagada con
 * varios medios. Sin decirlo, un QR de Bs 80 de una mesa de Bs 160 se leía
 * como la mesa entera.
 */
export function parteDe(c: Pick<CobroApi, "venta">): string | null {
  const v = c.venta;
  // `medios` ya viene sin repetidos (el efectivo normalizado como "Efectivo").
  if (!v || v.medios.length < 2) return null;
  return `parte de ${fmtMoney(v.total)}`;
}

export function sumaCobros(cobros: Pick<CobroApi, "monto">[]): number {
  return aCentavos(cobros.reduce((t, c) => t + c.monto, 0));
}

/** "21:30": la hora del cobro, en el reloj del local. */
export function horaCorta(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

/** "Sáb 24/10" desde un día `yyyy-MM-dd` (en hora local: `new Date("2026-10-24")` es el 23 en Bolivia). */
export function etiquetaDia(dia: string): string {
  const [a, m, d] = dia.split("-").map(Number);
  const f = new Date(a, m - 1, d);
  return `${DIAS[f.getDay()]} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

export interface DiaDeCobros {
  /** El día de la JORNADA (`yyyy-MM-dd`): un cobro de la 1:50 con corte a las 6:00 es de la noche anterior. */
  dia: string;
  cobros: CobroApi[];
  total: number;
}

/**
 * Los cobros por día de la jornada, en el orden en que vienen (del más nuevo
 * al más viejo). Por la jornada y no por el calendario: un billar cierra de
 * madrugada, y el QR de la 1:50 del domingo es de la noche del sábado, que es
 * como lo busca el administrador en su banco.
 */
export function agruparPorJornada(cobros: CobroApi[], corteMin = 0): DiaDeCobros[] {
  const dias = new Map<string, DiaDeCobros>();
  for (const c of cobros) {
    const dia = fechaDeJornada(new Date(c.hora), corteMin);
    const g = dias.get(dia);
    if (g) {
      g.cobros.push(c);
      g.total = aCentavos(g.total + c.monto);
    } else {
      dias.set(dia, { dia, cobros: [c], total: aCentavos(c.monto) });
    }
  }
  return [...dias.values()];
}
