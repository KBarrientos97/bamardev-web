import { fmtMoney, fmtNum } from "../../lib/format";
import { esCero } from "../../lib/dinero";

/**
 * Formatos propios de Reportes: los montos grandes se leen redondos ("Bs
 * 11.365" en un KPI, "Bs 11,4 mil" en el centro de una dona) y el detalle con
 * centavos queda para las filas. Un "Bs 11.364,75" en el eje de un gráfico no
 * entra, y en un titular no se lee de un vistazo.
 */

/** El símbolo del negocio ("Bs", "$", "S/"), sacado del formateo de siempre. */
function simbolo(): string {
  return fmtMoney(0).replace(/\s.*$/, "");
}

/** "Bs 1.624": sin centavos. */
export function bsEntero(n: number): string {
  const v = Math.round(n);
  return `${v < 0 ? "−" : ""}${simbolo()} ${fmtNum(Math.abs(v))}`;
}

/** "Bs 11,4 mil" desde diez mil; abajo, entero. */
export function bsCorto(n: number): string {
  if (Math.abs(n) >= 10_000) return `${n < 0 ? "−" : ""}${simbolo()} ${fmtNum(Math.abs(n) / 1000, 1)} mil`;
  return bsEntero(n);
}

/** Un monto con centavos que resta: "−Bs 116,60". El signo va pegado, como en el pizarrón. */
export function bsResta(n: number): string {
  if (esCero(n)) return fmtMoney(0);
  return `−${fmtMoney(Math.abs(n))}`;
}

/**
 * Un subtotal que puede dar negativo (utilidad bruta, operativa): "Bs 98,00"
 * o "−Bs 12.143,00". Con fmtMoney salía "Bs -12.143,00" justo al lado de la
 * pérdida escrita "−Bs 13.383,00": dos formas de escribir lo mismo.
 */
export function bsSubtotal(n: number): string {
  if (esCero(n)) return fmtMoney(0);
  return n < 0 ? `−${fmtMoney(-n)}` : fmtMoney(n);
}

/** Un monto con signo (resultado, diferencia de caja): "+Bs 24,00", "−Bs 59,00". */
export function bsConSigno(n: number): string {
  if (esCero(n)) return fmtMoney(0);
  return `${n > 0 ? "+" : "−"}${fmtMoney(Math.abs(n))}`;
}

/** Eje de un gráfico: "2,5 mil", "632", "0". Sin símbolo: el título ya dice que es plata. */
export function ejeCorto(n: number): string {
  if (Math.abs(n) >= 1000) return `${fmtNum(n / 1000, Math.abs(n) >= 10_000 ? 0 : 1)} mil`;
  return fmtNum(Math.round(n));
}

/**
 * Una fracción como porcentaje entero: 0,413 → "41 %". **Null → "—"**: un
 * porcentaje que no se puede calcular (sin ventas) no se escribe como 0 %,
 * que se lee como un dato.
 */
export function pct(fraccion: number | null | undefined): string {
  if (fraccion == null || !Number.isFinite(fraccion)) return "—";
  return `${Math.round(fraccion * 100)} %`;
}

/** Horas con un decimal: "230 h", "36,6 h". 25 minutos son "0,4 h" y no "0 h" al lado de una barra llena. */
export function horas(h: number): string {
  // Unos minutos de juego redondeaban a "0 h" al lado de lo que se cobró por
  // ese tiempo: se leía como que la mesa no se usó.
  if (h > 0 && Math.round(h * 10) === 0) return `${Math.max(1, Math.round(h * 60))} min`;
  return `${fmtNum(h, Number.isInteger(Math.round(h * 10) / 10) ? 0 : 1)} h`;
}

/** Minutos como "1:34 h" (duración de una sesión). */
export function duracion(min: number): string {
  const m = Math.max(0, Math.round(min));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")} h`;
}

/** "unidad" / "unidades" según la cantidad. */
export function plural(n: number, uno: string, varios: string): string {
  return `${fmtNum(n, Number.isInteger(n) ? 0 : 2)} ${n === 1 ? uno : varios}`;
}

/**
 * Variación contra el período anterior, como fracción (0,13 = +13 %). Null
 * cuando no hay contra qué: con el anterior en cero, cualquier venta sería un
 * "+∞ %", y eso no es un dato.
 */
export function variacion(actual: number, anterior: number | null | undefined): number | null {
  if (anterior == null || esCero(anterior) || anterior < 0) return null;
  return (actual - anterior) / anterior;
}

/** "ENE", "FEB"…: el mes en el lugar del ícono de las listas mensuales. */
export const SIGLAS_MES = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"] as const;
