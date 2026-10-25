import type { CenasReporteApi } from "../../api";
import { diasDelPeriodo } from "../../periodo";

/**
 * Las cuentas del reporte "Cenas del personal" (24-oct). Sin pantalla: la vista
 * (`Cenas.tsx`) sólo las dibuja, y acá viven con su prueba.
 */

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"] as const;

/** "2026-10-23" → "Vie 23/10": el día de la semana y la fecha, como se lo nombra en el billar. */
export function etiquetaDia(dia: string): string {
  const [a, m, d] = dia.slice(0, 10).split("-").map(Number);
  if (![a, m, d].every(Number.isFinite)) return dia;
  const fecha = new Date(a, m - 1, d);
  return `${DIAS[fecha.getDay()]} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

/**
 * Una barra por cada día del período, también los que no tuvieron cena (en
 * cero): así el gráfico mide el período entero y se ven los huecos. Hasta 45
 * días; con más, el gráfico no se lee y la lista de abajo alcanza.
 */
export function barrasPorDia(r: Pick<CenasReporteApi, "desde" | "hasta" | "porDia">): { etiqueta: string; valor: number; detalle: string }[] {
  const montos = new Map(r.porDia.map((d) => [d.dia, d.monto]));
  const dias = diasDelPeriodo(r.desde, r.hasta);
  if (dias.length > 45) return [];
  return dias.map((dia) => ({
    etiqueta: String(Number(dia.slice(8, 10))),
    valor: montos.get(dia) ?? 0,
    detalle: etiquetaDia(dia),
  }));
}

/**
 * Cuánto costarían las cenas de todo el mes si siguen al ritmo de hasta hoy.
 * Sólo tiene sentido con el mes en curso y algo gastado; null si no.
 */
export function proyeccionDelMes(total: number, diaActual: number, diasDelMes: number): number | null {
  if (!(total > 0) || diaActual <= 0 || diasDelMes <= 0) return null;
  return Math.round((total / diaActual) * diasDelMes);
}

/** "20 de 23": las noches con cena sobre las noches que se abrió el local. */
export function nochesConCenaTexto(r: Pick<CenasReporteApi, "nochesConCena" | "nochesAbiertas">): string {
  return `${r.nochesConCena} de ${r.nochesAbiertas}`;
}

/** Las noches que se abrió y no hubo cena (el administrador no dio nada). */
export function nochesSinCena(r: Pick<CenasReporteApi, "porNoche">): number {
  return r.porNoche.filter((n) => n.monto <= 0).length;
}
