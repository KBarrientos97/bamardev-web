import type { ReporteApi } from "../api";

/**
 * Los números de Reportes → Billar (§7.15). Los calcula el backend
 * (`GET /billar/reportes`) con lo que quedó guardado al cobrar cada mesa, no
 * con la tarifa de hoy; acá sólo se acomodan para dibujar.
 */
export type ReporteBillar = ReporteApi;

/**
 * Las horas en el orden de la jornada y no del reloj: un billar que abre a
 * las 4 p. m. y cierra a las 2 a. m. se lee "4 p. m. … 1 a. m.", no "0 1 … 16
 * 17". La jornada empieza después del hueco más largo sin juego.
 */
export function ordenJornada(porHora: ReporteBillar["porHora"]): ReporteBillar["porHora"] {
  const horas = [...porHora].sort((a, b) => a.hora - b.hora);
  if (horas.length < 2) return horas;
  let corte = 0;
  let hueco = -1;
  for (let i = 0; i < horas.length; i++) {
    const siguiente = horas[(i + 1) % horas.length].hora;
    const distancia = (siguiente - horas[i].hora + 24) % 24 || 24;
    if (distancia > hueco) {
      hueco = distancia;
      corte = (i + 1) % horas.length;
    }
  }
  return [...horas.slice(corte), ...horas.slice(0, corte)];
}

/** "9 p. m.", "12 a. m.", "1 a. m.": la hora de las barras y del pico. */
export function horaCorta(h: number): string {
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${h < 12 ? "a. m." : "p. m."}`;
}

/** "Pico de 9 a 11 p. m. (más del 80 %)", o la hora más llena si ninguna pasa del 80 %. */
export function textoPico(porHora: ReporteBillar["porHora"]): string | null {
  if (!porHora.some((x) => x.ocupacion > 0)) return null;
  const llenas = porHora.filter((x) => x.ocupacion >= 0.8);
  if (llenas.length) {
    const desde = llenas[0].hora;
    const hasta = (llenas[llenas.length - 1].hora + 1) % 24;
    return `Pico de ${horaCorta(desde)} a ${horaCorta(hasta)} (más del 80 %).`;
  }
  const max = porHora.reduce((a, b) => (b.ocupacion > a.ocupacion ? b : a));
  return `La hora más llena: ${horaCorta(max.hora)} (${Math.round(max.ocupacion * 100)} %).`;
}
