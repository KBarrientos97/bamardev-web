import { isoDia } from "../../lib/format";

/** Los períodos de los reportes de farmacia: del mes a la gestión. */
export type Periodo = "mes" | "mesPasado" | "trimestre" | "gestion";

export const PERIODOS: readonly (readonly [Periodo, string])[] = [
  ["mes", "Este mes"],
  ["mesPasado", "Mes pasado"],
  ["trimestre", "Últimos 3 meses"],
  ["gestion", "Esta gestión"],
];

/** Desde y hasta (incluido) de cada período, en días locales. */
export function rangoDe(p: Periodo, hoy = new Date()): { desde: string; hasta: string } {
  const y = hoy.getFullYear();
  const m = hoy.getMonth();
  switch (p) {
    case "mesPasado":
      return { desde: isoDia(new Date(y, m - 1, 1)), hasta: isoDia(new Date(y, m, 0)) };
    case "trimestre":
      return { desde: isoDia(new Date(y, m - 2, 1)), hasta: isoDia(hoy) };
    case "gestion":
      return { desde: isoDia(new Date(y, 0, 1)), hasta: isoDia(hoy) };
    default:
      return { desde: isoDia(new Date(y, m, 1)), hasta: isoDia(hoy) };
  }
}
